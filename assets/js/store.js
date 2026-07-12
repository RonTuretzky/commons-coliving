/* ============================================================
   Commons — demo-world store
   Single source of truth for every page. State lives in
   localStorage under KEY; Commons.reset() reseeds.
   Mechanics borrowed from commune-os-sc:
     - chores: instances are never stored; period = floor((now-start)/freq),
       assignee = rotation[period % rotation.length]
     - proposals: 2/3 majority auto-resolution
     - bills: deterministic monthly rotation
   ============================================================ */
(function () {
  const KEY = "dp-commons-v9";
  const DAY = 86400000;
  const now = Date.now();
  const days = (n) => new Date(now + n * DAY).toISOString();

  /* ---------- Vocabulary ---------- */

  const DIMS = [
    { id: "hearth", label: "Hearth", low: "Quiet sanctuary", high: "Open-door social house", desc: "How much life happens in the common rooms." },
    { id: "order", label: "Order", low: "Go with the flow", high: "Systems & labels", desc: "Appetite for structure, tidiness, and schedules." },
    { id: "voice", label: "Voice", low: "Do-ocracy", high: "Everything by consensus", desc: "How the house should make decisions." },
    { id: "mission", label: "Mission", low: "Just good living", high: "Shared purpose", desc: "Is the house for something beyond living well?" },
    { id: "porch", label: "Porch", low: "Inward-facing", high: "Networked & hosting", desc: "Guests, events, and ties to other houses." },
    { id: "pool", label: "Pool", low: "Split every bill", high: "One shared treasury", desc: "How much money becomes ours instead of mine." },
  ];

  const DEALBREAKERS = [
    { id: "smoke", label: "Smoking indoors", flag: "Smokes indoors" },
    { id: "420", label: "Regular 420 use", flag: "Regular 420" },
    { id: "dogs", label: "Dogs in the house", flag: "Has a dog" },
    { id: "cats", label: "Cats in the house", flag: "Has a cat" },
    { id: "guests", label: "Overnight guests 3+ nights/week", flag: "Frequent overnight guests" },
    { id: "meat", label: "Meat in the shared kitchen", flag: "Cooks meat" },
    { id: "latenoise", label: "Noise after midnight", flag: "Night owl (loud hours)" },
    { id: "kids", label: "Kids living in the house", flag: "Has a kid" },
    { id: "shift", label: "Overnight shift schedules", flag: "Works overnight shifts" },
    { id: "sublet", label: "Frequent subletting / Airbnb", flag: "Sublets their room" },
  ];


  /* ---------- Quiz v2 item banks (evidence-based; see docs/quiz-research-appendix.md) ----------
     Layer 2 · Rhythms: behavioral, frequency-anchored items in the five domains that
     actually predict roommate conflict (cleanliness, noise, sleep, guests, kitchen).
     Similarity on these IS defensible (Erb 2014; Larson 1991; Niu & Brown 2023). */
  const RHYTHM_ITEMS = [
    { id: "wake", text: "On a day with nothing scheduled, I'm naturally up before 8am.", domain: "sleep", w: 1.3,
      low: "never", high: "always" },
    { id: "night", text: "I'm often still up and active past midnight.", domain: "sleep", w: 1.3,
      low: "never", high: "most nights" },
    { id: "dishes", text: "Dishes I use are washed and put away within 24 hours.", domain: "clean", w: 1.5,
      low: "lol", high: "always" },
    { id: "tidy", text: "Mess in common spaces genuinely stresses me.", domain: "clean", w: 1.5,
      low: "not really", high: "deeply" },
    { id: "routine", text: "I want the house to have a regular cleaning rhythm we all keep.", domain: "clean", w: 1.2,
      low: "flow is fine", high: "strongly" },
    { id: "noise", text: "Music or a movie out loud in the common room is part of a living home.", domain: "noise", w: 1.2,
      low: "headphones exist", high: "absolutely" },
    { id: "quiet", text: "After about 10pm on weeknights, I need the house quiet.", domain: "noise", w: 1.2,
      low: "don't care", high: "very much" },
    { id: "guests", text: "A friend crashing on the couch a couple nights a week is fine by me.", domain: "guests", w: 1.1,
      low: "not fine", high: "totally fine" },
    { id: "host", text: "I want us to host dinners or gatherings at least monthly.", domain: "guests", w: 1.0,
      low: "rather not", high: "yes please" },
    { id: "kitchen", text: "I cook real meals at home most days.", domain: "kitchen", w: 0.9,
      low: "rarely", high: "daily" },
  ];
  const FRICTION_SCRIPTS = {
    sleep: "Your sleep schedules differ — settle headphones-after-midnight and morning-noise rules before the first 2am door slam.",
    clean: "Your cleanliness standards differ — agree on the sink rule and a reset day now, while it's still funny.",
    noise: "One of you needs quiet the other doesn't — write actual quiet hours into the house agreement.",
    guests: "Your guest expectations differ — set a heads-up norm and a couch ceiling (nights per week).",
    kitchen: "Kitchen rhythms differ — talk fridge territory and the dish flow at peak hours.",
  };

  /* Layer 3 · Structure: the five lenses from the commune course (Session 3),
     adapted to houses. 0–3 each; person↔house structural fit. */
  const LENSES = [
    { id: "property", label: "Property", emoji: "🫕", question: "How much money should become ours?",
      levels: ["Split every cost — nothing pooled", "Shared staples & supplies", "A real house fund", "Pool most costs — one household budget"] },
    { id: "governance", label: "Governance", emoji: "🗳️", question: "How should the house decide things?",
      levels: ["Whoever cares most just does it", "Informal check-ins over dinner", "House votes on anything big", "Consensus culture + rotating roles"] },
    { id: "labor", label: "Labor", emoji: "🧹", question: "How should the work of the house be organized?",
      levels: ["Everyone handles their own mess", "Loose expectations, no system", "A rotation for the big stuff", "Full rotation — all work counts equal"] },
    { id: "membership", label: "Membership", emoji: "🚪", question: "How should new people join?",
      levels: ["Open door — vibes decide", "A chat and references", "A trial stay before anyone commits", "Trial + deposit + a house vote"] },
    { id: "outside", label: "Outside", emoji: "📡", question: "What is the house to the wider world?",
      levels: ["A home for us, full stop", "Occasional guests & dinners", "We host things regularly", "A node — events, organizing, other houses"] },
  ];

  /* Layer 4 · Character: private housemate index. Main-effect traits (Dyrenforth 2010;
     Kurtz & Sherker 2003; Zettler 2020) — measured absolutely, never matched, never shown. */
  const CHARACTER_ITEMS = [
    { id: "agree1", trait: "agree", text: "I'm quick to assume a housemate meant well." },
    { id: "agree2", trait: "agree", rev: true, text: "I can be blunt to the point of friction." },
    { id: "consc1", trait: "consc", text: "I handle my share before anyone has to ask." },
    { id: "consc2", trait: "consc", rev: true, text: "I tend to leave tasks until the last minute." },
    { id: "stab1", trait: "stab", text: "I stay level when house stuff goes sideways." },
    { id: "stab2", trait: "stab", rev: true, text: "Small frictions at home can ruin my whole day." },
    { id: "honest1", trait: "honest", text: "I'd correct a ledger error in my own favor even if nobody would ever notice." },
    { id: "honest2", trait: "honest", rev: true, text: "House rules feel more like suggestions when nobody's checking." },
  ];
  const SVO_ITEMS = [
    { id: "svo1", text: "A $60 deposit refund arrives addressed to the whole house. You'd…",
      options: [
        { t: "Split it evenly, obviously", pts: 2 },
        { t: "Drop it in the house fund for repairs", pts: 2 },
        { t: "Route more to whoever's been covering extra lately", pts: 1 },
        { t: "Finders keepers is a real principle", pts: 0 },
      ]},
    { id: "svo2", text: "You organized the bulk grocery run. Splitting what's left over, you'd…",
      options: [
        { t: "Even shares, effort was the point", pts: 2 },
        { t: "Offer everyone else first", pts: 2 },
        { t: "Keep a little extra for doing the schlep", pts: 1 },
        { t: "Organizer's cut is 20%, industry standard", pts: 0 },
      ]},
  ];
  const CONFLICT_ITEM = { id: "voice1", text: "When something at home bothers me, I say it early and plainly." };

  const TRAIT_LABELS = {
    agree: { label: "Warmth", desc: "assuming good faith, absorbing small frictions" },
    consc: { label: "Reliability", desc: "chores before reminders, deadlines met" },
    stab: { label: "Steadiness", desc: "level through house chaos" },
    honest: { label: "Fair dealing", desc: "straight with shared money & rules" },
  };

  const ARCHETYPES = {
    hearth: { name: "The Hearthkeeper", emoji: "🔥", desc: "You make a kitchen feel like a village square. People orbit you at 11pm with tea." },
    order: { name: "The Quartermaster", emoji: "📦", desc: "Label maker, spreadsheet, bin system. Chaos fears you; deposits get returned because of you." },
    voice: { name: "The Delegate", emoji: "🗳️", desc: "You believe the meeting could have been an email, but the vote could not. Process is care." },
    mission: { name: "The Gardener", emoji: "🌱", desc: "A house is a lever. You're here to grow something bigger than rent-splitting." },
    porch: { name: "The Switchboard", emoji: "📡", desc: "You know every house in three boroughs and you're introducing them to each other on purpose." },
    pool: { name: "The Treasurer", emoji: "🪙", desc: "Trust, but with a ledger. You want the money question answered once, beautifully, forever." },
    balanced: { name: "The Keel", emoji: "⚖️", desc: "Steady in every sea. Every house needs exactly one of you; most have none." },
  };

  /* ---------- Economic templates ---------- */
  // Preset money models a house picks once. No enforcement theater — just a
  // clear template, a ledger, and votes where the template says votes.
  const ECON_TEMPLATES = [
    { id: "split", name: "Split & Settle", emoji: "🧾",
      tagline: "Every cost divided per head, settled monthly. Nothing pooled.",
      how: "Rent and each bill are split evenly. One settle-up a month; the ledger keeps score in between. No shared pot, no votes needed.",
      bestFor: "Brand-new houses, short leases, people still earning trust.",
      knobs: ["Settle-up day"], pool: false },
    { id: "weighted", name: "Room-Weighted Split", emoji: "📐",
      tagline: "Rent follows the room; shared costs stay per-head.",
      how: "Each room gets points for size, light, closet, and a private bath. Rent is split by points, so the closet-room pays less than the parlor floor. Bills stay even.",
      bestFor: "Houses where the rooms are wildly unequal — lofts, brownstones.",
      knobs: ["Room points (size, window, closet, bath)"], pool: false },
    { id: "fund", name: "House Fund", emoji: "🫕",
      tagline: "A flat monthly chip-in on top of rent. Most houses pick this.",
      how: "Everyone puts the same amount into a shared fund each month — groceries staples, repairs, the occasional feast. Spending over a threshold takes a 2/3 vote; the ledger shows every move.",
      bestFor: "Established houses that share meals and want repairs to just happen.",
      knobs: ["Monthly amount", "Vote threshold ($)"], pool: true },
    { id: "sliding", name: "Sliding Scale", emoji: "⚖️",
      tagline: "Contributions scale with income so the house prices nobody out.",
      how: "The house sets a target pool; each person contributes proportionally to their income band. Same ledger, same votes — the split is the only thing that changes.",
      bestFor: "Mixed-income crews, family houses, houses with artists AND engineers.",
      knobs: ["Target pool", "Income bands"], pool: true },
    { id: "commons", name: "Full Commons", emoji: "🌳",
      tagline: "Most costs pooled — food, supplies, repairs. One household, one budget.",
      how: "Rent, staples, and supplies all flow through one budget everyone funds. New members put down a refundable commitment deposit, returned when they leave well. Spending by 2/3 vote.",
      bestFor: "High-trust houses, founding crews, mission houses.",
      knobs: ["Monthly amount", "Deposit size"], pool: true },
    { id: "labor", name: "Points & Pool", emoji: "🛠️",
      tagline: "Work-trade counts — hours offset your cash contribution.",
      how: "A house fund plus a labor rate: logged hours (repairs, childcare, garden, cooking) credit against your monthly contribution. The chore ledger doubles as the timesheet.",
      bestFor: "Land projects, houses with big physical upkeep, mixed-availability crews.",
      knobs: ["Monthly amount", "$ per credited hour"], pool: true },
  ];

  /* ---------- Spaces & effort catalog (chore calculator) ----------
     Minutes are maintenance-clean estimates from cleaning-industry timing
     guides (bathroom 20–45min, kitchen reset 15–20min, ~10–15min/room for
     floors), not deep-clean numbers. */
  const SPACES = [
    { id: "kitchen", label: "Kitchen", emoji: "🍳", countable: false, tasks: [
      { name: "Kitchen reset", minutes: 15, freqDays: 3, kind: "kitchen", desc: "Counters, dishes away, wipe stove" },
      { name: "Kitchen deep clean", minutes: 45, freqDays: 7, kind: "kitchen", desc: "Stove, sink scrub, floor" },
      { name: "Fridge audit", minutes: 15, freqDays: 14, kind: "kitchen", desc: "Toss the science experiments" },
    ]},
    { id: "bath", label: "Bathroom", emoji: "🛁", countable: true, max: 4, tasks: [
      { name: "Bathroom clean", minutes: 30, freqDays: 7, kind: "bathroom", desc: "Toilet, sink, shower, floor" },
      { name: "Towels & restock", minutes: 10, freqDays: 7, kind: "bathroom", desc: "Fresh towels, TP, soap" },
    ]},
    { id: "common", label: "Common room", emoji: "🛋️", countable: true, max: 4, tasks: [
      { name: "Sweep & tidy", minutes: 15, freqDays: 7, kind: "floors", desc: "Floors, surfaces, cushions" },
      { name: "Mop & dust", minutes: 20, freqDays: 14, kind: "floors", desc: "Wet mop, shelves, sills" },
    ]},
    { id: "hall", label: "Hall & stairs", emoji: "🪜", countable: false, tasks: [
      { name: "Stairs & hallway sweep", minutes: 10, freqDays: 7, kind: "floors", desc: "Top to bottom" },
    ]},
    { id: "trash", label: "Trash duty", emoji: "🗑️", countable: false, tasks: [
      { name: "Trash & recycling out", minutes: 10, freqDays: 7, kind: "trash", desc: "Curb night — know your pickup day" },
      { name: "Compost run", minutes: 15, freqDays: 14, kind: "trash", desc: "Drop-off or brown bin" },
    ]},
    { id: "stoop", label: "Stoop / yard", emoji: "🪴", countable: false, tasks: [
      { name: "Stoop sweep & plants", minutes: 15, freqDays: 7, kind: "outdoor", desc: "Sweep, water, say hi to neighbors" },
      { name: "Yard hour", minutes: 45, freqDays: 30, kind: "outdoor", desc: "Weeds, leaves, the ambitious corner" },
    ]},
    { id: "laundry", label: "Laundry room", emoji: "🧺", countable: false, tasks: [
      { name: "Communal linens", minutes: 20, freqDays: 14, kind: "laundry", desc: "House towels, rags, lint trap" },
    ]},
    { id: "basement", label: "Basement / storage", emoji: "🕸️", countable: false, tasks: [
      { name: "Storage reset", minutes: 20, freqDays: 30, kind: "organizing", desc: "Sweep, restack, evict spiders" },
    ]},
    { id: "pantry", label: "Bulk pantry", emoji: "🌾", countable: false, tasks: [
      { name: "Bulk restock run", minutes: 45, freqDays: 30, kind: "organizing", desc: "Costco / co-op run for staples" },
    ]},
  ];

  const CHORE_PRESETS = [
    { id: "apartment", name: "Apartment crew", emoji: "🏢", people: 4,
      spaces: { kitchen: 1, bath: 1, common: 1, trash: 1 } },
    { id: "brownstone", name: "Brownstone", emoji: "🏘️", people: 6,
      spaces: { kitchen: 1, bath: 2, common: 2, hall: 1, trash: 1, stoop: 1 } },
    { id: "loft", name: "Warehouse loft", emoji: "🏭", people: 8,
      spaces: { kitchen: 1, bath: 2, common: 3, trash: 1, laundry: 1, basement: 1 } },
    { id: "land", name: "Land project", emoji: "⛰️", people: 10,
      spaces: { kitchen: 1, bath: 3, common: 2, hall: 1, trash: 1, stoop: 1, laundry: 1, basement: 1, pantry: 1 } },
  ];

  /* ---------- Chore kinds & preferences ----------
     People have wildly different chore tastes. Kinds let the rebalancer
     route bathrooms away from the bathroom-hater and give the garden to
     whoever finds it restorative. */
  const CHORE_KINDS = [
    { id: "kitchen", label: "Kitchen work", emoji: "🍳" },
    { id: "cooking", label: "Cooking", emoji: "🍲" },
    { id: "bathroom", label: "Bathrooms", emoji: "🛁" },
    { id: "floors", label: "Floors & dusting", emoji: "🧹" },
    { id: "trash", label: "Trash & compost", emoji: "🗑️" },
    { id: "outdoor", label: "Plants & outdoors", emoji: "🪴" },
    { id: "laundry", label: "Linens & laundry", emoji: "🧺" },
    { id: "organizing", label: "Organizing & errands", emoji: "📦" },
  ];
  const BANDWIDTH = [
    { id: "low", label: "Running on fumes", emoji: "🫠", capacity: 0.4, desc: "Big week elsewhere — cover me, I'll make it up." },
    { id: "normal", label: "Regular week", emoji: "🙂", capacity: 1, desc: "Business as usual." },
    { id: "high", label: "Got energy to burn", emoji: "⚡", capacity: 1.6, desc: "Therapy-cleaning energy. Load me up." },
  ];
  const APPETITE = [
    { id: "avoid", label: "Don't make me cook", emoji: "🙅", desc: "Feed me, but don't ask anything of me." },
    { id: "fine", label: "I'll take my turn", emoji: "🙂", desc: "Normal rotation is fine." },
    { id: "love", label: "Therapy-baking week", emoji: "🧑‍🍳", desc: "I want the kitchen. Give me the kitchen." },
  ];

  /* ---------- Meal planning (calculator) ----------
     Cost basis: home batch cooking runs ~$2.50–4.50/serving; rice-and-beans
     nights under $2. Quantities: 1 lb dry rice ≈ 6 cups cooked ≈ 6 main-dish
     servings; ~100g dry pasta per person; 4–6oz protein per plate. */
  const MEAL_PRESETS = [
    { id: "dinner-club", name: "Dinner Club", emoji: "🍝", dinners: 3, cooksPerNight: 1,
      desc: "Three shared dinners a week, one cook per night. The gateway drug of house meals." },
    { id: "sunday-batch", name: "Sunday Big Batch", emoji: "🍲", dinners: 4, cooksPerNight: 2, batch: true,
      desc: "One glorious batch afternoon → four weeknight dinners in the fridge. Two cooks, one playlist." },
    { id: "full-board", name: "Full Board", emoji: "🥘", dinners: 6, cooksPerNight: 2,
      desc: "Dinner together nearly every night, pantry staples pooled. Peak household." },
  ];

  // per-serving quantities & rough NYC bulk prices (estimates, editable on the page)
  const STAPLES = [
    { id: "grain", name: "Rice / grains (dry)", unit: "lb", perServing: 0.17, price: 1.6, note: "1 lb ≈ 6 cups cooked ≈ 6 mains" },
    { id: "pasta", name: "Pasta (dry)", unit: "lb", perServing: 0.22, price: 1.4, note: "~100g per plate" },
    { id: "beans", name: "Beans & lentils (dry)", unit: "lb", perServing: 0.12, price: 2.0, note: "≈15¢/serving vs 60¢ canned" },
    { id: "veg", name: "Seasonal vegetables", unit: "lb", perServing: 0.5, price: 2.2, note: "half by weight of every plate" },
    { id: "protein", name: "Protein (thighs / tofu / eggs)", unit: "lb", perServing: 0.31, price: 3.4, note: "4–6 oz per plate" },
    { id: "aromatics", name: "Aromatics, oil & spices", unit: "meal", perServing: 0.3, price: 1.0, note: "onions, garlic, oil amortized" },
  ];
  // grain & pasta alternate as the carb; beans ~half of dinners
  const STAPLE_SHARE = { grain: 0.5, pasta: 0.3, beans: 0.5, veg: 1, protein: 0.8, aromatics: 1 };
  const TIER_MULT = { thrifty: 0.8, standard: 1, generous: 1.3 };

  /* ---------- Quiz (12 questions → six dims) ---------- */
  // Each option nudges one or two dims toward 0 or 100. Score = average of nudges per dim (default 50).
  const QUIZ = [
    { q: "It's 9pm on a Tuesday. Your ideal common room is…", a: [
      { t: "Six people, a pot of soup, someone's coworker who just showed up", d: { hearth: 90, porch: 75 } },
      { t: "Two housemates reading in companionable silence", d: { hearth: 35 } },
      { t: "Empty — everyone recharging in their rooms, and that's beautiful", d: { hearth: 10, porch: 25 } },
    ]},
    { q: "The dish rack philosophy you actually believe in:", a: [
      { t: "A chore wheel with names and days. Laminated.", d: { order: 90 } },
      { t: "Everyone notices what needs doing; adults handle it", d: { order: 30, voice: 30 } },
      { t: "Hire out the deep cleans, automate the rest", d: { order: 65, pool: 70 } },
    ]},
    { q: "The house is choosing a new couch. What should happen?", a: [
      { t: "Whoever cares most researches and just buys it", d: { voice: 15 } },
      { t: "Quick proposal, quick vote, done by Friday", d: { voice: 60 } },
      { t: "We talk until everyone genuinely consents", d: { voice: 95 } },
    ]},
    { q: "Finish the sentence: a great house is…", a: [
      { t: "A calm, affordable, beautiful place to live", d: { mission: 15 } },
      { t: "A crew that throws legendary dinners for the block", d: { mission: 55, porch: 80, hearth: 75 } },
      { t: "A base for a project — food justice, art, childcare, land", d: { mission: 95 } },
    ]},
    { q: "A housemate wants to host 30 people Saturday. You feel:", a: [
      { t: "Yes. I'll run the door and the playlist", d: { porch: 92, hearth: 80 } },
      { t: "Fine a few times a year, with notice", d: { porch: 50 } },
      { t: "Home is not a venue", d: { porch: 12 } },
    ]},
    { q: "Money between housemates should be…", a: [
      { t: "Split to the cent, settled monthly, never weird", d: { pool: 15 } },
      { t: "A small shared pot for house stuff, rest separate", d: { pool: 55 } },
      { t: "A real house fund we vote on — commitments in writing, visible to all", d: { pool: 92, voice: 65 } },
    ]},
    { q: "Your room door is usually…", a: [
      { t: "Open — the house drifts in and out", d: { hearth: 85 } },
      { t: "Open when I'm social, shut means shut", d: { hearth: 55 } },
      { t: "Closed. My room is the sanctuary", d: { hearth: 20 } },
    ]},
    { q: "The fridge has a mystery container growing a civilization. You:", a: [
      { t: "Toss it, wipe the shelf, say nothing", d: { order: 70, voice: 20 } },
      { t: "Group chat with a photo and a deadline", d: { order: 60, voice: 55 } },
      { t: "Bring it to the house meeting — it's a systems problem", d: { order: 85, voice: 85 } },
    ]},
    { q: "Which weekend actually recharges you?", a: [
      { t: "Hosting a work-party: twelve people, one broken fence", d: { porch: 85, mission: 70 } },
      { t: "A long ramble with one housemate, phones off", d: { hearth: 45, porch: 35 } },
      { t: "A retreat upstate with three other houses", d: { porch: 95, mission: 60 } },
    ]},
    { q: "Rules in a house should be…", a: [
      { t: "Few, unwritten, felt", d: { order: 20, voice: 25 } },
      { t: "Written once, revised at solstices", d: { order: 70, voice: 60 } },
      { t: "A living document with version history", d: { order: 92, voice: 80 } },
    ]},
    { q: "A housemate is short on rent this month. The house should…", a: [
      { t: "That's between them and the landlord", d: { pool: 10, mission: 20 } },
      { t: "Float them informally — we're humans first", d: { pool: 55, hearth: 60 } },
      { t: "Have a solidarity fund for exactly this, with clear terms", d: { pool: 90, mission: 75 } },
    ]},
    { q: "Ten years from now, this chapter was…", a: [
      { t: "A great apartment with great people", d: { mission: 25 } },
      { t: "The place my closest friendships were forged", d: { hearth: 80, mission: 45 } },
      { t: "The first cell of something that outlived the lease", d: { mission: 95, pool: 70 } },
    ]},
  ];

  /* ---------- Seed world ---------- */

  function seedPeople() {
    const P = (id, name, age, borough, budget, dims, values, hard, flags, blurb, seeking, events) =>
      ({ id, name, age, borough, budget, dims, values, hard, flags, blurb, seeking, events });
    return [
      // Cypress Yard members (the user's house)
      P("p-zora", "Zora Williams", 31, "Bed-Stuy", 1500, { hearth: 88, order: 55, voice: 60, mission: 80, porch: 85, pool: 75 },
        ["Big dinners", "Food justice", "Vinyl nights"], ["smoke"], ["meat"],
        "Runs the Cypress dinner program. Believes a 12-seat table is political infrastructure.", "has-house", ["e-vibecamp", "e-mixer-prospect", "e-dinner-old"]),
      P("p-eli", "Eli Rosen", 29, "Bed-Stuy", 1400, { hearth: 60, order: 85, voice: 75, mission: 55, porch: 50, pool: 85 },
        ["Spreadsheets", "Bike repair", "Bulk buying"], ["latenoise"], [],
        "House treasurer. Wants every recurring cost on a rotation nobody has to think about.", "has-house", ["e-mixer-prospect"]),
      P("p-priya", "Priya Nair", 33, "Bed-Stuy", 1600, { hearth: 70, order: 60, voice: 88, mission: 70, porch: 65, pool: 60 },
        ["Facilitation", "Community land trusts", "Tea"], ["smoke", "sublet"], [],
        "Professional facilitator; runs the house meeting in 40 minutes flat.", "has-house", ["e-vibecamp", "e-dinner-old"]),
      P("p-marcus", "Marcus Chen", 27, "Bed-Stuy", 1300, { hearth: 75, order: 35, voice: 40, mission: 60, porch: 80, pool: 55 },
        ["DJ sets", "Rooftop gardening", "Open invites"], [], ["latenoise", "guests"],
        "The reason strangers know the house. Also the reason quiet hours got proposed.", "has-house", ["e-vibecamp", "e-workday-old"]),
      P("p-june", "June Park", 35, "Bed-Stuy", 1700, { hearth: 45, order: 75, voice: 65, mission: 85, porch: 45, pool: 80 },
        ["Mutual aid ops", "Preserving & pickling", "Early mornings"], ["420", "latenoise"], ["cats"],
        "Runs a fridge network across three neighborhoods. In bed by ten, up by six.", "has-house", ["e-mixer-prospect"]),

      P("p-theo", "Theo Alvarez", 30, "Bed-Stuy", 1500, { hearth: 72, order: 58, voice: 62, mission: 78, porch: 68, pool: 74 },
        ["Long dinners", "House fund", "Projects over vibes-only"], ["smoke", "sublet"], [],
        "Cypress's sixth — keeps the group chat funny and the pantry stocked.", "has-house", ["e-mixer-prospect", "e-vibecamp"]),

      // Seekers
      P("p-maya", "Maya Okafor", 27, "Crown Heights", 1400, { hearth: 82, order: 50, voice: 55, mission: 75, porch: 78, pool: 70 },
        ["Zine library", "Sunday cook-offs", "Abolitionist reading group"], ["smoke", "meat"], [],
        "Third year of random-roommate roulette. Done. Looking for people who mean it.", "room", ["e-vibecamp", "e-mixer-prospect"]),
      P("p-dev", "Dev Patel", 33, "Gowanus", 1900, { hearth: 65, order: 70, voice: 70, mission: 90, porch: 70, pool: 88 },
        ["Woodshop", "Co-op economics", "Long walks with agendas"], ["dogs"], [],
        "Has a line on a Red Hook warehouse lease. Needs four more people who show up.", "founding", ["e-vibecamp", "e-workday-old"]),
      P("p-sofia", "Sofia Reyes", 30, "Sunset Park", 1250, { hearth: 40, order: 80, voice: 50, mission: 45, porch: 30, pool: 40 },
        ["Ceramics", "Quiet mornings", "Library holds"], ["latenoise", "guests", "420"], [],
        "Wants a clean, calm home base. Will run your bathroom-cleaning rotation flawlessly.", "room", ["e-mixer-prospect"]),
      P("p-amara", "Amara Diallo", 26, "Bushwick", 1100, { hearth: 90, order: 25, voice: 35, mission: 65, porch: 92, pool: 50 },
        ["Warehouse shows", "Screen printing", "Stoop culture"], [], ["latenoise", "420", "guests"],
        "If the house has a roof, she'll book the band. Chaos, but the generative kind.", "room", ["e-vibecamp", "e-workday-old"]),
      P("p-jonah", "Jonah Kim", 38, "Ridgewood", 1500, { hearth: 55, order: 65, voice: 80, mission: 88, porch: 60, pool: 90 },
        ["Land projects", "Grant writing", "Fermentation"], ["smoke"], ["kids"],
        "Single dad, nine-year-old, day job in co-op finance. Playing the long game: land.", "founding", ["e-vibecamp"]),
      P("p-lena", "Lena Petrov", 29, "Greenpoint", 1650, { hearth: 60, order: 88, voice: 72, mission: 50, porch: 55, pool: 78 },
        ["Systems design", "Climbing", "Meal prep"], ["cats", "dogs"], ["shift"],
        "ICU nurse on nights. Wants a house that runs on rails and respects a blackout curtain.", "room", ["e-mixer-prospect"]),
      P("p-ty", "Ty Jackson", 31, "Crown Heights", 1550, { hearth: 78, order: 45, voice: 60, mission: 80, porch: 70, pool: 65 },
        ["Youth mentoring", "Pickup ball", "Big breakfasts"], ["smoke"], ["dogs"],
        "Comes with Biscuit (60 lbs, elderly, beloved). Wants a family-shaped house.", "room", ["e-dinner-old", "e-mixer-prospect"]),
      P("p-noor", "Noor Haddad", 25, "Bay Ridge", 1200, { hearth: 70, order: 60, voice: 85, mission: 92, porch: 65, pool: 85 },
        ["Tenant organizing", "Arabic coffee", "Consensus nerdery"], ["meat"], [],
        "Organizes her current building; wants to live the thing she organizes for.", "founding", ["e-vibecamp"]),
      P("p-casey", "Casey O'Brien", 34, "Beacon", 950, { hearth: 50, order: 55, voice: 45, mission: 90, porch: 35, pool: 75 },
        ["Timber framing", "Orchard keeping", "Off-grid systems"], ["sublet"], ["meat"],
        "Left the city for the Hudson Valley land project. Recruiting hands and hearts.", "has-house", ["e-vibecamp"]),
      P("p-gus", "Gus Ferreira", 28, "Bushwick", 1150, { hearth: 85, order: 30, voice: 30, mission: 40, porch: 88, pool: 35 },
        ["Analog synths", "Roof movies", "Found furniture"], [], ["420", "latenoise"],
        "Just wants five funny roommates and a projector. Honestly? Valid.", "room", ["e-workday-old", "e-vibecamp"]),
    ];
  }

  function seedHouses() {
    return [
      { id: "h-cypress", name: "Cypress Yard", borough: "Bed-Stuy", hasLocation: true, rent: 1450, poolModel: "fund",
        poolMonthly: 180, mission: "Food justice — a 12-seat table, a fridge on the gate, big open dinners.",
        networked: 72, roomsOpen: 1, moveIn: days(35), founded: "Mar 2024",
        members: ["p-theo", "p-zora", "p-eli", "p-priya", "p-marcus", "p-june"],
        values: ["Open dinners", "Community fridge", "House fund", "Quiet-ish weeknights"],
        rules: ["Quiet hours 11pm weeknights", "Guests welcome, heads-up in chat", "Dinner shift = no dish duty"],
        hue: "#0d9488", blurb: "Six of us in a brownstone with a long table and a longer group chat. One room opening up." },
      { id: "h-redhook", name: "Red Hook Assembly", borough: "Red Hook", hasLocation: false, rent: 1800, poolModel: "commons",
        poolMonthly: 300, mission: "A maker co-op with bedrooms — woodshop below, housing above.",
        networked: 60, roomsOpen: 3, moveIn: days(90), founded: "forming",
        members: ["p-dev", "p-noor", "p-jonah"],
        values: ["Workshop access", "Co-op bylaws", "Deposit-backed commitments", "Tool library"],
        rules: ["Founding members put down a deposit", "Weekly build nights", "Decisions by 2/3 vote"],
        hue: "#0f766e", blurb: "Three founders, a warehouse lead, and a spreadsheet. Seeking three more who show up on Saturdays." },
      { id: "h-sunset", name: "Sunset Terrace", borough: "Sunset Park", hasLocation: true, rent: 1250, poolModel: "split",
        poolMonthly: 0, mission: "",
        networked: 30, roomsOpen: 0, moveIn: null, founded: "Sep 2022",
        members: ["p-sofia"],
        values: ["Quiet hours", "Split bills to the cent", "Plants everywhere"],
        rules: ["Quiet after 10pm", "No overnight guests on weeknights", "Shoes off"],
        hue: "#0369a1", blurb: "Calm, sunlit, extremely tidy. Full right now — comes to mixers to meet future housemates." },
      { id: "h-ridge", name: "Ridgewood Switchboard", borough: "Ridgewood", hasLocation: true, rent: 1350, poolModel: "fund",
        poolMonthly: 150, mission: "The connective tissue between houses — mixers, skill-shares, a lending library.",
        networked: 90, roomsOpen: 2, moveIn: days(21), founded: "Jun 2023",
        members: ["p-amara", "p-gus"],
        values: ["Host everything", "Inter-house lending", "Open calendar"],
        rules: ["Every member hosts one event a season", "Common rooms are commons"],
        hue: "#16a34a", blurb: "If you've been to a house event in Queens, it was probably here. Two rooms open." },
      { id: "h-crown", name: "Crown Heights Hearth", borough: "Crown Heights", hasLocation: true, rent: 1600, poolModel: "sliding",
        poolMonthly: 220, mission: "Childcare co-op — three kids, six adults, one shared calendar that actually works.",
        networked: 55, roomsOpen: 1, moveIn: days(45), founded: "Jan 2023",
        members: ["p-ty", "p-jonah"],
        values: ["Kids at the table", "Childcare rotation", "Early quiet hours"],
        rules: ["Quiet 9pm–7am", "Childcare shifts count as chores", "No smoking anywhere"],
        hue: "#15803d", blurb: "A family-shaped house. Looking for one more adult who thinks bedtime stories are infrastructure." },
      { id: "h-bushwick", name: "Bushwick Static", borough: "Bushwick", hasLocation: true, rent: 1100, poolModel: "weighted",
        poolMonthly: 60, mission: "Art first. The living room is a studio, the studio is a venue.",
        networked: 80, roomsOpen: 2, moveIn: days(14), founded: "Nov 2023",
        members: ["p-gus", "p-amara"],
        values: ["Loud sometimes", "Make things", "Door's open"],
        rules: ["Shows end by 1am", "Label your paint water"],
        hue: "#513c35", blurb: "Cheap, loud, generative. Two rooms open — bring a practice and earplugs." },
      { id: "h-hudson", name: "Hudson Commons", borough: "Beacon, NY", hasLocation: true, rent: 950, poolModel: "labor",
        poolMonthly: 400, mission: "A land project: orchard, timber barn, thirty-year horizon.",
        networked: 35, roomsOpen: 2, moveIn: days(60), founded: "May 2021",
        members: ["p-casey"],
        values: ["Land stewardship", "Work-trade membership", "Seasons over sprints"],
        rules: ["Work-trade counts toward rent", "Consensus for land decisions"],
        hue: "#166534", blurb: "90 minutes up the Hudson. For people whose group chat dreams have acreage in them." },
    ];
  }

  function seedEvents() {
    return [
      { id: "e-dinner-cypress", title: "Cypress Yard Open Dinner", type: "dinner", when: days(4), where: "Cypress Yard, Bed-Stuy",
        price: 0, capacity: 14, host: "h-cypress", desc: "The long table, open to seekers. Bring a dish or a story.",
        attendees: ["p-zora", "p-maya", "p-ty", "p-sofia"], escrow: null },
      { id: "e-mixer-mccarren", title: "McCarren Fireside Mixer", type: "mixer", when: days(9), where: "McCarren Park, Greenpoint",
        price: 0, capacity: 60, host: "h-ridge", desc: "The monthly co-living mixer. Name tags list your archetype, not your job.",
        attendees: ["p-amara", "p-gus", "p-lena", "p-maya", "p-dev", "p-noor"], escrow: null },
      { id: "e-retreat-catskills", title: "Catskills Catalyst Weekend", type: "retreat", when: days(23), where: "Big Indian, NY",
        price: 185, capacity: 18, host: "h-ridge", desc: "Two nights, one lodge, five founding conversations. Deposits held in escrow — released to the lodge when the weekend happens, refunded if it doesn't.",
        attendees: ["p-dev", "p-noor", "p-jonah", "p-maya", "p-casey", "p-amara", "p-lena", "p-ty", "p-zora", "p-gus", "p-sofia"],
        escrow: { state: "held", total: 2035, note: "11 deposits held · releases on check-in" } },
      { id: "e-mixer-prospect", title: "Long Meadow Mixer", type: "mixer", when: days(-21), where: "Prospect Park",
        price: 0, capacity: 50, host: "h-ridge", desc: "Spring edition. Four founding groups traded numbers.",
        attendees: ["p-theo", "p-zora", "p-eli", "p-june", "p-maya", "p-sofia", "p-lena", "p-ty"], escrow: null, past: true },
      { id: "e-vibecamp", title: "Vibe Camp II", type: "retreat", when: days(-60), where: "Ramapo, NJ",
        price: 240, capacity: 120, host: null, desc: "The big one. Three houses catalyzed out of the last edition.",
        attendees: ["p-theo", "p-zora", "p-priya", "p-marcus", "p-maya", "p-dev", "p-amara", "p-jonah", "p-noor", "p-casey", "p-gus"],
        escrow: { state: "released", total: 26400, note: "Released to venue after the weekend" }, past: true },
      { id: "e-workday-old", title: "Bushwick Static Build Day", type: "workday", when: days(-35), where: "Bushwick Static",
        price: 0, capacity: 20, host: "h-bushwick", desc: "Built the stage, painted the hall, ate a heroic quantity of pizza.",
        attendees: ["p-gus", "p-amara", "p-marcus", "p-dev"], escrow: null, past: true },
      { id: "e-dinner-old", title: "Hearth Sunday Dinner", type: "dinner", when: days(-14), where: "Crown Heights Hearth",
        price: 0, capacity: 12, host: "h-crown", desc: "Kids made the dessert. It was structurally unsound and perfect.",
        attendees: ["p-ty", "p-zora", "p-priya", "p-maya"], escrow: null, past: true },
    ];
  }

  // A blank identity — the real one comes from account creation + the quiz.
  function blankMe() {
    return {
      id: "me", name: "You", age: null, borough: "Bed-Stuy", budget: 1500,
      quizDone: false,
      dims: { hearth: 50, order: 50, voice: 50, mission: 50, porch: 50, pool: 50 },
      values: [],
      hard: [], flags: [],
      blurb: "New here — the quiz fills this in.",
      seeking: "room", events: [], socials: {},
    };
  }

  // The shipped world is EMPTY — no fictional people, houses, or gatherings, no
  // pre-filled ledger. Real users populate it (and share houses via the backend).
  function seedState() {
    return {
      version: 9,
      seededAt: now,
      account: null,          // {name, email?, borough, budget, hue, bio?, createdAt} — local-first, this device only
      me: blankMe(),
      people: [],
      houses: [],
      events: [],
      myHouseId: null,
      rsvps: [],
      escrowPaid: {},
      connects: [],
      treasury: { balance: 0, currency: "USD" },
      contributions: [],
      bills: [],
      billsPaid: {},
      proposals: [],
      chores: [],
      choreDone: {},
      choreOverrides: {},
      choreChain: null,
      chorePrefs: {},
      bandwidth: {},
      mealAppetite: {},
      mealPlan: null,
      expenses: [],
      settlements: [],
      stewardChat: [],
      tasks: [],
      labor: [],
      laborRate: 15,
      agreementDoc: null,
      checkinLog: [],
      clicks: {},
      maintenance: [],
    };
  }

  // The demo world — a seeded NYC of houses, seekers, and a running house — kept
  // as an OPT-IN fixture (the test suite + `Commons.__seedDemo()`), never shipped
  // into a real user's app.
  function demoState() {
    return {
      version: 9,
      seededAt: now,
      account: null,          // {name, email?, borough, budget, hue, bio?, createdAt} — local-first, this device only
      me: blankMe(),
      people: seedPeople(),
      houses: seedHouses(),
      events: seedEvents(),
      myHouseId: null,
      rsvps: [],
      escrowPaid: {},
      connects: [],           // {kind:'house'|'person', id, at}
      treasury: { balance: 2340, currency: "USD" },
      contributions: [        // this month's pool contributions (poolMonthly each)
        { member: "p-theo", paid: true }, { member: "p-zora", paid: true },
        { member: "p-eli", paid: true }, { member: "p-priya", paid: false },
        { member: "p-marcus", paid: false }, { member: "p-june", paid: true },
      ],
      bills: [
        { id: "b-net", name: "Internet (fiber)", amount: 89, dueDay: 5, rotation: ["p-theo", "p-zora", "p-eli", "p-priya", "p-marcus", "p-june"], offset: 2 },
        { id: "b-coned", name: "Con Edison", amount: 214, dueDay: 12, rotation: ["p-eli", "p-june", "p-theo", "p-marcus", "p-zora", "p-priya"], offset: 0 },
        { id: "b-csa", name: "CSA veg box", amount: 128, dueDay: 18, rotation: ["p-zora", "p-theo", "p-june", "p-eli", "p-priya", "p-marcus"], offset: 4 },
        { id: "b-water", name: "Water & compost", amount: 63, dueDay: 22, rotation: ["p-priya", "p-marcus", "p-theo", "p-june", "p-zora", "p-eli"], offset: 1 },
      ],
      billsPaid: {},          // { "b-net:2026-07": true }
      proposals: [
        { id: "pr-freezer", title: "Chest freezer for bulk buys", kind: "spend", amount: 340,
          desc: "Second-hand 7cf chest freezer for the cellar. Pays for itself in four months of bulk grain and Costco runs.",
          proposer: "p-eli", createdAt: days(-3), status: "open",
          votes: { "p-eli": true, "p-zora": true, "p-june": true } },
        { id: "pr-dispute-coned", title: "Dispute: June Con Ed assignment", kind: "dispute", amount: 214,
          desc: "Marcus was assigned June's Con Ed but was subletting-out that month by house agreement. Proposal: reassign to the next slot in rotation (Zora).",
          proposer: "p-marcus", reassignTo: "p-zora", createdAt: days(-1), status: "open",
          votes: { "p-marcus": true, "p-priya": true } },
        { id: "pr-quiet", title: "Quiet hours 11pm on weeknights", kind: "rule",
          desc: "Common rooms wind down at 11 Sunday–Thursday. Headphones after.",
          proposer: "p-june", createdAt: days(-20), status: "passed", resolvedAt: days(-17),
          votes: { "p-june": true, "p-priya": true, "p-eli": true, "p-sofia": false, "p-theo": true } },
        { id: "pr-stoop", title: "Front stoop repair", kind: "spend", amount: 220,
          desc: "Loose tread on the stoop. Marcus knows a mason.",
          proposer: "p-zora", createdAt: days(-34), status: "passed", resolvedAt: days(-31), executed: true,
          votes: { "p-zora": true, "p-theo": true, "p-eli": true, "p-june": true } },
      ],
      chores: [
        { id: "c-kitchen", name: "Kitchen reset", emoji: "🍳", kind: "kitchen", minutes: 20, freqDays: 7, start: days(-70), rotation: ["p-theo", "p-zora", "p-eli", "p-priya", "p-marcus", "p-june"] },
        { id: "c-trash", name: "Trash & recycling", emoji: "🗑️", kind: "trash", minutes: 10, freqDays: 7, start: days(-70), rotation: ["p-june", "p-theo", "p-zora", "p-eli", "p-priya", "p-marcus"] },
        { id: "c-bath", name: "Bathroom deep clean", emoji: "🛁", kind: "bathroom", minutes: 30, freqDays: 14, start: days(-84), rotation: ["p-priya", "p-marcus", "p-june", "p-theo", "p-zora", "p-eli"] },
        { id: "c-sweep", name: "Sweep common rooms", emoji: "🧹", kind: "floors", minutes: 15, freqDays: 7, start: days(-70), rotation: ["p-marcus", "p-june", "p-theo", "p-zora", "p-eli", "p-priya"] },
        { id: "c-plants", name: "Plants & stoop", emoji: "🪴", kind: "outdoor", minutes: 15, freqDays: 7, start: days(-70), rotation: ["p-zora", "p-eli", "p-priya", "p-marcus", "p-june", "p-theo"] },
        { id: "c-compost", name: "Compost run", emoji: "🌰", kind: "trash", minutes: 15, freqDays: 14, start: days(-84), rotation: ["p-eli", "p-priya", "p-marcus", "p-june", "p-theo", "p-zora"] },
      ],
      choreDone: {},          // { choreId: { period: { by, at } } } — seeded below
      choreOverrides: {},     // { "choreId:period": memberId } — set by the rebalancer
      choreChain: null,       // { communeId, network, ids: {localChoreId: onchainId}, tx } — optional CommuneOS log
      chorePrefs: {           // love/hate by CHORE_KINDS id
        "p-theo": { loves: ["kitchen"], hates: ["bathroom"] },
        "p-zora": { loves: ["cooking", "kitchen"], hates: ["trash"] },
        "p-eli": { loves: ["organizing", "trash"], hates: ["outdoor"] },
        "p-priya": { loves: ["floors"], hates: [] },
        "p-marcus": { loves: ["outdoor"], hates: ["organizing"] },
        "p-june": { loves: ["outdoor", "cooking"], hates: ["floors"] },
      },
      bandwidth: { "p-theo": "normal", "p-zora": "normal", "p-eli": "high", "p-priya": "normal", "p-marcus": "low", "p-june": "normal" },
      mealAppetite: { "p-theo": "fine", "p-zora": "love", "p-eli": "fine", "p-priya": "fine", "p-marcus": "avoid", "p-june": "fine" },
      mealPlan: { presetId: "dinner-club", eaters: 6, dinners: 3, vegShare: 0.5, tier: "standard",
        batchDay: "Sunday", rotation: ["p-zora", "p-theo", "p-june", "p-priya", "p-marcus", "p-eli"] },
      expenses: [
        { id: "x-costco", desc: "Costco run — dry goods & staples", amount: 187.4, paidBy: "p-june", category: "groceries",
          at: days(-2), split: { mode: "equal", participants: ["p-theo", "p-zora", "p-eli", "p-priya", "p-marcus", "p-june"] } },
        { id: "x-coned", desc: "Con Edison (June)", amount: 214, paidBy: "p-eli", category: "utilities", fromBill: "b-coned",
          at: days(-4), recurring: "monthly", split: { mode: "equal", participants: ["p-theo", "p-zora", "p-eli", "p-priya", "p-marcus", "p-june"] } },
        { id: "x-keg", desc: "Keg + ice for the stoop party", amount: 96, paidBy: "p-marcus", category: "fun",
          at: days(-6), split: { mode: "equal", participants: ["p-theo", "p-zora", "p-priya", "p-marcus"] },
          note: "June & Eli sat this one out — not split to them." },
        { id: "x-supplies", desc: "Cleaning supplies restock", amount: 43.75, paidBy: "p-theo", category: "supplies",
          at: days(-8), split: { mode: "equal", participants: ["p-theo", "p-zora", "p-eli", "p-priya", "p-marcus", "p-june"] } },
        { id: "x-canning", desc: "Bulk tomatoes for canning day", amount: 62, paidBy: "p-june", category: "groceries",
          at: days(-10), split: { mode: "shares", participants: ["p-june", "p-zora", "p-theo", "p-priya"],
            values: { "p-june": 2, "p-zora": 2, "p-theo": 1, "p-priya": 1 } },
          note: "Canning crew took double shares — they keep double jars." },
        { id: "x-ubers", desc: "Cars back from Vibe Camp", amount: 75, paidBy: "p-theo", category: "transport",
          at: days(-12), split: { mode: "exact", participants: ["p-zora", "p-marcus", "p-theo"],
            values: { "p-zora": 30, "p-marcus": 30, "p-theo": 15 } } },
        { id: "x-bath", desc: "Shower curtain + bathmat", amount: 38, paidBy: "p-priya", category: "supplies",
          at: days(-15), split: { mode: "equal", participants: ["p-theo", "p-zora", "p-eli", "p-priya", "p-marcus", "p-june"] } },
        { id: "x-pizza", desc: "Pizza for stoop-repair day", amount: 54, paidBy: "p-marcus", category: "fun",
          at: days(-18), split: { mode: "equal", participants: ["p-theo", "p-eli", "p-marcus", "p-june"] } },
      ],
      settlements: [
        { id: "s-1", from: "p-priya", to: "p-theo", amount: 40, at: days(-5), rail: { fee: 0.02, seconds: 1.8, ref: "rail-8f3a21" } },
        { id: "s-2", from: "p-theo", to: "p-eli", amount: 62, at: days(-12), rail: { fee: 0.03, seconds: 2.4, ref: "rail-c07d55" } },
      ],
      stewardChat: [],        // {who:'me'|'steward', text, at, actions?}
      tasks: [                // bounties — CommuneOS TaskManager model (optional on-chain)
        { id: "t-railing", desc: "Fix the stoop railing (wobbling since build day)", budget: 45, dueDate: days(10),
          assignedTo: "p-marcus", status: "open", createdBy: "p-zora", at: days(-2), onchain: null },
        { id: "t-shelf", desc: "Mount the pantry shelf", budget: 20, dueDate: days(-5),
          assignedTo: "p-eli", status: "done", createdBy: "p-june", at: days(-12), onchain: null },
      ],
      labor: [                // hours ledger — work-trade credits (Twin Oaks model)
        { id: "l-1", member: "p-june", hours: 3, kind: "cooking", desc: "Canning day lead", at: days(-9) },
        { id: "l-2", member: "p-marcus", hours: 2, kind: "outdoor", desc: "Stoop planters", at: days(-6) },
        { id: "l-3", member: "p-eli", hours: 1.5, kind: "organizing", desc: "Cellar restack", at: days(-4) },
      ],
      laborRate: 15,          // $ credited per logged hour (Points & Pool knob)
      agreementDoc: null,     // {version, lines[], updatedAt, signatures{member:iso}, history[], notarized?}
      checkinLog: [           // instrumentation for the quiz validation loop
        { at: days(-21), member: "p-marcus", bandwidth: "normal", appetite: "fine" },
        { at: days(-14), member: "p-june", bandwidth: "high", appetite: "love" },
        { at: days(-7), member: "p-marcus", bandwidth: "low", appetite: "avoid" },
      ],
      clicks: {               // post-event mutual match: picks stay private unless mutual
        "e-mixer-prospect": { "p-maya": ["me", "p-sofia"], "p-lena": ["p-ty"], "p-ty": ["me", "p-lena"] },
        "e-vibecamp": { "p-dev": ["p-noor"], "p-noor": ["p-dev", "me"], "p-amara": ["p-gus"] },
      },
      maintenance: [
        { id: "m-sink", title: "Kitchen sink slow drain", status: "open", openedBy: "p-zora", at: days(-2), notes: "Steward suggested enzyme treatment before calling anyone." },
        { id: "m-radiator", title: "Front room radiator knock", status: "resolved", openedBy: "p-eli", at: days(-40), notes: "Bled the line — fixed. $0." },
      ],
    };
  }

  // Pre-mark most past chore periods complete so history has texture.
  function seedChoreHistory(state) {
    state.chores.forEach((c, ci) => {
      const per = currentPeriod(c);
      state.choreDone[c.id] = state.choreDone[c.id] || {};
      for (let p = 0; p < per; p++) {
        // leave a few gaps: every 5th period of alternating chores is missed
        if ((p + ci) % 5 === 4) continue;
        const who = c.rotation[p % c.rotation.length];
        state.choreDone[c.id][p] = { by: who, at: new Date(new Date(c.start).getTime() + (p + 0.8) * c.freqDays * DAY).toISOString() };
      }
    });
  }

  /* ---------- Mechanics ---------- */

  function currentPeriod(chore, at) {
    const t = at ? new Date(at).getTime() : Date.now();
    return Math.max(0, Math.floor((t - new Date(chore.start).getTime()) / (chore.freqDays * DAY)));
  }
  function choreAssignee(chore, period) {
    const p = period == null ? currentPeriod(chore) : period;
    const override = state && state.choreOverrides && state.choreOverrides[chore.id + ":" + p];
    return override || chore.rotation[p % chore.rotation.length];
  }
  function rotationAssignee(chore, period) {
    const p = period == null ? currentPeriod(chore) : period;
    return chore.rotation[p % chore.rotation.length];
  }
  function firstName(id) { const per = personOrMe(id, state); return per ? per.name.split(/\s+/)[0] : id; }
  function kindLabel(kind) { const k = CHORE_KINDS.find((x) => x.id === kind); return k ? k.label : kind; }

  function monthKey(d) { const x = d ? new Date(d) : new Date(); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0"); }
  function monthIndex(d) { const x = d ? new Date(d) : new Date(); return x.getFullYear() * 12 + x.getMonth(); }
  function billPayer(bill, d) { return bill.rotation[(monthIndex(d) + bill.offset) % bill.rotation.length]; }

  function clamp(n, a, b) { return Math.min(b, Math.max(a, n)); }

  // similarity over six dims, 0–100
  function dimScore(a, b) {
    let sum = 0;
    DIMS.forEach((d) => { sum += Math.abs((a[d.id] ?? 50) - (b[d.id] ?? 50)); });
    return Math.round(100 - sum / DIMS.length);
  }
  function conflictCount(a, b) {
    const aHard = a.hard || [], bHard = b.hard || [], aFlags = a.flags || [], bFlags = b.flags || [];
    return aHard.filter((x) => bFlags.includes(x)).length + bHard.filter((x) => aFlags.includes(x)).length;
  }
  function match(a, b) { return { score: clamp(dimScore(a.dims, b.dims), 0, 100), conflicts: conflictCount(a, b) }; }

  function houseDims(house, state) {
    const ms = house.members.map((id) => personOrMe(id, state)).filter(Boolean);
    const dims = {};
    DIMS.forEach((d) => {
      dims[d.id] = ms.length ? Math.round(ms.reduce((s, m) => s + (m.dims[d.id] ?? 50), 0) / ms.length) : 50;
    });
    return dims;
  }
  function matchHouse(me, house, state) {
    const ms = house.members.map((id) => personOrMe(id, state)).filter((m) => m && m.id !== "me");
    const score = clamp(dimScore(me.dims, houseDims(house, state)), 0, 100);
    let conflicts = 0, conflictMembers = 0;
    ms.forEach((m) => { const c = conflictCount(me, m); conflicts += c; if (c) conflictMembers++; });
    const budgetFit = house.rent <= me.budget * 1.05;
    return { score, conflicts, conflictMembers, budgetFit };
  }

  function archetype(dims) {
    const entries = DIMS.map((d) => [d.id, dims[d.id] ?? 50]).sort((x, y) => y[1] - x[1]);
    const [topId, topVal] = entries[0];
    const spread = topVal - entries[entries.length - 1][1];
    if (spread < 18) return ARCHETYPES.balanced;
    return ARCHETYPES[topId];
  }

  function personOrMe(id, state) {
    if (id === "me") return state.me;
    return state.people.find((p) => p.id === id) || null;
  }


  /* ---------- Quiz v2 fit engine ----------
     Fit = weighted rhythm similarity (.55) + lens similarity (.45), reported as
     BANDS with named frictions — never an oracle percentage (Finkel 2012; Joel
     2017/2020; the OkCupid self-fulfilling-% experiment). Character is a private
     main-effect index and never enters matching. */
  function hashN(str, mod) { let h = 0; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % mod; }
  const clamp15 = (n) => Math.min(5, Math.max(1, Math.round(n)));

  // derive rhythms/lenses for seeded profiles that predate quiz v2 (deterministic)
  function rhythmsOf(p) {
    if (p.rhythms) return p.rhythms;
    const d = p.dims || {}; const v = (x) => 1 + 4 * ((x ?? 50) / 100);
    const j = (k) => hashN(p.id + k, 3) - 1;
    return {
      wake: clamp15(v(d.order) + j("w")), night: clamp15(6 - v(d.order) + j("n")),
      dishes: clamp15(v(d.order) + j("d")), tidy: clamp15(v(d.order) + j("t")),
      routine: clamp15(v((d.order + d.voice) / 2) + j("r")),
      noise: clamp15(v(d.hearth) + j("no")), quiet: clamp15(6 - v(d.porch) + j("q")),
      guests: clamp15(v(d.porch) + j("g")), host: clamp15(v((d.hearth + d.porch) / 2) + j("h")),
      kitchen: clamp15(v((d.hearth + d.mission) / 2) + j("k")),
    };
  }
  function lensesOf(p) {
    if (p.lenses) return p.lenses;
    const d = p.dims || {}; const L = (x) => Math.min(3, Math.max(0, Math.round(3 * ((x ?? 50) / 100))));
    return { property: L(d.pool), governance: L(d.voice), labor: L(d.order),
      membership: Math.min(3, Math.max(0, L(d.mission) - (hashN(p.id + "m", 2)))), outside: L(d.porch) };
  }
  const ECON_LENS = { split: 0, weighted: 0, fund: 2, sliding: 2, commons: 3, labor: 2 };
  function houseLensesOf(h) {
    if (h.lenses) return h.lenses;
    return {
      property: ECON_LENS[h.poolModel] ?? 2,
      governance: 2, // every Commons house runs 2/3 votes
      labor: 2,      // rotations are the default culture
      membership: h.poolModel === "commons" || h.poolModel === "labor" ? 3 : (h.roomsOpen > 0 ? 2 : 1),
      outside: Math.min(3, Math.max(0, Math.round(3 * ((h.networked ?? 50) / 100)))),
    };
  }

  function rhythmFit(ra, rb) {
    let sum = 0, wsum = 0;
    const gaps = [];
    RHYTHM_ITEMS.forEach((it) => {
      const gap = Math.abs((ra[it.id] ?? 3) - (rb[it.id] ?? 3));
      sum += it.w * (gap / 4); wsum += it.w;
      gaps.push({ item: it, gap });
    });
    return { sim: 100 * (1 - sum / wsum), gaps };
  }
  function lensFit(la, lb) {
    let sum = 0;
    const gaps = [];
    LENSES.forEach((l) => {
      const gap = Math.abs((la[l.id] ?? 1) - (lb[l.id] ?? 1));
      sum += gap / 3;
      gaps.push({ lens: l, gap });
    });
    return { sim: 100 * (1 - sum / LENSES.length), gaps };
  }
  // thresholds calibrated on the seeded world's pairwise distribution
  // (median ~73, q75 ~78): strong = top quartile, stretch = bottom decile
  function bandOf(score) { return score >= 78 ? "strong" : score >= 60 ? "workable" : "stretch"; }
  const BAND_LABELS = { strong: "Strong fit", workable: "Workable fit", stretch: "A stretch" };

  function frictionsFrom(rGaps, lGaps) {
    const out = []; const seen = new Set();
    rGaps.filter((g) => g.gap >= 3).forEach((g) => {
      if (seen.has(g.item.domain)) return;
      seen.add(g.item.domain);
      out.push({ title: g.item.domain, script: FRICTION_SCRIPTS[g.item.domain], gap: g.gap });
    });
    lGaps.filter((g) => g.gap >= 2).forEach((g) => {
      out.push({ title: g.lens.label.toLowerCase(), gap: g.gap,
        script: `You want different ${g.lens.label.toLowerCase()} setups (${g.lens.levels[0].toLowerCase()} ↔ ${g.lens.levels[3].toLowerCase()}) — name it before anyone signs anything.` });
    });
    return out.sort((a, b) => b.gap - a.gap).slice(0, 3);
  }

  function fit(a, b) {
    const r = rhythmFit(rhythmsOf(a), rhythmsOf(b));
    const l = lensFit(lensesOf(a), lensesOf(b));
    const score = Math.round(0.55 * r.sim + 0.45 * l.sim);
    return { score, band: bandOf(score), bandLabel: BAND_LABELS[bandOf(score)],
      frictions: frictionsFrom(r.gaps, l.gaps), conflicts: conflictCount(a, b) };
  }
  function fitHouse(me, house, st) {
    const ms = house.members.map((id) => personOrMe(id, st)).filter((m) => m && m.id !== "me");
    // rhythms vs the member average; lenses vs the house's declared structure
    const avg = {};
    RHYTHM_ITEMS.forEach((it) => {
      avg[it.id] = ms.length ? ms.reduce((s, m) => s + (rhythmsOf(m)[it.id] ?? 3), 0) / ms.length : 3;
    });
    const r = rhythmFit(rhythmsOf(me), avg);
    const l = lensFit(lensesOf(me), houseLensesOf(house));
    const score = Math.round(0.55 * r.sim + 0.45 * l.sim);
    let conflicts = 0, conflictMembers = 0;
    ms.forEach((m) => { const c = conflictCount(me, m); conflicts += c; if (c) conflictMembers++; });
    return { score, band: bandOf(score), bandLabel: BAND_LABELS[bandOf(score)],
      frictions: frictionsFrom(r.gaps, l.gaps), conflicts, conflictMembers,
      budgetFit: house.rent <= me.budget * 1.05 };
  }

  // dims back-compat: derive the legacy six dims from v2 answers so meters,
  // archetypes and older UI keep working
  function dimsFromV2(rh, ln) {
    const pct = (v) => Math.round(((v - 1) / 4) * 100);
    const l = (v) => Math.round((v / 3) * 100);
    return {
      hearth: Math.round((pct(rh.noise) + pct(rh.host) + pct(rh.kitchen)) / 3),
      order: Math.round((pct(rh.dishes) + pct(rh.tidy) + pct(rh.routine)) / 3),
      voice: l(ln.governance),
      mission: Math.round((l(ln.outside) + l(ln.membership)) / 2),
      porch: Math.round((pct(rh.guests) + pct(rh.host) + l(ln.outside)) / 3),
      pool: l(ln.property),
    };
  }

  // the drafted house agreement (McCorkle & Mason 2009: agreements are the
  // one institutionalized conflict-prevention tool) — composed from answers
  function agreementFrom(profile, house) {
    const r = rhythmsOf(profile), l = lensesOf(profile);
    const lines = [];
    lines.push(r.quiet >= 4 ? "Quiet hours: 10pm weeknights — headphones after." :
      r.night >= 4 ? "Quiet hours: midnight weeknights; common rooms stay social till then." :
      "Quiet hours: 11pm weeknights, flexible weekends.");
    lines.push(r.dishes >= 4 ? "Dishes: same-day, always — the sink is not storage." :
      "Dishes: nothing sleeps in the sink twice; full reset at the weekly clean.");
    lines.push(r.routine >= 4 ? "Cleaning: a standing weekly reset hour, everyone in." :
      "Cleaning: rotation covers the big stuff; tidy-as-you-go for the rest.");
    lines.push(r.guests >= 4 ? "Guests: welcome with a heads-up; couch max 2 nights/week." :
      r.guests <= 2 ? "Guests: heads-up required, overnights the exception not the rule." :
      "Guests: fine with notice; recurring overnights get a house check-in.");
    const econ = ECON_TEMPLATES[Math.min(ECON_TEMPLATES.length - 1, [0, 2, 2, 4][l.property] ?? 2)];
    lines.push(`Money: run the ${econ.name} system${house ? "" : " (or whatever the house you join already runs)"} — the ledger keeps score, not memory.`);
    lines.push(l.governance >= 2 ? "Decisions: anything over the line goes to a house vote (2/3 passes)." :
      "Decisions: do-ocracy for small stuff; talk before anything irreversible.");
    lines.push(l.membership >= 2 ? "New people: trial stay before commitment — both directions." :
      "New people: meet the whole house before keys change hands.");
    return lines;
  }

  /* ---------- Store plumbing ---------- */

  let state;
  // A v8 world upcasts losslessly: every v9 addition is a new key with a safe
  // empty default (no fictional bounties/picks appear in an existing user's world).
  function upcastV8(s8) {
    return Object.assign({}, s8, {
      version: 9,
      tasks: s8.tasks || [],
      labor: s8.labor || [],
      laborRate: s8.laborRate || 15,
      agreementDoc: s8.agreementDoc || null,
      checkinLog: s8.checkinLog || [],
      clicks: s8.clicks || {},
    });
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { state = JSON.parse(raw); if (state.version === 9) return; }
    } catch (e) { /* reseed */ }
    try {
      const v8 = localStorage.getItem("dp-commons-v8");
      if (v8) {
        const s8 = JSON.parse(v8);
        if (s8 && s8.version === 8) { state = upcastV8(s8); save(); return; }
      }
    } catch (e) { /* fall through to reseed */ }
    // opt-in demo fixture: only when a test/preview explicitly asks for it before load
    if (typeof window !== "undefined" && window.__COLIVE_SEED_DEMO) {
      state = demoState();
      seedChoreHistory(state);
    } else {
      state = seedState(); // the real, empty world
    }
    save();
  }
  // (rollRecurring runs after load, below)
  function rollRecurring() {
    if (!state || !state.events) return;
    let changed = false;
    state.events.forEach((e) => {
      if (e.recurringMonthly && !e.past) {
        let when = new Date(e.when);
        const day = when.getDate();
        const now2 = new Date();
        while (when < now2) {
          // clamp to the target month's length (Jan 31 → Feb 28, not Mar 3), keep the time
          when = new Date(when.getTime());
          when.setDate(1);
          when.setMonth(when.getMonth() + 1);
          when.setDate(Math.min(day, new Date(when.getFullYear(), when.getMonth() + 1, 0).getDate()));
          changed = true;
        }
        e.when = when.toISOString();
      }
    });
    if (changed) save();
  }

  function save() {
    localStorage.setItem(KEY, JSON.stringify(state));
    try { if (window.CloudSync) window.CloudSync.onSave(); } catch (e) { /* sync is optional */ }
  }
  function reset() { localStorage.removeItem(KEY); load(); }

  /* ---------- Formatting & misc ---------- */

  const fmtMoney = (n) => "$" + Number(n).toLocaleString("en-US");
  const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const fmtDateLong = (iso) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric" });
  function relDate(iso) {
    const d = Math.round((new Date(iso).getTime() - Date.now()) / DAY);
    if (d === 0) return "today";
    if (d === 1) return "tomorrow";
    if (d === -1) return "yesterday";
    return d > 0 ? "in " + d + " days" : Math.abs(d) + " days ago";
  }
  const initials = (name) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const HUES = ["#0d9488", "#16a34a", "#0284c7", "#166534", "#075985", "#513c35", "#0f766e", "#15803d"];
  function hue(id) { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return HUES[h % HUES.length]; }
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const qp = (k) => new URLSearchParams(location.search).get(k);

  /* ---------- Public API ---------- */

  function proposalThreshold() {
    const h = state.houses.find((x) => x.id === state.myHouseId);
    return h ? Math.ceil((h.members.length * 2) / 3) : 2;
  }
  // 2/3 auto-resolution, shared by voting AND proposal creation (a solo house's
  // own yes already meets threshold). Rejected disputes free the task again.
  function resolveProposal(p) {
    if (p.status !== "open") return p;
    const yes = Object.values(p.votes).filter(Boolean).length;
    const no = Object.values(p.votes).filter((v) => v === false).length;
    const t = proposalThreshold();
    if (yes >= t) {
      p.status = "passed"; p.resolvedAt = new Date().toISOString();
      if (p.kind === "spend" && p.amount) { state.treasury.balance -= p.amount; p.executed = true; }
      if (p.kind === "dispute" && p.taskId) {
        const task = state.tasks.find((x) => x.id === p.taskId);
        if (task) { task.assignedTo = p.newAssignee; task.status = "open"; p.executed = true; }
      }
      if (p.kind === "agreement" && p.lines) {
        const doc = state.agreementDoc;
        if (doc) {
          doc.history.push({ version: doc.version, lines: doc.lines.slice(), at: doc.updatedAt, signatures: doc.signatures });
          doc.version += 1; doc.lines = p.lines.slice(); doc.updatedAt = new Date().toISOString();
          doc.signatures = {}; doc.notarized = null;
          p.executed = true;
        }
      }
    } else if (no >= t) {
      p.status = "rejected"; p.resolvedAt = new Date().toISOString();
      if (p.kind === "dispute" && p.taskId) {
        const task = state.tasks.find((x) => x.id === p.taskId);
        if (task && task.status === "disputed") task.status = "open";
      }
    }
    return p;
  }

  load();
  rollRecurring();

  window.Commons = {
    get state() { return state; },
    save, reset,
    // opt-in demo world (tests / sales previews) — never auto-runs for real users
    __seedDemo() { state = demoState(); seedChoreHistory(state); rollRecurring(); save(); return state; },
    DIMS, DEALBREAKERS, QUIZ, ARCHETYPES, DAY,
    ECON_TEMPLATES, SPACES, CHORE_PRESETS, MEAL_PRESETS, STAPLES,

    econ: {
      all: () => ECON_TEMPLATES.slice(),
      get: (id) => ECON_TEMPLATES.find((t) => t.id === id) || null,
      label(id) { const t = ECON_TEMPLATES.find((x) => x.id === id); return t ? t.name : "House Fund"; },
      apply(houseId, id) { const h = state.houses.find((x) => x.id === houseId); if (h) { h.poolModel = id; save(); } return h; },
    },

    chorePlanner: {
      spaces: () => SPACES.slice(),
      presets: () => CHORE_PRESETS.slice(),
      // selection: {spaceId: count}; returns proposed chores + load math
      estimate(selection, nMembers) {
        const chores = [];
        SPACES.forEach((sp) => {
          const count = selection[sp.id] || 0;
          if (!count) return;
          const n = sp.countable ? count : 1;
          for (let i = 0; i < n; i++) {
            sp.tasks.forEach((t, ti) => {
              chores.push({
                id: "c-" + sp.id + (n > 1 ? "-" + (i + 1) : "") + "-" + ti,
                name: t.name + (n > 1 ? " · " + sp.label + " " + (i + 1) : ""),
                emoji: sp.emoji, kind: t.kind, freqDays: t.freqDays, minutes: t.minutes, desc: t.desc,
              });
            });
          }
        });
        const weekly = chores.reduce((s, c) => s + c.minutes * (7 / c.freqDays), 0);
        return {
          chores,
          weeklyMinutes: Math.round(weekly),
          perPersonWeekly: nMembers ? Math.round(weekly / nMembers) : 0,
          perPersonDaily: nMembers ? Math.round(weekly / nMembers / 7) : 0,
        };
      },
      // replace the house rotation with a generated plan
      apply(chores) {
        const h = state.houses.find((x) => x.id === state.myHouseId);
        const members = h ? h.members.slice() : ["me"];
        state.chores = chores.map((c, i) => ({
          id: c.id, name: c.name, emoji: c.emoji, kind: c.kind, freqDays: c.freqDays, minutes: c.minutes,
          start: new Date().toISOString(),
          // stagger rotation starts so the same person doesn't open every chore
          rotation: members.slice(i % members.length).concat(members.slice(0, i % members.length)),
        }));
        state.choreDone = {};
        state.choreChain = null; // a replaced rotation invalidates the on-chain log — re-sync to start a fresh one
        save();
        return state.chores;
      },
    },

    meals: {
      presets: () => MEAL_PRESETS.slice(),
      staples: () => STAPLES.slice(),
      plan: () => state.mealPlan,
      setPlan(cfg) { state.mealPlan = cfg; save(); },
      clearPlan() { state.mealPlan = null; save(); },
      // cfg: {eaters, dinners, vegShare (0..1), tier, rotation?, presetId?, batchDay?}
      estimate(cfg) {
        const servings = cfg.eaters * cfg.dinners;
        const mult = TIER_MULT[cfg.tier] ?? 1;
        const list = STAPLES.map((s) => {
          let share = STAPLE_SHARE[s.id] ?? 1;
          if (s.id === "protein") share = share * (1 - cfg.vegShare * 0.45); // veg plates lean on beans
          if (s.id === "beans") share = share * (0.6 + cfg.vegShare * 0.8);
          const qty = servings * s.perServing * share;
          const cost = qty * s.price * mult;
          return { ...s, qty: Math.round(qty * 10) / 10, cost: Math.round(cost * 100) / 100 };
        });
        const weeklyCost = Math.round(list.reduce((s, x) => s + x.cost, 0));
        const perServing = Math.round((weeklyCost / Math.max(1, servings)) * 100) / 100;
        // cook shifts: round-robin through rotation, cooksPerNight from preset
        const preset = MEAL_PRESETS.find((p) => p.id === cfg.presetId) || MEAL_PRESETS[0];
        const rotation = (cfg.rotation && cfg.rotation.length ? cfg.rotation : ["me"]);
        const nights = [];
        let idx = 0;
        for (let n = 0; n < cfg.dinners; n++) {
          const cooks = [];
          for (let c = 0; c < preset.cooksPerNight; c++) { cooks.push(rotation[idx % rotation.length]); idx++; }
          nights.push({ night: n + 1, cooks });
        }
        // batch timeline (research: ~1.5–2h active for a multi-meal batch; scale with servings)
        const batchMinutes = preset.batch ? Math.round(90 + servings * 2.5) : 0;
        return {
          servings, weeklyCost, perServing,
          perPersonWeekly: Math.round(weeklyCost / Math.max(1, cfg.eaters)),
          list, nights, batchMinutes,
          takeoutComparison: Math.round(servings * 16), // vs ~$16/plate ordering in
        };
      },
    },

    me: () => state.me,
    setMe(patch) {
      Object.assign(state.me, patch);
      // account is the source of truth for identity fields — keep it in sync
      if (state.account) {
        ["name", "borough", "budget"].forEach((k) => { if (k in patch) state.account[k] = patch[k]; });
      }
      save();
    },

    account: {
      get: () => state.account,
      exists: () => !!state.account,
      active: () => !!(state.account && !state.account.signedOut),
      _applyIdentity() {
        const a = state.account;
        Object.assign(state.me, {
          name: a.name, borough: a.borough, budget: a.budget, hue: a.hue,
          blurb: a.bio || state.me.blurb, socials: a.socials || {},
        });
        if (a.photo) state.me.photo = a.photo; else delete state.me.photo;
      },
      _demoIdentity() {
        Object.assign(state.me, {
          name: "You", borough: "Bed-Stuy", budget: 1500,
          blurb: "Demo persona — create an account or retake the quiz to make this yours.",
        });
        delete state.me.hue;
        delete state.me.photo;
      },
      create(fields) {
        state.account = {
          name: fields.name, email: fields.email || null, borough: fields.borough,
          budget: fields.budget, hue: fields.hue || "#0d9488", bio: fields.bio || "",
          photo: fields.photo || null, passkey: null, signedOut: false,
          createdAt: new Date().toISOString(),
        };
        this._applyIdentity();
        save(); return state.account;
      },
      update(patch) {
        if (!state.account) return null;
        Object.assign(state.account, patch);
        this._applyIdentity();
        save(); return state.account;
      },
      setPasskey(credId) {
        if (!state.account) return;
        state.account.passkey = credId ? { credId, addedAt: new Date().toISOString() } : null;
        save();
      },
      signOut() {
        if (!state.account) return;
        state.account.signedOut = true;
        this._demoIdentity();
        save();
      },
      signIn() {
        if (!state.account) return null;
        state.account.signedOut = false;
        this._applyIdentity();
        save(); return state.account;
      },
      remove() {
        state.account = null;
        this._demoIdentity();
        save();
      },
      // Hosted mode: the account is a mirror of the server user. The backend
      // client (sync.js) calls these on sign-in / sign-out; the server is the
      // source of truth for who you are and what your world is.
      setSession(user) {
        if (!user) return null;
        state.account = {
          id: user.id, username: user.username || null,
          name: user.name || user.username, email: user.email || null,
          borough: user.borough || "Bed-Stuy", budget: user.budget || 1500,
          hue: user.hue || "#0d9488", bio: user.bio || "", photo: user.photo || null,
          socials: user.socials || {},
          signedOut: false, createdAt: user.createdAt || new Date().toISOString(),
        };
        this._applyIdentity();
        save(); return state.account;
      },
      clearSession() {
        // sign-out wipes this device — hosted means nothing lives here without a session
        state = seedState();
        save();
      },
    },

    people: {
      all: () => state.people.slice(),
      get: (id) => personOrMe(id, state),
      seekers: () => state.people.filter((p) => p.seeking !== "has-house"),
    },
    houses: {
      all: () => state.houses.slice(),
      get: (id) => state.houses.find((h) => h.id === id) || null,
      mine: () => state.houses.find((h) => h.id === state.myHouseId) || null,
      add(h) { state.houses.unshift(h); save(); return h; },
      dims: (h) => houseDims(h, state),
      // Join an existing house: you enter every running system — the roster,
      // the contribution sheet, each bill and chore rotation, the meal plan.
      join(id) {
        const h = state.houses.find((x) => x.id === id);
        if (!h || h.members.includes("me")) return h || null;
        h.members.push("me");
        if (h.roomsOpen > 0) h.roomsOpen -= 1;
        state.myHouseId = id;
        if (!state.contributions.some((c) => c.member === "me")) state.contributions.push({ member: "me", paid: false });
        state.bills.forEach((b) => { if (!b.rotation.includes("me")) b.rotation.push("me"); });
        state.chores.forEach((c) => { if (!c.rotation.includes("me")) c.rotation.push("me"); });
        if (state.mealPlan && state.mealPlan.rotation && !state.mealPlan.rotation.includes("me")) {
          state.mealPlan.rotation.push("me");
          state.mealPlan.eaters = h.members.length;
        }
        save(); return h;
      },
      // The split protocol: a house past its social ceiling divides into two.
      // Fund goes pro-rata by headcount; whichever side you're on keeps the
      // running systems (pruned to its members) — the other side starts clean.
      split(newName, movingIds) {
        const mine = state.houses.find((x) => x.id === state.myHouseId);
        if (!mine || !movingIds.length || movingIds.length >= mine.members.length) return null;
        const staying = mine.members.filter((m) => !movingIds.includes(m));
        const total = mine.members.length;
        const movedShare = Math.round((state.treasury.balance * movingIds.length) / total * 100) / 100;
        const iMove = movingIds.includes("me");
        const nh = {
          id: "h-" + Math.random().toString(36).slice(2, 8),
          name: newName, hood: mine.hood, borough: mine.borough,
          members: movingIds.slice(), roomsOpen: 0,
          poolModel: mine.poolModel, poolMonthly: mine.poolMonthly,
          rent: mine.rent, hue: mine.hue, mission: mine.mission,
          values: (mine.values || []).slice(), rules: (mine.rules || []).slice(),
          networked: mine.networked, hasLocation: false, founded: "forming", moveIn: null,
          blurb: "Split from " + mine.name + " — same DNA, room to breathe.",
          lenses: mine.lenses ? Object.assign({}, mine.lenses) : undefined,
          treasurySeed: iMove ? 0 : movedShare,
        };
        mine.members = staying;
        state.houses.unshift(nh);
        const keep = iMove ? movingIds : staying;
        state.contributions = state.contributions.filter((c) => keep.includes(c.member));
        state.bills.forEach((b) => { b.rotation = b.rotation.filter((m) => keep.includes(m)); });
        state.bills = state.bills.filter((b) => b.rotation.length);
        state.chores.forEach((c) => { c.rotation = c.rotation.filter((m) => keep.includes(m)); });
        state.chores = state.chores.filter((c) => c.rotation.length);
        if (state.mealPlan && state.mealPlan.rotation) {
          state.mealPlan.rotation = state.mealPlan.rotation.filter((m) => keep.includes(m));
          state.mealPlan.eaters = keep.length;
        }
        state.treasury.balance = Math.round((state.treasury.balance - movedShare) * 100) / 100;
        if (iMove) {
          state.myHouseId = nh.id;
          state.treasury.balance = movedShare;
          nh.treasurySeed = 0;
        }
        state.tasks = state.tasks.filter((t) => keep.includes(t.assignedTo) || t.assignedTo === "me");
        if (state.agreementDoc) {
          // departed members' signatures no longer bind this side's agreement
          Object.keys(state.agreementDoc.signatures).forEach((m) => {
            if (!keep.includes(m)) delete state.agreementDoc.signatures[m];
          });
        }
        save();
        return { house: nh, movedShare };
      },
      // Found a house of your own: the gallery keeps the world, but YOUR
      // house starts with clean systems — no inherited chores or ledgers.
      claimOwn(h) {
        state.houses.unshift(h);
        state.myHouseId = h.id;
        state.contributions = [{ member: "me", paid: true }];
        state.bills = [];
        state.chores = [];
        state.choreDone = {};
        state.choreOverrides = {};
        state.mealPlan = null;
        state.expenses = [];
        state.settlements = [];
        state.proposals = [];
        state.treasury = { balance: 0, currency: "USD" };
        state.maintenance = [];
        state.tasks = [];
        state.labor = [];
        state.agreementDoc = null;
        state.checkinLog = [];
        save(); return h;
      },
    },
    events: {
      all: () => state.events.slice().sort((a, b) => new Date(a.when) - new Date(b.when)),
      get: (id) => state.events.find((e) => e.id === id) || null,
      upcoming: () => state.events.filter((e) => new Date(e.when) > new Date()).sort((a, b) => new Date(a.when) - new Date(b.when)),
      past: () => state.events.filter((e) => new Date(e.when) <= new Date()).sort((a, b) => new Date(b.when) - new Date(a.when)),
      isRsvpd: (id) => state.rsvps.includes(id),
      rsvp(id) { if (!state.rsvps.includes(id)) { state.rsvps.push(id); const e = state.events.find((x) => x.id === id); if (e && !e.attendees.includes("me")) e.attendees.push("me"); save(); } },
      unrsvp(id) { state.rsvps = state.rsvps.filter((x) => x !== id); const e = state.events.find((x) => x.id === id); if (e) e.attendees = e.attendees.filter((a) => a !== "me"); save(); },
      escrowPaid: (id) => state.escrowPaid[id] || 0,
      payEscrow(id, amount) { state.escrowPaid[id] = amount; const e = state.events.find((x) => x.id === id); if (e && e.escrow) e.escrow.total += amount; this.rsvp(id); save(); },
      // host a gathering: real events, created by you (or your house)
      add(ev) {
        const e = Object.assign({
          id: "e-" + Math.random().toString(36).slice(2, 8),
          attendees: ["me"], hostedByMe: true,
          host: state.myHouseId || null,
          escrow: Number(ev.price) > 0 ? { state: "held", total: 0, note: "deposits held until it happens — refunded if it doesn't" } : null,
        }, ev);
        state.events.push(e); save(); return e;
      },
      // cancel something you host: any escrow you paid comes straight back
      cancel(id) {
        const e = state.events.find((x) => x.id === id);
        if (!e || !e.hostedByMe) return false;
        if (state.escrowPaid[id]) delete state.escrowPaid[id];
        state.rsvps = state.rsvps.filter((x) => x !== id);
        state.events = state.events.filter((x) => x.id !== id);
        save(); return true;
      },
      // people I share past events with, ranked by overlap
      overlap(profile) {
        const mine = new Set((profile.events || []).concat(state.rsvps));
        return state.people
          .map((p) => ({ p, shared: (p.events || []).filter((e) => mine.has(e)) }))
          .filter((x) => x.shared.length > 0 && x.p.id !== profile.id)
          .sort((a, b) => b.shared.length - a.shared.length);
      },
    },

    match: (a, b) => fit(a, b),
    matchHouse: (me, house) => fitHouse(me, house, state),
    archetype, conflictCount,
    quizV2: { RHYTHM_ITEMS, LENSES, CHARACTER_ITEMS, SVO_ITEMS, CONFLICT_ITEM, TRAIT_LABELS, BAND_LABELS },
    rhythmsOf, lensesOf, houseLensesOf, dimsFromV2,
    agreement: (profile, house) => agreementFrom(profile || state.me, house),

    chores: {
      all: () => state.chores.slice(),
      period: currentPeriod,
      assignee: choreAssignee,
      done: (choreId, period) => !!(state.choreDone[choreId] || {})[period],
      doneInfo: (choreId, period) => (state.choreDone[choreId] || {})[period] || null,
      markDone(choreId, period, by) {
        state.choreDone[choreId] = state.choreDone[choreId] || {};
        state.choreDone[choreId][period] = { by: by || "me", at: new Date().toISOString() };
        const c = state.chores.find((x) => x.id === choreId);
        if (c && c.minutes) {
          // anyone can confirm, but the hours belong to whoever the rotation says did it
          const doer = choreAssignee(c, period) || by || "me";
          state.labor.push({
            id: "l-" + Math.random().toString(36).slice(2, 8), member: doer,
            hours: Math.round((c.minutes / 60) * 100) / 100, kind: c.kind || "organizing",
            desc: c.name, at: new Date().toISOString(), fromChore: choreId,
          });
        }
        save();
      },
      completionRate(choreId) {
        const c = state.chores.find((x) => x.id === choreId); if (!c) return 0;
        const per = currentPeriod(c); if (per === 0) return 1;
        let done = 0; for (let p = 0; p < per; p++) if ((state.choreDone[choreId] || {})[p]) done++;
        return done / per;
      },
    },

    money: {
      treasury: () => state.treasury,
      contributions: () => state.contributions.slice(),
      payContribution(memberId) { const c = state.contributions.find((x) => x.member === memberId); if (c && !c.paid) { c.paid = true; const h = state.houses.find((x) => x.id === state.myHouseId); state.treasury.balance += h ? h.poolMonthly : 0; save(); } },
      bills: () => state.bills.slice(),
      billPayer, monthKey,
      billIsPaid: (billId) => !!state.billsPaid[billId + ":" + monthKey()],
      payBill(billId) {
        if (state.billsPaid[billId + ":" + monthKey()]) return;
        state.billsPaid[billId + ":" + monthKey()] = true;
        const b = state.bills.find((x) => x.id === billId);
        if (b && b.amount > 0) {
          // the bill is real money someone fronted — it belongs in the ledger, split like everything else
          state.expenses.unshift({
            id: "x-" + Math.random().toString(36).slice(2, 8), at: new Date().toISOString(),
            desc: b.name + " · " + monthKey(), amount: b.amount, paidBy: billPayer(b, new Date()),
            category: "utilities", fromBill: billId,
            split: { mode: "equal", participants: b.rotation.slice() },
          });
        }
        save();
      },
      rotationPreview(bill, monthsAhead) {
        const out = []; const base = new Date();
        for (let i = 0; i < (monthsAhead || 4); i++) {
          const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
          out.push({ month: d.toLocaleDateString("en-US", { month: "short" }), payer: billPayer(bill, d) });
        }
        return out;
      },
    },

    proposals: {
      all: () => state.proposals.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
      get: (id) => state.proposals.find((p) => p.id === id) || null,
      add(p) { state.proposals.unshift(Object.assign({ id: "pr-" + Math.random().toString(36).slice(2, 8), createdAt: new Date().toISOString(), status: "open", votes: {} }, p)); save(); return state.proposals[0]; },
      threshold() { return proposalThreshold(); },
      vote(id, memberId, val) {
        const p = state.proposals.find((x) => x.id === id); if (!p || p.status !== "open") return p;
        p.votes[memberId] = val;
        resolveProposal(p);
        save(); return p;
      },
    },

    // Bounties — one-off jobs with a budget, the CommuneOS TaskManager model.
    // Disputes route through the same 2/3 proposal machinery as everything else.
    tasks: {
      all: () => state.tasks.slice().sort((a, b) => new Date(b.at) - new Date(a.at)),
      get: (id) => state.tasks.find((t) => t.id === id) || null,
      open: () => state.tasks.filter((t) => t.status === "open"),
      add(t) {
        const task = Object.assign({
          id: "t-" + Math.random().toString(36).slice(2, 8),
          status: "open", createdBy: "me", at: new Date().toISOString(), onchain: null,
        }, t);
        task.budget = Math.max(0, Number(task.budget) || 0);
        state.tasks.unshift(task); save(); return task;
      },
      markDone(id) {
        const t = state.tasks.find((x) => x.id === id); if (!t || t.status !== "open") return t;
        t.status = "done"; t.doneAt = new Date().toISOString();
        if (t.budget > 0) {
          state.labor.push({
            id: "l-" + Math.random().toString(36).slice(2, 8), member: t.assignedTo,
            hours: Math.round((t.budget / state.laborRate) * 100) / 100, kind: "organizing",
            desc: "Bounty: " + t.desc, at: new Date().toISOString(), fromTask: id,
          });
        }
        save(); return t;
      },
      dispute(id, newAssignee) {
        const t = state.tasks.find((x) => x.id === id); if (!t || !newAssignee) return null;
        t.status = "disputed";
        const p = {
          id: "pr-" + Math.random().toString(36).slice(2, 8), createdAt: new Date().toISOString(),
          status: "open", votes: { me: true }, kind: "dispute", taskId: id, newAssignee, reassignTo: newAssignee,
          title: "Reassign: " + t.desc,
          desc: "Move this bounty to a new assignee. Passing the vote reassigns it on the spot.",
          proposer: "me",
        };
        state.proposals.unshift(p);
        resolveProposal(p); // a solo house's own vote already decides it
        save(); return p;
      },
      setOnchain(id, oc) { const t = state.tasks.find((x) => x.id === id); if (t) { t.onchain = oc; save(); } },
    },

    // Labor credits — the Twin Oaks insight: count hours, not just dollars.
    // Chores auto-log on mark-done; credit = hours × the house rate.
    labor: {
      all: () => state.labor.slice().sort((a, b) => new Date(b.at) - new Date(a.at)),
      rate: () => state.laborRate,
      setRate(r) { state.laborRate = Number(r) || 15; save(); },
      log(entry) {
        const e = Object.assign({
          id: "l-" + Math.random().toString(36).slice(2, 8),
          member: "me", at: new Date().toISOString(),
        }, entry);
        state.labor.push(e); save(); return e;
      },
      remove(id) { state.labor = state.labor.filter((l) => l.id !== id); save(); },
      hoursBy(member) { return Math.round(state.labor.filter((l) => l.member === member).reduce((s, l) => s + l.hours, 0) * 100) / 100; },
      creditBy(member) { return Math.round(this.hoursBy(member) * state.laborRate * 100) / 100; },
      byMember() {
        const out = {};
        state.labor.forEach((l) => { out[l.member] = Math.round(((out[l.member] || 0) + l.hours) * 100) / 100; });
        return out;
      },
    },

    // The living house agreement — versioned, signed, amended by 2/3 vote.
    agreementDoc: {
      get: () => state.agreementDoc,
      // first call drafts v1 from the same generator the quiz uses
      ensure() {
        if (state.agreementDoc) return state.agreementDoc;
        const mine = state.houses.find((x) => x.id === state.myHouseId);
        if (!mine) return null;
        state.agreementDoc = {
          version: 1, lines: agreementFrom(state.me, mine),
          updatedAt: new Date().toISOString(), signatures: {}, history: [], notarized: null,
        };
        save(); return state.agreementDoc;
      },
      sign(member) {
        const d = state.agreementDoc; if (!d) return null;
        d.signatures[member || "me"] = new Date().toISOString();
        save(); return d;
      },
      signedBy: (member) => !!(state.agreementDoc && state.agreementDoc.signatures[member || "me"]),
      // an amendment is a proposal; the 2/3 vote applies it (see proposals.vote)
      proposeAmendment(lines, note) {
        const d = state.agreementDoc; if (!d) return null;
        const p = {
          id: "pr-" + Math.random().toString(36).slice(2, 8), createdAt: new Date().toISOString(),
          status: "open", votes: { me: true }, kind: "agreement", lines: lines.slice(),
          title: "Amend the house agreement → v" + (d.version + 1),
          desc: note || "Full text replaces the current version when this passes. Signatures reset.",
          proposer: "me",
        };
        state.proposals.unshift(p);
        resolveProposal(p); // a solo house's own vote already decides it
        save(); return p;
      },
      setNotarized(info) { if (state.agreementDoc) { state.agreementDoc.notarized = info; save(); } },
    },

    // House health — the quiz-validation loop, instrumented.
    health: {
      log: () => state.checkinLog.slice().sort((a, b) => new Date(b.at) - new Date(a.at)),
      metrics() {
        const per = (c) => currentPeriod(c);
        let periods = 0, done = 0;
        state.chores.forEach((c) => {
          const p = per(c);
          for (let i = 0; i < p; i++) { periods++; if ((state.choreDone[c.id] || {})[i]) done++; }
        });
        const cutoff = Date.now() - 28 * DAY;
        const recent = state.checkinLog.filter((e) => new Date(e.at).getTime() > cutoff);
        const myLog = state.checkinLog.filter((e) => e.member === "me");
        const lowStreak = myLog.slice(-3).filter((e) => e.bandwidth === "low" || e.bandwidth === "away").length;
        // a user dispute is one dispute, not two: open dispute proposals, plus any
        // disputed task that somehow has no open proposal attached
        const openDisputeProps = state.proposals.filter((p) => p.kind === "dispute" && p.status === "open");
        const orphanDisputed = state.tasks.filter((t) => t.status === "disputed" &&
          !openDisputeProps.some((p) => p.taskId === t.id)).length;
        const disputes = openDisputeProps.length + orphanDisputed;
        return {
          choreRate: periods ? Math.round((done / periods) * 100) : 100,
          checkins4w: recent.length,
          lowStreak, disputes,
          laborHours: Math.round(state.labor.reduce((s, l) => s + l.hours, 0) * 100) / 100,
        };
      },
    },

    // Post-event mutual match: picks are private; only reciprocal ones surface.
    clicks: {
      myPicks: (eventId) => ((state.clicks[eventId] || {}).me || []).slice(),
      toggle(eventId, personId) {
        state.clicks[eventId] = state.clicks[eventId] || {};
        const mine = state.clicks[eventId].me = state.clicks[eventId].me || [];
        const i = mine.indexOf(personId);
        if (i >= 0) mine.splice(i, 1); else mine.push(personId);
        save(); return mine.slice();
      },
      mutuals(eventId) {
        const ev = state.clicks[eventId] || {};
        return (ev.me || []).filter((pid) => (ev[pid] || []).includes("me"));
      },
      allMutuals() {
        const seen = new Set(); const out = [];
        Object.keys(state.clicks).forEach((eid) => {
          this.mutuals(eid).forEach((pid) => {
            if (!seen.has(pid)) { seen.add(pid); out.push({ eventId: eid, personId: pid }); }
          });
        });
        return out;
      },
    },

    CHORE_KINDS, BANDWIDTH, APPETITE,

    prefs: {
      kinds: () => CHORE_KINDS.slice(),
      get: (memberId) => state.chorePrefs[memberId] || { loves: [], hates: [] },
      setMine(p) { state.chorePrefs.me = { loves: p.loves || [], hates: p.hates || [] }; save(); },
      bandwidth: (memberId) => state.bandwidth[memberId || "me"] || "normal",
      setBandwidth(id, memberId) { state.bandwidth[memberId || "me"] = id; save(); },
      appetite: (memberId) => state.mealAppetite[memberId || "me"] || "fine",
      setAppetite(id, memberId) { state.mealAppetite[memberId || "me"] = id; save(); },
    },

    // The reallocator: reassigns THIS period's not-yet-done chores so minutes
    // land where the bandwidth is, loved kinds go to their people, and hated
    // kinds go anywhere else. Greedy: biggest chores placed first, each to the
    // member with the lowest preference-adjusted load.
    rebalance: {
      week() {
        const h = state.houses.find((x) => x.id === state.myHouseId);
        if (!h) return { changes: [], mealNote: null };
        const members = h.members.slice();
        const cap = {}, load = {};
        members.forEach((m) => {
          const bw = BANDWIDTH.find((b) => b.id === (state.bandwidth[m] || "normal")) || BANDWIDTH[1];
          cap[m] = bw.capacity; load[m] = 0;
        });
        const open = state.chores
          .map((c) => ({ c, period: currentPeriod(c) }))
          .filter(({ c, period }) => !(state.choreDone[c.id] || {})[period])
          .sort((a, b) => (b.c.minutes || 20) - (a.c.minutes || 20));
        const changes = [];
        open.forEach(({ c, period }) => {
          const before = choreAssignee(c, period);
          let best = null, bestScore = Infinity;
          members.forEach((m) => {
            const prefs = state.chorePrefs[m] || { loves: [], hates: [] };
            let score = (load[m] + (c.minutes || 20)) / cap[m];
            if (c.kind && prefs.loves.includes(c.kind)) score -= 22;
            if (c.kind && prefs.hates.includes(c.kind)) score += 30;
            if (m === before) score -= 4; // mild stickiness — don't churn for churn's sake
            if (score < bestScore) { bestScore = score; best = m; }
          });
          load[best] += (c.minutes || 20);
          const key = c.id + ":" + period;
          if (best !== rotationAssignee(c, period)) state.choreOverrides[key] = best;
          else delete state.choreOverrides[key];
          if (best !== before) {
            const prefs = state.chorePrefs[best] || { loves: [], hates: [] };
            const beforePrefs = state.chorePrefs[before] || { loves: [], hates: [] };
            let reason = "evening out the minutes";
            if ((state.bandwidth[before] || "normal") === "low") reason = (before === "me" ? "you're running on fumes" : firstName(before) + " is running on fumes");
            else if (c.kind && beforePrefs.hates.includes(c.kind)) reason = (before === "me" ? "you hate " : firstName(before) + " hates ") + kindLabel(c.kind).toLowerCase();
            if (c.kind && prefs.loves.includes(c.kind)) reason += " · " + (best === "me" ? "you actually like this" : firstName(best) + " actually likes this");
            changes.push({ choreId: c.id, name: c.name, emoji: c.emoji, period, from: before, to: best, reason });
          }
        });
        // meals: reorder the cook rotation by appetite (therapy-bakers first, avoiders last)
        let mealNote = null;
        if (state.mealPlan && state.mealPlan.rotation) {
          const rank = { love: 0, fine: 1, avoid: 2 };
          state.mealPlan.rotation.sort((a, b) => (rank[state.mealAppetite[a] || "fine"] || 1) - (rank[state.mealAppetite[b] || "fine"] || 1));
          const avoiders = members.filter((m) => (state.mealAppetite[m] || "fine") === "avoid");
          const bakers = members.filter((m) => (state.mealAppetite[m] || "fine") === "love");
          if (avoiders.length || bakers.length) {
            mealNote = (bakers.length ? firstName(bakers[0]) + " wants the kitchen this week" : "") +
              (bakers.length && avoiders.length ? "; " : "") +
              (avoiders.length ? avoiders.map(firstName).join(" & ") + (avoiders.length > 1 ? " are" : " is") + " off cook duty" : "") + ".";
          }
        }
        const today = new Date().toISOString().slice(0, 10);
        state.checkinLog = state.checkinLog.filter((e) => !(e.member === "me" && e.at.slice(0, 10) === today));
        state.checkinLog.push({
          at: new Date().toISOString(), member: "me",
          bandwidth: state.bandwidth.me || "normal", appetite: state.mealAppetite.me || "fine",
        });
        save();
        return { changes, mealNote };
      },
      clear() { state.choreOverrides = {}; save(); },
      overrideCount: () => Object.keys(state.choreOverrides).length,
      isOverridden: (choreId, period) => !!state.choreOverrides[choreId + ":" + period],
    },

    ledger: {
      CATEGORIES: [
        { id: "groceries", label: "Groceries", emoji: "🛒" },
        { id: "utilities", label: "Utilities", emoji: "💡" },
        { id: "supplies", label: "Supplies", emoji: "🧴" },
        { id: "repairs", label: "Repairs", emoji: "🔧" },
        { id: "fun", label: "Fun", emoji: "🎉" },
        { id: "transport", label: "Transport", emoji: "🚕" },
        { id: "other", label: "Other", emoji: "🧷" },
      ],
      all: () => state.expenses.slice().sort((a, b) => new Date(b.at) - new Date(a.at)),
      settlements: () => state.settlements.slice().sort((a, b) => new Date(b.at) - new Date(a.at)),
      add(x) {
        const e = Object.assign({ id: "x-" + Math.random().toString(36).slice(2, 8), at: new Date().toISOString(), category: "other" }, x);
        state.expenses.unshift(e); save(); return e;
      },
      // per-member share of one expense, exact to the cent (remainder to the payer)
      shares(x) {
        const out = {};
        const parts = x.split.participants;
        const cents = Math.round(x.amount * 100);
        if (x.split.mode === "exact") {
          parts.forEach((p) => { out[p] = Math.round((x.split.values?.[p] || 0) * 100) / 100; });
          return out;
        }
        let weights;
        if (x.split.mode === "shares") weights = parts.map((p) => x.split.values?.[p] || 1);
        else if (x.split.mode === "percent") weights = parts.map((p) => x.split.values?.[p] || 0);
        else weights = parts.map(() => 1);
        const total = weights.reduce((s, w) => s + w, 0) || 1;
        let assigned = 0;
        parts.forEach((p, i) => {
          const c = Math.floor((cents * weights[i]) / total);
          out[p] = c / 100; assigned += c;
        });
        const payer = parts.includes(x.paidBy) ? x.paidBy : parts[0];
        out[payer] = Math.round((out[payer] * 100 + (cents - assigned))) / 100;
        return out;
      },
      // net balance per member: + means the house owes them
      balances() {
        const net = {};
        const bump = (id, v) => { net[id] = Math.round(((net[id] || 0) + v) * 100) / 100; };
        state.expenses.forEach((x) => {
          if (x.paidByFund) return; // fund-paid: no interpersonal debt
          bump(x.paidBy, x.amount);
          const sh = this.shares(x);
          Object.entries(sh).forEach(([p, v]) => bump(p, -v));
        });
        state.settlements.forEach((s) => { bump(s.from, s.amount); bump(s.to, -s.amount); });
        return net;
      },
      // Splitwise-style simplify: greedy netting of givers vs receivers.
      // Optimal payment-count is NP-hard; greedy is what Splitwise ships too.
      simplify() {
        const net = this.balances();
        const owed = [], owes = [];
        Object.entries(net).forEach(([id, v]) => {
          if (v > 0.009) owed.push({ id, v });
          else if (v < -0.009) owes.push({ id, v: -v });
        });
        owed.sort((a, b) => b.v - a.v); owes.sort((a, b) => b.v - a.v);
        const plan = [];
        let i = 0, j = 0;
        while (i < owes.length && j < owed.length) {
          const amt = Math.min(owes[i].v, owed[j].v);
          plan.push({ from: owes[i].id, to: owed[j].id, amount: Math.round(amt * 100) / 100 });
          owes[i].v -= amt; owed[j].v -= amt;
          if (owes[i].v < 0.009) i++;
          if (owed[j].v < 0.009) j++;
        }
        return plan;
      },
      // raw pairwise debts (pre-simplify) so the UI can show the reduction
      pairwiseCount() {
        const pair = {};
        state.expenses.forEach((x) => {
          if (x.paidByFund) return;
          const sh = this.shares(x);
          Object.entries(sh).forEach(([p, v]) => {
            if (p !== x.paidBy && v > 0.009) pair[p + ">" + x.paidBy] = (pair[p + ">" + x.paidBy] || 0) + v;
          });
        });
        // net opposing directions
        const seen = new Set(); let n = 0;
        Object.keys(pair).forEach((k) => {
          const [a, b] = k.split(">");
          const rk = b + ">" + a;
          if (seen.has(rk) || seen.has(k)) return;
          seen.add(k);
          const diff = (pair[k] || 0) - (pair[rk] || 0);
          if (Math.abs(diff) > 0.009) n++;
        });
        return n;
      },
      // settle on rails: instant, sub-cent-ish fee, receipt recorded
      settle(from, to, amount) {
        const fee = Math.max(0.01, Math.round(amount * 0.02) / 100);
        const s = {
          id: "s-" + Math.random().toString(36).slice(2, 8), from, to,
          amount: Math.round(amount * 100) / 100, at: new Date().toISOString(),
          rail: { fee, seconds: Math.round((1 + Math.random() * 2.2) * 10) / 10, ref: "rail-" + Math.random().toString(36).slice(2, 8) },
        };
        state.settlements.unshift(s); save(); return s;
      },
      payFromFund(x) {
        const e = this.add(Object.assign({}, x, { paidByFund: true, paidBy: x.paidBy || "me" }));
        state.treasury.balance = Math.round((state.treasury.balance - x.amount) * 100) / 100;
        save(); return e;
      },
      byCategory(sinceDays) {
        const cutoff = Date.now() - (sinceDays || 30) * DAY;
        const out = {};
        state.expenses.forEach((x) => {
          if (new Date(x.at).getTime() < cutoff) return;
          out[x.category || "other"] = Math.round(((out[x.category || "other"] || 0) + x.amount) * 100) / 100;
        });
        return out;
      },
      // template-aware default for a new expense in this house
      defaultSplit() {
        const h = state.houses.find((x) => x.id === state.myHouseId);
        const members = h ? h.members.slice() : ["me"];
        const t = h ? h.poolModel : "split";
        if (t === "sliding") return { mode: "percent", participants: members, hint: "Sliding-scale house — tune the percentages to your bands." };
        if (t === "fund" || t === "commons" || t === "labor") return { mode: "equal", participants: members, fundOption: true, hint: "House-fund template — shared staples can come straight out of the fund." };
        return { mode: "equal", participants: members };
      },
    },

    connects: {
      all: () => state.connects.slice(),
      has: (kind, id) => state.connects.some((c) => c.kind === kind && c.id === id),
      add(kind, id) { if (!this.has(kind, id)) { state.connects.push({ kind, id, at: new Date().toISOString() }); save(); } },
    },

    steward: {
      chat: () => state.stewardChat.slice(),
      push(msg) { state.stewardChat.push(Object.assign({ at: new Date().toISOString() }, msg)); save(); },
      clear() { state.stewardChat = []; save(); },
      maintenance: () => state.maintenance.slice(),
      addMaintenance(m) { state.maintenance.unshift(Object.assign({ id: "m-" + Math.random().toString(36).slice(2, 8), status: "open", at: new Date().toISOString(), openedBy: "me" }, m)); save(); },
    },

    // upcast an older exported state to the current shape (null = unsupported)
    migrate: (st) => (st && st.version === 9 ? st : (st && st.version === 8 ? upcastV8(st) : null)),
    util: { fmtMoney, fmtDate, fmtDateLong, relDate, initials, hue, esc, qp, clamp },
  };
})();
