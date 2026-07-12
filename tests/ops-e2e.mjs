// colive.fun — operations-layer e2e (the 2026-07-12 feature batch).
// Registers a hosted account, joins the seeded Cypress house, and drives every
// new flow against real store state: the "what needs you" inbox, "eating in
// tonight?", the house wall, the pantry (→ ledger), chore covers, the kudos
// circle, vouches/references, the public storefront, move-out reviews, and the
// graceful exit itself (run LAST — it leaves the house).
//
// Own server + browser rig (mirrors tests/e2e.mjs), STORAGE=memory. Run:
//   node tests/ops-e2e.mjs
import { chromium } from 'playwright';
import { spawn } from 'child_process';

const REPO = '/Users/wk/conductor/workspaces/research/cancun';
const PORT = 8093;
const BASE = process.env.BASE_URL || `http://localhost:${PORT}`;
let browser, ctx, page;
const results = [];
let consoleErrors = [];

let apiServer = null;
if (!process.env.BASE_URL) {
  apiServer = spawn('node', [REPO + '/api/server.js'], {
    env: { ...process.env, PORT: String(PORT), STORAGE: 'memory', STATIC_DIR: REPO, RP_ID: 'localhost', ORIGINS: BASE, SESSION_SECRET: 'ops-e2e' },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  await new Promise((r) => setTimeout(r, 900));
}

async function newPage() {
  page = await ctx.newPage();
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) consoleErrors.push('console: ' + m.text()); });
  return page;
}
async function go(url) { await page.goto(BASE + '/' + url); await page.waitForTimeout(400); }
const ev = (fn, arg) => page.evaluate(fn, arg);

async function test(name, fn) {
  try {
    await fn();
    if (consoleErrors.length) throw new Error('JS errors: ' + consoleErrors.join(' | ').slice(0, 200));
    results.push(['PASS', name]);
  } catch (e) {
    results.push(['FAIL', name + ' — ' + String(e.message).slice(0, 240)]);
  }
  consoleErrors = [];
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

browser = await chromium.launch();
ctx = await browser.newContext();
await ctx.addInitScript(() => { window.__COLIVE_SEED_DEMO = true; }); // the seeded NYC demo world
await newPage();

/* ---------- setup: register + join the Cypress house ---------- */
await test('setup: register a hosted account', async () => {
  await page.goto(BASE + '/account.html?new=1');
  await page.waitForFunction(() => window.CloudSync && window.CloudSync.available === true, null, { timeout: 10000 });
  await page.waitForSelector('#a-username');
  await page.fill('#a-username', 'opstester');
  await page.fill('#a-password', 'opspassword1');
  await page.fill('#a-name', 'Ops Tester');
  await page.locator('#a-submit').click();
  await page.waitForTimeout(2400);
  assert((await ev(() => window.CloudSync.user && window.CloudSync.user.username)) === 'opstester', 'no hosted session');
});

await test('setup: join Cypress Yard → member with running systems', async () => {
  await go('house.html?id=h-cypress');
  await page.locator('#join-btn').click();
  await page.waitForTimeout(2900);
  assert(page.url().includes('dashboard.html'), 'not redirected to dashboard: ' + page.url());
  assert((await ev(() => window.Commons.state.myHouseId)) === 'h-cypress', 'myHouseId not set');
});

/* ---------- "What needs you" inbox ---------- */
await test('inbox: dashboard surfaces items that need me, and clearing one works', async () => {
  await go('dashboard.html');
  const count = await ev(() => window.Commons.inbox.count());
  assert(count > 0, 'inbox computed no items for a fresh member');
  assert((await ev(() => !!document.querySelector('.inbox-card'))), 'inbox card not rendered');
  const hasContrib = await ev(() => !!document.querySelector("[data-act='ib-contrib']"));
  if (hasContrib) {
    await page.locator("[data-act='ib-contrib']").first().click();
    await page.waitForTimeout(300);
    assert((await ev(() => window.Commons.money.contributions().find((c) => c.member === 'me').paid)), 'contribution not paid via inbox');
  }
});

/* ---------- Eating in tonight? ---------- */
await test('dinner: RSVP "in" from the dashboard registers a headcount', async () => {
  await go('dashboard.html');
  assert((await ev(() => !!window.Commons.dinner.tonight())), 'no dinner tonight (mealPlan missing)');
  await page.locator("[data-act='dn-in']").first().click();
  await page.waitForTimeout(300);
  const r = await ev(() => window.Commons.dinner.myRSVP());
  assert(r && r.status === 'in', 'dinner RSVP not recorded: ' + JSON.stringify(r));
});

await test('dinner: meals page shows the headcount and logs a cook', async () => {
  await go('meals.html#tonight');
  assert((await ev(() => !!document.getElementById('tonight'))), 'no tonight section on meals');
  // if I happen to be tonight's cook, "I cooked it" logs an hour
  const iCook = await ev(() => { const t = window.Commons.dinner.tonight(); return t && t.cook === 'me'; });
  if (iCook) {
    const before = await ev(() => window.Commons.labor.all().length);
    await page.locator("[data-din='cooked']").click();
    await page.waitForTimeout(300);
    assert((await ev(() => window.Commons.labor.all().length)) === before + 1, 'cooked-it did not log labor');
  }
});

/* ---------- House Wall ---------- */
await test('wall: post a heads-up and react to it', async () => {
  await go('wall.html');
  await page.fill('#w-text', 'E2E: landlord coming Tuesday 2pm');
  await page.locator('#w-post').click();
  await page.waitForTimeout(300);
  assert((await ev(() => window.Commons.wall.all().some((p) => p.text.includes('landlord coming Tuesday')))), 'wall post not saved');
  await page.locator('[data-react]').first().click();
  await page.waitForTimeout(200);
  assert((await ev(() => window.Commons.wall.all().some((p) => Object.keys(p.reactions || {}).length > 0))), 'reaction not recorded');
});

/* ---------- The Pantry → the ledger ---------- */
await test('pantry: add an item, mark it bought, and it lands in the ledger', async () => {
  await go('pantry.html');
  const ledgerBefore = await ev(() => window.Commons.ledger.all().length);
  await page.fill("[data-add] [name='name']", 'E2E olive oil');
  await page.fill("[data-add] [name='est']", '12');
  await page.locator("[data-add] button[type='submit']").click();
  await page.waitForTimeout(300);
  const id = await ev(() => { const it = window.Commons.pantry.needs().find((x) => x.name === 'E2E olive oil'); return it && it.id; });
  assert(id, 'pantry item not added');
  await page.locator(`[data-act='buy-open'][data-id='${id}']`).click();
  await page.waitForTimeout(150);
  await page.fill('#price-' + id, '11.5');
  await page.locator(`[data-act='buy'][data-id='${id}']`).click();
  await page.waitForTimeout(300);
  assert((await ev(() => window.Commons.pantry.bought().some((x) => x.name === 'E2E olive oil'))), 'item not marked bought');
  const after = await ev(() => window.Commons.ledger.all());
  assert(after.length === ledgerBefore + 1 && after[0].amount === 11.5, 'pantry buy did not post 11.50 to the ledger');
});

/* ---------- Cover me (chore swap) ---------- */
await test('covers: ask for a cover on my chore, and it becomes claimable', async () => {
  // deterministically make the first chore mine this period, then reload
  await go('chores.html');
  await ev(() => { const c = window.Commons.chores.all()[0]; const per = window.Commons.chores.period(c); window.Commons.state.choreOverrides[c.id + ':' + per] = 'me'; window.Commons.save(); });
  await go('chores.html');
  const askBtn = page.locator('[data-cover-ask]').first();
  assert((await askBtn.count()) > 0, 'no cover-ask button on my chore');
  await askBtn.click();
  await page.waitForTimeout(300);
  assert((await ev(() => window.Commons.covers.open().length)) > 0, 'cover request not created');
});

/* ---------- Kudos (gratitude circle) ---------- */
await test('kudos: thank a housemate with a reason', async () => {
  await go('checkin.html');
  await page.locator('#kudos [data-kudo-who]').first().click();
  await page.waitForTimeout(150);
  await page.fill('#kudo-why', 'E2E: reset the kitchen every morning');
  await page.locator('#kudo-give').click();
  await page.waitForTimeout(300);
  assert((await ev(() => window.Commons.kudos.all().some((k) => k.from === 'me' && k.why.includes('reset the kitchen')))), 'kudos not recorded');
});

/* ---------- Vouch (bring-your-own-trust) ---------- */
await test('vouch: one-tap vouch for a housemate shows on their profile', async () => {
  await go('person.html?id=p-maya');
  await page.locator('#vouch-btn').click();
  await page.waitForTimeout(300);
  assert((await ev(() => window.Commons.refs.vouchesFor('p-maya').some((v) => v.by === 'me'))), 'vouch not recorded');
  assert((await ev(() => document.getElementById('page').textContent.includes('Vouched by'))), 'vouch not shown on profile');
});

/* ---------- Reviews display + public storefront ---------- */
await test('reviews: a house-review renders as reputation on the profile', async () => {
  await ev(() => window.Commons.reviews.add({ house: 'h-cypress', to: 'p-zora', recommend: true, tags: ['Paid their share'], line: 'a joy to live with' }));
  await go('person.html?id=p-zora');
  assert((await ev(() => /would live again/i.test(document.getElementById('page').textContent))), 'review summary not shown');
});

await test('recruit: listing the house lights up the public share', async () => {
  await go('dashboard.html');
  await page.locator("[data-act='recruit-toggle']").click();
  await page.waitForTimeout(300);
  assert((await ev(() => window.Commons.houses.mine().listed === true)), 'house not listed');
  assert((await ev(() => !!document.getElementById('recruit-url'))), 'public link not revealed');
});

await test('public storefront: a not-mine house in public mode shows the fit teaser', async () => {
  await go('house.html?id=h-ridge&public=1');
  const body = await ev(() => document.body.textContent);
  assert(/public page/i.test(body), 'no public banner');
  assert(/See if we.?d click|take the .*quiz/i.test(body), 'no quiz-to-reveal teaser: ' + body.slice(0, 120));
});

/* ---------- Refer & references ---------- */
await test('account: personal invite link + reference link are present', async () => {
  await go('account.html');
  await page.waitForSelector('#refer-link', { timeout: 6000 });
  const link = await ev(() => document.getElementById('refer-link').value);
  assert(/[?&]ref=/.test(link), 'invite link missing ?ref= : ' + link);
  assert((await ev(() => !!document.getElementById('reference-copy'))), 'reference link button missing');
});

await test('reference: the public no-account form sends a reference', async () => {
  await go('reference.html?for=opstester&name=Ops%20Tester');
  await page.locator('#r-send').click();
  await page.waitForTimeout(300);
  assert((await ev(() => /Thank you/i.test(document.getElementById('page').textContent))), 'reference form did not confirm');
});

/* ---------- Graceful Exit + move-out reviews (LAST — it leaves the house) ---------- */
await test('moveout: graceful exit prunes me and opens the review step', async () => {
  const roomsBefore = await ev(() => window.Commons.houses.get('h-cypress').roomsOpen);
  await go('moveout.html');
  await page.locator('#confirm-leave').click();
  await page.waitForTimeout(500);
  assert((await ev(() => window.Commons.houses.mine() === null || window.Commons.houses.mine() === undefined)), 'still in a house after leaving');
  assert((await ev(() => !window.Commons.houses.get('h-cypress').members.includes('me'))), 'still on the Cypress roster');
  assert((await ev(() => window.Commons.houses.get('h-cypress').roomsOpen)) === roomsBefore + 1, 'a room did not reopen');
  assert((await ev(() => /Review your/i.test(document.getElementById('page').textContent))), 'did not advance to the review step');
});

await test('moveout: submitting reviews records them for each co-resident', async () => {
  await page.locator('#submit-reviews').click();
  await page.waitForTimeout(400);
  assert((await ev(() => window.Commons.reviews.byMe().filter((r) => r.house === 'h-cypress').length)) > 0, 'no move-out reviews recorded');
  assert((await ev(() => /moved out/i.test(document.getElementById('page').textContent))), 'no completion screen');
});

/* ---------- report ---------- */
const passed = results.filter((r) => r[0] === 'PASS').length;
console.log('\n=== ops-layer e2e ===');
for (const [s, n] of results) console.log((s === 'PASS' ? '  ✓ ' : '  ✗ ') + n);
console.log(`\n${passed}/${results.length} passed`);

await browser.close();
if (apiServer) apiServer.kill();
process.exit(passed === results.length ? 0 : 1);
