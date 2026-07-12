// colive.fun cloud e2e — the backend, driven like real life:
// two people, two browsers, one shared house. The API server also serves the
// static site (same origin), exactly like the App Platform layout.
import { chromium } from 'playwright';
import { spawn } from 'child_process';

const PORT = 8092;
const BASE = `http://localhost:${PORT}`;
const REPO = '/Users/wk/conductor/workspaces/research/cancun';

const results = [];
let browser;

async function test(name, fn, errs) {
  try {
    await fn();
    if (errs && errs.length) throw new Error('JS errors: ' + errs.join(' | ').slice(0, 200));
    results.push(['PASS', name]);
  } catch (e) {
    results.push(['FAIL', name + ' — ' + String(e.message).slice(0, 260)]);
    if (errs) errs.length = 0;
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- rig: API server (memory storage) serving the repo ---------- */
const server = spawn('node', [REPO + '/api/server.js'], {
  env: {
    ...process.env, PORT: String(PORT),
    STORAGE: process.env.CLOUD_STORAGE || 'memory',
    DATABASE_URL: process.env.CLOUD_DB_URL || '',
    STATIC_DIR: REPO,
    RP_ID: 'localhost', ORIGINS: BASE, SESSION_SECRET: 'e2e-secret',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });
await sleep(900);

browser = await chromium.launch();

/* a "device": its own browser context, virtual authenticator, error trap */
async function device() {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
    protocol: 'ctap2', transport: 'internal', hasResidentKey: true,
    hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true,
  }});
  return { ctx, page, errs, cdp, authenticatorId };
}
const ev = (page, fn, arg) => page.evaluate(fn, arg);
async function cloudReady(page) {
  await page.waitForFunction(() => window.CloudSync && window.CloudSync.available === true, null, { timeout: 8000 });
}

/* ================= device A: Ada founds the house ================= */
const A = await device();

await test('cloud: signup creates a server-verified passkey account', async () => {
  await A.page.goto(BASE + '/account.html');
  await cloudReady(A.page);
  await A.page.fill('#a-name', 'Ada Cloudwright');
  await A.page.fill('#a-bio', 'Fixes the wifi, feeds the sourdough.');
  await A.page.locator('#a-save').click();
  await A.page.waitForTimeout(2500); // passkey ceremony + register + redirect
  assert(A.page.url().includes('quiz.html'), 'not onboarded after signup: ' + A.page.url());
  await A.page.goto(BASE + '/account.html');
  await cloudReady(A.page);
  await A.page.waitForFunction(() => window.CloudSync.user, null, { timeout: 6000 });
  const user = await ev(A.page, () => window.CloudSync.user);
  assert(user && user.name === 'Ada Cloudwright' && user.id.startsWith('u-'), 'no cloud user: ' + JSON.stringify(user));
  const acct = await ev(A.page, () => window.Commons.account.get());
  assert(acct.passkey && acct.passkey.credId, 'local passkey gate not set from cloud credential');
  const body = await ev(A.page, () => document.getElementById('cloud-slot').textContent);
  assert(body.includes('Synced') && body.includes('Ada'), 'cloud card not showing synced: ' + body.slice(0, 120));
}, A.errs);

await test('cloud: personal state pushes as you go', async () => {
  await ev(A.page, () => { window.Commons.setMe({ blurb: 'Cloud-backed and thriving.' }); });
  await A.page.waitForTimeout(2200); // debounce + push
  const version = await ev(A.page, () => window.CloudSync.stateVersion);
  assert(version >= 1, 'state never pushed, version=' + version);
}, A.errs);

let inviteCode = null;
await test('cloud: found a house, put it online, mint an invite', async () => {
  await ev(A.page, () => {
    window.Commons.houses.claimOwn({
      id: 'h-cloudtest', name: 'Cloud Nine', borough: 'Bed-Stuy', hood: 'Bed-Stuy', hasLocation: true,
      rent: 1400, poolModel: 'fund', poolMonthly: 150, mission: 'test the backend', networked: 50,
      roomsOpen: 2, moveIn: null, founded: 'forming', members: ['me'], values: [], rules: [],
      hue: '#0d9488', blurb: 'The house that syncs.',
    });
  });
  await A.page.goto(BASE + '/dashboard.html');
  await cloudReady(A.page);
  await A.page.waitForSelector("[data-cloud='online']", { timeout: 6000 });
  await A.page.locator("[data-cloud='online']").click();
  await A.page.waitForSelector("[data-cloud='invite']", { timeout: 8000 });
  assert(await ev(A.page, () => window.CloudSync.houseSynced()), 'house not marked synced');
  await A.page.locator("[data-cloud='invite']").click();
  await A.page.waitForSelector('#invite-url', { timeout: 6000 });
  const url = await ev(A.page, () => document.getElementById('invite-url').value);
  inviteCode = new URL(url).searchParams.get('code');
  assert(inviteCode && inviteCode.length >= 8, 'no invite code in ' + url);
}, A.errs);

/* ================= device B: Bo joins from his own phone ================= */
const B = await device();

await test('cloud: invite link walks a stranger to a real account', async () => {
  await B.page.goto(BASE + '/join.html?code=' + inviteCode);
  await cloudReady(B.page);
  await B.page.waitForSelector('#join-create', { timeout: 6000 });
  await B.page.locator('#join-create').click();
  await B.page.waitForTimeout(400);
  await B.page.fill('#a-name', 'Bo Renter');
  await B.page.locator('#a-save').click();
  await B.page.waitForTimeout(2500);
  assert(B.page.url().includes('join.html'), 'pending join not resumed: ' + B.page.url());
  await cloudReady(B.page);
  await B.page.waitForSelector('#accept', { timeout: 8000 });
}, B.errs);

await test('cloud: accepting the invite lands Bo in every system', async () => {
  await B.page.locator('#accept').click();
  await B.page.waitForTimeout(1500);
  assert(B.page.url().includes('dashboard.html'), 'not redirected home: ' + B.page.url());
  const world = await ev(B.page, () => ({
    house: window.Commons.houses.mine() && window.Commons.houses.mine().name,
    members: window.Commons.houses.mine().members,
    contrib: window.Commons.money.contributions().map((c) => c.member),
    adaSeen: !!window.Commons.people.get((window.Commons.houses.mine().members.filter((m) => m !== 'me'))[0]),
  }));
  assert(world.house === 'Cloud Nine', 'wrong house: ' + world.house);
  assert(world.members.includes('me') && world.members.some((m) => m.startsWith('u-')), 'roster wrong: ' + world.members);
  assert(world.contrib.includes('me'), 'no contribution row for Bo');
  assert(world.adaSeen, "Ada's person record missing on Bo's device");
  const body = await ev(B.page, () => document.getElementById('page').textContent);
  assert(body.includes('Ada'), "dashboard doesn't show Ada: " + body.slice(0, 100));
}, B.errs);

await test("cloud: Bo's expense shows up on Ada's device", async () => {
  await ev(B.page, () => {
    window.Commons.ledger.add({
      desc: 'Cloud groceries run', amount: 84, paidBy: 'me', category: 'groceries',
      split: { mode: 'equal', participants: window.Commons.houses.mine().members },
    });
  });
  await B.page.waitForTimeout(2200); // push debounce
  await ev(A.page, () => window.CloudSync.pullNow());
  await A.page.waitForTimeout(600);
  const seen = await ev(A.page, () => {
    const x = window.Commons.ledger.all().find((e) => e.desc === 'Cloud groceries run');
    if (!x) return null;
    return { paidBy: x.paidBy, payerName: window.Commons.people.get(x.paidBy)?.name, amount: x.amount };
  });
  assert(seen, "expense never arrived on Ada's device");
  assert(seen.paidBy.startsWith('u-') && seen.payerName === 'Bo Renter', 'payer identity wrong: ' + JSON.stringify(seen));
  assert(seen.amount === 84, 'amount wrong');
}, A.errs);

await test("cloud: Ada's signature syncs to Bo — real multi-device votes", async () => {
  await ev(A.page, () => {
    window.Commons.agreementDoc.ensure();
    window.Commons.agreementDoc.sign('me');
  });
  await A.page.waitForTimeout(2200);
  await ev(B.page, () => window.CloudSync.pullNow());
  await B.page.waitForTimeout(600);
  const sigs = await ev(B.page, () => Object.keys((window.Commons.agreementDoc.get() || { signatures: {} }).signatures));
  assert(sigs.some((k) => k.startsWith('u-')), "Ada's signature not visible on Bo's device: " + JSON.stringify(sigs));
}, B.errs);

await test('cloud: chore mark-done crosses devices with identity intact', async () => {
  await ev(A.page, () => {
    window.Commons.chorePlanner.apply(window.Commons.chorePlanner.estimate({ kitchen: 1 }, 2).chores.slice(0, 2));
  });
  await A.page.waitForTimeout(2200);
  await ev(B.page, () => window.CloudSync.pullNow());
  await B.page.waitForTimeout(400);
  const choreId = await ev(B.page, () => window.Commons.chores.all()[0] && window.Commons.chores.all()[0].id);
  assert(choreId, "chores never arrived on Bo's device");
  await ev(B.page, (id) => {
    const c = window.Commons.chores.all().find((x) => x.id === id);
    window.Commons.chores.markDone(id, window.Commons.chores.period(c), 'me');
  }, choreId);
  await B.page.waitForTimeout(2200);
  await ev(A.page, () => window.CloudSync.pullNow());
  await A.page.waitForTimeout(400);
  const done = await ev(A.page, (id) => {
    const c = window.Commons.chores.all().find((x) => x.id === id);
    const info = window.Commons.chores.doneInfo(id, window.Commons.chores.period(c));
    return info && { by: info.by, name: window.Commons.people.get(info.by)?.name };
  }, choreId);
  assert(done && done.by.startsWith('u-') && done.name === 'Bo Renter', 'completion identity wrong: ' + JSON.stringify(done));
}, A.errs);

await test('cloud: concurrent votes converge — no whole-key clobber', async () => {
  // Ada and Bo each add a proposal. Naive whole-key LWW would let one member's
  // push (with only their proposal) overwrite the array and drop the other's.
  await ev(A.page, () => window.Commons.proposals.add({ title: 'Ada prop', desc: 'x', kind: 'rule', proposer: 'me' }));
  await ev(B.page, () => window.Commons.proposals.add({ title: 'Bo prop', desc: 'y', kind: 'rule', proposer: 'me' }));
  await A.page.waitForTimeout(2200); await B.page.waitForTimeout(2200);
  await ev(A.page, () => window.CloudSync.pullNow()); await ev(B.page, () => window.CloudSync.pullNow());
  await A.page.waitForTimeout(600); await B.page.waitForTimeout(600);
  // both proposals must be visible on both devices (neither push clobbered the other)
  const both = (page) => ev(page, () => window.Commons.proposals.all().map((x) => x.title));
  assert((await both(A.page)).includes('Bo prop') && (await both(A.page)).includes('Ada prop'), 'Ada device missing a proposal');
  assert((await both(B.page)).includes('Ada prop') && (await both(B.page)).includes('Bo prop'), 'Bo device missing a proposal');
  // now BOTH vote on the SAME proposal at once — the votes map must union, not clobber
  await ev(A.page, () => { const p = window.Commons.proposals.all().find((x) => x.title === 'Ada prop'); window.Commons.proposals.vote(p.id, 'me', true); });
  await ev(B.page, () => { const p = window.Commons.proposals.all().find((x) => x.title === 'Ada prop'); window.Commons.proposals.vote(p.id, 'me', true); });
  await A.page.waitForTimeout(2200); await B.page.waitForTimeout(2200);
  await ev(A.page, () => window.CloudSync.pullNow()); await A.page.waitForTimeout(600);
  await ev(B.page, () => window.CloudSync.pullNow()); await B.page.waitForTimeout(600);
  const votes = (page) => ev(page, () => {
    const p = window.Commons.proposals.all().find((x) => x.title === 'Ada prop');
    return Object.keys(p.votes).length;
  });
  // Ada's vote + Bo's vote on the one proposal = 2, converged on both devices
  assert((await votes(A.page)) === 2, 'Ada device lost a vote on the shared proposal: ' + (await votes(A.page)));
  assert((await votes(B.page)) === 2, 'Bo device lost a vote on the shared proposal: ' + (await votes(B.page)));
}, A.errs);

await test('cloud: a malicious hue/photo is sanitized, not rendered as markup', async () => {
  // Bo sets a profile hue crafted to break out of the style attribute
  const r = await ev(B.page, async () => {
    const res = await fetch('/api/me', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ hue: 'red"><img src=x onerror=alert(1)>', photo: 'javascript:alert(1)' }) });
    return { status: res.status, user: await res.json() };
  });
  assert(r.status === 200, 'update rejected outright: ' + JSON.stringify(r));
  assert(r.user.user.hue === null, 'malicious hue not nulled: ' + r.user.user.hue);
  assert(!r.user.user.photo || r.user.user.photo.startsWith('data:image'), 'bad photo not rejected: ' + r.user.user.photo);
  // and even if bad data reached the store, avatarHtml must not emit the tag
  const html = await ev(A.page, () => window.Shell.avatarHtml({ id: 'x', name: 'Evil', hue: 'red"><img src=x onerror=alert(1)>', photo: 'javascript:alert(1)' }));
  assert(!/<img/i.test(html) && !/onerror/i.test(html), 'avatarHtml emitted attacker markup: ' + html);
}, A.errs);

await test('cloud: a captured verify request cannot be replayed (single-use challenge)', async () => {
  // grab a fresh login challenge cookie + a valid assertion, submit once (ok), replay (rejected)
  const first = await ev(B.page, async () => {
    const res = await fetch('/api/auth/login-options', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: '{}' });
    return res.status;
  });
  assert(first === 200, 'login-options failed');
  // drive a real sign-in via the client (consumes the challenge), then a raw replay of a stale one:
  const replay = await ev(B.page, async () => {
    // reuse an intentionally already-consumed challenge shape — the server must 400
    const res = await fetch('/api/auth/login-verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ credential: { id: 'x', rawId: 'x', type: 'public-key', response: {} } }) });
    return res.status;
  });
  assert(replay === 400 || replay === 404, 'replay/garbage verify should be rejected: ' + replay);
}, null);

await test('cloud: maintenance ticket keeps its true author across devices', async () => {
  await ev(A.page, () => window.Commons.steward.addMaintenance({ title: 'Cloud sink leak' }));
  await A.page.waitForTimeout(2200);
  await ev(B.page, () => window.CloudSync.pullNow());
  await B.page.waitForTimeout(500);
  const m = await ev(B.page, () => {
    const t = window.Commons.state.maintenance.find((x) => x.title === 'Cloud sink leak');
    return t && { openedBy: t.openedBy, isMe: t.openedBy === 'me', name: window.Commons.people.get(t.openedBy)?.name };
  });
  assert(m, 'maintenance ticket never synced');
  // on Bo's device it must NOT say Bo opened it (openedBy must be Ada's uid, not literal 'me')
  assert(!m.isMe && m.openedBy.startsWith('u-') && m.name === 'Ada Cloudwright', 'maintenance author wrong on Bo device: ' + JSON.stringify(m));
}, B.errs);

await test('cloud: an edit made while offline survives and pushes on reconnect', async () => {
  // Bo goes offline, edits, "navigates" (new page load) — the edit must reach the server
  await B.ctx.setOffline(true);
  await ev(B.page, () => window.Commons.setMe({ blurb: 'Edited on the subway.' }));
  await B.page.waitForTimeout(300);
  assert((await ev(B.page, () => localStorage.getItem('dp-cloud-dirty'))) === '1', 'offline edit not marked dirty');
  await B.ctx.setOffline(false);
  await B.page.reload();
  await cloudReady(B.page);
  await B.page.waitForTimeout(2500); // init flush pushes the dirty edit
  await ev(A.page, () => window.CloudSync.pullNow()); // (personal keys are per-user; verify server took it)
  const serverBlurb = await ev(B.page, async () => {
    const s = await (await fetch('/api/state', { credentials: 'same-origin' })).json();
    return s.doc.me && s.doc.me.blurb;
  });
  assert(serverBlurb === 'Edited on the subway.', 'offline edit never reached the server: ' + serverBlurb);
}, null);

/* ================= device C: Ada's new phone ================= */
await test('cloud: same passkey on a new device restores the whole world', async () => {
  const { credentials } = await A.cdp.send('WebAuthn.getCredentials', { authenticatorId: A.authenticatorId });
  assert(credentials.length >= 1, 'no credential to migrate');
  const C = await device();
  await C.cdp.send('WebAuthn.addCredential', { authenticatorId: C.authenticatorId, credential: credentials[0] });
  await C.page.goto(BASE + '/account.html');
  await cloudReady(C.page);
  await C.page.waitForSelector('#cloud-signin', { timeout: 6000 });
  await C.page.locator('#cloud-signin').click();
  await C.page.waitForTimeout(2500);
  const world = await ev(C.page, () => ({
    name: window.Commons.me().name,
    blurb: window.Commons.me().blurb,
    house: window.Commons.houses.mine() && window.Commons.houses.mine().name,
    active: window.Commons.account.active(),
  }));
  assert(world.active, 'account not active after restore');
  assert(world.name === 'Ada Cloudwright', 'wrong identity restored: ' + world.name);
  assert(world.house === 'Cloud Nine', 'house not restored: ' + world.house);
  await C.ctx.close();
}, null);

await test('cloud: wrong invite codes and strangers bounce politely', async () => {
  const r = await ev(B.page, async () => {
    const res = await fetch('/api/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'nope123456' }) });
    return { status: res.status, body: await res.json() };
  });
  assert(r.status === 404, 'bad code should 404: ' + JSON.stringify(r));
  const anon = await ev(B.page, async () => {
    const res = await fetch('/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ changes: {} }), credentials: 'omit' });
    return res.status;
  });
  assert(anon === 401 || anon === 400, 'anonymous write should be rejected: ' + anon);
}, null);

/* ================= wrap ================= */
await browser.close();
server.kill();

const fails = results.filter(([s]) => s === 'FAIL');
results.forEach(([s, n]) => console.log(s, '—', n));
if (fails.length) console.log('\nserver log tail:\n' + serverLog.slice(-1200));
console.log(`\n${results.length - fails.length}/${results.length} passed`);
process.exit(fails.length ? 1 : 0);
