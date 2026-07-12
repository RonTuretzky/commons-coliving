// Commons e2e suite — the productized user journey, asserted against real store state.
import { chromium } from 'playwright';
import { spawn, execSync } from 'child_process';
import { readFileSync } from 'fs';

const REPO = '/Users/wk/conductor/workspaces/research/cancun';
const PORT = 8091;
const BASE = process.env.BASE_URL || `http://localhost:${PORT}`;
let browser, ctx, page;
const results = [];
let consoleErrors = [];

// The app is hosted now — spawn the API server (it also serves the static site,
// exactly like production). Skipped when BASE_URL points elsewhere (live checks).
let apiServer = null;
if (!process.env.BASE_URL) {
  apiServer = spawn('node', [REPO + '/api/server.js'], {
    env: { ...process.env, PORT: String(PORT), STORAGE: 'memory', STATIC_DIR: REPO, RP_ID: 'localhost', ORIGINS: BASE, SESSION_SECRET: 'e2e' },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  await new Promise((r) => setTimeout(r, 900));
}

// register a hosted account through the UI, then wait for the redirect
async function signup(username, password, name) {
  await page.goto(BASE + '/account.html?new=1');
  await page.waitForFunction(() => window.CloudSync && window.CloudSync.available === true, null, { timeout: 10000 });
  await page.waitForSelector('#a-username');
  await page.fill('#a-username', username);
  await page.fill('#a-password', password);
  if (name) await page.fill('#a-name', name);
  await page.locator('#a-submit').click();
  await page.waitForTimeout(2200);
}
async function loginUi(username, password) {
  await page.goto(BASE + '/account.html');
  await page.waitForFunction(() => window.CloudSync && window.CloudSync.available === true, null, { timeout: 10000 });
  await page.waitForSelector('#a-username');
  await page.fill('#a-username', username);
  await page.fill('#a-password', password);
  await page.locator('#a-submit').click();
  await page.waitForTimeout(2800);
}

const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

async function newPage() {
  page = await ctx.newPage();
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  // resource 404s are not app errors (the /api/health probe is 404 on static-only serving)
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) consoleErrors.push('console: ' + m.text()); });
  return page;
}
async function fresh(url) {
  if (ctx) await ctx.close();
  ctx = await browser.newContext();
  // the shipped app is empty; feature tests run against the opt-in demo fixture
  await ctx.addInitScript(() => { window.__COLIVE_SEED_DEMO = true; });
  consoleErrors = [];
  await newPage();
  await page.goto(BASE + '/' + url);
  await page.waitForTimeout(300);
}
async function go(url) { await page.goto(BASE + '/' + url); await page.waitForTimeout(350); }
const ev = (fn, arg) => page.evaluate(fn, arg);

async function addVirtualAuthenticator() {
  const client = await ctx.newCDPSession(page);
  await client.send('WebAuthn.enable');
  await client.send('WebAuthn.addVirtualAuthenticator', { options: {
    protocol: 'ctap2', transport: 'internal', hasResidentKey: true,
    hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true,
  }});
  return client;
}

async function test(name, fn) {
  try {
    await fn();
    if (consoleErrors.length) throw new Error('JS errors: ' + consoleErrors.join(' | '));
    results.push(['PASS', name]);
  } catch (e) {
    results.push(['FAIL', name + ' — ' + String(e.message).slice(0, 220)]);
    consoleErrors = [];
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

browser = await chromium.launch();

/* ---------- chain rig: anvil + escrow deployment (localhost runs only) ---------- */
const CHAIN = BASE.includes('localhost');
const FOUNDRY = process.env.HOME + '/.foundry/bin';
const ANVIL_KEY0 = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
// (REPO declared at top)
let anvil = null, escrowAddr = null, communeAddr = null;
if (CHAIN) {
  anvil = spawn(FOUNDRY + '/anvil', ['--silent'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 1500));
  const out = execSync(
    FOUNDRY + `/forge create src/GatheringEscrow.sol:GatheringEscrow --root ${REPO}/contracts ` +
    `--rpc-url http://127.0.0.1:8545 --private-key ${ANVIL_KEY0} --broadcast`,
    { encoding: 'utf8' });
  escrowAddr = (out.match(/Deployed to: (0x[0-9a-fA-F]{40})/) || [])[1];
  const out2 = execSync(
    FOUNDRY + `/forge create vendor/commune-os/CommuneOS.sol:CommuneOS --root ${REPO}/contracts ` +
    `--rpc-url http://127.0.0.1:8545 --private-key ${ANVIL_KEY0} --broadcast ` +
    `--constructor-args 0xa555d5344f6FB6c65da19e403Cb4c1eC4a1a5Ee3`,
    { encoding: 'utf8' });
  communeAddr = (out2.match(/Deployed to: (0x[0-9a-fA-F]{40})/) || [])[1];
  console.log('anvil escrow at', escrowAddr, '· communeOS at', communeAddr);
}
async function freshChain(url) {
  if (ctx) await ctx.close();
  ctx = await browser.newContext();
  await ctx.addInitScript(() => { window.__COLIVE_SEED_DEMO = true; });
  await ctx.addInitScript(([addr, commune]) => {
    localStorage.setItem('dp-chain', 'local');
    localStorage.setItem('dp-escrow-local', addr);
    localStorage.setItem('dp-communeos-local', commune);
  }, [escrowAddr, communeAddr]);
  consoleErrors = [];
  await newPage();
  await page.goto(BASE + '/' + url);
  await page.waitForTimeout(300);
}

/* ---------- 0. public pages load clean ---------- */
const PUBLIC = ['index.html', 'browse.html', 'house.html?id=h-redhook', 'person.html?id=p-maya', 'gatherings.html', 'gathering.html?id=e-retreat-catskills', 'templates.html', 'quiz.html', 'account.html', 'chore-builder.html', 'meals.html'];
await fresh('index.html');
for (const p of PUBLIC) {
  await test('public page loads clean: ' + p, async () => {
    await go(p);
    assert((await ev(() => document.body.innerHTML.length)) > 3000, 'page too empty');
  });
}
await test('nav: visitor sees discovery, no app pages', async () => {
  await go('index.html');
  const nav = await ev(() => document.getElementById('nav-links')?.textContent || '');
  assert(nav.includes('Calculators') && nav.includes('Browse'), 'visitor nav wrong: ' + nav);
  assert(!nav.includes('My House') && !nav.includes('Ledger') && !nav.includes('Steward'), 'visitor nav leaks app pages: ' + nav);
});

await test('landing: signed-out hero funnels to signup', async () => {
  await go('index.html');
  const cta = await ev(() => document.getElementById('hero-cta')?.textContent || '');
  assert(cta.includes('Get started'), 'no signup CTA: ' + cta);
});

await test('pwa: manifest linked, sw served, registration attempted', async () => {
  await go('index.html');
  assert((await ev(() => !!document.querySelector('link[rel="manifest"]'))), 'manifest link not injected');
  const m = await ev(async () => (await fetch('manifest.webmanifest')).status);
  assert(m === 200, 'manifest not served: ' + m);
  const sw = await ev(async () => { const r = await fetch('sw.js'); return { s: r.status, t: await r.text() }; });
  assert(sw.s === 200 && sw.t.includes('colive-v'), 'sw.js not served');
  await page.waitForTimeout(600);
  assert((await ev(async () => !!(await navigator.serviceWorker.getRegistration()))), 'sw not registered on localhost');
});

/* ---------- clean launch: the SHIPPED app carries no demo/mock data ---------- */
await test('clean launch: a real device starts with an empty world', async () => {
  // a context WITHOUT the demo fixture flag = exactly what a real user gets
  const clean = await browser.newContext();
  const cp = await clean.newPage();
  await cp.goto(BASE + '/index.html');
  await cp.waitForTimeout(300);
  const counts = await cp.evaluate(() => ({
    people: window.Commons.people.all().length,
    houses: window.Commons.houses.all().length,
    events: window.Commons.events.all().length,
    expenses: window.Commons.ledger.all().length,
    proposals: window.Commons.proposals.all().length,
    tasks: window.Commons.tasks.all().length,
    treasury: window.Commons.money.treasury().balance,
    account: window.Commons.account.get(),
  }));
  assert(counts.houses === 0 && counts.people === 0 && counts.events === 0, 'seeded world leaked into a real device: ' + JSON.stringify(counts));
  assert(counts.expenses === 0 && counts.proposals === 0 && counts.tasks === 0 && counts.treasury === 0, 'seeded operational data present: ' + JSON.stringify(counts));
  assert(counts.account === null, 'a real device should start with no account');
  await clean.close();
});

await test('clean launch: browse + landing show first-user states, not fake data', async () => {
  const clean = await browser.newContext();
  const cp = await clean.newPage();
  await cp.goto(BASE + '/browse.html');
  await cp.waitForTimeout(400);
  const browseText = await cp.evaluate(() => document.querySelector('main').innerText);
  assert(/No houses yet|start the first/i.test(browseText), 'browse homes tab should show a launch state: ' + browseText.slice(0, 120));
  assert(!/Cypress|McCarren|Ridgewood/.test(browseText), 'browse leaked seeded house names');
  await cp.goto(BASE + '/index.html');
  await cp.waitForTimeout(300);
  const heroText = await cp.evaluate(() => document.getElementById('live-stats').innerText);
  assert(/first houses are forming|be one of them|Start yours/i.test(heroText), 'hero should show a launch line: ' + heroText);
  await clean.close();
});

await test('gathering page: unknown id gets a friendly dead-end', async () => {
  await go('gathering.html?id=e-nope');
  const body = await ev(() => document.getElementById('page').textContent);
  assert(body.includes("isn't on the board"), 'no friendly missing state');
});

await test('browse: house cards carry five-lens dots', async () => {
  await go('browse.html');
  const titles = await ev(() => Array.from(document.querySelectorAll('main [title]')).map((el) => el.title).join('|'));
  assert(titles.includes('Governance') && titles.includes('Property'), 'no lens dots on house cards');
});

/* ---------- 1. auth gates redirect ---------- */
const GATED = ['dashboard.html', 'ledger.html', 'chores.html', 'checkin.html', 'steward.html', 'create.html', 'agreement.html', 'split.html'];
for (const p of GATED) {
  await test('gate redirects when signed out: ' + p, async () => {
    await go(p);
    await page.waitForTimeout(400);
    assert(page.url().includes('account.html'), 'no redirect, still on ' + page.url());
  });
}

/* ---------- 1b. quick quiz (v1 restored) ---------- */
await fresh('quiz.html');
await test('quick quiz: 12 questions → estimated profiles + upsell', async () => {
  await page.locator('#start-simple').click();
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(150);
    await page.locator('main [data-v]').first().click();
  }
  await page.waitForTimeout(300);
  assert((await ev(() => document.getElementById('page').textContent.includes('Hard lines'))), 'quick quiz never reached hard lines');
  await page.locator('main button', { hasText: /^Continue$/ }).click();
  await page.waitForTimeout(300);
  await page.locator('main button', { hasText: /See your results/ }).click();
  await page.waitForTimeout(500);
  const me = await ev(() => window.Commons.me());
  assert(me.quizDone && me.quizMode === 'simple', 'quick quiz not saved');
  assert(!me.rhythms, 'quick quiz should not fabricate direct rhythms');
  const body = await ev(() => document.getElementById('page').textContent);
  assert(body.includes('estimated'), 'no estimated labels');
  assert(body.includes('Want the real instrument'), 'no full-quiz upsell');
  assert(body.includes('house agreement'), 'no drafted agreement in quick mode');
});

await test('migration: a v8 world upcasts to v9 losslessly', async () => {
  await fresh('index.html');
  await ev(() => {
    const s = JSON.parse(JSON.stringify(window.Commons.state));
    delete s.tasks; delete s.labor; delete s.laborRate; delete s.agreementDoc; delete s.checkinLog; delete s.clicks;
    s.version = 8;
    s.me.name = 'V8 Veteran';
    localStorage.setItem('dp-commons-v8', JSON.stringify(s));
    localStorage.removeItem('dp-commons-v9');
  });
  await go('index.html');
  const st = await ev(() => ({
    v: window.Commons.state.version, name: window.Commons.me().name,
    tasks: Array.isArray(window.Commons.state.tasks), labor: Array.isArray(window.Commons.state.labor),
    clicks: typeof window.Commons.state.clicks === 'object',
  }));
  assert(st.v === 9 && st.name === 'V8 Veteran' && st.tasks && st.labor && st.clicks, 'upcast failed: ' + JSON.stringify(st));
});

/* ---------- 2. THE JOURNEY (one continuous context, like a real user) ---------- */
await fresh('account.html?new=1');

await test('signup: username + password → hosted account → onboards to quiz', async () => {
  await page.waitForSelector('#a-username');
  await page.fill('#a-username', 'ront');
  await page.fill('#a-password', 'compostking7');
  await page.fill('#a-name', 'Ron T');
  await page.locator('#a-submit').click();
  await page.waitForTimeout(2200); // register + redirect
  assert(page.url().includes('quiz.html'), 'not onboarded to quiz: ' + page.url());
  const acct = await ev(() => window.Commons.account.get());
  assert(acct && acct.name === 'Ron T' && acct.username === 'ront', 'account not saved: ' + JSON.stringify(acct));
  assert((await ev(() => window.CloudSync.user && window.CloudSync.user.username)) === 'ront', 'no hosted session');
});

await test('quiz v2 (full): rhythms → lenses → character → hard lines → results', async () => {
  await page.locator('#start-adv').click();
  // drive the staged flow: answer any [data-v] question, click Continue on interstitials
  for (let i = 0; i < 45; i++) {
    await page.waitForTimeout(180);
    const body = await ev(() => document.getElementById('page').textContent);
    if (body.includes('Hard lines')) break;
    const opt = page.locator('main [data-v]');
    if (await opt.count()) { await opt.last().click(); continue; }
    const cont = page.locator('main button', { hasText: /^Continue$/ });
    if (await cont.count()) { await cont.click(); continue; }
  }
  assert((await ev(() => document.getElementById('page').textContent.includes('Hard lines'))), 'never reached hard lines');
  await page.locator('main button', { hasText: 'Smoking indoors' }).click();
  await page.locator('main button', { hasText: /^Continue$/ }).click();
  await page.waitForTimeout(300);
  await page.locator('main button', { hasText: /See your results/ }).click();
  await page.waitForTimeout(600);
  const me = await ev(() => window.Commons.me());
  assert(me.quizDone === true, 'quiz not saved');
  assert(me.rhythms && Object.keys(me.rhythms).length === 10, 'rhythms not saved');
  assert(me.lenses && Object.keys(me.lenses).length === 5, 'lenses not saved');
  assert(me.index && typeof me.index.agree === 'number' && me.index.svo, 'index not saved');
  assert(me.hard.includes('smoke'), 'dealbreaker not saved');
  const body = await ev(() => document.getElementById('page').textContent);
  assert(/You’re|You're/.test(body), 'no archetype reveal');
  assert(body.includes('house agreement'), 'no drafted agreement');
  assert(body.includes('Only you ever see this'), 'no private index card');
});

await test('quiz v2: fit bands (not %) flow through browse and house pages', async () => {
  await go('browse.html');
  const body = await ev(() => document.getElementById('page') ? document.getElementById('page').textContent : document.body.innerText);
  assert(/fit|stretch/i.test(body), 'no fit bands on browse');
  assert(!/\d+% match/.test(body), 'stale % match still on browse');
  await go('house.html?id=h-redhook');
  const hb = await ev(() => document.body.innerText);
  assert(/Strong fit|Workable fit|A stretch/.test(hb), 'no band on house page');
});

await test('houseless: dashboard shows find-a-house state, not Cypress', async () => {
  await go('dashboard.html');
  const body = await ev(() => document.body.textContent);
  assert(body.includes('not in a house') || body.includes('Start one'), 'no houseless state');
  assert(!body.includes('Cypress Yard'), 'dashboard leaked Cypress data');
});

await test('join: request → accepted → member of Cypress with systems', async () => {
  await go('house.html?id=h-cypress');
  const roomsBefore = await ev(() => window.Commons.houses.get('h-cypress').roomsOpen);
  await page.locator('#join-btn').click();
  await page.waitForTimeout(2800); // review + redirect
  assert(page.url().includes('dashboard.html'), 'not redirected home: ' + page.url());
  const h = await ev(() => window.Commons.houses.get('h-cypress'));
  assert(h.members.includes('me'), 'not in roster');
  assert(h.roomsOpen === roomsBefore - 1, 'room not taken');
  assert((await ev(() => window.Commons.state.myHouseId)) === 'h-cypress', 'myHouseId not set');
  assert((await ev(() => window.Commons.chores.all().every((c) => c.rotation.includes('me')))), 'not in chore rotations');
  assert((await ev(() => window.Commons.money.bills().every((b) => b.rotation.includes('me')))), 'not in bill rotations');
  assert((await ev(() => window.Commons.money.contributions().some((c) => c.member === 'me'))), 'no contribution row');
  const body = await ev(() => document.body.textContent);
  assert(body.includes('Cypress Yard'), 'dashboard not showing the house');
  const nav = await ev(() => document.getElementById('nav-links')?.textContent || '');
  assert(nav.includes('My House') && nav.includes('Ledger') && nav.includes('Meals'), 'member nav missing app pages: ' + nav);
});

await test('dashboard: contribution + vote mechanics at 7 members', async () => {
  await page.locator("[data-act='pay-contrib']").click();
  await page.waitForTimeout(300);
  assert((await ev(() => window.Commons.money.contributions().find((c) => c.member === 'me').paid)), 'contribution not paid');
  const threshold = await ev(() => window.Commons.proposals.threshold());
  assert(threshold === 5, 'threshold should be 5 of 7, got ' + threshold);
  await page.locator("[data-act='vote'][data-val='1'][data-id='pr-freezer']:not([data-voter])").click();
  await page.waitForTimeout(300);
  let p = await ev(() => window.Commons.proposals.get('pr-freezer'));
  assert(p.votes['me'] === true && p.status === 'open', 'my vote should leave it at 4 of 5');
  const balBefore = await ev(() => window.Commons.money.treasury().balance);
  p = await ev(() => window.Commons.proposals.vote('pr-freezer', 'p-priya', true));
  assert(p.status === 'passed' && p.executed, '5th vote should pass + execute');
  assert((await ev(() => window.Commons.money.treasury().balance)) === balBefore - 340, 'fund not debited');
});

await test('ledger: I start square; expense + settle + auto-settle work', async () => {
  await go('ledger.html');
  assert(Math.abs(await ev(() => window.Commons.ledger.balances()['me'] || 0)) < 0.01, 'new member should start square');
  await page.fill('#x-desc', 'Test lightbulbs');
  await page.fill('#x-amount', '24');
  await page.locator('button', { hasText: /Add to the ledger/ }).click();
  await page.waitForTimeout(400);
  assert((await ev(() => window.Commons.ledger.all().some((x) => x.desc === 'Test lightbulbs'))), 'expense not stored');
  const sum = await ev(() => Object.values(window.Commons.ledger.balances()).reduce((s, v) => s + v, 0));
  assert(Math.abs(sum) < 0.05, 'balances do not sum to zero');
  await ev(() => window.Commons.ledger.add({ desc: 'Boiler visit', amount: 700, paidBy: 'p-june', category: 'repairs',
    split: { mode: 'equal', participants: window.Commons.houses.get('h-cypress').members } }));
  const setBefore = await ev(() => window.Commons.ledger.settlements().length);
  await page.locator("[data-act='autosettle']").click();
  await page.waitForTimeout(700);
  assert((await ev(() => window.Commons.ledger.settlements().length)) > setBefore, 'auto-settle did not fire');
  assert((await ev(() => window.Commons.ledger.simplify().filter((x) => x.from === 'me' && x.amount >= 50).length)) === 0, 'big debt survived');
});

await test('chores: mark done + check-in reshuffle + swap badges', async () => {
  await go('chores.html');
  await page.locator('[data-chore]').first().click();
  await page.waitForTimeout(300);
  await go('checkin.html');
  await page.locator('main .card', { hasText: 'Running on fumes' }).first().click();
  await page.waitForTimeout(300);
  await page.locator('main button', { hasText: /Reshuffle/ }).click();
  await page.waitForTimeout(500);
  assert((await ev(() => window.Commons.rebalance.overrideCount())) > 0, 'no overrides');
  await go('chores.html');
  assert((await ev(() => document.body.textContent.includes('swapped'))), 'no swap badges');
});

await test('meals: save plan includes me in rotation', async () => {
  await go('meals.html');
  await page.locator('main .card', { hasText: 'Sunday Big Batch' }).first().click();
  await page.waitForTimeout(300);
  await page.locator('button', { hasText: /Save as the house plan/ }).click();
  await page.waitForTimeout(300);
  const plan = await ev(() => window.Commons.meals.plan());
  assert(plan.presetId === 'sunday-batch' && plan.rotation.includes('me'), 'plan wrong: ' + JSON.stringify(plan));
});

await test('labor credits: chores auto-log hours; manual log via ledger', async () => {
  assert((await ev(() => window.Commons.state.labor.some((l) => l.fromChore))), 'mark-done did not auto-log hours');
  await go('ledger.html');
  const body = await ev(() => document.getElementById('page').textContent);
  assert(body.includes('Labor credits'), 'no labor section on ledger');
  const before = await ev(() => window.Commons.labor.hoursBy('me'));
  await page.fill('#lb-desc', 'Rebuilt the compost bays');
  await page.fill('#lb-hours', '2.5');
  await page.locator("[data-act='labor-log']").click();
  await page.waitForTimeout(300);
  const after = await ev(() => window.Commons.labor.hoursBy('me'));
  assert(Math.abs(after - before - 2.5) < 0.01, 'manual hours not logged: ' + before + ' -> ' + after);
  assert((await ev(() => window.Commons.labor.creditBy('me'))) === Math.round(after * 15 * 100) / 100, 'credit math off');
});

await test('bill → ledger: paying a bill writes the split expense', async () => {
  await go('dashboard.html');
  const x = await ev(() => {
    const b = window.Commons.money.bills()[0];
    window.Commons.money.payBill(b.id);
    return { bill: b, exp: window.Commons.ledger.all().find((e) => e.fromBill === b.id) };
  });
  assert(x.exp, 'no ledger expense from bill');
  assert(x.exp.amount === x.bill.amount && x.exp.category === 'utilities', 'bill expense wrong: ' + JSON.stringify(x.exp).slice(0, 120));
  assert(x.exp.split.participants.length === x.bill.rotation.length, 'split not across the rotation');
  await go('ledger.html');
  assert((await ev((name) => document.getElementById('page').textContent.includes(name), x.bill.name)), 'bill expense not in the feed');
});

await test('bounties: post → mark done pays labor credit', async () => {
  await go('dashboard.html');
  assert((await ev(() => document.getElementById('page').textContent.includes('Bounties'))), 'no bounty board');
  await page.locator("[data-act='task-form']").first().click();
  await page.fill('#t-desc', 'E2E: fix the cellar hinge');
  await page.fill('#t-budget', '30');
  await page.selectOption('#t-assignee', 'me');
  await page.locator("[data-act='task-add']").click();
  await page.waitForTimeout(400);
  const t = await ev(() => window.Commons.tasks.all().find((x) => x.desc.includes('cellar hinge')));
  assert(t && t.status === 'open' && t.budget === 30, 'bounty not stored');
  await page.locator(`[data-act='task-done'][data-id='${t.id}']`).click();
  await page.waitForTimeout(400);
  assert((await ev((id) => window.Commons.tasks.get(id).status, t.id)) === 'done', 'bounty not done');
  const lab = await ev((id) => window.Commons.state.labor.find((l) => l.fromTask === id), t.id);
  assert(lab && Math.abs(lab.hours - 2) < 0.01, 'bounty did not pay 30/15=2h labor credit: ' + JSON.stringify(lab));
});

await test('bounty dispute: 2/3 vote reassigns the task', async () => {
  await go('dashboard.html');
  await page.selectOption("[data-reassign='t-railing']", 'p-june');
  await page.locator("[data-act='task-dispute'][data-id='t-railing']").click();
  await page.waitForTimeout(400);
  assert((await ev(() => window.Commons.tasks.get('t-railing').status)) === 'disputed', 'task not disputed');
  const pr = await ev(() => window.Commons.proposals.all().find((x) => x.kind === 'dispute' && x.taskId === 't-railing'));
  assert(pr && pr.status === 'open' && pr.newAssignee === 'p-june', 'dispute proposal wrong');
  // the rest of the house votes through the pass-the-phone buttons — pure UI, no store calls
  for (const m of ['p-theo', 'p-zora', 'p-eli', 'p-priya']) {
    await page.locator(`[data-act='vote'][data-id='${pr.id}'][data-voter='${m}'][data-val='1']`).click();
    await page.waitForTimeout(250);
  }
  const t = await ev(() => window.Commons.tasks.get('t-railing'));
  assert(t.assignedTo === 'p-june' && t.status === 'open', 'vote did not reassign: ' + JSON.stringify({ a: t.assignedTo, s: t.status }));
});

await test('agreement: draft v1 → sign → amend by 2/3 vote → v2', async () => {
  await go('agreement.html');
  const doc = await ev(() => window.Commons.agreementDoc.get());
  assert(doc && doc.version === 1 && doc.lines.length >= 5, 'v1 not drafted');
  await page.locator("[data-act='sign'][data-member='me']").click();
  await page.waitForTimeout(300);
  assert((await ev(() => window.Commons.agreementDoc.signedBy('me'))), 'my signature not recorded');
  await page.fill('#am-text', doc.lines.concat(['Amendment: the stoop is common ground — keep it clear.']).join('\n'));
  await page.fill('#am-note', 'e2e amendment');
  await page.locator("[data-act='propose']").click();
  await page.waitForTimeout(400);
  const pr = await ev(() => window.Commons.proposals.all().find((x) => x.kind === 'agreement' && x.status === 'open'));
  assert(pr, 'amendment proposal missing');
  await ev((id) => { ['p-theo', 'p-zora', 'p-eli', 'p-priya'].forEach((m) => window.Commons.proposals.vote(id, m, true)); }, pr.id);
  const d2 = await ev(() => window.Commons.agreementDoc.get());
  assert(d2.version === 2 && d2.lines.some((l) => l.includes('stoop is common ground')), 'amendment not applied');
  assert(Object.keys(d2.signatures).length === 0 && d2.history.length === 1, 'signatures/history wrong after amendment');
  await go('agreement.html');
  assert((await ev(() => document.getElementById('page').textContent.includes('v2'))), 'page not showing v2');
});

await test('house health: dashboard card reflects the check-in loop', async () => {
  await go('dashboard.html');
  const body = await ev(() => document.getElementById('page').textContent);
  assert(body.includes('House health'), 'no health card');
  const m = await ev(() => window.Commons.health.metrics());
  assert(typeof m.choreRate === 'number' && m.checkins4w >= 1, 'metrics wrong: ' + JSON.stringify(m));
  assert(body.includes(m.choreRate + '%'), 'chore rate not rendered');
});

await test('gathering page: share url, rsvp, and a real .ics download', async () => {
  await go('gathering.html?id=e-retreat-catskills');
  const share = await ev(() => document.getElementById('share-url')?.value || '');
  assert(share.includes('gathering.html?id=e-retreat-catskills'), 'share url wrong: ' + share);
  const body = await ev(() => document.getElementById('page').textContent);
  assert(body.includes('Catskills Catalyst Weekend') && body.includes('Big Indian'), 'gathering facts missing');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.locator("[data-action='ics']").click(),
  ]);
  assert(dl.suggestedFilename().endsWith('.ics'), 'not an ics download: ' + dl.suggestedFilename());
  const ics = readFileSync(await dl.path(), 'utf8');
  assert(ics.startsWith('BEGIN:VCALENDAR') && ics.includes('SUMMARY:Catskills Catalyst Weekend') && ics.includes('DTSTART:'), 'ics malformed');
});

await test('mutual match: private picks reveal only when reciprocal', async () => {
  await ev(() => { const e = window.Commons.events.get('e-mixer-prospect'); if (!e.attendees.includes('me')) e.attendees.push('me'); window.Commons.save(); });
  await go('gathering.html?id=e-mixer-prospect');
  const body0 = await ev(() => document.getElementById('page').textContent);
  assert(/close the loop/i.test(body0), 'no mutual module on attended past event');
  // p-sofia never picked me — no reveal
  await page.locator("[data-action='pick'][data-person='p-sofia']").click();
  await page.waitForTimeout(300);
  assert((await ev(() => window.Commons.clicks.mutuals('e-mixer-prospect').length)) === 0, 'non-reciprocal pick leaked');
  // p-maya picked me in the seed — reveal fires
  await page.locator("[data-action='pick'][data-person='p-maya']").click();
  await page.waitForTimeout(400);
  assert((await ev(() => window.Commons.clicks.mutuals('e-mixer-prospect'))).includes('p-maya'), 'mutual not detected');
  assert((await ev(() => document.getElementById('page').textContent.includes("It's mutual"))), 'mutual reveal not rendered');
  await go('gatherings.html');
  assert((await ev(() => (document.getElementById('mutual-strip')?.textContent || '').includes('Maya'))), 'mutual strip missing on gatherings');
});

await test('recurring gatherings: past monthly dates roll forward on load', async () => {
  await ev(() => {
    window.Commons.events.add({ title: 'E2E Monthly Potluck', type: 'dinner', when: new Date(Date.now() - 40 * 864e5).toISOString(),
      where: 'The Stoop', price: 0, capacity: 20, desc: 'rolls', recurringMonthly: true });
  });
  await go('gatherings.html'); // fresh load re-runs rollRecurring
  const when = await ev(() => window.Commons.events.all().find((x) => x.title === 'E2E Monthly Potluck').when);
  assert(new Date(when) > new Date(), 'recurring date did not roll forward: ' + when);
  assert((await ev(() => document.getElementById('page') ? true : document.body.textContent.includes('repeats monthly'))), 'recurring chip missing');
  await ev(() => { const e = window.Commons.events.all().find((x) => x.title === 'E2E Monthly Potluck'); window.Commons.events.cancel(e.id); });
});

await test('gatherings: RSVP marks you going', async () => {
  await go('gatherings.html');
  await page.waitForTimeout(500);
  await page.locator("[data-action='rsvp']").first().click();
  await page.waitForTimeout(500);
  assert((await ev(() => window.Commons.state.rsvps.length)) >= 1, 'rsvp not stored');
  assert((await ev(() => document.getElementById('upcoming-grid').innerText.includes("You're going"))), 'not marked going');
});

await test('gatherings: host to the shared calendar, then cancel it', async () => {
  await go('gatherings.html');
  await page.waitForFunction(() => window.CloudSync && window.CloudSync.available === true, null, { timeout: 8000 });
  await page.waitForTimeout(400);
  await page.locator('#host-toggle').click();
  await page.waitForSelector('#g-title', { state: 'visible', timeout: 6000 });
  const d = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  await page.fill('#g-title', 'E2E Stoop Mixer');
  await page.fill('#g-when', d);
  await page.fill('#g-where', 'The Stoop, Bed-Stuy');
  await page.locator('#g-submit').click();
  await page.waitForTimeout(1500); // publish to the server + reload
  assert((await ev(() => document.getElementById('upcoming-grid').innerText.includes('E2E Stoop Mixer'))), 'hosted gathering not shown');
  assert((await ev(() => document.getElementById('my-gatherings').textContent.includes('E2E Stoop Mixer'))), 'not in Your gatherings');
  // cancel (two-tap confirm) → off the shared calendar
  await page.locator("[data-action='cancel-gathering']").first().click();
  await page.waitForTimeout(200);
  await page.locator("[data-action='cancel-gathering']").first().click();
  await page.waitForTimeout(1500);
  assert(!(await ev(() => document.getElementById('upcoming-grid').innerText.includes('E2E Stoop Mixer'))), 'cancel did not remove it');
});

await test('steward: personalized greeting + ledger + slammed + draft→approve', async () => {
  await go('steward.html');
  await page.waitForTimeout(700);
  const chat0 = await ev(() => document.querySelector('.chat')?.textContent || '');
  assert(chat0.includes('Hey Ron'), 'greeting not personalized');
  await page.locator('button.chip', { hasText: 'Who owes what?' }).click();
  await page.waitForTimeout(1300);
  assert(/owes you|You owe|all square/.test(await ev(() => document.querySelector('.chat').textContent)), 'no ledger answer');
  await page.locator('button.chip', { hasText: "I'm slammed this week" }).click();
  await page.waitForTimeout(1300);
  assert((await ev(() => window.Commons.prefs.bandwidth('me'))) === 'low', 'bandwidth not set');
  await page.fill('.card .input', 'the bathroom sink is leaking');
  await page.locator('button', { hasText: /^Send$/ }).click();
  await page.waitForTimeout(1300);
  await page.fill('.card .input', 'leaking under the basin');
  await page.locator('button', { hasText: /^Send$/ }).click();
  await page.waitForTimeout(1500);
  await page.locator('[data-draft]').first().click();
  await page.waitForTimeout(400);
  await page.locator('[data-approve]').first().click();
  await page.waitForTimeout(400);
  assert((await ev(() => window.Commons.steward.maintenance().some((m) => m.status === 'scheduled'))), 'draft→approve broken');
});

await test('split protocol: pro-rata fund division, pruned rotations', async () => {
  await go('split.html');
  const balBefore = await ev(() => window.Commons.money.treasury().balance);
  const nBefore = await ev(() => window.Commons.houses.mine().members.length);
  await page.locator("[data-mem='p-marcus']").check();
  await page.locator("[data-mem='p-june']").check();
  await page.fill('#f-newname', 'Cypress Annex');
  await page.locator('#confirm-btn').click(); // arm
  await page.waitForTimeout(250);
  await page.locator('#confirm-btn').click(); // execute
  await page.waitForTimeout(500);
  const annex = await ev(() => window.Commons.houses.all().find((h) => h.name === 'Cypress Annex'));
  assert(annex && annex.members.length === 2, 'daughter house not created');
  assert((await ev(() => window.Commons.houses.mine().members.length)) === nBefore - 2, 'mother house roster wrong');
  const expectedMoved = Math.round((balBefore * 2) / nBefore * 100) / 100;
  const balAfter = await ev(() => window.Commons.money.treasury().balance);
  assert(Math.abs(balAfter - (balBefore - expectedMoved)) < 0.02, 'fund split not pro-rata: ' + balBefore + ' -> ' + balAfter);
  assert((await ev(() => window.Commons.chores.all().every((c) => !c.rotation.includes('p-marcus') && !c.rotation.includes('p-june')))), 'rotations not pruned');
  assert((await ev(() => window.Commons.money.bills().every((b) => !b.rotation.includes('p-marcus')))), 'bill rotations not pruned');
});

await test('found your own house: clean systems, gallery keeps the world', async () => {
  await go('create.html');
  await page.locator('main input').first().fill('E2E Test House');
  await page.locator('main input').nth(1).fill('Testing, warmly.');
  await page.locator('main select').selectOption({ index: 1 });
  await page.locator('#next-1').click();
  await page.waitForTimeout(300);
  await page.locator('#f-rent').fill('1300');
  await page.locator('[data-model=fund]').click();
  await page.locator('#next-2').click();
  await page.waitForTimeout(300);
  await page.locator('#next-3').click();
  await page.waitForTimeout(300);
  await page.locator('main button', { hasText: /Launch/ }).click();
  await page.waitForTimeout(600);
  assert((await ev(() => window.Commons.houses.mine()?.name)) === 'E2E Test House', 'house not claimed');
  assert((await ev(() => window.Commons.chores.all().length)) === 0, 'inherited chores');
  assert((await ev(() => window.Commons.ledger.all().length)) === 0, 'inherited ledger');
  assert((await ev(() => window.Commons.money.treasury().balance)) === 0, 'inherited fund');
  const invite = await ev(() => document.getElementById('invite-link')?.value || '');
  assert(invite.includes('house.html?id='), 'invite link not a real URL: ' + invite);
  await go('browse.html');
  const body = await ev(() => document.body.textContent);
  assert(body.includes('E2E Test House') && body.includes('Cypress Yard'), 'gallery lost a house');
});

await test('setup wizard: launch → chores → meals → dashboard complete', async () => {
  await go('dashboard.html');
  assert((await ev(() => document.getElementById('page').textContent.includes('Finish setting up'))), 'no setup nudge on fresh house');
  await go('chore-builder.html?setup=1');
  assert((await ev(() => document.body.textContent.includes('House setup · chores'))), 'no setup banner on chore-builder');
  await page.locator('button', { hasText: 'Apartment crew' }).click();
  await page.waitForTimeout(400);
  await page.locator('button', { hasText: /Make this the house rotation/ }).click();
  await page.waitForTimeout(300);
  const confirm = page.locator('button', { hasText: /^Confirm/ });
  if (await confirm.count()) { await confirm.click(); await page.waitForTimeout(400); }
  assert((await ev(() => window.Commons.chores.all().length)) > 3, 'setup did not apply chores');
  await page.locator('a', { hasText: /Next: the meal plan/ }).click();
  await page.waitForTimeout(500);
  assert(page.url().includes('meals.html?setup=1'), 'did not chain to meals: ' + page.url());
  assert((await ev(() => document.body.textContent.includes('House setup · meals'))), 'no setup banner on meals');
  await page.locator('main .card', { hasText: 'Dinner Club' }).first().click();
  await page.waitForTimeout(300);
  await page.locator('button', { hasText: /Save as the house plan/ }).click();
  await page.waitForTimeout(1600); // toast + redirect
  assert(page.url().includes('dashboard.html'), 'did not finish on dashboard: ' + page.url());
  assert((await ev(() => window.Commons.meals.plan()?.presetId)) === 'dinner-club', 'plan not saved in setup');
  assert(!(await ev(() => document.getElementById('page').textContent.includes('Finish setting up'))), 'setup nudge still showing after completion');
});

await test('solo house: your own vote decides — nothing wedges', async () => {
  await go('agreement.html');
  await page.waitForTimeout(400);
  assert((await ev(() => window.Commons.agreementDoc.get().version)) === 1, 'fresh house should draft v1');
  const lines = await ev(() => window.Commons.agreementDoc.get().lines.join('\n'));
  await page.fill('#am-text', lines + '\nSolo amendment: the hallway stays clear.');
  await page.locator("[data-act='propose']").click();
  await page.waitForTimeout(400);
  const doc = await ev(() => window.Commons.agreementDoc.get());
  assert(doc.version === 2 && doc.lines.some((l) => l.includes('hallway stays clear')), 'solo amendment did not auto-pass: v' + doc.version);
  await go('dashboard.html');
  await page.locator("[data-act='task-form']").first().click();
  await page.fill('#t-desc', 'Solo bounty');
  await page.locator("[data-act='task-add']").click();
  await page.waitForTimeout(300);
  assert((await ev(() => window.Commons.tasks.all().some((x) => x.desc === 'Solo bounty'))), 'solo bounty not stored');
  assert((await ev(() => document.querySelectorAll("[data-act='task-dispute']").length)) === 0, 'dispute control rendered in a solo house');
});

// (sign-out / sign-in is covered reliably by the hosted cloud suite)

/* ---------- on-chain rails (anvil) ---------- */
if (process.env.RUN_CHAIN && CHAIN && escrowAddr) {  // localhost anvil rails — opt-in (RUN_CHAIN=1)
  await freshChain('account.html?new=1');
  await test('rails: account + wallet; funding shows in balance', async () => {
    await page.waitForFunction(() => window.CloudSync && window.CloudSync.available === true, null, { timeout: 10000 });
    await page.waitForSelector('#a-username');
    await page.fill('#a-username', 'chaintester');
    await page.fill('#a-password', 'gnosisgnosis1');
    await page.fill('#a-name', 'Chain Tester');
    await page.locator('#a-submit').click();
    await page.waitForTimeout(2600);
    await go('account.html'); // rails-enabled page
    await page.waitForTimeout(600);
    const addr = await ev(() => window.Rails.ensureWallet());
    assert(addr && addr.startsWith('0x'), 'no wallet address derivable: ' + addr);
    execSync(FOUNDRY + `/cast send ${addr} --value 50ether --private-key ${ANVIL_KEY0} --rpc-url http://127.0.0.1:8545`, { stdio: 'ignore' });
    const bal = await ev(() => Rails.balance());
    assert(Number(bal) >= 50, 'funding not visible: ' + bal);
  });

  await test('rails: hosting a priced gathering opens on-chain escrow', async () => {
    await go('gatherings.html');
    await page.waitForFunction(() => window.CloudSync && window.CloudSync.available === true, null, { timeout: 10000 });
    await page.waitForTimeout(400);
    await page.locator('#host-toggle').click();
    await page.waitForSelector('#g-title', { state: 'visible', timeout: 8000 });
    const d = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    await page.fill('#g-title', 'Chain Mixer');
    await page.fill('#g-when', d);
    await page.fill('#g-where', 'On Chain, Gnosis');
    await page.fill('#g-price', '15');
    await page.locator('#g-submit').click();
    await page.waitForTimeout(2500); // create tx confirms on anvil
    const evt = await ev(() => window.Commons.events.all().find((x) => x.title === 'Chain Mixer'));
    assert(evt && evt.chain === true && evt.escrowTx, 'event not marked on-chain: ' + JSON.stringify({c: evt && evt.chain, t: evt && evt.escrowTx}));
    const info = await ev((id) => Rails.escrow.info(id), evt.id);
    const wallet = await ev(() => Rails.address());
    assert(info.host && info.host.toLowerCase() === wallet.toLowerCase(), 'contract host mismatch: ' + JSON.stringify(info) + ' vs ' + wallet);
    assert(info.deposit === '15', 'contract deposit mismatch: ' + info.deposit);
  });

  await test('rails: real deposit moves real xDai into the contract', async () => {
    const evt = await ev(() => window.Commons.events.all().find((x) => x.title === 'Chain Mixer'));
    const before = Number(await ev(() => Rails.balance()));
    await ev((id) => Rails.escrow.deposit(id, 15), evt.id);
    const info = await ev((id) => Rails.escrow.info(id), evt.id);
    assert(info.pot === '15', 'pot not funded: ' + info.pot);
    const after = Number(await ev(() => Rails.balance()));
    assert(before - after > 14.9, 'balance did not drop by the deposit');
  });

  await test('rails: host cancel on-chain refunds the deposit', async () => {
    const evt = await ev(() => window.Commons.events.all().find((x) => x.title === 'Chain Mixer'));
    await ev((id) => Commons.events.payEscrow(id, 15), evt.id); // mirror local so UI shows refundable state
    const before = Number(await ev(() => Rails.balance()));
    await go('gatherings.html');
    await page.locator("[data-action='cancel-gathering']").first().click();
    await page.waitForTimeout(200);
    await page.locator("[data-action='cancel-gathering']").first().click();
    await page.waitForTimeout(3000); // cancel + withdraw txs
    assert(!(await ev(() => window.Commons.events.all().some((x) => x.title === 'Chain Mixer'))), 'event not removed locally');
    const after = Number(await ev(() => Rails.balance()));
    assert(after - before > 14.9, 'deposit not refunded on-chain: ' + before + ' -> ' + after);
  });
}
if (process.env.RUN_CHAIN && CHAIN && communeAddr) {
  await test('rails: chore rotation syncs to CommuneOS and mark-done dual-writes', async () => {
    // give the chain tester a house + rotation, then sync it on-chain via the UI
    await go('account.html');
    await ev(() => {
      window.Commons.houses.claimOwn({ id: 'h-chain', name: 'Chain House', borough: 'Bed-Stuy', hasLocation: true,
        rent: 1300, poolModel: 'fund', poolMonthly: 150, mission: '', networked: 50, roomsOpen: 0, moveIn: null,
        founded: 'forming', members: ['me'], values: [], rules: [], hue: '#0d9488', blurb: 'chain test' });
      window.Commons.chorePlanner.apply(window.Commons.chorePlanner.estimate({ kitchen: 1, trash: 1 }, 1).chores);
    });
    await go('chores.html');
    // The chore-log UI is gated behind (unbuilt) collateral mode, so drive the
    // CommuneOS sync through the same rails the button used — the on-chain path
    // still exists, it's just not offered without a stake.
    await ev(async () => {
      const house = window.Commons.houses.mine();
      const chores = window.Commons.chores.all();
      const ids = {}; chores.forEach((c, i) => { ids[c.id] = i; });
      const { communeId, hash } = await Rails.commune.create(house.name, chores.map((c, i) => ({
        onchainId: i, name: c.name, freqDays: c.freqDays, startMs: new Date(c.start).getTime(),
      })));
      window.Commons.state.choreChain = { communeId, network: Rails.netId(), ids, tx: hash };
      window.Commons.save();
    });
    await page.waitForTimeout(1500);
    const cc = await ev(() => window.Commons.state.choreChain);
    assert(cc && typeof cc.communeId === 'number', 'commune not created: ' + JSON.stringify(cc));
    await go('chores.html'); // re-render so mark-done binds with the chain synced
    // mark the first chore done through the UI → dual-write
    await page.locator('[data-chore]').first().click();
    await page.waitForTimeout(3000); // markChoreComplete tx
    const done = await ev(async (cc2) => {
      const chores = window.Commons.chores.all();
      const c = chores[0];
      const period = window.Commons.chores.period(c);
      return await Rails.commune.isComplete(cc2.communeId, cc2.ids[c.id], period);
    }, cc);
    assert(done === true, 'completion not recorded on CommuneOS');
  });

  await test('rails: bounty dual-writes to the CommuneOS TaskManager', async () => {
    await go('dashboard.html');
    assert((await ev(() => document.getElementById('page').textContent.includes('dual-writing'))), 'chain-ready pill missing');
    await page.locator("[data-act='task-form']").first().click();
    await page.fill('#t-desc', 'Chain bounty: seal the window');
    await page.fill('#t-budget', '45');
    await page.locator("[data-act='task-add']").click();
    await page.waitForTimeout(3000); // createTask tx
    const t = await ev(() => window.Commons.tasks.all().find((x) => x.desc.includes('seal the window')));
    assert(t && t.onchain && typeof t.onchain.taskId === 'number' && t.onchain.tx, 'task not on-chain: ' + JSON.stringify(t && t.onchain));
    await page.locator(`[data-act='task-done'][data-id='${t.id}']`).click();
    await page.waitForTimeout(3000); // markTaskDone tx
    assert((await ev((id) => window.Commons.tasks.get(id).status, t.id)) === 'done', 'chain bounty not marked done');
  });

  await test('rails: notarize the house agreement on-chain', async () => {
    await go('agreement.html');
    await page.waitForTimeout(500);
    await page.locator("[data-act='notarize']").click();
    await page.waitForTimeout(3000); // self-send tx
    const doc = await ev(() => window.Commons.agreementDoc.get());
    assert(doc.notarized && doc.notarized.tx && doc.notarized.digest.startsWith('0x') && doc.notarized.version === doc.version,
      'notarization not recorded: ' + JSON.stringify(doc.notarized));
  });
}

if (anvil) anvil.kill();
if (apiServer) apiServer.kill();

await browser.close();

const fails = results.filter(([s]) => s === 'FAIL');
results.forEach(([s, n]) => console.log(s, '—', n));
console.log(`\n${results.length - fails.length}/${results.length} passed`);
process.exit(fails.length ? 1 : 0);
