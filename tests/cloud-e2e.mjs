// colive.fun hosted e2e — pure server-backed accounts (username + password).
// The core proof: register in one browser, sign in from a FRESH context
// (incognito) and your world is there. Plus house sharing across two people.
// The API server also serves the static site (same origin) — the prod layout.
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

/* ---------- rig: API server serving the repo ---------- */
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

/* a "device" = its own browser context (own storage), like a separate browser/incognito */
async function device() {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  return { ctx, page, errs };
}
const ev = (page, fn, arg) => page.evaluate(fn, arg);
async function cloudReady(page) {
  await page.waitForFunction(() => window.CloudSync && window.CloudSync.available === true, null, { timeout: 10000 });
}
async function register(page, username, password, name) {
  await page.goto(BASE + '/account.html?new=1');
  await cloudReady(page);
  await page.waitForSelector('#a-username');
  await page.fill('#a-username', username);
  await page.fill('#a-password', password);
  if (name) await page.fill('#a-name', name);
  await page.locator('#a-submit').click();
  await page.waitForTimeout(2500);
}
async function login(page, username, password) {
  await page.goto(BASE + '/account.html');
  await cloudReady(page);
  await page.waitForSelector('#a-username');
  await page.fill('#a-username', username);
  await page.fill('#a-password', password);
  await page.locator('#a-submit').click();
  await page.waitForTimeout(2500);
}

/* ================= device A: Ada ================= */
const A = await device();

await test('register: username + password creates a hosted account', async () => {
  await register(A.page, 'ada', 'sunflower99', 'Ada Cloudwright');
  assert(/quiz\.html|dashboard\.html/.test(A.page.url()), 'not onboarded after register: ' + A.page.url());
  await A.page.goto(BASE + '/account.html');
  await cloudReady(A.page);
  await A.page.waitForFunction(() => window.CloudSync.user, null, { timeout: 6000 });
  const user = await ev(A.page, () => window.CloudSync.user);
  assert(user && user.username === 'ada' && user.id.startsWith('u-'), 'no hosted user: ' + JSON.stringify(user));
  assert((await ev(A.page, () => window.Commons.account.active())), 'local account mirror not active');
}, A.errs);

await test('register: bad username / short password are rejected', async () => {
  const bad = await ev(A.page, async () => {
    const out = {};
    let r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'x', password: 'longenough1' }) });
    out.shortName = r.status;
    r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'goodname', password: 'short' }) });
    out.shortPw = r.status;
    r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'ada', password: 'sunflower99' }) });
    out.dupe = r.status;
    return out;
  });
  assert(bad.shortName === 400 && bad.shortPw === 400 && bad.dupe === 409, 'validation wrong: ' + JSON.stringify(bad));
}, A.errs);

await test('personal world: create a house + expense, they persist', async () => {
  await ev(A.page, () => {
    window.Commons.houses.claimOwn({
      id: 'h-ada', name: 'Cloud Nine', borough: 'Bed-Stuy', hood: 'Bed-Stuy', hasLocation: true,
      rent: 1400, poolModel: 'fund', poolMonthly: 150, mission: 'hosted living', networked: 50,
      roomsOpen: 2, moveIn: null, founded: 'forming', members: ['me'], values: [], rules: [], hue: '#0d9488', blurb: 'x',
    });
    window.Commons.ledger.add({ desc: 'Fiber install', amount: 99, paidBy: 'me', category: 'utilities', split: { mode: 'equal', participants: ['me'] } });
  });
  await A.page.waitForTimeout(2500); // debounced push
  const v = await ev(A.page, () => window.CloudSync.stateVersion);
  assert(v >= 1, 'state never pushed: ' + v);
}, A.errs);

/* ================= THE CORE TEST: incognito login sees the world ================= */
await test('incognito: sign in from a fresh browser and the whole world is there', async () => {
  const B = await device(); // a brand-new context = a different browser / incognito
  // a gated page with no session must bounce to the front door
  await B.page.goto(BASE + '/dashboard.html');
  await B.page.waitForTimeout(600);
  assert(B.page.url().includes('account.html'), 'gated page did not redirect when signed out: ' + B.page.url());
  // now sign in with the same username + password
  await login(B.page, 'ada', 'sunflower99');
  assert(B.page.url().includes('dashboard.html'), 'not sent to dashboard after login: ' + B.page.url());
  const world = await ev(B.page, () => ({
    user: window.CloudSync.user && window.CloudSync.user.username,
    name: window.Commons.me().name,
    house: window.Commons.houses.mine() && window.Commons.houses.mine().name,
    expense: (window.Commons.ledger.all().find((x) => x.desc === 'Fiber install') || {}).amount,
  }));
  assert(world.user === 'ada', 'wrong user after incognito login: ' + JSON.stringify(world));
  assert(world.name === 'Ada Cloudwright', 'name not restored: ' + world.name);
  assert(world.house === 'Cloud Nine', 'house not restored on the fresh browser: ' + world.house);
  assert(world.expense === 99, 'expense not restored: ' + world.expense);
  await B.ctx.close();
}, null);

await test('login: wrong password is rejected', async () => {
  const status = await ev(A.page, async () => {
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'ada', password: 'wrongwrong' }) });
    return r.status;
  });
  assert(status === 401, 'wrong password should 401: ' + status);
}, A.errs);

await test('sign out wipes the device; sign back in restores from the server', async () => {
  await A.page.goto(BASE + '/account.html');
  await cloudReady(A.page);
  await A.page.waitForSelector('#a-signout');
  await A.page.locator('#a-signout').click();
  await A.page.waitForTimeout(1200);
  // device is wiped: no account, no house
  const afterOut = await ev(A.page, () => ({ acct: window.Commons.account.active(), house: !!window.Commons.houses.mine() }));
  assert(!afterOut.acct && !afterOut.house, 'sign-out did not wipe the device: ' + JSON.stringify(afterOut));
  await login(A.page, 'ada', 'sunflower99');
  const back = await ev(A.page, () => window.Commons.houses.mine() && window.Commons.houses.mine().name);
  assert(back === 'Cloud Nine', 'world not restored after re-login: ' + back);
}, A.errs);

/* ================= house sharing across two real people ================= */
let inviteCode = null;
await test('sharing: put the house online and mint an invite', async () => {
  await A.page.goto(BASE + '/dashboard.html');
  await cloudReady(A.page);
  await A.page.waitForSelector("[data-cloud='online']", { timeout: 8000 });
  await A.page.locator("[data-cloud='online']").click();
  await A.page.waitForSelector("[data-cloud='invite']", { timeout: 8000 });
  assert(await ev(A.page, () => window.CloudSync.houseSynced()), 'house not marked synced');
  await A.page.locator("[data-cloud='invite']").click();
  await A.page.waitForSelector('#invite-url', { timeout: 6000 });
  inviteCode = new URL(await ev(A.page, () => document.getElementById('invite-url').value)).searchParams.get('code');
  assert(inviteCode && inviteCode.length >= 8, 'no invite code');
}, A.errs);

const Bo = await device();
await test('sharing: a second person registers via the invite and joins', async () => {
  await Bo.page.goto(BASE + '/join.html?code=' + inviteCode);
  await cloudReady(Bo.page);
  await Bo.page.waitForSelector('a[href="account.html?new=1"]', { timeout: 8000 });
  await register(Bo.page, 'bobby', 'raspberry42', 'Bo Renter');
  // pending join resumes → back on join.html with an accept button
  assert(Bo.page.url().includes('join.html'), 'pending join not resumed: ' + Bo.page.url());
  await cloudReady(Bo.page);
  await Bo.page.waitForSelector('#accept', { timeout: 8000 });
  await Bo.page.locator('#accept').click();
  await Bo.page.waitForTimeout(1500);
  assert(Bo.page.url().includes('dashboard.html'), 'not sent home after joining: ' + Bo.page.url());
  const w = await ev(Bo.page, () => ({
    house: window.Commons.houses.mine() && window.Commons.houses.mine().name,
    members: window.Commons.houses.mine().members,
    adaSeen: window.Commons.people.get(window.Commons.houses.mine().members.filter((m) => m !== 'me')[0])?.name,
  }));
  assert(w.house === 'Cloud Nine' && w.members.includes('me') && w.members.some((m) => m.startsWith('u-')), 'roster wrong: ' + JSON.stringify(w));
  assert(w.adaSeen === 'Ada Cloudwright', "Ada not visible on Bo's device: " + w.adaSeen);
}, Bo.errs);

await test("sharing: Bo's expense reaches Ada with identity intact", async () => {
  await ev(Bo.page, () => window.Commons.ledger.add({ desc: 'Group groceries', amount: 84, paidBy: 'me', category: 'groceries', split: { mode: 'equal', participants: window.Commons.houses.mine().members } }));
  await Bo.page.waitForTimeout(2500);
  await ev(A.page, () => window.CloudSync.pullNow());
  await A.page.waitForTimeout(700);
  const seen = await ev(A.page, () => {
    const x = window.Commons.ledger.all().find((e) => e.desc === 'Group groceries');
    return x && { by: window.Commons.people.get(x.paidBy)?.name, amount: x.amount };
  });
  assert(seen && seen.by === 'Bo Renter' && seen.amount === 84, "expense/identity wrong on Ada: " + JSON.stringify(seen));
}, A.errs);

await test('sharing: concurrent votes on the same proposal converge', async () => {
  await ev(A.page, () => window.Commons.proposals.add({ title: 'New kettle', desc: 'x', kind: 'rule', proposer: 'me' }));
  await A.page.waitForTimeout(2200);
  await ev(Bo.page, () => window.CloudSync.pullNow()); await Bo.page.waitForTimeout(700);
  await ev(A.page, () => { const p = window.Commons.proposals.all().find((x) => x.title === 'New kettle'); window.Commons.proposals.vote(p.id, 'me', true); });
  await ev(Bo.page, () => { const p = window.Commons.proposals.all().find((x) => x.title === 'New kettle'); window.Commons.proposals.vote(p.id, 'me', true); });
  await A.page.waitForTimeout(2200); await Bo.page.waitForTimeout(2200);
  await ev(A.page, () => window.CloudSync.pullNow()); await A.page.waitForTimeout(700);
  await ev(Bo.page, () => window.CloudSync.pullNow()); await Bo.page.waitForTimeout(700);
  const votes = (p) => ev(p, () => Object.keys((window.Commons.proposals.all().find((x) => x.title === 'New kettle') || { votes: {} }).votes).length);
  assert((await votes(A.page)) === 2, 'Ada lost a vote: ' + (await votes(A.page)));
  assert((await votes(Bo.page)) === 2, 'Bo lost a vote: ' + (await votes(Bo.page)));
}, A.errs);

await test('authz: anonymous writes are rejected', async () => {
  const codes = await ev(A.page, async () => {
    const s = await fetch('/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', body: JSON.stringify({ changes: { x: 1 } }) });
    const j = await fetch('/api/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', body: JSON.stringify({ code: 'nope' }) });
    return { state: s.status, join: j.status };
  });
  assert(codes.state === 401 && codes.join === 401, 'anon writes not rejected: ' + JSON.stringify(codes));
}, null);

/* ================= wrap ================= */
await browser.close();
server.kill();

const fails = results.filter(([s]) => s === 'FAIL');
results.forEach(([s, n]) => console.log(s, '—', n));
if (fails.length) console.log('\nserver log tail:\n' + serverLog.slice(-1400));
console.log(`\n${results.length - fails.length}/${results.length} passed`);
process.exit(fails.length ? 1 : 0);
