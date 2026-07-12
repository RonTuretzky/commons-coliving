/* ============================================================
   colive.fun — the backend client (assets/js/sync.js).
   The SERVER is the source of truth. You sign in with a username +
   password from any browser (incl. incognito) and your world is
   fetched from the server; the local store is just the working cache.

   - personal state  : your whole world, per-key merge → PUT /api/state
   - the house doc   : the house-scoped keys, shared by every member,
                       merged per element → PUT /api/house

   House docs are canonical: member ids are real user ids (u-…).
   On this device you are 'me'; translate() swaps 'me' ↔ your uid in
   every id position on the way in and out, so the entire store and
   every page keep working untouched.

   Loaded on every page by shell.js.
   ============================================================ */
(function () {
  const HOUSE_KEYS = [
    "contributions", "bills", "billsPaid", "chores", "choreDone", "choreOverrides",
    "chorePrefs", "bandwidth", "mealAppetite", "mealPlan", "expenses", "settlements",
    "proposals", "treasury", "maintenance", "tasks", "labor", "agreementDoc",
    "checkinLog", "choreChain",
  ];
  // device-local sync bookkeeping — never pushed to or read from the server
  // (pushing them would corrupt another device's version tracking)
  const LOCAL_ONLY = ["cloudSync", "cloudHouse"];

  const S = () => window.Commons.state;

  /* ---------- identity translation ('me' <-> my uid) ---------- */
  function translate(doc, from, to) {
    const t = (v) => (v === from ? to : v);
    const tArr = (a) => (Array.isArray(a) ? a.map(t) : a);
    const tKeys = (o) => {
      if (!o || typeof o !== "object" || Array.isArray(o)) return o;
      const out = {};
      Object.keys(o).forEach((k) => { out[t(k)] = o[k]; });
      return out;
    };
    const d = JSON.parse(JSON.stringify(doc));
    if (d.house && Array.isArray(d.house.members)) d.house.members = tArr(d.house.members);
    (d.contributions || []).forEach((c) => { c.member = t(c.member); });
    (d.bills || []).forEach((b) => { b.rotation = tArr(b.rotation); });
    (d.chores || []).forEach((c) => { c.rotation = tArr(c.rotation); });
    if (d.choreDone) Object.keys(d.choreDone).forEach((cid) =>
      Object.keys(d.choreDone[cid] || {}).forEach((per) => {
        const e = d.choreDone[cid][per];
        if (e && e.by) e.by = t(e.by);
      }));
    if (d.choreOverrides) Object.keys(d.choreOverrides).forEach((k) => { d.choreOverrides[k] = t(d.choreOverrides[k]); });
    d.chorePrefs = tKeys(d.chorePrefs);
    d.bandwidth = tKeys(d.bandwidth);
    d.mealAppetite = tKeys(d.mealAppetite);
    if (d.mealPlan && Array.isArray(d.mealPlan.rotation)) d.mealPlan.rotation = tArr(d.mealPlan.rotation);
    (d.expenses || []).forEach((x) => {
      x.paidBy = t(x.paidBy);
      if (x.split) {
        x.split.participants = tArr(x.split.participants);
        if (x.split.values) x.split.values = tKeys(x.split.values);
      }
    });
    (d.settlements || []).forEach((s) => { s.from = t(s.from); s.to = t(s.to); });
    (d.proposals || []).forEach((p) => {
      if (p.proposer) p.proposer = t(p.proposer);
      if (p.votes) p.votes = tKeys(p.votes);
      if (p.newAssignee) p.newAssignee = t(p.newAssignee);
      if (p.reassignTo) p.reassignTo = t(p.reassignTo);
    });
    (d.tasks || []).forEach((x) => {
      if (x.assignedTo) x.assignedTo = t(x.assignedTo);
      if (x.createdBy) x.createdBy = t(x.createdBy);
    });
    (d.labor || []).forEach((l) => { l.member = t(l.member); });
    if (d.agreementDoc) {
      d.agreementDoc.signatures = tKeys(d.agreementDoc.signatures);
      (d.agreementDoc.history || []).forEach((h) => { h.signatures = tKeys(h.signatures); });
    }
    (d.checkinLog || []).forEach((e) => { e.member = t(e.member); });
    (d.maintenance || []).forEach((m) => { m.openedBy = t(m.openedBy); });
    return d;
  }

  /* ---------- the sync engine ---------- */
  const Cloud = {
    available: null,   // null = probing, false = no api, true = api reachable
    user: null,        // {id, name, ...} when signed in
    houseId: null,     // server-side house id
    stateVersion: 0,
    houseVersion: 0,

    _lastPersonal: {},   // key -> JSON string at last push/pull
    _lastHouse: {},
    _lastProfile: "",    // JSON of the public directory profile at last push
    _applying: false,
    _pushTimer: null,
    _loop: null,

    async api(path, opts) {
      const res = await fetch(path, Object.assign({
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
      }, opts));
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(body.error || res.statusText), { status: res.status, body });
      return body;
    },

    async init() {
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 3000);
        const res = await fetch("/api/health", { signal: ctl.signal });
        clearTimeout(timer);
        this.available = res.ok && (await res.json()).ok === true;
      } catch (e) { this.available = false; }
      if (this.available) {
        try {
          const me = await this.api("/api/me");        // 200 only if the session cookie is valid
          this.user = me.user;
          this.houseId = me.houseId;
          window.Commons.account.setSession(me.user);  // mirror the server identity locally
          this._loadVersions();
          if (localStorage.getItem("dp-cloud-dirty")) { this._lastPersonal = {}; this._lastHouse = {}; }
          else { this._snapshotPersonal(); this._snapshotHouse(); this._snapshotProfile(); }
          this._startLoop();                           // pullNow reconciles with the server (the truth)
        } catch (e) {
          // no valid server session → we are NOT logged in, whatever localStorage thinks
          if (e.status === 401 && window.Commons.account.active()) {
            window.Commons.account.clearSession();
            window.dispatchEvent(new CustomEvent("cloud:signedout"));
          }
        }
      }
      window.dispatchEvent(new CustomEvent("cloud:ready"));
    },

    signedIn() { return !!this.user; },
    houseSynced() {
      const cs = S().cloudHouse;
      return !!(this.user && this.houseId && cs && cs.localId === S().myHouseId);
    },

    /* ----- auth (username + password, server-hashed) ----- */
    async register({ username, password, profile }) {
      const r = await this.api("/api/auth/register", {
        method: "POST", body: JSON.stringify({ username, password, profile: profile || {} }),
      });
      this.user = r.user;
      this.houseId = null;
      window.Commons.account.setSession(r.user);
      this._lastPersonal = {}; // force a full first push of this device's fresh world
      await this.push(true);
      this._persistVersions();
      this._startLoop();
      window.dispatchEvent(new CustomEvent("cloud:change"));
      return { user: r.user };
    },

    async signIn({ username, password }) {
      const r = await this.api("/api/auth/login", {
        method: "POST", body: JSON.stringify({ username, password }),
      });
      this.user = r.user;
      window.Commons.account.setSession(r.user);
      // the server is the source of truth — pull the whole world down
      await this._hydrate();
      this._snapshotProfile();
      this._startLoop();
      window.dispatchEvent(new CustomEvent("cloud:change"));
      return { user: r.user };
    },

    // Replace the local world with the server's copy (used on sign-in / new device).
    async _hydrate() {
      try {
        const remote = await this.api("/api/state");
        const migrated = remote.doc && window.Commons.migrate(remote.doc);
        if (migrated) {
          this._applying = true;
          const st = S();
          Object.keys(migrated).forEach((k) => { if (!LOCAL_ONLY.includes(k)) st[k] = migrated[k]; });
          window.Commons.save();
          this._applying = false;
          this.stateVersion = remote.version || 0;
        }
      } catch (e) { /* brand-new account: no server state yet — this device's empty world becomes it */ }
      const me = await this.api("/api/me");
      this.houseId = me.houseId;
      if (me.houseId) {
        try {
          const h = await this.api("/api/house");
          this.applyHouse(h.doc, h.version);
          S().cloudHouse = { houseId: h.houseId, localId: S().myHouseId };
          this._applying = true; window.Commons.save(); this._applying = false;
        } catch (e) { /* no house doc — fine */ }
      }
      this._snapshotPersonal();
      this._persistVersions();
    },

    async signOut() {
      try { await this.api("/api/auth/logout", { method: "POST", body: "{}" }); } catch (e) { /* best effort */ }
      this.user = null;
      this.houseId = null;
      this.stateVersion = 0;
      this.houseVersion = 0;
      if (this._loop) { clearInterval(this._loop); this._loop = null; }
      try { localStorage.removeItem("dp-cloud-dirty"); } catch (e) {}
      window.Commons.account.clearSession(); // clears the local mirror + wipes this device's cached world
      window.dispatchEvent(new CustomEvent("cloud:change"));
    },

    async updateProfile(patch) {
      if (!this.user) return;
      const body = patch || this._publicProfile();
      const r = await this.api("/api/me", { method: "PUT", body: JSON.stringify(body) });
      this.user = r.user;
      this._snapshotProfile();
    },

    /* ----- house sharing ----- */
    houseDocFromLocal() {
      const st = S();
      const house = st.houses.find((h) => h.id === st.myHouseId);
      if (!house) return null;
      const doc = { house };
      HOUSE_KEYS.forEach((k) => { doc[k] = st[k]; });
      // fictional roster members need person records on the other members' devices
      doc.housePeople = house.members
        .filter((m) => m !== "me")
        .map((m) => st.people.find((p) => p.id === m))
        .filter(Boolean);
      return translate(doc, "me", this.user.id);
    },

    async houseOnline() {
      if (!this.user) throw new Error("cloud account first");
      const doc = this.houseDocFromLocal();
      if (!doc) throw new Error("no house to put online");
      const r = await this.api("/api/houses", { method: "POST", body: JSON.stringify({ doc }) });
      this.houseId = r.houseId;
      this.houseVersion = r.version;
      S().cloudHouse = { houseId: r.houseId, localId: S().myHouseId };
      this._applying = true; window.Commons.save(); this._applying = false;
      this._snapshotHouse();
      this._persistVersions();
      this.schedulePush();
      window.dispatchEvent(new CustomEvent("cloud:change"));
      return r;
    },

    async invite() {
      return await this.api("/api/house/invite", { method: "POST", body: "{}" });
    },

    async join(code) {
      if (!this.user) throw new Error("cloud account first");
      const r = await this.api("/api/join", { method: "POST", body: JSON.stringify({ code }) });
      this.houseId = r.houseId;
      this.applyHouse(r.doc, r.version);
      S().cloudHouse = { houseId: r.houseId, localId: S().myHouseId };
      this._applying = true; window.Commons.save(); this._applying = false;
      this._persistVersions();
      this.schedulePush();
      return r;
    },

    // Detach from the server house (claimOwn/split moved me to a different local
    // house, or I was removed by a split on someone else's device).
    async leaveHouse() {
      try { await this.api("/api/house/leave", { method: "POST", body: "{}" }); } catch (e) { /* best effort */ }
      this.houseId = null;
      this.houseVersion = 0;
      this._lastHouse = {};
      if (S().cloudHouse) { S().cloudHouse = null; this._applying = true; window.Commons.save(); this._applying = false; }
      this._persistVersions();
      window.dispatchEvent(new CustomEvent("cloud:change"));
    },

    applyHouse(canonicalDoc, version) {
      const local = translate(canonicalDoc, this.user.id, "me");
      const st = S();
      // removed from the house (a split on another device dropped me)? detach.
      if (local.house && Array.isArray(local.house.members) && !local.house.members.includes("me") && S().cloudHouse) {
        S().cloudHouse = null;
        this.houseId = null;
        this.houseVersion = 0;
        this._applying = true; window.Commons.save(); this._applying = false;
        this._persistVersions();
        window.dispatchEvent(new CustomEvent("sync:update"));
        return;
      }
      HOUSE_KEYS.forEach((k) => { if (k in local) st[k] = local[k]; });
      if (local.house) {
        const i = st.houses.findIndex((h) => h.id === local.house.id);
        if (i >= 0) st.houses[i] = local.house; else st.houses.unshift(local.house);
        st.myHouseId = local.house.id;
      }
      (canonicalDoc.housePeople || []).forEach((p) => {
        if (p.id === this.user.id) return; // that's me — I'm 'me' here
        const i = st.people.findIndex((x) => x.id === p.id);
        if (i >= 0) st.people[i] = p; else st.people.push(p);
      });
      this._applying = true;
      window.Commons.save();
      this._applying = false;
      this.houseVersion = version;
      this._persistVersions();
      this._snapshotHouse();
      this._snapshotPersonal(); // house keys changed under the personal doc too
      window.dispatchEvent(new CustomEvent("sync:update"));
    },

    /* ----- version bookkeeping (persisted so cross-load compares are real) ----- */
    _persistVersions() {
      S().cloudSync = { stateVersion: this.stateVersion, houseVersion: this.houseVersion };
      this._applying = true; window.Commons.save(); this._applying = false;
    },
    _loadVersions() {
      const v = S().cloudSync || {};
      this.stateVersion = v.stateVersion || 0;
      this.houseVersion = v.houseVersion || 0;
    },

    /* ----- push / pull ----- */
    onSave() {
      if (this._applying) return;
      // dirty until a push completes — a page nav killing the debounce timer
      // must not lose the edit (the next flush recovers it)
      try { localStorage.setItem("dp-cloud-dirty", "1"); } catch (e) { /* private mode */ }
      if (!this.user) return;
      this.schedulePush();
    },
    schedulePush() {
      clearTimeout(this._pushTimer);
      this._pushTimer = setTimeout(() => { this.push().catch(() => {}); }, 1200);
    },
    // flush pending edits to the server before adopting anything from it —
    // the invariant that keeps a local edit from being reverted by a pull
    async flush() {
      clearTimeout(this._pushTimer);
      if (localStorage.getItem("dp-cloud-dirty")) await this.push().catch(() => {});
    },

    // the subset of identity that's public in the directory (account fields +
    // the quiz-derived dims/values/seeking + the discoverable toggle)
    _publicProfile() {
      const a = window.Commons.account.get();
      if (!a) return null;
      const me = S().me;
      return {
        name: a.name, borough: a.borough, budget: a.budget, hue: a.hue,
        bio: a.bio || "", photo: a.photo || null, socials: a.socials || {},
        seeking: me.seeking || "room", dims: me.dims || null, values: me.values || [],
        discoverable: a.discoverable !== false,
      };
    },
    _snapshotProfile() { try { this._lastProfile = JSON.stringify(this._publicProfile()); } catch (e) { this._lastProfile = ""; } },
    _snapshotPersonal() {
      const st = S();
      this._lastPersonal = {};
      Object.keys(st).forEach((k) => { if (!LOCAL_ONLY.includes(k)) this._lastPersonal[k] = JSON.stringify(st[k]); });
    },
    _snapshotHouse() {
      if (!this.user) return;
      const doc = this.houseSynced() ? this.houseDocFromLocal() : null;
      this._lastHouse = {};
      if (doc) Object.keys(doc).forEach((k) => { this._lastHouse[k] = JSON.stringify(doc[k]); });
    },

    // returns true only if every attempted PUT succeeded; baselines advance
    // ONLY on success so a failed request doesn't mask the lost edit
    async push(force) {
      if (!this.user) return false;
      const st = S();
      let ok = true;
      const changes = {}, sent = {};
      Object.keys(st).forEach((k) => {
        if (LOCAL_ONLY.includes(k)) return;
        const j = JSON.stringify(st[k]);
        if (force || this._lastPersonal[k] !== j) { changes[k] = st[k]; sent[k] = j; }
      });
      if (Object.keys(changes).length) {
        try {
          const r = await this.api("/api/state", { method: "PUT", body: JSON.stringify({ changes }) });
          this.stateVersion = r.version;
          Object.assign(this._lastPersonal, sent);
        } catch (e) { ok = false; }
      }
      // keep the PUBLIC directory profile (users table) in step with my identity
      // + quiz — this is what other people see when they browse
      try {
        const prof = this._publicProfile();
        if (prof) {
          const j = JSON.stringify(prof);
          if (force || this._lastProfile !== j) {
            const r = await this.api("/api/me", { method: "PUT", body: JSON.stringify(prof) });
            this.user = r.user;
            this._lastProfile = j;
          }
        }
      } catch (e) { ok = false; }
      if (this.houseSynced()) {
        const doc = this.houseDocFromLocal();
        if (doc) {
          const hchanges = {}, hsent = {};
          Object.keys(doc).forEach((k) => {
            if (k === "housePeople") return; // server-managed
            const j = JSON.stringify(doc[k]);
            if (force || this._lastHouse[k] !== j) { hchanges[k] = doc[k]; hsent[k] = j; }
          });
          if (Object.keys(hchanges).length) {
            try {
              await this.api("/api/house", { method: "PUT", body: JSON.stringify({ changes: hchanges }) });
              // NOTE: don't adopt the returned version — the server MERGED my push
              // with other members' data, so my local doc isn't that version's full
              // content yet. Leaving houseVersion behind makes the next pullNow
              // re-fetch the merged doc once and reconcile. Baselines still advance
              // so I don't re-push the same keys.
              Object.assign(this._lastHouse, hsent);
            } catch (e) { ok = false; }
          }
        }
      }
      if (ok) { try { localStorage.removeItem("dp-cloud-dirty"); } catch (e) {} this._persistVersions(); }
      else { try { localStorage.setItem("dp-cloud-dirty", "1"); } catch (e) {} }
      return ok;
    },

    async pullNow() {
      if (!this.user) return;
      // local house replaced (claimOwn / split moved me elsewhere)? leave first.
      const cs = S().cloudHouse;
      if (cs && cs.localId !== S().myHouseId) await this.leaveHouse().catch(() => {});
      await this.flush(); // never adopt remote before local edits are up
      const s = await this.api("/api/sync");
      // house: adopt only a house this device is synced to (join owns first adoption)
      if (s.houseId && this.houseSynced() && s.houseVersion > this.houseVersion) {
        const h = await this.api("/api/house");
        this.houseId = h.houseId;
        this.applyHouse(h.doc, h.version);
      }
      // personal: apply server changes only to keys this device hasn't touched
      // since the last sync (a diverged key is a pending local edit — keep it)
      if (s.stateVersion > this.stateVersion) {
        const remote = await this.api("/api/state");
        const st = S();
        this._applying = true;
        let changed = false;
        Object.keys(remote.doc).forEach((k) => {
          if (LOCAL_ONLY.includes(k)) return;
          if (this.houseSynced() && (HOUSE_KEYS.includes(k) || k === "houses")) return; // house doc is the authority
          const localJ = JSON.stringify(st[k]);
          if (!(k in this._lastPersonal) || localJ === this._lastPersonal[k]) {
            st[k] = remote.doc[k];
            this._lastPersonal[k] = JSON.stringify(remote.doc[k]);
            changed = true;
          }
        });
        if (changed) window.Commons.save();
        this._applying = false;
        this.stateVersion = remote.version;
        this._persistVersions();
        if (changed) window.dispatchEvent(new CustomEvent("sync:update"));
      }
    },

    _startLoop() {
      if (this._loop) return;
      this._loop = setInterval(() => { this.pullNow().catch(() => {}); }, 8000);
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) this.pullNow().catch(() => {});
      });
      this.pullNow().catch(() => {});
    },
  };

  window.CloudSync = Cloud;
  Cloud.init();
})();
