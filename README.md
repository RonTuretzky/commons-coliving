# colive.fun — find your people, share a home

**A Decentral Park solidarity app** (the pine one), live at [colive.fun](https://colive.fun). Formerly "Commons" — the internal JS namespace is still `window.Commons`. A prototype of the full co-living pipeline: quiz-based matching → mixers & catalyst retreats (escrowed deposits) → house formation → house operations (house fund, rotating bills, 2/3 votes, chores on rails, an AI steward) → **house tools** (economic templates, a chore-schedule calculator with real effort estimates, a meal-prep calculator).

- **[PRD.md](PRD.md)** — the one big PRD: thesis, personas, all user flows, economic templates, MVP sequencing.
- **[docs/UI-SPEC.md](docs/UI-SPEC.md)** — build conventions and the demo-store API.

## Run it

No build step, no backend. Open `index.html`, or:

```bash
python3 -m http.server 8080
```

Productized and local-first: create an account (photo, avatar, optional Touch ID passkey via WebAuthn — no server), take the quiz, join or found a house, run it. App pages are auth-gated; a new user starts houseless like a real one. State lives in `localStorage` (`dp-commons-v7`); "Reset this device" is in the account danger zone.

## The tools

- **`templates.html`** — six economic templates (Split & Settle, Room-Weighted, House Fund, Sliding Scale, Full Commons, Points & Pool) with live calculators: a room-weighted rent splitter and a sliding-scale contribution calculator.
- **`chore-builder.html`** — map your actual spaces (kitchen, N bathrooms, stoop…), get per-task effort estimates (maintenance-clean minutes from cleaning-industry timing guides), a fairness readout, and a one-click applied rotation.
- **`meals.html`** — eaters × dinners × diet × budget → cost per serving (batch cooking ≈ $2.50–4.50/serving vs ~$16 ordering in), scaled bulk shopping list, cook rotation, batch-day timeline.

## Branding

Faithful vanilla-CSS port of [decentralpark-ui-kit](https://github.com/decentralparknyc/decentralpark-ui-kit): self-hosted Park Display (Space Grotesk) & Park Body (Inter), the park palette, lifted buttons, square ink chips, the tree-in-a-dashed-ring mark. See `assets/css/park.css`.

## Mechanics

Templates + a ledger + votes. Deterministic bill rotation, period-calculated chores (`period = floor((now−start)/freq)`, no stored instances), 2/3-majority proposals with auto-resolution.

## Gnosis rails (real)

- **Wallets:** every account gets a real Gnosis Chain address, generated on-device (`assets/js/rails.js`, vendored viem); key never leaves the browser. Balances read via the public RPC. Native **xDai** — a dollar that costs a fraction of a cent to move.
- **Gathering deposits:** non-custodial via `contracts/src/GatheringEscrow.sol` (Foundry; 10 unit tests) — attendees can pull out before start, host cancelling makes everyone refundable forever, an uncancelled gathering lets the host claim after start. The platform never holds funds.
- **Deploy:** `contracts/deploy.sh gnosis` with a funded key, then set the address in `ESCROW.gnosis` in `rails.js`. Until then the UI runs the same flows off-chain and says so.
- **Chain e2e:** the suite spins up anvil, deploys the contract, and drives wallet-funding → on-chain escrow → deposit → cancel-refund through the real UI (localhost runs only).
- **Optional on-chain chore log:** the vendored [commune-os](https://github.com/communetxyz/commune-os-sc) suite (share-house.fun's contracts) — a house can put its rotation on CommuneOS (`createCommune` with chore schedules; the same `period = (now−start)/frequency` math), and every mark-done also writes `markChoreComplete` for an immutable completion record. Deploy via CI with `script=DeployCommuneOS`.
- Not wired on purpose: onramps (later), Safe multisig house funds (wanted simpler).

## E2E tests

37 headless Playwright tests drive every feature against real store state — account creation/sign-out, the full quiz, ledger splits/settle/auto-settle, 2/3 votes executing from the fund, the check-in reallocator, escrow reserve/refund, the steward's draft→approve flow, the wizard, and both calculators.

```bash
python3 -m http.server 8091 &
npm i playwright --no-save && node tests/e2e.mjs   # BASE_URL to point elsewhere
```
