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
  const KEY = "dp-commons-v2";
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
      { name: "Kitchen reset", minutes: 15, freqDays: 3, desc: "Counters, dishes away, wipe stove" },
      { name: "Kitchen deep clean", minutes: 45, freqDays: 7, desc: "Stove, sink scrub, floor" },
      { name: "Fridge audit", minutes: 15, freqDays: 14, desc: "Toss the science experiments" },
    ]},
    { id: "bath", label: "Bathroom", emoji: "🛁", countable: true, max: 4, tasks: [
      { name: "Bathroom clean", minutes: 30, freqDays: 7, desc: "Toilet, sink, shower, floor" },
      { name: "Towels & restock", minutes: 10, freqDays: 7, desc: "Fresh towels, TP, soap" },
    ]},
    { id: "common", label: "Common room", emoji: "🛋️", countable: true, max: 4, tasks: [
      { name: "Sweep & tidy", minutes: 15, freqDays: 7, desc: "Floors, surfaces, cushions" },
      { name: "Mop & dust", minutes: 20, freqDays: 14, desc: "Wet mop, shelves, sills" },
    ]},
    { id: "hall", label: "Hall & stairs", emoji: "🪜", countable: false, tasks: [
      { name: "Stairs & hallway sweep", minutes: 10, freqDays: 7, desc: "Top to bottom" },
    ]},
    { id: "trash", label: "Trash duty", emoji: "🗑️", countable: false, tasks: [
      { name: "Trash & recycling out", minutes: 10, freqDays: 7, desc: "Curb night — know your pickup day" },
      { name: "Compost run", minutes: 15, freqDays: 14, desc: "Drop-off or brown bin" },
    ]},
    { id: "stoop", label: "Stoop / yard", emoji: "🪴", countable: false, tasks: [
      { name: "Stoop sweep & plants", minutes: 15, freqDays: 7, desc: "Sweep, water, say hi to neighbors" },
      { name: "Yard hour", minutes: 45, freqDays: 30, desc: "Weeds, leaves, the ambitious corner" },
    ]},
    { id: "laundry", label: "Laundry room", emoji: "🧺", countable: false, tasks: [
      { name: "Communal linens", minutes: 20, freqDays: 14, desc: "House towels, rags, lint trap" },
    ]},
    { id: "basement", label: "Basement / storage", emoji: "🕸️", countable: false, tasks: [
      { name: "Storage reset", minutes: 20, freqDays: 30, desc: "Sweep, restack, evict spiders" },
    ]},
    { id: "pantry", label: "Bulk pantry", emoji: "🌾", countable: false, tasks: [
      { name: "Bulk restock run", minutes: 45, freqDays: 30, desc: "Costco / co-op run for staples" },
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
        members: ["me", "p-zora", "p-eli", "p-priya", "p-marcus", "p-june"],
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
        attendees: ["me", "p-zora", "p-eli", "p-june", "p-maya", "p-sofia", "p-lena", "p-ty"], escrow: null, past: true },
      { id: "e-vibecamp", title: "Vibe Camp II", type: "retreat", when: days(-60), where: "Ramapo, NJ",
        price: 240, capacity: 120, host: null, desc: "The big one. Three houses catalyzed out of the last edition.",
        attendees: ["me", "p-zora", "p-priya", "p-marcus", "p-maya", "p-dev", "p-amara", "p-jonah", "p-noor", "p-casey", "p-gus"],
        escrow: { state: "released", total: 26400, note: "Released to venue after the weekend" }, past: true },
      { id: "e-workday-old", title: "Bushwick Static Build Day", type: "workday", when: days(-35), where: "Bushwick Static",
        price: 0, capacity: 20, host: "h-bushwick", desc: "Built the stage, painted the hall, ate a heroic quantity of pizza.",
        attendees: ["p-gus", "p-amara", "p-marcus", "p-dev"], escrow: null, past: true },
      { id: "e-dinner-old", title: "Hearth Sunday Dinner", type: "dinner", when: days(-14), where: "Crown Heights Hearth",
        price: 0, capacity: 12, host: "h-crown", desc: "Kids made the dessert. It was structurally unsound and perfect.",
        attendees: ["p-ty", "p-zora", "p-priya", "p-maya"], escrow: null, past: true },
    ];
  }

  function seedState() {
    return {
      version: 2,
      seededAt: now,
      me: {
        id: "me", name: "You", age: 30, borough: "Bed-Stuy", budget: 1500,
        quizDone: true, // demo persona; quiz.html overwrites
        dims: { hearth: 72, order: 58, voice: 62, mission: 78, porch: 68, pool: 74 },
        values: ["Long dinners", "Shared treasury", "Projects over vibes-only"],
        hard: ["smoke", "sublet"], flags: [],
        blurb: "Demo persona — retake the quiz to make this yours.",
        seeking: "has-house", events: ["e-mixer-prospect", "e-vibecamp"],
      },
      people: seedPeople(),
      houses: seedHouses(),
      events: seedEvents(),
      myHouseId: "h-cypress",
      rsvps: ["e-retreat-catskills"],
      escrowPaid: { "e-retreat-catskills": 185 },
      connects: [],           // {kind:'house'|'person', id, at}
      treasury: { balance: 2340, currency: "USD" },
      contributions: [        // this month's pool contributions (poolMonthly each)
        { member: "me", paid: true }, { member: "p-zora", paid: true },
        { member: "p-eli", paid: true }, { member: "p-priya", paid: false },
        { member: "p-marcus", paid: false }, { member: "p-june", paid: true },
      ],
      bills: [
        { id: "b-net", name: "Internet (fiber)", amount: 89, dueDay: 5, rotation: ["me", "p-zora", "p-eli", "p-priya", "p-marcus", "p-june"], offset: 2 },
        { id: "b-coned", name: "Con Edison", amount: 214, dueDay: 12, rotation: ["p-eli", "p-june", "me", "p-marcus", "p-zora", "p-priya"], offset: 0 },
        { id: "b-csa", name: "CSA veg box", amount: 128, dueDay: 18, rotation: ["p-zora", "me", "p-june", "p-eli", "p-priya", "p-marcus"], offset: 4 },
        { id: "b-water", name: "Water & compost", amount: 63, dueDay: 22, rotation: ["p-priya", "p-marcus", "me", "p-june", "p-zora", "p-eli"], offset: 1 },
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
          votes: { "p-june": true, "p-priya": true, "p-eli": true, "p-sofia": false, "me": true } },
        { id: "pr-stoop", title: "Front stoop repair", kind: "spend", amount: 220,
          desc: "Loose tread on the stoop. Marcus knows a mason.",
          proposer: "p-zora", createdAt: days(-34), status: "passed", resolvedAt: days(-31), executed: true,
          votes: { "p-zora": true, "me": true, "p-eli": true, "p-june": true } },
      ],
      chores: [
        { id: "c-kitchen", name: "Kitchen reset", emoji: "🍳", freqDays: 7, start: days(-70), rotation: ["me", "p-zora", "p-eli", "p-priya", "p-marcus", "p-june"] },
        { id: "c-trash", name: "Trash & recycling", emoji: "🗑️", freqDays: 7, start: days(-70), rotation: ["p-june", "me", "p-zora", "p-eli", "p-priya", "p-marcus"] },
        { id: "c-bath", name: "Bathroom deep clean", emoji: "🛁", freqDays: 14, start: days(-84), rotation: ["p-priya", "p-marcus", "p-june", "me", "p-zora", "p-eli"] },
        { id: "c-sweep", name: "Sweep common rooms", emoji: "🧹", freqDays: 7, start: days(-70), rotation: ["p-marcus", "p-june", "me", "p-zora", "p-eli", "p-priya"] },
        { id: "c-plants", name: "Plants & stoop", emoji: "🪴", freqDays: 7, start: days(-70), rotation: ["p-zora", "p-eli", "p-priya", "p-marcus", "p-june", "me"] },
        { id: "c-compost", name: "Compost run", emoji: "🌰", freqDays: 14, start: days(-84), rotation: ["p-eli", "p-priya", "p-marcus", "p-june", "me", "p-zora"] },
      ],
      choreDone: {},          // { choreId: { period: { by, at } } } — seeded below
      mealPlan: { presetId: "dinner-club", eaters: 6, dinners: 3, vegShare: 0.5, tier: "standard",
        batchDay: "Sunday", rotation: ["p-zora", "me", "p-june", "p-priya", "p-marcus", "p-eli"] },
      stewardChat: [],        // {who:'me'|'steward', text, at, actions?}
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
    return chore.rotation[p % chore.rotation.length];
  }

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

  /* ---------- Store plumbing ---------- */

  let state;
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { state = JSON.parse(raw); if (state.version === 2) return; }
    } catch (e) { /* reseed */ }
    state = seedState();
    seedChoreHistory(state);
    save();
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(state)); }
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

  load();

  window.Commons = {
    get state() { return state; },
    save, reset,
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
                emoji: sp.emoji, freqDays: t.freqDays, minutes: t.minutes, desc: t.desc,
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
          id: c.id, name: c.name, emoji: c.emoji, freqDays: c.freqDays, minutes: c.minutes,
          start: new Date().toISOString(),
          // stagger rotation starts so the same person doesn't open every chore
          rotation: members.slice(i % members.length).concat(members.slice(0, i % members.length)),
        }));
        state.choreDone = {};
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
    setMe(patch) { Object.assign(state.me, patch); save(); },

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
      // people I share past events with, ranked by overlap
      overlap(profile) {
        const mine = new Set((profile.events || []).concat(state.rsvps));
        return state.people
          .map((p) => ({ p, shared: (p.events || []).filter((e) => mine.has(e)) }))
          .filter((x) => x.shared.length > 0 && x.p.id !== profile.id)
          .sort((a, b) => b.shared.length - a.shared.length);
      },
    },

    match, matchHouse: (me, house) => matchHouse(me, house, state), archetype, conflictCount,

    chores: {
      all: () => state.chores.slice(),
      period: currentPeriod,
      assignee: choreAssignee,
      done: (choreId, period) => !!(state.choreDone[choreId] || {})[period],
      doneInfo: (choreId, period) => (state.choreDone[choreId] || {})[period] || null,
      markDone(choreId, period, by) {
        state.choreDone[choreId] = state.choreDone[choreId] || {};
        state.choreDone[choreId][period] = { by: by || "me", at: new Date().toISOString() };
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
      payBill(billId) { state.billsPaid[billId + ":" + monthKey()] = true; save(); },
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
      threshold() { const h = state.houses.find((x) => x.id === state.myHouseId); return h ? Math.ceil((h.members.length * 2) / 3) : 2; },
      vote(id, memberId, val) {
        const p = state.proposals.find((x) => x.id === id); if (!p || p.status !== "open") return p;
        p.votes[memberId] = val;
        const yes = Object.values(p.votes).filter(Boolean).length;
        const no = Object.values(p.votes).filter((v) => v === false).length;
        const t = this.threshold();
        if (yes >= t) { p.status = "passed"; p.resolvedAt = new Date().toISOString(); if (p.kind === "spend" && p.amount) { state.treasury.balance -= p.amount; p.executed = true; } }
        else if (no >= t) { p.status = "rejected"; p.resolvedAt = new Date().toISOString(); }
        save(); return p;
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

    util: { fmtMoney, fmtDate, fmtDateLong, relDate, initials, hue, esc, qp, clamp },
  };
})();
