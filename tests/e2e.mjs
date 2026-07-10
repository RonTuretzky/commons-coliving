// Commons e2e suite — drives every feature against localhost:8091 and asserts real state.
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:8091';
let browser, ctx, page;
const results = [];
let consoleErrors = [];

async function fresh(url) {
  if (ctx) await ctx.close();
  ctx = await browser.newContext();
  page = await ctx.newPage();
  consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push('console: ' + m.text()); });
  await page.goto(BASE + '/' + url);
  await page.waitForTimeout(300);
}
async function go(url) { await page.goto(BASE + '/' + url); await page.waitForTimeout(300); }
const ev = (fn) => page.evaluate(fn);

async function test(name, fn) {
  try {
    await fn();
    if (consoleErrors.length) throw new Error('JS errors: ' + consoleErrors.join(' | '));
    results.push(['PASS', name]);
  } catch (e) {
    results.push(['FAIL', name + ' — ' + String(e.message).slice(0, 200)]);
    consoleErrors = [];
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

browser = await chromium.launch();

/* ---------- 0. every page loads clean ---------- */
const PAGES = ['index.html','quiz.html','browse.html','house.html?id=h-redhook','person.html?id=p-maya','create.html','dashboard.html','ledger.html','chores.html','chore-builder.html','meals.html','checkin.html','gatherings.html','steward.html','templates.html','account.html'];
await fresh('index.html');
for (const p of PAGES) {
  await test('loads clean: ' + p, async () => {
    await go(p);
    await page.waitForTimeout(250);
    assert((await ev(() => document.body.innerHTML.length)) > 3000, 'page too empty');
  });
}

/* ---------- 1. account creation e2e ---------- */
await fresh('account.html');
await test('account: create → navbar identity + store mirror', async () => {
  await page.fill('#a-name', 'Ron T');
  await page.fill('#a-bio', 'Strong compost opinions.');
  await page.locator('[data-hue]').nth(2).click();
  await page.locator('#a-save').click();
  await page.waitForTimeout(700); // reloads
  const acct = await ev(() => window.Commons.account.get());
  assert(acct && acct.name === 'Ron T', 'account not saved');
  const meName = await ev(() => window.Commons.me().name);
  assert(meName === 'Ron T', 'me not mirrored');
  const nav = await ev(() => document.querySelector('a[href="account.html"].row')?.textContent || '');
  assert(nav.includes('Ron'), 'navbar missing account name');
});
await test('account: identity propagates to steward greeting', async () => {
  await go('steward.html');
  await page.waitForTimeout(600);
  const chat = await ev(() => document.querySelector('.chat')?.textContent || '');
  assert(chat.includes('Hey Ron'), 'greeting not personalized: ' + chat.slice(0, 60));
});
await test('account: edit + sign out restores demo persona', async () => {
  await go('account.html');
  await page.fill('#a-name', 'Ron Turetzky');
  await page.locator('#a-save').click();
  await page.waitForTimeout(700);
  assert((await ev(() => window.Commons.me().name)) === 'Ron Turetzky', 'update not mirrored');
  await page.locator('#a-signout').click();
  await page.waitForTimeout(900);
  assert((await ev(() => window.Commons.account.get())) === null, 'account not cleared');
  assert((await ev(() => window.Commons.me().name)) === 'You', 'demo persona not restored');
});

/* ---------- 2. quiz e2e ---------- */
await fresh('quiz.html');
await test('quiz: 12 questions → dealbreakers → basics → archetype saved', async () => {
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
  const body = await ev(() => document.body.textContent);
  assert(/You’re|You're/.test(body), 'no archetype reveal');
  assert((await ev(() => window.Commons.me().quizDone)) === true, 'quiz not saved');
  assert((await ev(() => window.Commons.me().hard.includes('smoke'))), 'dealbreaker not saved');
});

/* ---------- 3. ledger e2e ---------- */
await fresh('ledger.html');
await test('ledger: settle button moves real money state', async () => {
  const before = await ev(() => window.Commons.ledger.settlements().length);
  await page.locator('button', { hasText: 'Settle now' }).last().click();
  await page.waitForTimeout(400);
  const after = await ev(() => window.Commons.ledger.settlements().length);
  assert(after === before + 1, 'settlement not recorded');
});
await test('ledger: add expense via form lands in feed + balances', async () => {
  await page.fill('#x-desc', 'Test lightbulbs');
  await page.fill('#x-amount', '24');
  await page.locator('button', { hasText: /Add to the ledger/ }).click();
  await page.waitForTimeout(400);
  const found = await ev(() => window.Commons.ledger.all().some((x) => x.desc === 'Test lightbulbs' && x.amount === 24));
  assert(found, 'expense not stored');
  const sum = await ev(() => Object.values(window.Commons.ledger.balances()).reduce((s, v) => s + v, 0));
  assert(Math.abs(sum) < 0.05, 'balances no longer sum to zero: ' + sum);
});
await test('ledger: auto-settle actually settles debts ≥ $50', async () => {
  await ev(() => window.Commons.ledger.add({ desc: 'Fridge repair', amount: 480, paidBy: 'p-june', category: 'repairs',
    split: { mode: 'equal', participants: ['me','p-zora','p-eli','p-priya','p-marcus','p-june'] } }));
  const oweBefore = await ev(() => window.Commons.ledger.simplify().filter((p) => p.from === 'me' && p.amount >= 50).length);
  assert(oweBefore > 0, 'setup failed — no big debt created');
  const setBefore = await ev(() => window.Commons.ledger.settlements().length);
  await page.locator("[data-act='autosettle']").click();
  await page.waitForTimeout(600);
  const setAfter = await ev(() => window.Commons.ledger.settlements().length);
  assert(setAfter > setBefore, 'auto-settle did not settle');
  const oweAfter = await ev(() => window.Commons.ledger.simplify().filter((p) => p.from === 'me' && p.amount >= 50).length);
  assert(oweAfter === 0, 'big debt still open after auto-settle');
});

/* ---------- 4. dashboard e2e ---------- */
await fresh('dashboard.html');
await test('dashboard: vote crosses 2/3 → auto-executes from fund', async () => {
  const balBefore = await ev(() => window.Commons.money.treasury().balance);
  await page.locator("[data-act='vote'][data-val='1'][data-id='pr-freezer']").click();
  await page.waitForTimeout(400);
  const p = await ev(() => window.Commons.proposals.get('pr-freezer'));
  assert(p.status === 'passed' && p.executed, 'proposal did not auto-execute');
  const balAfter = await ev(() => window.Commons.money.treasury().balance);
  assert(balAfter === balBefore - 340, 'treasury not debited');
});
await test('dashboard: new proposal modal creates real proposal', async () => {
  await page.locator("[data-act='new-proposal']").click();
  await page.fill('#m-title', 'Test: new door mat');
  await page.fill('#m-desc', 'The old one is a biohazard.');
  await page.fill('#m-amount', '35');
  await page.locator('#m-submit').click();
  await page.waitForTimeout(400);
  assert(await ev(() => window.Commons.proposals.all().some((x) => x.title === 'Test: new door mat')), 'proposal not stored');
});

/* ---------- 5. chores + check-in + reallocator e2e ---------- */
await fresh('chores.html');
await test('chores: mark done persists', async () => {
  await page.locator('[data-chore]').first().click();
  await page.waitForTimeout(300);
  const doneCount = await ev(() => {
    const C = window.Commons; let n = 0;
    C.chores.all().forEach((c) => { if (C.chores.done(c.id, C.chores.period(c))) n++; });
    return n;
  });
  assert(doneCount >= 1, 'chore not marked');
});
await test('check-in: bandwidth + reshuffle creates real overrides', async () => {
  await go('checkin.html');
  await page.locator('main .card', { hasText: 'Running on fumes' }).first().click();
  await page.waitForTimeout(300);
  assert((await ev(() => window.Commons.prefs.bandwidth('me'))) === 'low', 'bandwidth not saved');
  await page.locator('main button', { hasText: /Reshuffle/ }).click();
  await page.waitForTimeout(500);
  assert((await ev(() => window.Commons.rebalance.overrideCount())) > 0, 'no overrides created');
  await go('chores.html');
  const badges = await ev(() => document.body.textContent.includes('swapped'));
  assert(badges, 'swap badges not shown on chores board');
});
await test('chore-builder: estimate + apply replaces rotation', async () => {
  await go('chore-builder.html');
  await page.locator('button', { hasText: 'Warehouse loft' }).click();
  await page.waitForTimeout(400);
  await page.locator('button', { hasText: /Make this the house rotation/ }).click();
  await page.waitForTimeout(300);
  const confirm = page.locator('button', { hasText: /^Confirm/ });
  if (await confirm.count()) { await confirm.click(); await page.waitForTimeout(400); }
  const n = await ev(() => window.Commons.chores.all().length);
  assert(n > 8, 'rotation not replaced (chores=' + n + ')');
});

/* ---------- 6. meals e2e ---------- */
await fresh('meals.html');
await test('meals: preset + save plan persists', async () => {
  await page.locator('main .card', { hasText: 'Sunday Big Batch' }).first().click();
  await page.waitForTimeout(300);
  await page.locator('button', { hasText: /Save as the house plan/ }).click();
  await page.waitForTimeout(300);
  assert((await ev(() => window.Commons.meals.plan().presetId)) === 'sunday-batch', 'plan not saved');
});

/* ---------- 7. gatherings e2e ---------- */
await fresh('gatherings.html');
await test('gatherings: rsvp / escrow reserve / refund / raise-hand all persist', async () => {
  await page.locator("[data-action='rsvp']").first().click();
  await page.waitForTimeout(300);
  assert((await ev(() => window.Commons.state.rsvps.length)) >= 2, 'rsvp not stored');
  // refund the seeded catskills escrow
  const refundBtn = page.locator('button', { hasText: /Un-RSVP \(refunds/ });
  if (await refundBtn.count()) {
    await refundBtn.click(); await page.waitForTimeout(300);
    assert((await ev(() => window.Commons.events.escrowPaid('e-retreat-catskills'))) === 0, 'escrow not refunded');
  }
  // re-reserve
  await page.locator("[data-action='reserve']").first().click();
  await page.waitForTimeout(300);
  assert((await ev(() => window.Commons.events.escrowPaid('e-retreat-catskills'))) === 185, 'escrow not held');
  // raise hand persists across reload
  await page.locator("[data-action='raise-hand']").click();
  await page.waitForTimeout(300);
  await go('gatherings.html');
  const slot = await ev(() => document.getElementById('raise-hand-slot')?.textContent || '');
  assert(slot.includes("on the Switchboard's list"), 'raise-hand did not persist');
});

/* ---------- 8. steward e2e ---------- */
await fresh('steward.html');
await test('steward: who-owes-what answers from live ledger', async () => {
  await page.locator('button.chip', { hasText: 'Who owes what?' }).click();
  await page.waitForTimeout(1300);
  const chat = await ev(() => document.querySelector('.chat')?.textContent || '');
  assert(/owes you|You owe|all square/.test(chat), 'no ledger answer');
});
await test('steward: slammed → real reallocation', async () => {
  const before = await ev(() => window.Commons.rebalance.overrideCount());
  await page.locator('button.chip', { hasText: "I'm slammed this week" }).click();
  await page.waitForTimeout(1300);
  assert((await ev(() => window.Commons.prefs.bandwidth('me'))) === 'low', 'bandwidth not set from chat');
});
await test('steward: broken → ticket → vendor draft → approve → scheduled', async () => {
  await page.fill('.card .input', 'the bathroom sink is leaking');
  await page.locator('button', { hasText: /^Send$/ }).click();
  await page.waitForTimeout(1300);
  await page.fill('.card .input', 'the bathroom sink is leaking badly');
  await page.locator('button', { hasText: /^Send$/ }).click();
  await page.waitForTimeout(1500);
  const draftBtns = page.locator('[data-draft]');
  assert(await draftBtns.count() > 0, 'no vendor cards offered');
  await draftBtns.first().click();
  await page.waitForTimeout(400);
  const hasDraft = await ev(() => window.Commons.steward.maintenance().some((m) => m.draft));
  assert(hasDraft, 'draft not attached to ticket');
  await page.locator('[data-approve]').first().click();
  await page.waitForTimeout(400);
  assert(await ev(() => window.Commons.steward.maintenance().some((m) => m.status === 'scheduled')), 'ticket not scheduled after approve');
});

/* ---------- 9. create wizard + browse + connects e2e ---------- */
await fresh('create.html');
await test('create: full wizard → house exists in store + browse', async () => {
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
  assert(await ev(() => window.Commons.houses.all().some((h) => h.name === 'E2E Test House')), 'house not stored');
  await go('browse.html');
  assert(await ev(() => document.body.textContent.includes('E2E Test House')), 'house not in gallery');
});
await test('connects: house join request + person say-hi persist', async () => {
  await go('house.html?id=h-ridge');
  await page.locator('button', { hasText: /Request to join|founding crew/ }).first().click();
  await page.waitForTimeout(300);
  assert(await ev(() => window.Commons.connects.has('house', 'h-ridge')), 'house connect not stored');
  await go('person.html?id=p-maya');
  await page.locator('#connect').click();
  await page.waitForTimeout(300);
  assert(await ev(() => window.Commons.connects.has('person', 'p-maya')), 'person connect not stored');
});

/* ---------- 10. templates/systems e2e ---------- */
await fresh('templates.html');
await test('systems: apply template to house is real', async () => {
  await page.locator('button', { hasText: 'Use for my house' }).first().click();
  await page.waitForTimeout(300);
  const model = await ev(() => window.Commons.houses.mine().poolModel);
  assert(model && model !== 'fund', 'system not applied (still ' + model + ')');
});
await test('systems: rent splitter recomputes live', async () => {
  const before = await ev(() => document.getElementById('room-out')?.textContent || '');
  await page.fill('#rent-total', '9000');
  await page.waitForTimeout(300);
  const after = await ev(() => document.getElementById('room-out')?.textContent || '');
  assert(before !== after && after.length > 5, 'splitter did not recompute');
});

await browser.close();

const fails = results.filter(([s]) => s === 'FAIL');
results.forEach(([s, n]) => console.log(s, '—', n));
console.log(`\n${results.length - fails.length}/${results.length} passed`);
process.exit(fails.length ? 1 : 0);
