/* colive.fun API — passkey auth, cross-device state sync, shared houses.
   Runs as a DigitalOcean App Platform service routed at /api (same origin as
   the static site, so plain httpOnly cookies do sessions and CORS never
   exists). In dev/tests it also serves the static site itself (STATIC_DIR).

   Design notes:
   - Auth is passkey-only (WebAuthn, server-verified). No passwords anywhere.
   - State sync is per-top-level-key last-writer-wins: clients push only the
     keys that changed; the server merges (`doc || changes`), so two house
     members only conflict when they touch the same key at the same moment.
   - House docs are canonical: member ids are real user ids. Each client
     translates its own id <-> 'me' at the sync layer (assets/js/sync.js). */

const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} = require("@simplewebauthn/server");
const { makeDb } = require("./db");

const PORT = Number(process.env.PORT || 8080);
const RP_ID = process.env.RP_ID || "colive.fun";
const RP_NAME = "colive.fun";
const ORIGINS = (process.env.ORIGINS || "https://colive.fun,https://www.colive.fun").split(",").map((s) => s.trim());
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const STATIC_DIR = process.env.STATIC_DIR || null;
const SESSION_DAYS = 30;
const BODY_LIMIT = 4 * 1024 * 1024; // personal docs carry data-url photos

const db = makeDb();

/* ---------------- small utilities ---------------- */

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const hmac = (s) => crypto.createHmac("sha256", SECRET).update(s).digest("base64url");
const b64 = (buf) => Buffer.from(buf).toString("base64");
const fromB64 = (s) => new Uint8Array(Buffer.from(s, "base64"));

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

// stateless signed challenge: value.timestamp.hmac, 5 minute window.
// Single-use: once a ceremony verifies against a challenge, it is burned so a
// captured request can't be replayed within the HMAC lifetime.
const usedChallenges = new Map(); // challenge -> expiresAt
function sweepChallenges() {
  const now = Date.now();
  for (const [c, exp] of usedChallenges) if (exp < now) usedChallenges.delete(c);
}
function issueChallenge(res, challenge) {
  const ts = Date.now().toString();
  setCookie(res, "colive_chal", `${challenge}.${ts}.${hmac(challenge + ts)}`, 300);
}
function readChallenge(req) {
  const raw = parseCookies(req).colive_chal;
  if (!raw) return null;
  const [challenge, ts, sig] = raw.split(".");
  if (!challenge || !ts || !sig) return null;
  if (Date.now() - Number(ts) > 5 * 60 * 1000) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(hmac(challenge + ts)))) return null;
  if (usedChallenges.has(challenge)) return null; // already consumed
  return challenge;
}
function burnChallenge(res, challenge) {
  sweepChallenges();
  usedChallenges.set(challenge, Date.now() + 6 * 60 * 1000);
  setCookie(res, "colive_chal", "", 0); // clear the cookie too
}

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
  return out;
};

const publicUser = (u) => u && ({
  id: u.id, name: u.name, email: u.email, borough: u.borough, budget: u.budget,
  hue: u.hue, bio: u.bio, photo: u.photo, createdAt: u.createdAt,
});

/* the person record housemates see for a cloud member — mirrors the seeded
   person shape so every existing page renders it without special cases */
const personFor = (u) => ({
  id: u.id, name: u.name, age: null, borough: u.borough || "NYC", budget: u.budget || 1400,
  dims: { hearth: 50, order: 50, voice: 50, mission: 50, porch: 50, pool: 50 },
  values: [], hard: [], flags: [],
  blurb: u.bio || "Cloud member — profile syncs from their device.",
  seeking: "has-house", events: [],
  hue: u.hue || undefined, photo: u.photo || undefined,
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

/* ---------------- routes ---------------- */

const routes = {
  "GET /api/health": async (req, res) => send(res, 200, { ok: true, storage: db.kind, rpId: RP_ID }),

  "POST /api/auth/register-options": async (req, res) => {
    if (rateLimited(req)) return send(res, 429, { error: "slow down" });
    const body = await readBody(req);
    const name = String(body.name || "").trim().slice(0, 80);
    if (!name) return send(res, 400, { error: "name required" });
    const options = await generateRegistrationOptions({
      rpName: RP_NAME, rpID: RP_ID, userName: name, userDisplayName: name,
      attestationType: "none",
      authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
    });
    issueChallenge(res, options.challenge);
    send(res, 200, { options });
  },

  "POST /api/auth/register-verify": async (req, res) => {
    if (rateLimited(req)) return send(res, 429, { error: "slow down" });
    const body = await readBody(req);
    const expectedChallenge = readChallenge(req);
    if (!expectedChallenge) return send(res, 400, { error: "challenge expired — try again" });
    if (!body.credential) return send(res, 400, { error: "credential required" });
    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: body.credential,
        expectedChallenge,
        expectedOrigin: ORIGINS,
        expectedRPID: RP_ID,
        requireUserVerification: false,
      });
    } catch (e) { return send(res, 400, { error: "verification failed: " + e.message }); }
    if (!verification.verified) return send(res, 400, { error: "not verified" });
    burnChallenge(res, expectedChallenge);

    const cred = verification.registrationInfo.credential;
    const existing = await db.getCredential(cred.id);
    if (existing) return send(res, 409, { error: "this passkey already has an account — sign in instead" });

    const profile = profileFields(body.profile || {});
    if (!profile.name) return send(res, 400, { error: "profile.name required" });
    const user = await db.createUser(profile);
    await db.createCredential({
      credId: cred.id, userId: user.id, publicKey: b64(cred.publicKey),
      counter: cred.counter, transports: (cred.transports || []).join(","),
    });
    await issueSession(res, user.id);
    send(res, 200, { user: publicUser(user) });
  },

  "POST /api/auth/login-options": async (req, res) => {
    if (rateLimited(req)) return send(res, 429, { error: "slow down" });
    // usernameless: discoverable credentials — the browser offers the account picker
    const options = await generateAuthenticationOptions({ rpID: RP_ID, userVerification: "preferred" });
    issueChallenge(res, options.challenge);
    send(res, 200, { options });
  },

  "POST /api/auth/login-verify": async (req, res) => {
    if (rateLimited(req)) return send(res, 429, { error: "slow down" });
    const body = await readBody(req);
    const expectedChallenge = readChallenge(req);
    if (!expectedChallenge) return send(res, 400, { error: "challenge expired — try again" });
    if (!body.credential || !body.credential.id) return send(res, 400, { error: "credential required" });
    const stored = await db.getCredential(body.credential.id);
    if (!stored) return send(res, 404, { error: "no account for this passkey — create one first" });
    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: body.credential,
        expectedChallenge,
        expectedOrigin: ORIGINS,
        expectedRPID: RP_ID,
        requireUserVerification: false,
        credential: {
          id: stored.credId, publicKey: fromB64(stored.publicKey),
          counter: stored.counter, transports: stored.transports ? stored.transports.split(",") : undefined,
        },
      });
    } catch (e) { return send(res, 400, { error: "verification failed: " + e.message }); }
    if (!verification.verified) return send(res, 400, { error: "not verified" });
    burnChallenge(res, expectedChallenge);
    await db.setCredentialCounter(stored.credId, verification.authenticationInfo.newCounter);
    const user = await db.getUser(stored.userId);
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
