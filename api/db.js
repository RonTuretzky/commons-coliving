/* colive.fun API — storage layer.
   Two drivers behind one interface:
   - pg     : DigitalOcean managed Postgres (production). Top-level-key merges
              ride jsonb `doc || $changes` so concurrent writers only clash
              per key, never per document.
   - memory : in-process maps (dev + e2e). Same semantics, zero setup.
   Everything returns plain objects; callers never see driver types. */

const crypto = require("node:crypto");
const { mergeHouseDoc, mergeStateDoc, tooBig } = require("./merge");

const uuid = () => crypto.randomUUID();

/* ---------------- memory driver ---------------- */

function memoryDriver() {
  const users = new Map();        // id -> user row
  const credentials = new Map();  // credId -> {credId, userId, publicKey, counter, transports}
  const sessions = new Map();     // tokenHash -> {userId, expiresAt}
  const states = new Map();       // userId -> {doc, version}
  const houses = new Map();       // id -> {doc, version}
  const members = new Map();      // houseId -> Set(userId)
  const invites = new Map();      // code -> {houseId, createdBy, expiresAt}

  return {
    kind: "memory",
    async init() {},

    async createUser(fields) {
      const u = { id: "u-" + uuid(), createdAt: new Date().toISOString(), ...fields };
      users.set(u.id, u);
      return u;
    },
    async getUser(id) { return users.get(id) || null; },
    async updateUser(id, patch) {
      const u = users.get(id);
      if (!u) return null;
      Object.assign(u, patch);
      return u;
    },

    async createCredential(c) {
      if (credentials.has(c.credId)) throw Object.assign(new Error("credential exists"), { code: "conflict" });
      credentials.set(c.credId, c);
    },
    async getCredential(credId) { return credentials.get(credId) || null; },
    async setCredentialCounter(credId, counter) {
      const c = credentials.get(credId);
      if (c) c.counter = counter;
    },

    async createSession(tokenHash, userId, expiresAt) { sessions.set(tokenHash, { userId, expiresAt }); },
    async getSession(tokenHash) {
      const s = sessions.get(tokenHash);
      if (!s) return null;
      if (new Date(s.expiresAt) < new Date()) { sessions.delete(tokenHash); return null; }
      return s;
    },
    async deleteSession(tokenHash) { sessions.delete(tokenHash); },

    async getState(userId) { return states.get(userId) || null; },
    async mergeState(userId, changes) {
      const cur = states.get(userId) || { doc: {}, version: 0 };
      const next = mergeStateDoc(cur.doc, changes);
      if (tooBig(next)) throw Object.assign(new Error("state too large"), { status: 413 });
      cur.doc = next;
      cur.version += 1;
      states.set(userId, cur);
      return { version: cur.version };
    },

    async createHouse(doc) {
      const id = "h-cloud-" + uuid().slice(0, 8);
      houses.set(id, { doc, version: 1 });
      members.set(id, new Set());
      return { id, version: 1 };
    },
    async getHouse(id) {
      const h = houses.get(id);
      return h ? { id, doc: h.doc, version: h.version } : null;
    },
    // atomic read-modify-write (single-threaded JS: fn must be synchronous)
    async mutateHouse(id, fn) {
      const h = houses.get(id);
      if (!h) return null;
      const next = fn(JSON.parse(JSON.stringify(h.doc)));
      if (tooBig(next)) throw Object.assign(new Error("house too large"), { status: 413 });
      h.doc = next;
      h.version += 1;
      return { doc: h.doc, version: h.version };
    },
    async mergeHouse(id, changes) {
      const r = await this.mutateHouse(id, (doc) => mergeHouseDoc(doc, changes));
      return r && { version: r.version };
    },

    async addMember(houseId, userId) {
      if (!members.has(houseId)) members.set(houseId, new Set());
      members.get(houseId).add(userId);
    },
    async removeMember(houseId, userId) { members.get(houseId)?.delete(userId); },
    async isMember(houseId, userId) { return !!members.get(houseId)?.has(userId); },
    async houseOf(userId) {
      for (const [hid, set] of members) if (set.has(userId)) return hid;
      return null;
    },

    async createInvite(code, houseId, createdBy, expiresAt) { invites.set(code, { houseId, createdBy, expiresAt }); },
    async getInvite(code) {
      const i = invites.get(code);
      if (!i) return null;
      if (new Date(i.expiresAt) < new Date()) { invites.delete(code); return null; }
      return i;
    },
  };
}

/* ---------------- postgres driver ---------------- */

function pgDriver(databaseUrl) {
  const { Pool } = require("pg");
  // DigitalOcean managed Postgres serves a self-signed CA. Strip any sslmode from
  // the URL (newer pg treats sslmode=require as verify-full, which rejects it) and
  // set ssl explicitly so we encrypt but don't verify the chain.
  const wantsSsl = /ondigitalocean|sslmode=/.test(databaseUrl);
  const cleanUrl = databaseUrl.replace(/([?&])sslmode=[^&]*/g, "$1").replace(/[?&]$/, "");
  const pool = new Pool({
    connectionString: cleanUrl,
    ssl: wantsSsl ? { rejectUnauthorized: false } : undefined,
    max: 5,
  });

  const SCHEMA = `
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      borough TEXT,
      budget INT,
      hue TEXT,
      bio TEXT,
      photo TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS credentials (
      cred_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      public_key TEXT NOT NULL,
      counter BIGINT NOT NULL DEFAULT 0,
      transports TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      expires_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS states (
      user_id TEXT PRIMARY KEY REFERENCES users(id),
      doc JSONB NOT NULL,
      version INT NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS houses (
      id TEXT PRIMARY KEY,
      doc JSONB NOT NULL,
      version INT NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS house_members (
      house_id TEXT NOT NULL REFERENCES houses(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (house_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS invites (
      code TEXT PRIMARY KEY,
      house_id TEXT NOT NULL REFERENCES houses(id),
      created_by TEXT NOT NULL REFERENCES users(id),
      expires_at TIMESTAMPTZ NOT NULL
    );
  `;

  const row = (r) => (r.rows.length ? r.rows[0] : null);
  const userFromRow = (r) => r && {
    id: r.id, name: r.name, email: r.email, borough: r.borough, budget: r.budget,
    hue: r.hue, bio: r.bio, photo: r.photo, createdAt: r.created_at,
  };

  return {
    kind: "pg",
    async init() { await pool.query(SCHEMA); },

    async createUser(f) {
      const id = "u-" + uuid();
      const r = await pool.query(
        `INSERT INTO users (id, name, email, borough, budget, hue, bio, photo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [id, f.name, f.email || null, f.borough || null, f.budget || null, f.hue || null, f.bio || null, f.photo || null]);
      return userFromRow(row(r));
    },
    async getUser(id) {
      return userFromRow(row(await pool.query(`SELECT * FROM users WHERE id=$1`, [id])));
    },
    async updateUser(id, patch) {
      const cols = ["name", "email", "borough", "budget", "hue", "bio", "photo"].filter((k) => k in patch);
      if (!cols.length) return this.getUser(id);
      const sets = cols.map((c, i) => `${c}=$${i + 2}`).join(", ");
      const r = await pool.query(`UPDATE users SET ${sets} WHERE id=$1 RETURNING *`, [id, ...cols.map((c) => patch[c])]);
      return userFromRow(row(r));
    },

    async createCredential(c) {
      try {
        await pool.query(
          `INSERT INTO credentials (cred_id, user_id, public_key, counter, transports) VALUES ($1,$2,$3,$4,$5)`,
          [c.credId, c.userId, c.publicKey, c.counter, c.transports || null]);
      } catch (e) {
        if (e.code === "23505") throw Object.assign(new Error("credential exists"), { code: "conflict" });
        throw e;
      }
    },
    async getCredential(credId) {
      const r = row(await pool.query(`SELECT * FROM credentials WHERE cred_id=$1`, [credId]));
      return r && { credId: r.cred_id, userId: r.user_id, publicKey: r.public_key, counter: Number(r.counter), transports: r.transports };
    },
    async setCredentialCounter(credId, counter) {
      await pool.query(`UPDATE credentials SET counter=$2 WHERE cred_id=$1`, [credId, counter]);
    },

    async createSession(tokenHash, userId, expiresAt) {
      await pool.query(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1,$2,$3)`, [tokenHash, userId, expiresAt]);
    },
    async getSession(tokenHash) {
      const r = row(await pool.query(`SELECT * FROM sessions WHERE token_hash=$1 AND expires_at > now()`, [tokenHash]));
      return r && { userId: r.user_id, expiresAt: r.expires_at };
    },
    async deleteSession(tokenHash) { await pool.query(`DELETE FROM sessions WHERE token_hash=$1`, [tokenHash]); },

    async getState(userId) {
      const r = row(await pool.query(`SELECT doc, version FROM states WHERE user_id=$1`, [userId]));
      return r && { doc: r.doc, version: r.version };
    },
    async mergeState(userId, changes) {
      // read-modify-write under a row lock so a size cap and proto-safe merge apply
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const cur = row(await client.query(`SELECT doc, version FROM states WHERE user_id=$1 FOR UPDATE`, [userId]));
        const next = mergeStateDoc(cur ? cur.doc : {}, changes);
        if (tooBig(next)) throw Object.assign(new Error("state too large"), { status: 413 });
        const r = cur
          ? row(await client.query(`UPDATE states SET doc=$2::jsonb, version=version+1, updated_at=now() WHERE user_id=$1 RETURNING version`, [userId, JSON.stringify(next)]))
          : row(await client.query(`INSERT INTO states (user_id, doc, version) VALUES ($1, $2::jsonb, 1) RETURNING version`, [userId, JSON.stringify(next)]));
        await client.query("COMMIT");
        return { version: r.version };
      } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; }
      finally { client.release(); }
    },

    async createHouse(doc) {
      const id = "h-cloud-" + uuid().slice(0, 8);
      await pool.query(`INSERT INTO houses (id, doc) VALUES ($1, $2::jsonb)`, [id, JSON.stringify(doc)]);
      return { id, version: 1 };
    },
    async getHouse(id) {
      const r = row(await pool.query(`SELECT doc, version FROM houses WHERE id=$1`, [id]));
      return r && { id, doc: r.doc, version: r.version };
    },
    // atomic read-modify-write under a row lock; fn may be sync or async
    async mutateHouse(id, fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const cur = row(await client.query(`SELECT doc, version FROM houses WHERE id=$1 FOR UPDATE`, [id]));
        if (!cur) { await client.query("ROLLBACK"); return null; }
        const next = await fn(cur.doc);
        if (tooBig(next)) throw Object.assign(new Error("house too large"), { status: 413 });
        const r = row(await client.query(
          `UPDATE houses SET doc=$2::jsonb, version=version+1, updated_at=now() WHERE id=$1 RETURNING version`,
          [id, JSON.stringify(next)]));
        await client.query("COMMIT");
        return { doc: next, version: r.version };
      } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; }
      finally { client.release(); }
    },
    async mergeHouse(id, changes) {
      const r = await this.mutateHouse(id, (doc) => mergeHouseDoc(doc, changes));
      return r && { version: r.version };
    },

    async addMember(houseId, userId) {
      await pool.query(
        `INSERT INTO house_members (house_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [houseId, userId]);
    },
    async removeMember(houseId, userId) {
      await pool.query(`DELETE FROM house_members WHERE house_id=$1 AND user_id=$2`, [houseId, userId]);
    },
    async isMember(houseId, userId) {
      const r = row(await pool.query(`SELECT 1 AS ok FROM house_members WHERE house_id=$1 AND user_id=$2`, [houseId, userId]));
      return !!r;
    },
    async houseOf(userId) {
      const r = row(await pool.query(
        `SELECT house_id FROM house_members WHERE user_id=$1 ORDER BY joined_at DESC LIMIT 1`, [userId]));
      return r ? r.house_id : null;
    },

    async createInvite(code, houseId, createdBy, expiresAt) {
      await pool.query(`INSERT INTO invites (code, house_id, created_by, expires_at) VALUES ($1,$2,$3,$4)`,
        [code, houseId, createdBy, expiresAt]);
    },
    async getInvite(code) {
      const r = row(await pool.query(`SELECT * FROM invites WHERE code=$1 AND expires_at > now()`, [code]));
      return r && { houseId: r.house_id, createdBy: r.created_by, expiresAt: r.expires_at };
    },
  };
}

function makeDb() {
  if (process.env.STORAGE === "memory" || !process.env.DATABASE_URL) return memoryDriver();
  return pgDriver(process.env.DATABASE_URL);
}

module.exports = { makeDb };
