/* colive.fun — house-doc merge (shared by both storage drivers).

   Whole-key last-writer-wins loses concurrent sub-edits: two members voting on
   different proposals, or two expenses added seconds apart, would clobber each
   other. So the house doc merges per-element:

   - append-mostly logs (expenses, tasks, labor, settlements, checkinLog,
     maintenance) union by id; the incoming element wins a same-id conflict.
   - proposals union by id AND merge each proposal's `votes` map, so two people
     voting on the same proposal both stick.
   - choreDone / billsPaid / choreOverrides / chorePrefs / bandwidth /
     mealAppetite are id-keyed maps → shallow (or 2-level) merge.
   - agreementDoc merges its `signatures` map; keeps the higher version's text.
   - house unions `members`; scalar fields last-writer-wins.
   - contributions merge by member.
   - chores / bills / mealPlan / treasury / choreChain are set-then-stable or
     inherently single-valued → last-writer-wins whole.

   Personal state is single-owner, so it stays plain per-key LWW (Object.assign).

   All object merges reject prototype-polluting keys. */

const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);

function safeKeys(o) {
  return Object.keys(o).filter((k) => !FORBIDDEN.has(k));
}
function shallowMerge(a, b) {
  const out = Object.assign({}, a && typeof a === "object" ? a : {});
  if (b && typeof b === "object") safeKeys(b).forEach((k) => { out[k] = b[k]; });
  return out;
}
function deepMerge2(a, b) {
  const out = Object.assign({}, a && typeof a === "object" ? a : {});
  if (b && typeof b === "object") safeKeys(b).forEach((k) => {
    out[k] = shallowMerge(out[k], b[k]);
  });
  return out;
}
function unionById(a, b, combine) {
  const order = [];
  const byId = new Map();
  const take = (arr) => (Array.isArray(arr) ? arr : []).forEach((el) => {
    const id = el && el.id;
    if (id == null) { order.push(Symbol()); byId.set(order[order.length - 1], el); return; }
    if (!byId.has(id)) order.push(id);
    byId.set(id, byId.has(id) && combine ? combine(byId.get(id), el) : el);
  });
  take(a); take(b);
  return order.map((id) => byId.get(id));
}
function unionValues(a, b) {
  const seen = new Set();
  const out = [];
  [].concat(Array.isArray(a) ? a : [], Array.isArray(b) ? b : []).forEach((v) => {
    if (!seen.has(v)) { seen.add(v); out.push(v); }
  });
  return out;
}
const mergeProposal = (pa, pb) => Object.assign({}, pa, pb, { votes: shallowMerge(pa && pa.votes, pb && pb.votes) });
// a wall post: incoming text/pin wins, but reactions maps union and replies append
const mergeWallPost = (wa, wb) => {
  const reactions = {};
  const src = [wa && wa.reactions, wb && wb.reactions];
  src.forEach((m) => { if (m && typeof m === "object") safeKeys(m).forEach((e) => { reactions[e] = unionValues(reactions[e], m[e]); }); });
  const replies = unionById(wa && wa.replies, wb && wb.replies);
  return Object.assign({}, wa, wb, { reactions, replies });
};

const STRATEGY = {
  expenses: (a, b) => unionById(a, b),
  tasks: (a, b) => unionById(a, b),
  labor: (a, b) => unionById(a, b),
  settlements: (a, b) => unionById(a, b),
  checkinLog: (a, b) => unionById(a, b),
  maintenance: (a, b) => unionById(a, b),
  proposals: (a, b) => unionById(a, b, mergeProposal),
  // the operations layer
  wall: (a, b) => unionById(a, b, mergeWallPost),
  shoppingList: (a, b) => unionById(a, b),        // incoming wins a same-id conflict (bought supersedes need)
  coverRequests: (a, b) => unionById(a, b),
  kudos: (a, b) => unionById(a, b),
  dinnerRSVP: (a, b) => deepMerge2(a, b),         // date → member → rsvp
  contributions: (a, b) => {
    const byM = new Map();
    const order = [];
    const take = (arr) => (Array.isArray(arr) ? arr : []).forEach((c) => {
      if (!byM.has(c.member)) order.push(c.member);
      byM.set(c.member, c);
    });
    take(a); take(b);
    return order.map((m) => byM.get(m));
  },
  choreDone: (a, b) => deepMerge2(a, b),
  billsPaid: (a, b) => shallowMerge(a, b),
  choreOverrides: (a, b) => shallowMerge(a, b),
  chorePrefs: (a, b) => shallowMerge(a, b),
  bandwidth: (a, b) => shallowMerge(a, b),
  mealAppetite: (a, b) => shallowMerge(a, b),
  agreementDoc: (a, b) => {
    if (!a) return b;
    if (!b) return a;
    // the newer version's text/history wins; signatures union either way
    const base = (b.version || 0) >= (a.version || 0) ? b : a;
    return Object.assign({}, base, { signatures: shallowMerge(a.signatures, b.signatures) });
  },
  house: (a, b) => {
    if (!b || typeof b !== "object") return a; // never let a scalar overwrite the house
    const merged = Object.assign({}, a, b);
    merged.members = unionValues(a && a.members, b.members);
    return merged;
  },
};

// merge `changes` into `base` (both plain house docs); returns a new doc
function mergeHouseDoc(base, changes) {
  const out = Object.assign({}, base && typeof base === "object" ? base : {});
  if (!changes || typeof changes !== "object") return out;
  safeKeys(changes).forEach((k) => {
    if (k === "housePeople") return; // server-managed
    const strat = STRATEGY[k];
    out[k] = strat ? strat(out[k], changes[k]) : changes[k]; // default: LWW whole
  });
  return out;
}

// personal state: single-owner, per-key LWW, but still proto-safe
function mergeStateDoc(base, changes) {
  const out = Object.assign({}, base && typeof base === "object" ? base : {});
  if (changes && typeof changes === "object") safeKeys(changes).forEach((k) => { out[k] = changes[k]; });
  return out;
}

const MAX_DOC_BYTES = 3 * 1024 * 1024; // a synced world with photos; hard ceiling per row
function tooBig(doc) {
  try { return Buffer.byteLength(JSON.stringify(doc)) > MAX_DOC_BYTES; }
  catch { return true; }
}

module.exports = { mergeHouseDoc, mergeStateDoc, tooBig, FORBIDDEN, MAX_DOC_BYTES };
