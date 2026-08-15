/* ══════════════════════════════════════════════════════════════════════════
   l101Export.js — handing a built course to a store that is not this one.

   Bri built the L101 Store Template for the new store, with a September 1
   date. Everything she built lives in GATE CITY'S database: eight weeks, the
   class content under each, five prep sections and the survey. A new store is
   a NEW REPO WITH AN EMPTY DATABASE (see NEW-STORE-SETUP.md, "their copy is a
   new repo, not a fork"), so none of it travels on its own. They would open
   the template and find the five generic weeks that ship in code and no prep
   work at all. This file is the bridge.

   ★ LEAF. Imports nothing, and must stay that way — the same rule l101Copy.js
   states and for the same reason: it is reached from inside the five-file
   import knot around Leadership101.jsx, and anything imported back in here
   closes the cycle that produced the blank page on Jul 25.

   ⚠️ IT DOES NO I/O AND BUILDS NO KEYS. The caller reads and writes; this file
   decides WHAT is allowed in a bundle, WHAT must never be, and whether a
   bundle that turns up is whole. Key shapes have exactly one home (`kvFor` in
   Leadership101.jsx) and it is not this one.

   ═══ THE ONE THING THAT WOULD HAVE BEEN GOT WRONG ══════════════════════════
   ⚠️⚠️ HER WEEKS CANNOT BE FOUND BY KEY PREFIX. The template ships five weeks
   keyed `tpl-w1`, `tpl-w2` and so on, and the obvious export is "everything
   starting with tpl-". Measured against the live record on Aug 12 2026, she
   has EIGHT weeks, and three of them were added through the editor so they
   carry generated keys:

       wkmsoz5c1hvk   Intro to Leadership — Live Module     18,077 bytes
       wkmsp073g530n  Catering — Live Module                10,319 bytes
       wkmsnebnj6uq   Final Activities                       2,451 bytes

   A prefix export ships five of eight weeks, loses 30KB including the LARGEST
   single module she has written, and looks complete at both ends. The stored
   week list is the only index that knows where her weeks are, so every read
   here starts from it and follows the keys it names.
   ══════════════════════════════════════════════════════════════════════════ */

export const BUNDLE_KIND = "gcfcr-l101-template";
export const BUNDLE_VERSION = 1;

const asArray = (v) => (Array.isArray(v) ? v : []);
const isMap = (v) => !!v && typeof v === "object" && !Array.isArray(v);

/* The week key, the one way. Mirrors `keyOf` in Leadership101.jsx: a week Bri
   added has an explicit key, one from the code seed falls back to its number. */
export const weekKey = (w) => (w && (w.key || (w.n != null ? `w${w.n}` : ""))) || "";

/* EVERY key the caller must fetch, in order, derived from the week list. This
   exists so no caller is ever tempted to glob a prefix — see the header. */
export const weekKeysOf = (weeks) =>
  asArray(weeks).map(weekKey).filter(Boolean);

/* ⚠️⚠️ WHAT MUST NEVER TRAVEL, WRITTEN DOWN RATHER THAN LEFT TO THE CALLER.
   Each of these is either WIRING (which the template exists to not have) or
   GATE CITY'S PEOPLE. A bundle carrying any of them hands a second store a
   working entrance to a class, or our staff, or somebody's schoolwork.

     <ns>:pin, :pin:w1, :pin:rest   the class entrance. The template is unwired
                                    on purpose and a shipped PIN un-wires that.
     <ns>:open                      the open switch, same reason.
     ld:l101:instructors-v1         who Bri assigned. Gate City directors.
     ld:l101:ifeedback:<week>       an instructor's private notes on their own
                                    class. Personal, and not hers to send.
     ld:l101:isessions-v1           who taught which class and when. Our people.
     ld:l101:progress:<personId>    students' completed work. Never.
     <ns>:progress-hidden/-cleared  Bri's own roster view preferences.
     <ns>:materials                 module links. Gate City Drive URLs that a
                                    second store cannot open anyway.
   ⚠️ THIS LIST IS DOCUMENTATION, NOT A FILTER. The builder below is an
   allow-list — it copies the four things it is given and nothing else — because
   a deny-list is one forgotten key away from leaking and an allow-list is not.
   Keep both: the list says WHY, the shape enforces it. */
export const NEVER_TRAVELS = Object.freeze([
  "pin", "pin:w1", "pin:rest", "open", "materials",
  "progress-hidden", "progress-cleared",
  "instructors-v1", "ifeedback", "isessions-v1", "progress",
]);

/* ═══ BUILDING ONE ══════════════════════════════════════════════════════════
   ⚠️ AN ALLOW-LIST, FIELD BY FIELD. Nothing is spread in from the caller, so a
   caller that hands over a whole record by mistake cannot widen what ships. */
export function buildBundle(input) {
  const i = input || {};
  const weeks = asArray(i.weeks);
  const keys = weekKeysOf(weeks);
  const content = {};
  for (const k of keys) {
    const c = isMap(i.contentByKey) ? i.contentByKey[k] : null;
    if (c) content[k] = c;
  }
  const inotes = {};
  for (const k of keys) {
    const n = isMap(i.inotesByKey) ? i.inotesByKey[k] : null;
    /* Teaching notes travel (Matt, Aug 12 2026: a new director running
       Conflict & Coaching needs them more than they need a tidy file). An
       empty one is simply left out rather than shipped as `{}`. */
    if (isMap(n) && Object.keys(n).length) inotes[k] = n;
  }
  return {
    kind: BUNDLE_KIND,
    version: BUNDLE_VERSION,
    madeAt: String(i.madeAt || ""),      // the caller stamps it; this file has no clock
    fromStore: String(i.fromStore || ""),
    programNs: String(i.programNs || ""),
    weekCount: keys.length,              // see bundleProblems: a short file must fail loudly
    weeks,
    content,
    prepwork: asArray(i.prepwork),
    survey: isMap(i.survey) ? i.survey : null,
    inotes,
  };
}

/* ═══ READING ONE ═══════════════════════════════════════════════════════════
   ⚠️ RESULT-STYLE, NEVER A THROW ACROSS A UI BOUNDARY, and never a silent
   null: the person pasting this needs to know WHICH thing was wrong. */
export function readBundle(text) {
  let v;
  try { v = JSON.parse(String(text || "")); }
  catch { return { ok: false, error: "That is not a course file. It should start with a { and end with a }." }; }
  if (!isMap(v)) return { ok: false, error: "That file is not in the right shape." };
  if (v.kind !== BUNDLE_KIND) return { ok: false, error: "That file is not a Leadership 101 template export." };
  if (Number(v.version) > BUNDLE_VERSION) {
    return { ok: false, error: `That file was made by a newer Hub (version ${v.version}). Update this store first.` };
  }
  return { ok: true, bundle: v };
}

/* ⚠️⚠️ A SHORT FILE MUST FAIL LOUDLY, WHICH IS THE WHOLE REASON `weekCount` IS
   WRITTEN INTO THE BUNDLE. A truncated paste, a half-finished download or an
   export that dropped a week all produce a file that LOADS PERFECTLY and seeds
   a course missing a module nobody will notice is gone until the class is
   sitting in the room. Counting on load against a number written at export is
   what turns that into a refusal. */
export function bundleProblems(bundle) {
  const b = bundle || {};
  const out = [];
  const weeks = asArray(b.weeks);
  if (!weeks.length) out.push("It has no weeks in it.");
  const keys = weekKeysOf(weeks);
  if (keys.length !== weeks.length) out.push("One of the weeks has no key, so its content cannot be found.");
  if (Number(b.weekCount) && Number(b.weekCount) !== keys.length) {
    out.push(`It says it holds ${b.weekCount} weeks but only ${keys.length} arrived. The file is incomplete.`);
  }
  const missing = keys.filter((k) => !(isMap(b.content) && b.content[k]));
  if (missing.length) {
    const named = weeks.filter((w) => missing.includes(weekKey(w))).map((w) => w.title || weekKey(w));
    out.push(`${missing.length} week${missing.length === 1 ? " has" : "s have"} no content: ${named.join(", ")}.`);
  }
  return out;
}

/* ═══ WHAT STILL SAYS GATE CITY ═════════════════════════════════════════════
   ⚠️ IT REPORTS, IT NEVER REWRITES. Measured against the live record Aug 12
   2026: four of her eight content rows say "Gate City" inside the class text,
   and the Conflict & Coaching instructor notes name Bri. That is HER WRITING.
   Editing somebody's course content on their behalf is worse than showing them
   where it is — she knows which mentions matter and a regex does not. Same
   ruling as everywhere else here: build the affordance, do not do the surgery.
   ⚠️ WHOLE WORDS. "Bri" inside "Brianna" is the same person and fine, but
   matching loosely would flag "brief" and "fabric" and train her to ignore it. */
export function nameFlags(bundle, terms) {
  const b = bundle || {};
  const list = asArray(terms).map((t) => String(t || "").trim()).filter(Boolean);
  if (!list.length) return [];
  const re = new RegExp(`\\b(${list.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "i");
  const titleOf = (k) => {
    const w = asArray(b.weeks).find((x) => weekKey(x) === k);
    return (w && w.title) || k;
  };
  const out = [];
  const look = (where, value) => { if (re.test(JSON.stringify(value == null ? "" : value))) out.push(where); };
  for (const k of Object.keys(isMap(b.content) ? b.content : {})) look(titleOf(k), b.content[k]);
  for (const k of Object.keys(isMap(b.inotes) ? b.inotes : {})) look(`${titleOf(k)} (instructor notes)`, b.inotes[k]);
  if (asArray(b.prepwork).length) look("Prep work", b.prepwork);
  if (isMap(b.survey)) look("Survey", b.survey);
  return out;
}

/* A one-line summary for the screen, so she can see the file is the size she
   expects before she sends it. */
export function bundleSummary(bundle) {
  const b = bundle || {};
  const weeks = weekKeysOf(b.weeks).length;
  const items = Object.values(isMap(b.content) ? b.content : {})
    .reduce((n, c) => n + asArray(c && c.sections).reduce((m, s) => m + asArray(s && s.items).length, 0), 0);
  return {
    weeks,
    items,
    prep: asArray(b.prepwork).length,
    survey: isMap(b.survey) ? asArray(b.survey.questions).length : 0,
    inotes: Object.keys(isMap(b.inotes) ? b.inotes : {}).length,
  };
}
