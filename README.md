# colive.fun — find your people, share a home

**A Decentral Park solidarity app** (the pine one), live at [colive.fun](https://colive.fun). **Hosted:** accounts are username + password on the server — sign in from any browser (including incognito) and your world is there. Formerly "Commons" — the internal JS namespace is still `window.Commons`. A prototype of the full co-living pipeline: quiz-based matching → mixers & catalyst retreats (escrowed deposits) → house formation → house operations (house fund, rotating bills, 2/3 votes, chores on rails, an AI steward) → **house tools** (economic templates, a chore-schedule calculator with real effort estimates, a meal-prep calculator).

- **[PRD.md](PRD.md)** — the one big PRD: thesis, personas, all user flows, economic templates, MVP sequencing.
- **[docs/UI-SPEC.md](docs/UI-SPEC.md)** — build conventions and the demo-store API.

## Run it

No build step, no backend. Open `index.html`, or:

```bash
python3 -m http.server 8080
```

Productized and server-backed: create an account (username + password), take the quiz, join or found a house, run it. The client keeps a working cache in `localStorage`, but the **server is the source of truth** — sign out and the device is wiped; sign in anywhere and it's restored. **The shipped app is empty** — no fake people, houses, or ledgers; real users populate it (and share houses via the backend). A seeded NYC demo world stays available as an opt-in fixture (`Commons.__seedDemo()`, used by the test suite and sales previews), never auto-loaded for a real user. App pages are auth-gated; a new user starts houseless. State lives in `localStorage` (`dp-commons-v9`); backup/restore is one-file JSON export/import on the account page. Installable as a PWA (offline shell via service worker), with an optional backend for cross-device sync and shared houses (see below).

## The tools

- **`templates.html`** — six economic templates (Split & Settle, Room-Weighted, House Fund, Sliding Scale, Full Commons, Points & Pool) with live calculators: a room-weighted rent splitter and a sliding-scale contribution calculator.
- **`chore-builder.html`** — map your actual spaces (kitchen, N bathrooms, stoop…), get per-task effort estimates (maintenance-clean minutes from cleaning-industry timing guides), a fairness readout, and a one-click applied rotation.
- **`meals.html`** — eaters × dinners × diet × budget → cost per serving (batch cooking ≈ $2.50–4.50/serving vs ~$16 ordering in), scaled bulk shopping list, cook rotation, batch-day timeline.

## Branding

Faithful vanilla-CSS port of [decentralpark-ui-kit](https://github.com/decentralparknyc/decentralpark-ui-kit): self-hosted Park Display (Space Grotesk) & Park Body (Inter), the park palette, lifted buttons, square ink chips, the tree-in-a-dashed-ring mark. See `assets/css/park.css`.

## Mechanics

Systems + a ledger + votes. Deterministic bill rotation, period-calculated chores (`period = floor((now−start)/freq)`, no stored instances), 2/3-majority proposals with auto-resolution — and the same vote machinery drives bounty disputes and agreement amendments.

- **Bounties** (`dashboard.html`) — one-off jobs with a budget, the CommuneOS TaskManager model; completion pays labor credit; disputes go to a 2/3 vote that reassigns on pass.
- **Labor credits** (`ledger.html`) — hours count like money (the Twin Oaks insight): chores auto-log minutes on mark-done, bounties pay `budget/rate` hours, project hours log by hand.
- **The living agreement** (`agreement.html`) — versioned house agreement drafted from the quiz, member signatures, amendments by 2/3 vote, optional keccak256 notarization on Gnosis.
- **House health** — check-ins, chore-close rate, disputes and logged hours roll into a dashboard card: the quiz-validation loop, instrumented.
- **The split protocol** (`split.html`) — past ~8 people a house divides Hutterite-style: pro-rata fund split, rotations pruned, both houses stay in the network.
- **Gatherings, shareable** (`gathering.html?id=`) — per-event pages with copy-link and real `.ics` export, monthly recurrence that rolls itself forward, and post-event mutual matching (picks stay private until reciprocal).

## The backend (real accounts, real sync)

An optional Node service at `/api` (same origin, DigitalOcean App Platform) with managed Postgres:

- **Accounts are username + password** — hashed server-side with scrypt (node built-in, no deps), httpOnly session cookie. Sign in from any browser/device/incognito and the server restores your whole world.
- **State syncs as you go** — the client pushes only changed top-level keys (per-key last-writer-wins); the server merges with jsonb `doc || changes`. Local-first stays the truth on-device; offline keeps working and back-fills when the API returns.
- **Houses are shared** — "Put the house online" on the dashboard, mint a 7-day invite link, and each housemate joins from their own phone: same rotations, ledger, votes, signatures, live within seconds (8s poll). House docs are canonical (member ids are real user ids); each device translates its own id ↔ `'me'` at the sync boundary (`assets/js/sync.js`), so the entire store and every page work unchanged.
- **Run it**: `cd api && npm install && STORAGE=memory STATIC_DIR=.. RP_ID=localhost ORIGINS=http://localhost:8080 node server.js` — one process serves the site and the API, exactly like production routing.

## Gnosis rails (real)

- **Wallets:** every account gets a real Gnosis Chain address, generated on-device (`assets/js/rails.js`, vendored viem); key never leaves the browser. Balances read via the public RPC. Native **xDai** — a dollar that costs a fraction of a cent to move.
- **Gathering deposits:** non-custodial via `contracts/src/GatheringEscrow.sol` (Foundry; 10 unit tests) — attendees can pull out before start, host cancelling makes everyone refundable forever, an uncancelled gathering lets the host claim after start. The platform never holds funds.
- **Deploy:** `contracts/deploy.sh gnosis` with a funded key, then set the address in `ESCROW.gnosis` in `rails.js`. Until then the UI runs the same flows off-chain and says so.
- **Chain e2e:** the suite spins up anvil, deploys the contract, and drives wallet-funding → on-chain escrow → deposit → cancel-refund through the real UI (localhost runs only).
- **On-chain chore log (gated, not shipped in UI):** the vendored [commune-os](https://github.com/communetxyz/commune-os-sc) suite (share-house.fun's contracts) can put a rotation on CommuneOS (`createCommune`; same `period = (now−start)/frequency` math) with mark-done writing `markChoreComplete`. This only earns its place under **collateral mode** — members stake xDai, completions release it / misses slash it — because a log of self-reported checkmarks with nothing at stake adds gas and friction without adding trust. Collateral mode isn't built yet (`createCommune` is called with `collateralRequired:false`), so the sync isn't offered in the chores UI; the rails + deployed contract stay dormant behind a `COLLATERAL_MODE` flag. Deploy the contract via CI with `script=DeployCommuneOS`.
- Not wired on purpose: onramps (later), Safe multisig house funds (wanted simpler).

## E2E tests

60 headless Playwright tests (plus a 10-test cloud suite: two browser contexts as two people's phones — signup with server-verified passkeys, house sharing via invite, cross-device expenses/signatures/chores with identity intact, and same-passkey world restore on a new device) drive every feature against real store state — account creation/sign-out, the full quiz, ledger splits/settle/auto-settle, 2/3 votes executing from the fund, the check-in reallocator, escrow reserve/refund, the steward's draft→approve flow, the wizard, both calculators, bounties (incl. on-chain dual-write + dispute votes), the agreement lifecycle (sign → amend → notarize on anvil), labor credits, the split protocol, mutual match, `.ics` downloads, PWA registration, and JSON backup/restore.

```bash
python3 -m http.server 8091 &
npm i playwright --no-save && node tests/e2e.mjs   # BASE_URL to point elsewhere
```
