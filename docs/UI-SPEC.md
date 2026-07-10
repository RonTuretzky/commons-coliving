# Commons — page build spec

Conventions for building pages of the Commons prototype. **Read `PRD.md` for product intent, `assets/css/park.css` for available classes, and `assets/js/store.js` + `assets/js/shell.js` for the full API before writing your page.** Do not modify those shared files — if something is missing, work around it with inline `<style>`/local JS in your own page file only.

## Page boilerplate

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PAGE — Commons by Decentral Park</title>
  <link rel="icon" href="assets/img/logomark.png" />
  <link rel="stylesheet" href="assets/css/park.css" />
</head>
<body>
  <main>
    <!-- your content, usually .container sections -->
  </main>
  <script src="assets/js/store.js"></script>
  <script src="assets/js/shell.js"></script>
  <script>
    Shell.render("ACTIVE_NAV_ID"); // one of: browse|gatherings|dashboard|chores|steward|quiz|create|'' (landing/profiles)
    // page logic here — plain ES6, no frameworks, no external CDNs
  </script>
</body>
</html>
```

- **No frameworks, no CDNs, no network requests.** Everything self-contained; must work from `file://` and any static host.
- Escape ALL seed/user strings interpolated into HTML with `Commons.util.esc(...)`.
- Pages re-render by calling their own `render()` after any state mutation; state persists automatically via the store.
- Feedback for every action: `Shell.toast("Marked done", "green")`.

## Store API quick reference (`window.Commons`)

- `Commons.me()` / `Commons.setMe(patch)` — the user profile `{name, borough, budget, dims{hearth,order,voice,mission,porch,pool}, hard[], flags[], values[], quizDone, events[]}`
- `Commons.DIMS` `[{id,label,low,high,desc}]` · `Commons.DEALBREAKERS` `[{id,label,flag}]` · `Commons.QUIZ` `[{q, a:[{t, d}]}]` · `Commons.ARCHETYPES`
- `Commons.people.all()/get(id)/seekers()` · `Commons.houses.all()/get(id)/mine()/add(h)/dims(h)`
- `Commons.match(a, b)` → `{score, conflicts}` · `Commons.matchHouse(me, house)` → `{score, conflicts, conflictMembers, budgetFit}` · `Commons.archetype(dims)` → `{name, emoji, desc}`
- `Commons.events.upcoming()/past()/get(id)/rsvp(id)/unrsvp(id)/isRsvpd(id)/payEscrow(id, amt)/escrowPaid(id)/overlap(profile)`
- `Commons.chores.all()/period(chore)/assignee(chore, period?)/done(id, period)/doneInfo(id, period)/markDone(id, period)/completionRate(id)` — period-calculated rotation (commune-os-sc style)
- `Commons.money.treasury()/contributions()/payContribution(memberId)/bills()/billPayer(bill, date?)/billIsPaid(id)/payBill(id)/rotationPreview(bill, n)`
- `Commons.proposals.all()/get(id)/add({title,kind:'spend'|'rule'|'dispute',desc,amount?,proposer:'me'})/vote(id,'me',true|false)/threshold()` — **2/3 auto-resolution built in**
- `Commons.connects.add('house'|'person', id)/has(kind, id)`
- `Commons.steward.chat()/push({who:'me'|'steward', text, actions?})/clear()/maintenance()/addMaintenance({title})`
- `Commons.econ.all()/get(id)/label(id)/apply(houseId, id)` — economic templates (`split|weighted|fund|sliding|commons|labor`, each `{id,name,emoji,tagline,how,bestFor,knobs[],pool}`); houses store the id in `house.poolModel`
- `Commons.chorePlanner.spaces()/presets()/estimate(selection, nMembers)/apply(chores)` — `selection` is `{spaceId: count}`; estimate returns `{chores[], weeklyMinutes, perPersonWeekly, perPersonDaily}` with per-task minutes/freq from the SPACES effort catalog; `apply` replaces the house rotation (confirm with the user first — it wipes completion history)
- `Commons.meals.presets()/staples()/plan()/setPlan(cfg)/clearPlan()/estimate(cfg)` — `cfg = {presetId, eaters, dinners, vegShare 0..1, tier thrifty|standard|generous, batchDay?, rotation[]}`; estimate returns `{servings, weeklyCost, perServing, perPersonWeekly, list[] (staples w/ qty+cost), nights[] (cook shifts), batchMinutes, takeoutComparison}`
- `Commons.ledger` — the Splitwise-style house ledger:
  - `CATEGORIES` `[{id,label,emoji}]` · `all()` expenses newest-first · `settlements()`
  - expense shape: `{id, desc, amount, paidBy, category, at, note?, recurring?, fromBill?, paidByFund?, split:{mode:'equal'|'exact'|'shares'|'percent', participants:[ids], values?:{id:num}}}`
  - `add(x)` · `payFromFund(x)` (no interpersonal debt; deducts treasury) · `shares(x)` → `{memberId: $}` cent-exact
  - `balances()` → net per member (+ = is owed) · `pairwiseCount()` raw debt count · `simplify()` → `[{from,to,amount}]` greedy netting (show the reduction: "N payments instead of M")
  - `settle(from,to,amount)` → records settlement with a rail receipt `{fee, seconds, ref}` (instant stablecoin rails — keep the framing quiet/pragmatic)
  - `byCategory(sinceDays)` → `{catId: $}` · `defaultSplit()` → template-aware default `{mode, participants, fundOption?, hint?}`
- `Commons.CHORE_KINDS` `[{id,label,emoji}]` · `Commons.BANDWIDTH` `[{id,label,emoji,capacity,desc}]` (low/normal/high) · `Commons.APPETITE` `[{id,label,emoji,desc}]` (avoid/fine/love)
- `Commons.prefs.kinds()/get(memberId)/setMine({loves,hates})/bandwidth(memberId?)/setBandwidth(id)/appetite(memberId?)/setAppetite(id)` — chore-taste profiles + weekly bandwidth & cooking appetite
- `Commons.rebalance.week()` → `{changes:[{choreId,name,emoji,period,from,to,reason}], mealNote}` — reallocates this period's open chores by preference + bandwidth (writes overrides; `chores.assignee()` is automatically override-aware) and reorders the meal-plan cook rotation by appetite. `clear()` drops overrides · `overrideCount()` · `isOverridden(choreId, period)`
- `Commons.util`: `fmtMoney, fmtDate, fmtDateLong, relDate, initials, hue, esc, qp(name), clamp`

**Copy rule ("systems, not templates"):** the product story is *"run the house on a system that works"* — the word "template" undersells and should be avoided in headings/CTAs (fine in passing). The calculators are first-class features: label them CALCULATOR and cross-link them prominently.
- `Shell.toast(msg, 'green'?)` · `Shell.avatarHtml(profile, 'sm'|'lg'?)` · `Shell.matchPill(matchResult)`

## Brand rules

- Headlines: `.text-h1` (uppercase, landing hero only) / `.text-h2` / `.text-h3`; section kickers: `<div class="kicker">Like this</div>` above headings.
- Primary CTAs are **lifted buttons**: `<button class="lifted"><span class="shadow"></span><span class="face">Label</span></button>` (variants: `green`, `sky`, `stroke`, `burn`; sizes `sm`, `xs`). Secondary actions use `.park-btn` variants. Filters/values use `.chip` (`.on` for selected).
- Cards: `.card` (+`.clickable` when it links). Pills: `.pill.match/.conflict/.zero/.open/.pine/.ink/.warn/.paper`.
- Match display always pairs match % with the dealbreaker count pill (never reveal WHICH dealbreakers — count only).
- Copy voice: warm, direct, playful; say *house/home/crew/pool*, never *commune/DAO/protocol*. Money framing: "held in escrow", "enforced by code, not vibes".
- The word "commune" may appear only in PRD/README, never in app UI copy.

## The pages

| file | nav id | job |
|---|---|---|
| index.html | `''` | Landing: hero, the pipeline (Match→Meet→Gather→Form→Run), feature sections per flow, CTAs to quiz/browse, solidarity-apps positioning |
| quiz.html | `quiz` | 12-question quiz (one at a time, progress bar) → dealbreakers picker → budget/borough/intent → archetype reveal → save via `setMe`, CTA to browse |
| browse.html | `browse` | Homes/People tabs, filter chips (borough, budget, rooms open, mission, seeking-type), cards with match pill; links to house.html?id= / person.html?id= |
| house.html | `''` | House profile from `?id=`: band header, mission, values, rules, members w/ avatars, rooms-open panel, match breakdown vs me, connect CTA |
| person.html | `''` | Person profile from `?id=`: archetype, blurb, values, six-dim meter comparison vs me, shared events, conflict count, connect CTA |
| create.html | `create` | 4-step wizard (Basics → Money → Culture → Rooms) with progress, review, `houses.add(...)`, success → link to browse/house page |
| dashboard.html | `dashboard` | My-house ops: treasury card, contributions, bill rotation table w/ rotation preview, proposals list w/ voting UI (2/3 explained), new-proposal modal |
| chores.html | `chores` | This period's chores (who's on it, mark done), full rotation schedule, completion history/rates |
| gatherings.html | `gatherings` | Upcoming events (RSVP; retreat = escrow pay flow w/ state), past events, attendee-overlap ("people you keep crossing paths with") |
| steward.html | `steward` | Chat UI with scripted steward brain (chores due, bills, maintenance triage w/ vendor cards, house rules), quick-action chips, maintenance log |
| templates.html | `templates` | Economic templates gallery + interactive calculators (room-weighted rent splitter, sliding-scale contributions) |
| meals.html | `meals` | Meal plan presets + interactive cost/quantity calculator, cook rotation, shopping list, batch timeline |
| chore-builder.html | `chores` | Space-by-space chore schedule calculator with effort estimates; applies a generated rotation to the house |
| ledger.html | `ledger` | Splitwise-style house ledger: expenses w/ 4 split modes, template-aware defaults, net balances, simplify-debts, one-tap rail settlement, category chart, activity feed |

Note: the app is deliberately web2 — no wallets, tokens, or on-chain anything in UI copy. Money mechanics are "templates + a ledger + votes". Words like *stake*, *on-chain*, *crypto*, *contract* must not appear in visible copy (use *deposit*, *ledger*, *template*).
