# Commons — Product Requirements Document

**A Decentral Park solidarity app · co-living first, commune underneath**

> Working name: **Commons** (the "coming soon" slot in the Decentral Park solidarity-apps family — pine hue, "Build together."). Everything in this document is branded co-living, not commune. That is deliberate.

---

## 1. Thesis

The core problem of communal living is **trust between strangers who must share money, space, and responsibility**. People already want this — every NYC group chat has someone posting "starting a house, looking for five roommates" — but the tools stop at the group chat. There is no pipeline from *"I want to live with people who share my values"* to *a running house with pooled money, a chore rotation, and a way to make decisions*.

Commons is that pipeline:

```
QUIZ ──▶ MATCH ──▶ MEET ──▶ GATHER ──▶ FORM ──▶ OPERATE ──▶ GROW
(values)  (browse)  (mixers)  (retreat)  (house)   (money/     (rooms,
                                                    chores/     networks,
                                                    votes/AI)   scale)
```

**Overton-window strategy:** brand it as a co-living platform. "Co-living" is already moving in New York; "commune" scares the normies. The commune is what a co-living house *becomes* once it has a shared treasury, a chore rotation, regular rituals, and real trust. The product ladders people there; it never has to say the word.

**Trust strategy:** every money flow between strangers runs on an **economic template** — a money model the house picks once (split, fund, sliding scale, …) — plus a shared ledger, escrowed event deposits, and 2/3 votes. Templates and ledgers do the work nagging used to do. **This is a web2 product**: no wallets, no tokens, no chain. A trustless enforcement layer (see §8) is explicitly parked — it only becomes interesting after the flows have real users and real money.

---

## 2. Personas

| Persona | Situation | What they need |
|---|---|---|
| **The Seeker** (Maya, 27, Bed-Stuy) | Wants out of a random-roommate situation; values-driven; posts in group chats | A gallery of houses & people, a quiz that does the awkward filtering for her, low-stakes ways to meet (mixers) |
| **The Founder** (Dev, 33) | Has a lease opportunity (or 4 friends and no lease); needs 3 more people and money commitments | A create-a-house wizard, a way to broadcast open rooms, tools to collect commitments before signing |
| **The Established House** (Cypress Yard, 6 people) | Running for 2 years; one room opening up; bills chaos; chore resentment | Transient-flow room listing, bill rotation, chore schedule, dispute-free money, an AI steward that nags so no human has to |
| **The Connector** (org / DP itself) | Hosts mixers & retreats; wants communities to catalyze | Event tooling with pooled payments, escrowed retreat deposits, attendee-overlap discovery |

---

## 3. Product pillars & user flows

### Flow 1 — Onboarding quiz ("the Buzzfeed thing")

OkCupid-style questionnaire, fun on purpose. Output is a **profile vector**, an **archetype** (shareable payoff), and a private **dealbreaker set**.

1. 12 lightweight either/or & slider questions across six dimensions:
   - **Hearth** — quiet sanctuary ↔ open-door social house
   - **Order** — go-with-the-flow ↔ systems & labels
   - **Voice** — do-ocracy ↔ everything by consensus
   - **Mission** — just good living ↔ shared purpose/project
   - **Porch** — inward-facing ↔ networked (guests, events, other houses)
   - **Pool** — split every bill ↔ one shared treasury
2. **Dealbreakers section** — hard filters chosen privately (smoking indoors, pets, overnight-guest frequency, quiet hours, 420, meat in the kitchen, kids, etc.). Never displayed on profiles.
3. **Financial reality section** — monthly budget range, move-in horizon, appetite for pooling. ("You should have financial, really.")
4. Result: archetype card ("The Hearthkeeper," "The Quartermaster," …) → CTA into Browse.

**Dealbreaker mechanic (key trust feature):** when viewing a person or house, you see *how many* dealbreaker conflicts exist — **never which ones**. "2 dealbreaker conflicts" is enough signal to pass without forcing anyone to disclose.

### Flow 2 — Discover & match (Browse gallery)

- Two tabs: **Homes** and **People**. Filter chips: borough, budget band, rooms open, mission-driven, networked.
- Every card shows **match %** (cosine similarity over the six dimensions, budget/borough weighted) and the dealbreaker-conflict count.
- House cards: contribution/mo, rooms open now (transient flow), mission tag, members preview.
- People cards: archetype, values chips, budget band, shared-event history ("you were both at the Prospect Park mixer").
- **Hybrid by design:** the same gallery serves people-seeking-houses, houses-seeking-people (rooms open), and people-seeking-people (founding groups).

### Flow 3 — Catalyzation (meet → gather → retreat)

Communes historically catalyze out of gatherings (the 200-person conference that births three communes). Productize that funnel:

1. **Mixers** — regular-cadence IRL events (this is micro-dating, and micro-dating is ethical here — it *is* the catalyzation mechanism). Free/cheap, RSVP in app.
2. **Catalyst weekends / camp retreats** — a matched cluster books a weekend together before committing to a lease. Payments go to **escrow**: released to the host when the weekend happens, refunded if it doesn't. This is the first moment strangers trust the platform with money — it must feel bulletproof.
3. **Attendee-overlap discovery** — past events surface people who share your rooms-of-interest ("14 people from Vibe Camp are seeking in Brooklyn").
4. Post-event: prompt clusters with high mutual match to form a **founding group** (a proto-house with no address).

### Flow 4 — Form a house (create wizard)

Four steps:

1. **Basics** — name, vibe blurb, *has location* vs *seeking location* (both are first-class), borough, target size.
2. **Money** — monthly contribution and an economic template (*Split & Settle* / *House Fund* / *Fund + deposit* in the wizard; all six in §Flow 4b), what the pool is for.
3. **Culture** — mission statement (optional; "is it for something other than co-living?"), networked↔isolationary slider, house rules, quiet hours, guest policy.
4. **Rooms & launch** — open rooms with target move-in dates; publish to the gallery; generate single-use invite links for the founding group (membership is invite-gated).

### Flow 4b — Economic templates (the money answer, productized)

Six preset money models, borrowed from real houses and co-ops. A house picks one at formation and can switch by 2/3 vote:

| Template | One-liner | Pool? |
|---|---|---|
| **Split & Settle** | Every cost per-head, settled monthly, nothing pooled | no |
| **Room-Weighted Split** | Rent follows room points (size, light, closet, bath); bills stay even | no |
| **House Fund** | Flat monthly chip-in; spending over a line takes a 2/3 vote | yes |
| **Sliding Scale** | Contributions proportional to income bands | yes |
| **Full Commons** | Most costs pooled; refundable commitment deposit on joining | yes |
| **Points & Pool** | Work-trade hours credit against your cash contribution | yes |

Each template ships with an **interactive calculator** (room-weighted rent splitter, sliding-scale contribution calculator) so the house argues with numbers instead of vibes.

### Flow 5 — Operate: the house dashboard

The daily-driver surface once you're in a house. Four areas:

**5a. Money**
- House fund balance, this month's contribution status per member.
- **Bill rotation:** "who pays this bill this month" — internet, utilities, CSA box — rotates automatically through members; the ledger shows the whole rotation so nobody has to remember. Rotation is deterministic: `assignee = rotation[period % members]`.
- Reimbursements & assigned expenses with due dates.
- Escrows (retreat deposits, security deposits) visible with state.

**5a-ii. The House Ledger (Splitwise, house-native, settlement built in)**

The single most-proven shared-money UX is Splitwise's; we take its core and fix its structural flaw. Feature mapping from the full Splitwise set:

| Splitwise | Commons Ledger | Notes |
|---|---|---|
| Groups | The house *is* the group | no setup |
| Equal / exact / shares / percent splits | ✅ all four | cent-exact, remainder to payer |
| Group default splits (Pro) | **Automatic from the money system** | sliding-scale house defaults to percent, fund house gets "pay from the house fund" (no interpersonal debt) |
| Simplify debts | ✅ greedy giver/receiver netting | "5 payments instead of 15"; optimal is NP-hard, greedy is what Splitwise ships |
| Recurring expenses | ✅ + bill-rotation expenses flow in | |
| Settle up → Venmo/PayPal handoff | **One-tap settlement on stablecoin rails** | instant, ~penny fees, receipts recorded; **auto-settle thresholds** ("any balance over $50 at month end") — impossible on card rails |
| Activity feed, comments, categories, charts (Pro) | ✅ feed, notes, categories, monthly category meters | |
| Free-tier daily expense cap, ads | none — it's your house | |
| Receipt scanning/itemization (Pro), FX (Pro) | deferred | needs camera/backend; stablecoins make FX native later |

The honest dig that motivates this: expense apps stop at the IOU and hand you to a payments app, so tabs rot for months (unsettled balances are their engagement model). When the ledger and the money live in the same place, settling is cheaper than remembering. Rails framing stays quiet and pragmatic — "instant, final, pennies" — never ideological; under the hood it's embedded wallets (the DP ui-kit already ships Privy/wagmi peers) moving stablecoins on an L2, gas sponsored.

**5b. Decisions**
- Proposals: spend from the fund, change a rule, resolve a dispute.
- **2/3 majority auto-resolution** — when a proposal crosses ⅔ of members, it executes (demo: state change; later: contract call). No admin, no landlord energy.
- **Disputes:** any member can dispute any expense/assignment at any time; a dispute is just a proposal with a reassignment attached.

**5c. Chores**
- Chore schedule defined once (name, frequency, rotation order) — instances are *calculated*, never stored: `period = floor((now − start) / frequency)`, `assignee = rotation[period % len]`.
- Week grid: what's due, who owns it, mark-complete (any member can mark, completion is per-period).
- Streaks/completion history for gentle accountability — transparency over enforcement.

**5c-ii. Calculators (chores & meals)**
- **Chore schedule calculator:** map the actual spaces (kitchen, N bathrooms, common rooms, stoop…), get effort estimates per task (maintenance-clean minutes from cleaning-industry timing guides), a fairness readout (minutes/week/person), and a generated rotation you can apply to the house in one click. Preset house shapes: apartment 4, brownstone 6, warehouse loft 8, land project 10.
- **Meal prep calculator:** eaters × shared dinners × diet mix × budget tier → cost per serving (batch cooking runs ~$2.50–4.50/serving vs ~$16 ordering in), a scaled bulk shopping list (1 lb dry rice ≈ 6 servings, ~100g pasta/plate, 4–6oz protein), cook rotation, and a batch-day timeline. Presets: Dinner Club (3×/wk), Sunday Big Batch, Full Board.

**5c-iii. Weekly check-ins & the reallocator (chores/meals that bend with real life)**

People have extremely different chore tastes, and the same person has extremely different weeks. A fixed rotation ignores both. So:

- **Chore-taste profile** (set once, edit whenever): Love it / Fine / Nope across eight chore kinds (kitchen, cooking, bathrooms, floors, trash, outdoors, laundry, organizing).
- **Weekly check-in** (~2 minutes): bandwidth (🫠 *running on fumes* / 🙂 regular / ⚡ *energy to burn*) and cooking appetite (🙅 *don't make me cook* / 🙂 my turn is fine / 🧑‍🍳 *therapy-baking week — give me the kitchen*).
- **The reallocator**: a preference-weighted load balancer reassigns the current period's open chores — loved kinds pull toward their people, dreaded kinds push away, low-bandwidth weeks shrink your share — and reorders the cook rotation by appetite. Every move comes with a human-readable reason ("Marcus is running on fumes · Zora actually likes this") and a ✦ swap badge on the board.
- **Steward integration**: saying "I'm slammed this week" in chat sets your bandwidth and reshuffles on the spot — nobody has to ask a housemate to cover, which is the entire point.

**5c-iv. House setup wizard**
Launching a house chains straight into configuration: create → chore calculator (`?setup=1`, step 1 of 2) → meal calculator (step 2) → dashboard. Houses with missing systems get a "finish setting up" nudge with per-system checkmarks.

**5d. Steward (AI house manager)**
> **Integration decision:** the steward seat will be filled by [lab0r.fun](https://lab0r.fun/) — no further in-house steward features. The current rule-based chat stays as a placeholder until that integration.
- Chat interface. It reminds about chores and bill rotations, takes **maintenance requests** ("the sink is leaking" → triage → here's how to fix it yourself → or here are three plumbers near you), tracks follow-ups, answers house-rules questions.
- Later: connects to the house's vendor accounts via MCP; a human still owns accounts, the steward drafts and coordinates.

### Flow 6 — Grow (transient & network flows)

- **Rooms open** — an established house lists a room; seekers see house-level match % and conflict count computed against *all current members*. ("It should be hybrid" — houses seek people as much as people seek houses.)
- **Event production pooling** — the same pooled-money + escrow + vendor rails serve one-off productions (the wedding-commune case; Airbnb-for-vendors is the same infrastructure as retreat booking). Not MVP, but the data model shouldn't preclude it.
- **Late stage (explicitly deferred):** inter-house resource sharing, tool libraries, bulk buying / economies of scale, insurance pools, house mergers, multi-house retreats.

---

## 4. MVP cut

"No MVP anymore, people can just do it all" — so the prototype demonstrates **every flow end-to-end in demo mode**, and the MVP question becomes a *sequencing* question for real infrastructure. All web2:

| Phase | Real infra | Everything else |
|---|---|---|
| **1. Move the Overton window** | Quiz, browse, profiles, house pages, mixers RSVP; calculators work fully client-side | Money flows simulated |
| **2. First money** | Retreat deposits held by the platform (Stripe + a clear refund policy) | House funds simulated |
| **3. House ops** | Real accounts + house ledgers (bill rotation, contributions, 2/3 votes) on a boring backend (Postgres, not a chain) | Steward is rule-based |
| **4. Steward+** | LLM steward w/ vendor actions (drafts only; humans send) | — |

---

## 5. Demo-mode prototype (this repo)

Static, no build step. **Productized, local-first:** a marketing landing funnels into real account creation (name, photo, avatar, optional WebAuthn **passkey** — Touch ID guards the account, no server involved). App pages are auth-gated like any product. A new user starts houseless: quiz → browse the seeded NYC world (7 houses, 15 seekers, events) → **actually join a house** (you enter its roster, chore/bill rotations, contribution sheet, and meal plan) or found one (fresh, empty systems). All state in `localStorage` (`dp-commons-v7`); device reset lives in the account's danger zone. A 29-test Playwright suite drives the entire journey.

| Page | Flow covered |
|---|---|
| `index.html` | Landing, thesis, pipeline, solidarity-apps framing |
| `quiz.html` | Flow 1 (quiz → archetype → profile) |
| `browse.html` | Flow 2 (homes/people gallery, filters, match %) |
| `house.html?id=` | Flow 2/6 (house profile, rooms open, request-to-connect) |
| `person.html?id=` | Flow 2/3 (person profile, dimension breakdown, shared events) |
| `create.html` | Flow 4 (4-step wizard → publishes house) |
| `dashboard.html` | Flow 5a/5b (house fund, contributions, bill rotation, proposals & 2/3 votes) |
| `chores.html` | Flow 5c (period-calculated rotation, week grid, completions) |
| `gatherings.html` | Flow 3 (mixers, retreats, escrow states, attendee overlap) |
| `steward.html` | Flow 5d (scripted steward chat, maintenance triage, vendor cards) |
| `templates.html` | Flow 4b (six money systems + rent-splitter & sliding-scale calculators) |
| `meals.html` | Flow 5c-ii (meal presets, cost/quantity calculator, cook rotation, batch timeline) |
| `chore-builder.html` | Flow 5c-ii (space-by-space chore calculator with effort estimates → applied rotation) |
| `ledger.html` | Flow 5a-ii (expenses w/ four split modes, simplify-debts, one-tap rail settlement, category meters, activity feed) |
| `account.html` | Auth center: sign-up (photo, avatar, passkey), sign-in, profile management, danger zone |
| `checkin.html` | Flow 5c-iii (chore tastes, weekly bandwidth & appetite, the reallocator + "what moved") |

**Copy rule:** the product says *system*, not *template* ("run the house on a system that works"); calculators are first-class, labeled CALCULATOR, and showcased on the landing page.

---

## 6. Brand

- **Identity:** Decentral Park **Commons** — pine (`#0d9488`) as the app hue within the DP system (fund→green, meetups→sky, commons→pine). Tree-in-a-dashed-ring logomark. Fonts self-hosted: Park Display (Space Grotesk) for headings/kickers, Park Body (Inter) for text.
- **Voice:** warm, direct, a little playful; solidarity-coded, never landlord-coded. "Find your people. Share a home." Copy says *house*, *home*, *crew*, *pool* — not *commune*, *DAO*, *protocol*.
- **Signature UI:** lifted buttons (offset hard shadow, lifts on hover), square ink-bordered chips, paper backgrounds with soft radial washes, uppercase display headlines.

## 7. Metrics (the catalyzation funnel)

quiz completion → profiles with dealbreakers set → matches viewed → connect requests → mixer RSVPs → **retreat escrow paid** (the money-trust moment) → founding groups formed → houses launched → **months of active house ops** (north star) → rooms refilled through the platform.

## 8. Parked: trustless enforcement (explicitly not now)

The product is web2: templates + ledgers + votes + platform-held deposits. A trustless layer ([commune-os-sc](https://github.com/communetxyz/commune-os-sc) proved the shape — period-calculated chores, 2/3 voting, deposit slashing) stays parked until some flow has real users, real money, and a real counterparty-trust problem that Stripe-plus-policy can't solve. The demo's mechanics (deterministic rotations, threshold votes, deposits) were designed so they *could* be enforced trustlessly later without changing the UX — that's the only concession made to it.

## 9. Open questions

- Identity & safety: what verification before an IRL mixer? (DP community vouching?)
- Money custody in phases 1–2: platform-held vs contract-held vs Venmo-and-vibes?
- How much house financial state is visible to prospective members? (Probably: contribution amount yes, balances no.)
- Dealbreaker taxonomy governance — fixed list vs user-defined (fixed list keeps the "count without disclosure" mechanic clean).
- When a founding group forms in-app, who is the legal leaseholder? (Out of scope for software, decisive for adoption.)
