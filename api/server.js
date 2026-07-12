/* colive.fun API — hosted accounts, cross-device state sync, shared houses.
   Runs as a DigitalOcean App Platform service routed at /api (same origin as
   the static site, so plain httpOnly cookies do sessions and CORS never
   exists). In dev/tests it also serves the static site itself (STATIC_DIR).

   Design notes:
   - Auth is username + password (server-hashed with scrypt). The SERVER is the
     source of truth for identity and state — sign in from any browser (incl.
     incognito) and your world is there.
   - State sync merges per top-level key; the house doc merges per element so
     concurrent edits (votes, expenses, signatures) converge (see merge.js).
   - House docs are canonical: member ids are real user ids. Each client
     translates its own id <-> 'me' at the sync layer (assets/js/sync.js). */

const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { makeDb } = require("./db");

const PORT = Number(process.env.PORT || 8080);
const RP_ID = process.env.RP_ID || "colive.fun";
const ORIGINS = (process.env.ORIGINS || "https://colive.fun,https://www.colive.fun").split(",").map((s) => s.trim());
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const STATIC_DIR = process.env.STATIC_DIR || null;
const SESSION_DAYS = 30;
const BODY_LIMIT = 4 * 1024 * 1024; // personal docs carry data-url photos

const db = makeDb();

/* ---------------- small utilities ---------------- */

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function setCookie(res, name, value, maxAgeSec) {
  const secure = ORIGINS.some((o) => o.startsWith("https://")) ? " Secure;" : "";
  const prior = res.getHeader("Set-Cookie") || [];
  const list = Array.isArray(prior) ? prior : [prior];
  list.push(`${name}=${encodeURIComponent(value)}; Path=/; HttpOnly;${secure} SameSite=Lax; Max-Age=${maxAgeSec}`);
  res.setHeader("Set-Cookie", list);
}

// Password hashing with scrypt (node built-in — no dependency). Stored as
// scrypt$N$r$p$salt$hash; verification is constant-time.
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const dk = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${dk.toString("base64")}`;
}
function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, saltB64, hashB64] = String(stored).split("$");
    if (scheme !== "scrypt") return false;
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const dk = crypto.scryptSync(password, salt, expected.length, { N: Number(N), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
    return dk.length === expected.length && crypto.timingSafeEqual(dk, expected);
  } catch (e) { return false; }
}
const USERNAME_RE = /^[a-z0-9_.-]{3,30}$/;

async function issueSession(res, userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  await db.createSession(sha256(token), userId, expires);
  setCookie(res, "colive_session", token, SESSION_DAYS * 86400);
}

async function currentUser(req) {
  const token = parseCookies(req).colive_session;
  if (!token) return null;
  const sess = await db.getSession(sha256(token));
  if (!sess) return null;
  return await db.getUser(sess.userId);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > BODY_LIMIT) { reject(Object.assign(new Error("body too large"), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { reject(Object.assign(new Error("invalid json"), { status: 400 })); }
    });
    req.on("error", reject);
  });
}

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(body);
}

/* per-ip limiter. Behind DigitalOcean's ingress the trusted proxy APPENDS the
   real client IP to the right of any client-supplied X-Forwarded-For, so the
   rightmost entry is the one to trust — the leftmost is attacker-controlled. */
const buckets = new Map();
function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) { const parts = String(xff).split(","); return parts[parts.length - 1].trim(); }
  return req.socket.remoteAddress || "?";
}
function rateLimited(req, limit) {
  const ip = clientIp(req);
  const now = Date.now();
  // sweep expired buckets instead of nuking all (which would wipe live counters)
  if (buckets.size > 20000) for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k);
  let b = buckets.get(ip);
  if (!b || now > b.resetAt) { b = { count: 0, resetAt: now + 5 * 60 * 1000 }; buckets.set(ip, b); }
  b.count += 1;
  return b.count > (limit || 60);
}

// A hue is a CSS color the UI drops into an inline style; a photo is a data:
// image URL. Both are rendered by other members' devices, so validate strictly
// here (defence in depth — avatarHtml also escapes) and never store garbage.
const HUE_RE = /^#[0-9a-fA-F]{3,8}$|^(rgb|hsl)a?\([0-9.,%\s/]+\)$/;
const profileFields = (body) => {
  const out = {};
  ["name", "email", "borough", "budget", "hue", "bio", "photo"].forEach((k) => {
    if (k in body && (typeof body[k] === "string" || typeof body[k] === "number" || body[k] === null)) out[k] = body[k];
  });
  if ("budget" in out) {
    const n = Math.round(Number(out.budget));
    out.budget = Number.isFinite(n) && n >= 0 && n <= 100000 ? n : null; // fits Postgres INT, sane range
  }
  if (typeof out.name === "string") out.name = out.name.slice(0, 80);
  if (typeof out.email === "string") out.email = out.email.slice(0, 200);
  if (typeof out.borough === "string") out.borough = out.borough.slice(0, 60);
  if (typeof out.bio === "string") out.bio = out.bio.slice(0, 2000);
  if ("hue" in out && !(typeof out.hue === "string" && HUE_RE.test(out.hue))) out.hue = null;
  if ("photo" in out) {
    const ok = typeof out.photo === "string" && /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(out.photo) && out.photo.length <= 400_000;
    if (!ok) delete out.photo; // canvas output is ~30KB; reject non-images and anything huge
  }
  if ("socials" in body) out.socials = sanitizeSocials(body.socials);
  if ("seeking" in body && ["room", "founding", "has-house"].includes(body.seeking)) out.seeking = body.seeking;
  if ("discoverable" in body) out.discoverable = !!body.discoverable;
  if ("dims" in body) out.dims = sanitizeDims(body.dims);
  if ("values" in body && Array.isArray(body.values)) {
    out.values = body.values.filter((v) => typeof v === "string").map((v) => v.slice(0, 40)).slice(0, 10);
  }
  return out;
};

const DIM_KEYS = ["hearth", "order", "voice", "mission", "porch", "pool"];
function sanitizeDims(d) {
  if (!d || typeof d !== "object") return null;
  const out = {};
  DIM_KEYS.forEach((k) => { const n = Math.round(Number(d[k])); out[k] = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 50; });
  return out;
}

// Socials are rendered as links on profiles — sanitize hard. Handles are
// stripped to safe chars; the website must be an http(s) URL.
const HANDLE_RE = /^[A-Za-z0-9_.]{1,40}$/;
function sanitizeSocials(v) {
  const out = {};
  if (!v || typeof v !== "object") return out;
  ["instagram", "x", "telegram", "farcaster"].forEach((k) => {
    if (typeof v[k] === "string") {
      const h = v[k].trim().replace(/^@+/, "").slice(0, 40);
      if (h && HANDLE_RE.test(h)) out[k] = h;
    }
  });
  if (typeof v.website === "string") {
    let w = v.website.trim().slice(0, 200);
    if (w && !/^https?:\/\//i.test(w)) w = "https://" + w;
    try { const u = new URL(w); if (u.protocol === "http:" || u.protocol === "https:") out.website = u.href; } catch (e) { /* drop */ }
  }
  return out;
}

const publicUser = (u) => u && ({
  id: u.id, username: u.username, name: u.name, email: u.email, borough: u.borough, budget: u.budget,
  hue: u.hue, bio: u.bio, photo: u.photo, socials: u.socials || {},
  seeking: u.seeking || "room", dims: u.dims || null, values: u.values || [], discoverable: u.discoverable !== false,
  createdAt: u.createdAt,
});

/* the person record housemates see for a cloud member — mirrors the seeded
   person shape so every existing page renders it without special cases */
const personFor = (u) => ({
  id: u.id, username: u.username || undefined, name: u.name, age: null, borough: u.borough || "NYC", budget: u.budget || 1400,
  dims: u.dims || { hearth: 50, order: 50, voice: 50, mission: 50, porch: 50, pool: 50 },
  values: u.values || [], hard: [], flags: [],
  blurb: u.bio || "New here — profile fills in with the quiz.",
  seeking: u.seeking || "has-house", events: [],
  hue: u.hue || undefined, photo: u.photo || undefined, socials: u.socials || {},
});

/* mirrors Commons.houses.join(): a new member enters every running system */
function addMemberToDoc(doc, user) {
  const uid = user.id;
  doc.house = doc.house || {};
  doc.house.members = doc.house.members || [];
  if (!doc.house.members.includes(uid)) {
    doc.house.members.push(uid);
    if (doc.house.roomsOpen > 0) doc.house.roomsOpen -= 1;
  }
  doc.contributions = doc.contributions || [];
  if (!doc.contributions.some((c) => c.member === uid)) doc.contributions.push({ member: uid, paid: false });
  (doc.bills || []).forEach((b) => { if (b.rotation && !b.rotation.includes(uid)) b.rotation.push(uid); });
  (doc.chores || []).forEach((c) => { if (c.rotation && !c.rotation.includes(uid)) c.rotation.push(uid); });
  if (doc.mealPlan && Array.isArray(doc.mealPlan.rotation)) {
    if (!doc.mealPlan.rotation.includes(uid)) doc.mealPlan.rotation.push(uid);
    doc.mealPlan.eaters = doc.house.members.length;
  }
  doc.housePeople = doc.housePeople || [];
  const i = doc.housePeople.findIndex((p) => p.id === uid);
  if (i >= 0) doc.housePeople[i] = personFor(user); else doc.housePeople.push(personFor(user));
  return doc;
}

const safeColor = (c) => (typeof c === "string" && HUE_RE.test(c)) ? c : "#0d9488";

// A public, safe summary of a shared house for the browse directory — house
// meta + member cards, never the private ledger/chores/votes. Only members who
// are CURRENTLY discoverable are exposed (from their fresh user record), so an
// opt-out is honored even for someone living in a listed house.
function publicHouseSummary(id, doc, discById) {
  const h = doc && doc.house;
  if (!h || !Array.isArray(h.members)) return null;
  const listed = (h.roomsOpen || 0) > 0 || h.listed === true;
  const housePeople = h.members.map((mid) => discById.get(mid)).filter(Boolean).map((u) => personFor(u));
  return {
    id, name: h.name, borough: h.borough, hood: h.hood, rent: h.rent || 0,
    roomsOpen: h.roomsOpen || 0, hue: safeColor(h.hue), blurb: h.blurb || h.vibe || "",
    mission: h.mission || "", founded: h.founded, poolModel: h.poolModel,
    networked: h.networked, lenses: h.lenses, hasLocation: h.hasLocation !== false,
    members: housePeople.map((p) => p.id), memberCount: h.members.length, housePeople, listed,
  };
}

/* ---------------- routes ---------------- */

const routes = {
  "GET /api/health": async (req, res) => send(res, 200, { ok: true, storage: db.kind, rpId: RP_ID }),

  // public: the browsable directory — houses seeking members AND discoverable
  // people, so both sides of the match can find each other (no auth needed)
  "GET /api/directory": async (req, res) => {
    const all = await db.allHouses();
    const discoverable = await db.listDiscoverable();
    const discById = new Map(discoverable.map((u) => [u.id, u]));
    const houses = all.map((x) => publicHouseSummary(x.id, x.doc, discById)).filter((h) => h && h.listed);
    const people = discoverable.map((u) => personFor(u));
    send(res, 200, { houses, people });
  },

  "POST /api/auth/register": async (req, res) => {
    if (rateLimited(req, 30)) return send(res, 429, { error: "slow down" });
    const body = await readBody(req);
    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!USERNAME_RE.test(username)) return send(res, 400, { error: "username must be 3–30 characters: letters, numbers, . _ -" });
    if (password.length < 8) return send(res, 400, { error: "password must be at least 8 characters" });
    if (await db.getUserByUsername(username)) return send(res, 409, { error: "that username is taken — pick another or sign in" });
    const profile = profileFields(body.profile || {});
    if (!profile.name) profile.name = username;
    profile.username = username;
    profile.passwordHash = hashPassword(password);
    const user = await db.createUser(profile);
    await issueSession(res, user.id);
    send(res, 200, { user: publicUser(user) });
  },

  "POST /api/auth/login": async (req, res) => {
    if (rateLimited(req, 30)) return send(res, 429, { error: "slow down" });
    const body = await readBody(req);
    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!username || !password) return send(res, 400, { error: "username and password required" });
    const user = await db.getUserByUsername(username);
    // constant-ish work whether or not the user exists (don't leak which)
    const ok = user && user.passwordHash && verifyPassword(password, user.passwordHash);
    if (!ok) return send(res, 401, { error: "wrong username or password" });
    await issueSession(res, user.id);
    send(res, 200, { user: publicUser(user) });
  },

  "POST /api/auth/logout": async (req, res) => {
    const token = parseCookies(req).colive_session;
    if (token) await db.deleteSession(sha256(token));
    setCookie(res, "colive_session", "", 0);
    send(res, 200, { ok: true });
  },

  "GET /api/me": async (req, res) => {
    const user = await currentUser(req);
    if (!user) return send(res, 401, { error: "not signed in" });
    const houseId = await db.houseOf(user.id);
    send(res, 200, { user: publicUser(user), houseId });
  },

  "PUT /api/me": async (req, res) => {
    const user = await currentUser(req);
    if (!user) return send(res, 401, { error: "not signed in" });
    const patch = profileFields(await readBody(req));
    const updated = await db.updateUser(user.id, patch);
    // keep the house's person record for me in sync so housemates see the update —
    // atomic RMW so a concurrent join/edit doesn't get clobbered off housePeople
    const houseId = await db.houseOf(user.id);
    if (houseId) {
      await db.mutateHouse(houseId, (doc) => {
        const people = doc.housePeople || [];
        const i = people.findIndex((p) => p.id === user.id);
        if (i >= 0) people[i] = personFor(updated); else people.push(personFor(updated));
        doc.housePeople = people;
        return doc;
      }).catch(() => {});
    }
    send(res, 200, { user: publicUser(updated) });
  },

  "GET /api/state": async (req, res) => {
    const user = await currentUser(req);
    if (!user) return send(res, 401, { error: "not signed in" });
    const state = await db.getState(user.id);
    if (!state) return send(res, 404, { error: "no state yet" });
    send(res, 200, state);
  },

  "PUT /api/state": async (req, res) => {
    const user = await currentUser(req);
    if (!user) return send(res, 401, { error: "not signed in" });
    if (rateLimited(req, 240)) return send(res, 429, { error: "slow down" });
    const body = await readBody(req);
    const changes = body.changes;
    if (!changes || typeof changes !== "object" || Array.isArray(changes)) return send(res, 400, { error: "changes object required" });
    const { version } = await db.mergeState(user.id, changes);
    send(res, 200, { version });
  },

  "GET /api/sync": async (req, res) => {
    const user = await currentUser(req);
    if (!user) return send(res, 401, { error: "not signed in" });
    const state = await db.getState(user.id);
    const houseId = await db.houseOf(user.id);
    const house = houseId ? await db.getHouse(houseId) : null;
    send(res, 200, {
      stateVersion: state ? state.version : 0,
      houseId: houseId || null,
      houseVersion: house ? house.version : 0,
    });
  },

  "POST /api/houses": async (req, res) => {
    const user = await currentUser(req);
    if (!user) return send(res, 401, { error: "not signed in" });
    const existing = await db.houseOf(user.id);
    if (existing) return send(res, 409, { error: "already in a cloud house", houseId: existing });
    const body = await readBody(req);
    const doc = body.doc;
    if (!doc || typeof doc !== "object" || !doc.house) return send(res, 400, { error: "doc with house record required" });
    // the founder's device sends the doc already canonicalized (their uid, not 'me')
    doc.housePeople = doc.housePeople || [];
    if (!doc.housePeople.some((p) => p.id === user.id)) doc.housePeople.push(personFor(user));
    const { id, version } = await db.createHouse(doc);
    await db.addMember(id, user.id);
    send(res, 200, { houseId: id, version });
  },

  "GET /api/house": async (req, res) => {
    const user = await currentUser(req);
    if (!user) return send(res, 401, { error: "not signed in" });
    const houseId = await db.houseOf(user.id);
    if (!houseId) return send(res, 404, { error: "no cloud house" });
    const house = await db.getHouse(houseId);
    send(res, 200, { houseId, doc: house.doc, version: house.version });
  },

  "PUT /api/house": async (req, res) => {
    const user = await currentUser(req);
    if (!user) return send(res, 401, { error: "not signed in" });
    if (rateLimited(req, 240)) return send(res, 429, { error: "slow down" });
    const houseId = await db.houseOf(user.id);
    if (!houseId) return send(res, 404, { error: "no cloud house" });
    const body = await readBody(req);
    const changes = body.changes;
    if (!changes || typeof changes !== "object" || Array.isArray(changes)) return send(res, 400, { error: "changes object required" });
    delete changes.housePeople; // server-managed (profile updates flow through PUT /api/me)
    // the house record must stay a well-formed object — never let a scalar or a
    // member-less blob overwrite it (that would break every member's house view)
    if ("house" in changes) {
      const h = changes.house;
      if (!h || typeof h !== "object" || Array.isArray(h) || !Array.isArray(h.members)) {
        return send(res, 400, { error: "house must be an object with a members array" });
      }
    }
    const result = await db.mergeHouse(houseId, changes);
    send(res, 200, { version: result.version });
  },

  "POST /api/house/invite": async (req, res) => {
    const user = await currentUser(req);
    if (!user) return send(res, 401, { error: "not signed in" });
    const houseId = await db.houseOf(user.id);
    if (!houseId) return send(res, 404, { error: "no cloud house" });
    const code = crypto.randomBytes(5).toString("hex"); // 10 chars, plenty for 7-day codes
    const expires = new Date(Date.now() + 7 * 864e5).toISOString();
    await db.createInvite(code, houseId, user.id, expires);
    send(res, 200, { code, expiresAt: expires });
  },

  "POST /api/join": async (req, res) => {
    const user = await currentUser(req);
    if (!user) return send(res, 401, { error: "not signed in" });
    const body = await readBody(req);
    const invite = await db.getInvite(String(body.code || "").toLowerCase());
    if (!invite) return send(res, 404, { error: "invite not found or expired" });
    const already = await db.houseOf(user.id);
    if (already && already !== invite.houseId) return send(res, 409, { error: "already in another cloud house" });
    if (!(await db.isMember(invite.houseId, user.id))) {
      // atomic RMW under a row lock — two people joining at once both stick,
      // instead of the second overwriting the first (full-doc replace was racy)
      const r = await db.mutateHouse(invite.houseId, (doc) => addMemberToDoc(doc, user));
      if (!r) return send(res, 404, { error: "house is gone" });
      await db.addMember(invite.houseId, user.id);
    }
    const fresh = await db.getHouse(invite.houseId);
    send(res, 200, { houseId: invite.houseId, doc: fresh.doc, version: fresh.version });
  },

  "POST /api/house/leave": async (req, res) => {
    const user = await currentUser(req);
    if (!user) return send(res, 401, { error: "not signed in" });
    const houseId = await db.houseOf(user.id);
    if (!houseId) return send(res, 200, { ok: true }); // already out
    await db.mutateHouse(houseId, (doc) => {
      if (doc.house && Array.isArray(doc.house.members)) doc.house.members = doc.house.members.filter((m) => m !== user.id);
      if (Array.isArray(doc.contributions)) doc.contributions = doc.contributions.filter((c) => c.member !== user.id);
      if (Array.isArray(doc.housePeople)) doc.housePeople = doc.housePeople.filter((p) => p.id !== user.id);
      (doc.bills || []).forEach((b) => { if (Array.isArray(b.rotation)) b.rotation = b.rotation.filter((m) => m !== user.id); });
      (doc.chores || []).forEach((c) => { if (Array.isArray(c.rotation)) c.rotation = c.rotation.filter((m) => m !== user.id); });
      return doc;
    }).catch(() => {});
    await db.removeMember(houseId, user.id);
    send(res, 200, { ok: true });
  },
};

/* ---------------- static serving (dev + e2e only) ---------------- */

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".md": "text/markdown", ".txt": "text/plain",
};

function serveStatic(req, res, urlPath) {
  let p = decodeURIComponent(urlPath.split("?")[0]);
  if (p === "/") p = "/index.html";
  const file = path.join(STATIC_DIR, path.normalize(p).replace(/^(\.\.[/\\])+/, ""));
  if (!file.startsWith(path.resolve(STATIC_DIR))) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}

/* ---------------- server ---------------- */

const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split("?")[0];
  try {
    if (urlPath.startsWith("/api/")) {
      const handler = routes[`${req.method} ${urlPath}`];
      if (!handler) return send(res, 404, { error: "no such endpoint" });
      await handler(req, res);
      return;
    }
    if (STATIC_DIR) return serveStatic(req, res, req.url);
    send(res, 404, { error: "api only — the site lives on the static component" });
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(`[api] ${req.method} ${urlPath} failed:`, e);
    send(res, status, { error: status === 500 ? "server error" : e.message });
  }
});

db.init().then(() => {
  server.listen(PORT, () => {
    console.log(`[api] listening on :${PORT} · storage=${db.kind} · rpID=${RP_ID} · origins=${ORIGINS.join("|")}${STATIC_DIR ? " · serving static from " + STATIC_DIR : ""}`);
  });
}).catch((e) => {
  console.error("[api] db init failed:", e);
  process.exit(1);
});
