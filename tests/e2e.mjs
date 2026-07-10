// Commons e2e suite — the productized user journey, asserted against real store state.
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:8091';
let browser, ctx, page;
const results = [];
let consoleErrors = [];

const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

async function newPage() {
  page = await ctx.newPage();
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push('console: ' + m.text()); });
  return page;
}
async function fresh(url) {
  if (ctx) await ctx.close();
  ctx = await browser.newContext();
  consoleErrors = [];
  await newPage();
  await page.goto(BASE + '/' + url);
  await page.waitForTimeout(300);
}
async function go(url) { await page.goto(BASE + '/' + url); await page.waitForTimeout(350); }
const ev = (fn) => page.evaluate(fn);

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

/* ---------- 0. public pages load clean ---------- */
const PUBLIC = ['index.html', 'browse.html', 'house.html?id=h-redhook', 'person.html?id=p-maya', 'gatherings.html', 'templates.html', 'quiz.html', 'account.html'];
await fresh('index.html');
for (const p of PUBLIC) {
  await test('public page loads clean: ' + p, async () => {
    await go(p);
    assert((await ev(() => document.body.innerHTML.length)) > 3000, 'page too empty');
  });
}
await test('landing: signed-out hero funnels to signup', async () => {
  await go('index.html');
  const cta = await ev(() => document.getElementById('hero-cta')?.textContent || '');
  assert(cta.includes('Get started'), 'no signup CTA: ' + cta);
});

/* ---------- 1. auth gates redirect ---------- */
const GATED = ['dashboard.html', 'ledger.html', 'chores.html', 'chore-builder.html', 'meals.html', 'checkin.html', 'steward.html', 'create.html'];
for (const p of GATED) {
  await test('gate redirects when signed out: ' + p, async () => {
    await go(p);
    await page.waitForTimeout(400);
    assert(page.url().includes('account.html'), 'no redirect, still on ' + page.url());
  });
}

/* ---------- 2. THE JOURNEY (one continuous context, like a real user) ---------- */
await fresh('account.html');
const cdp = await addVirtualAuthenticator();

await test('signup: account + passkey + photo → onboards to quiz', async () => {
  await page.setInputFiles('#a-photo', { name: 'me.png', mimeType: 'image/png', buffer: PNG_1x1 });
  await page.waitForTimeout(500);
  await page.fill('#a-name', 'Ron T');
  await page.fill('#a-bio', 'Strong compost opinions.');
  await page.fill('#a-email', 'ron@example.com');
  await page.locator('#a-save').click();
  await page.waitForTimeout(2200); // passkey create + redirect
  assert(page.url().includes('quiz.html'), 'not onboarded to quiz: ' + page.url());
  const acct = await ev(() => window.Commons.account.get());
  assert(acct && acct.name === 'Ron T', 'account not saved');
  assert(acct.passkey && acct.passkey.credId, 'passkey not created');
  assert(acct.photo && acct.photo.startsWith('data:image/jpeg'), 'photo not stored');
  assert((await ev(() => window.Commons.me().photo && true)), 'photo not mirrored to profile');
});

await test('quiz: full run saves profile', async () => {
  await page.locator('main button', { hasText: /^Start/ }).first().click();
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(450);
    await page.locator('main .choice').first().click();
  }
  await page.waitForTimeout(600);
  await page.locator('main button', { hasText: 'Smoking indoors' }).click();
  await page.locator('main button', { hasText: /Continue/ }).click();
  await page.waitForTimeout(400);
  await page.locator('main button', { hasText: /reveal|See|Continue|Finish/i }).last().click();
  await page.waitForTimeout(1600);
  assert((await ev(() => window.Commons.me().quizDone)) === true, 'quiz not saved');
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
});

await test('dashboard: contribution + vote mechanics at 7 members', async () => {
  await page.locator("[data-act='pay-contrib']").click();
  await page.waitForTimeout(300);
  assert((await ev(() => window.Commons.money.contributions().find((c) => c.member === 'me').paid)), 'contribution not paid');
  const threshold = await ev(() => window.Commons.proposals.threshold());
  assert(threshold === 5, 'threshold should be 5 of 7, got ' + threshold);
  await page.locator("[data-act='vote'][data-val='1'][data-id='pr-freezer']").click();
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

await test('gatherings: rsvp, escrow reserve → refund, raise-hand persists', async () => {
  await go('gatherings.html');
  await page.locator("[data-action='rsvp']").first().click();
  await page.waitForTimeout(300);
  assert((await ev(() => window.Commons.state.rsvps.length)) >= 1, 'rsvp not stored');
  await page.locator("[data-action='reserve']").first().click();
  await page.waitForTimeout(300);
  assert((await ev(() => window.Commons.events.escrowPaid('e-retreat-catskills'))) === 185, 'escrow not held');
  await page.locator('button', { hasText: /refunds/ }).click();
  await page.waitForTimeout(300);
  assert((await ev(() => window.Commons.events.escrowPaid('e-retreat-catskills'))) === 0, 'escrow not refunded');
  await page.locator("[data-action='raise-hand']").click();
  await page.waitForTimeout(300);
  await go('gatherings.html');
  assert((await ev(() => (document.getElementById('raise-hand-slot')?.textContent || '').includes("Switchboard's list"))), 'raise-hand not persisted');
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

await test('sign out → gate closes → passkey sign-in reopens', async () => {
  await go('account.html');
  await page.locator('#a-signout').click();
  await page.waitForTimeout(800);
  await go('dashboard.html');
  await page.waitForTimeout(400);
  assert(page.url().includes('account.html'), 'gate open while signed out');
  const btn = page.locator('#signin');
  assert((await btn.textContent()).includes('passkey'), 'sign-in not passkey-gated');
  await btn.click();
  await page.waitForTimeout(1200);
  assert((await ev(() => window.Commons.account.active())), 'not signed back in');
  await go('dashboard.html');
  assert(!page.url().includes('account.html'), 'gate still closed after sign-in');
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

await browser.close();

const fails = results.filter(([s]) => s === 'FAIL');
results.forEach(([s, n]) => console.log(s, '—', n));
console.log(`\n${results.length - fails.length}/${results.length} passed`);
process.exit(fails.length ? 1 : 0);
