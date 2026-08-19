import React, { useState, useMemo, useEffect, useRef } from "react";
/* The shared raised look and accent edge — see cardStyle.js. */
import { CARD_3D, accentEdge } from "./cardStyle.js";
import { leadershipDevNames, leadershipDevInstructorIds,
  courseOwnerLabel, courseOwnerLabelCap, STORE } from "./storeConfig.js";
import * as store from "./store.js";
import { loadHRTeam } from "./HRConsole.jsx";
import { loadAllProgress, summarise, detailOf, useProgress, openUpload, uploadCourseAsset,
  classProgress, hasProgramWork, overrideWeekComplete, loadHidden, hideStudent, unhideStudent,
  clearStudent, loadCleared, groupCounts, loadCountsHidden, setCountsHidden } from "./L101Progress.jsx";
import L101IntroModule, { INTRO_TO_LEADERSHIP } from "./L101IntroModule.jsx";
import L101CateringModule, { CATERING_W4 } from "./L101CateringModule.jsx";
import L101WelcomeModule, { WELCOME_SEED } from "./L101WelcomeModule.jsx";
import L101Week from "./L101Week.jsx";
import { L101_W2 } from "./L101W2.js";
import { L101_W3 } from "./L101W3.js";
import { weekHasInstructors, loadAssignments, loadSessions } from "./l101Instructors.js";
import L101Print from "./L101Print.jsx";
import { collectPrepStrings, applyPrepStrings } from "./courseTranslate.js";
import L101Survey, { surveyIsOpen, SURVEY_SEED } from "./L101Survey.jsx";
import { TRAINING_ADMIN_ROLES } from "./adminRoles.js";
/* Bri's Copy Class. The RULES live in the leaf; this file only draws the screen
   and does the reading and writing. */
import { weekPairs, copyWeek, copyPrep, progTag, COPY_EXCLUDES } from "./l101Copy.js";
/* Class content is keyed by WEEK ID alone, never by class — see the "SHARED
   (NOT namespaced)" note below and the same warning in L101Template.jsx. That
   is precisely why a copy has to rewrite ids. */
import { contentKey } from "./L101Editor.jsx";

// ============================================================
// STORAGE ADAPTER — the one place that reads/writes KV.
// App.jsx imports { kvGet } from store.js for reading. This
// panel also needs to WRITE. store.js's write function is one
// of the names below; the adapter tries them in order so it
// works regardless. If saves silently fail, open store.js and
// confirm the export name, then keep only that line.
// ============================================================
const kvRead = async (key) => {
  try {
    if (typeof store.kvGet === "function") return await store.kvGet(key);
  } catch {}
  return null;
};
const kvWrite = async (key, value) => {
  // Tries the common store.js write names. One of these is real.
  const fn =
    store.kvSet || store.kvPut || store.set || store.put || store.kvWrite || store.save;
  if (typeof fn === "function") return await fn(key, value);
  // Fallback so the panel still works before store.js write is confirmed:
  try { await window.storage.set(key, JSON.stringify(value)); } catch {}
};
/* ok:false = the read FAILED, not "nothing stored". kvRead cannot tell the two
   apart, and the prep-work autosave used to write the SEED over Bri's real
   sections ON MOUNT ALONE whenever the hydrate read dropped. */
const kvReadResult = async (key) => {
  try {
    if (typeof store.kvGetResult === "function") return await store.kvGetResult(key);
    return { ok: true, value: await kvRead(key) };
  } catch { return { ok: false, value: null }; }
};

// KV keys this tile owns
/* ═══ ONE PROGRAM SHELL, MANY PROGRAMS ═══════════════════════════════════
   Bri asked for Trainer Orientation as "essentially a copy of the Leadership
   101 class, but content and pin entrance is different", and has already
   hinted at Leadership 201 after it. Copying this file would have made a
   second 1,300-line twin — the exact duplication that was deleted from the
   class RENDERER this morning, one level up. So the page is now a shell and a
   program is a config object.

   ★ WHICH KEYS ARE PER-PROGRAM AND WHICH ARE SHARED — the load-bearing split:
   PER-PROGRAM (namespaced): pins, the open switch, prep work, materials.
     Two programs must have their own entrance, their own prep and their own
     open/closed state.
   SHARED (NOT namespaced): `ld:l101:content:<classKey>`, `ld:l101:due` and
     `ld:l101:progress:<personId>`.
     ⚠️ These are keyed by CLASS ID or PERSON, not by program, and class ids are
     unique across programs. Namespacing them would split one student's record
     in two — and this file has argued from the start that there is ONE progress
     record per person. Keeping them shared is what lets a person's Trainer
     Orientation work sit beside their Leadership 101 work.
   ⚠️ EVERY EXISTING KEY IS BYTE-IDENTICAL for the l101 namespace. Three
   students have live records; L101 must read exactly what it read before. */
/* ⚠️ EXPORTED Aug 12 2026 so the template's export panel builds its keys from
   the SAME definition the shell reads them with. A second copy of these key
   shapes is how an export quietly reads a key nothing writes. Declaration
   unchanged; only `export` was added. */
export const kvFor = (ns) => ({
  pin: `${ns}:pin`,
  pinW1: `${ns}:pin:w1`,      // the split-cohort PINs; only used when
  pinRest: `${ns}:pin:rest`,  // program.splitPins is true
  open: `${ns}:open`,
  materials: `${ns}:materials`,
  prepwork: `${ns}:prepwork`,
  /* The end-of-class survey: questions plus its open/close window. One record
     per program, like every other key here, so Trainer Orientation can carry a
     different survey from Leadership 101 without either knowing about it. */
  survey: `${ns}:survey`,
  /* ★ THE COURSE STRUCTURE ITSELF (Bri, Aug 7 2026, having asked several times:
     "Can I PLEASE have the option to add, delete, reorder modules within the
     courses? … now it's more pressing because I need to add a module for
     Leadership 101.")
     🐛 SHE COULD NOT, AND REORDER ONLY LOOKED LIKE IT WORKED. The weeks and their
     modules lived in the program registry in CODE. moveModule changed screen
     state and nothing wrote it, so a reorder survived until the next refresh and
     then vanished — which reads as "it didn't save" and is worse than no button.
     Add and delete never existed at all.
     ⚠️ ONLY THE STRUCTURE LIVES HERE. Module LINKS stay in `materials`, keyed by
     module id, and are stripped before this is written. Two homes for one url is
     how the two drift and somebody opens last month's video. */
  weeks: `${ns}:weeks`,
  /* ★ WHO BRI HAS TAKEN OFF HER ROSTER — PER PROGRAM (Bri, Aug 10 2026):
     "Can we also remove progress that was moved over to the L101 template — my
     cleared and removed were transferred over and I don't need those visible in
     the template since it's separate."

     🐛 THEY WERE NOT TRANSFERRED. Both lists were module constants, so every
     program read the SAME two keys — the template was showing her live class's
     removals because there was only ever one list. She read that as a copy; it
     was one list with two doors onto it.

     ⚠️ BYTE-IDENTICAL FOR THE l101 NAMESPACE, deliberately: `ld:l101` +
     `:progress-hidden` is exactly the key that already exists, so her live
     roster keeps reading the list it has always read and nothing migrates. The
     template resolves to `ld:l101tpl:progress-hidden`, which has never existed
     and is therefore empty — which is precisely what she asked for.
     ⚠️ This is the SPLIT the header above describes: these are Bri's own view
     preferences, not a student's record. `ld:l101:progress:<personId>` stays
     shared, because there is one progress record per person. */
  progressHidden: `${ns}:progress-hidden`,
  progressCleared: `${ns}:progress-cleared`,
});

/* ═══ THE PROGRAM REGISTRY ═════════════════════════════════════════════════
   Progress is ONE record per person, shared across every program — that is
   deliberate and is what lets Bri see somebody's Orientation work beside their
   L101 work. The cost is that a program looking at that record cannot, on its
   own, tell "this item belongs to a class I don't run" from "this item belongs
   to no class at all". It treated both as orphans, which is why Trainer
   Orientation displayed the whole of Leadership 101.

   So each program announces itself here and every program can see the others'
   class ids. ⚠️ ONE-WAY ON PURPOSE: TrainerOrientation imports this file, so
   this file must never import it back. A program registers itself from its own
   module body instead.
   ⚠️ Degrades to today's behaviour if a program was never imported — the set is
   simply smaller, and an unclaimed id still surfaces rather than vanishing. */
export const PROGRAM_REGISTRY = [];
export function registerProgram(p) {
  if (p && p.ns && !PROGRAM_REGISTRY.some((x) => x.ns === p.ns)) PROGRAM_REGISTRY.push(p);
  return p;
}

const KV_DUE_SHARED = "ld:l101:due";
/* Which weeks are in-person, and their timeframe. Its own record rather than a
   field inside the due map: that map is SHARED across programs (see
   KV_DUE_SHARED) and adding a key to a shared shape is how an old reader starts
   choking on a field it has never seen. Rule 1. */
const KV_INPERSON_SHARED = "ld:l101:inperson";
// ★ DUE DATES (Bri, Jul 25: "scheduled due dates/times on the classes and the
// prep work tasks"). One flat map, keyed the same way progress is — "w1" for a
// class, "pw:<taskId>" for a prep task — so a task keeps its date when its
// section is renamed or moved. Stored separately from the content for the same
// reason `materials` is: editing the class must not disturb the schedule.


// ============================================================
// Leadership101.jsx — Gate City Hub · People & Team
// Built from Bri's "Leadership Dev Hub" spec + the two Canva
// student workbooks she emailed Jul 10 ("For Hub stuff").
//
// ⚠️ SECURITY — READ BEFORE COMMITTING
// Canva share URLs contain `invite=` and `accessToken=` params.
// They are credentials: anyone with the link opens the design.
// DO NOT paste them into this file. Store them in Supabase KV
// under `ld:l101:materials` and fetch at runtime, the same way
// the Worker reads its secrets. The placeholders below are
// intentionally blank.
//
// WK2 (Conflict & Coaching) and WK3 (Food Safety) are IN PERSON.
// Per Bri (Jul 10): the standalone "Student Workbook" rows were
// removed; the workbook link now lives on the class entry itself
// (paste it into that module's Admin box). The workbook replaces
// the online class for those two weeks.
//
// Two-key access, per spec:
//   1. Personal PIN  → proves identity (passed in as `user`)
//   2. Class PIN     → set + rotated by Bri (KV: ld:l101:pin)
//
// KV wiring:
//   ld:l101:pin · ld:l101:open · ld:l101:prepwork
//   ld:l101:materials · ld:l101:progress:{personId}
// ============================================================

const C = {
  ink: "#171C26",
  sub: "#5B6472",
  paper: "#F4F6F8",
  card: "#FFFFFF",
  line: "#E3E7EC",
  red: "#DD0031",
  green: "#1E8E5A",
  greenSoft: "#E4F3EC",
  amber: "#C77D0A",
  amberSoft: "#FBF1DF",
  blue: "#1D5FA8",
  blueSoft: "#E6EFF9",
  violet: "#7D2AE8", // Canva
  violetSoft: "#F1E8FD",
};

// ★ ROLE FIRST, NAMES ONLY AS A SAFETY NET (Jul 26).
// A hardcoded list of people is a thing that rots. Kyleeka is leaving
// and sits in FOUR of these lists across the Hub; a new Executive Director
// would sit in none of them and silently have no access until someone edited
// code. Neither failure announces itself.
// The role check is the real gate now. The names stay so nobody currently
// holding access loses it the moment this deploys — but a name list should
// never again be the ONLY way in.
/* ⛔ PLAIN "director" IS DELIBERATELY *NOT* HERE — Bri ruled on this directly,
   Jul 27: "I am good with Matt, Hannah, and I having the all access, but I
   don't want Directors being able to edit (Daisy and Brandon when permissions
   change upon promotion)."

   She anticipated the exact mechanism: the moment Hannah retitles Daisy and
   Brandon from "Assistant Director" to "Director", a role test containing
   "director" would silently hand them edit rights over her classes. It was
   added earlier the same day for that very reason and is now removed.

   ⚠️ THIS NARROWS HER OWN EARLIER RULE ("edit access is role-based so a newly
   promoted Director gets it without a code change") and the narrowing is
   deliberate — she owns the class and changed her mind with the specific people
   in view. Do not "restore" it as a consistency fix.
   ⚠️ The FOH/BOH directors are ops leaders, not instructors on this course.
   That is the distinction being drawn, not a judgement about them. */
/* ★ THE LIST NOW LIVES IN adminRoles.js — TRAINING_ADMIN_ROLES.
   the four training tools share one list. NOTE this list carries `leadership director` and NOT plain `director`.
   ⚠️ ONLY THE DECLARATION MOVED. Every use of LEAD_ROLES below is
   byte-for-byte what it was, including this file's own role normaliser,
   which is NOT the same function in every tile. */
const LEAD_ROLES = new Set(TRAINING_ADMIN_ROLES);
const normRole = (s) => String(s || "").trim().toLowerCase();
/* ★ MOVED TO storeConfig owners.leadershipDev.directors (Aug 11 2026). This
   list was byte-identical to LeadershipDev's NOTES_VISIBLE_TO and to
   LeadershipDevTile's DIRECTORS — three copies of four people in one feature,
   each free to drift. Design rule 8. */

/* ★ BY ROSTER ID AS WELL AS BY NAME AND ROLE (Matt, Jul 27: "directors by ID
   as well as Nick"). A name changes when someone marries and a role string
   changes when HR retitles a seat; the roster id never does. Three ways in, and
   any ONE of them is enough — this list only ever ADDS people.

   ⚠️ THE ROSTER USES TWO ID SHAPES AND THEY MUST BOTH MATCH. `gcfcr-hr-team-v1`
   stores "tm33"; HRConsole's HANDBOOK_EXEMPT stores the bare "33" for the same
   person. Comparing either form literally would silently match nobody, which is
   the house bug class — so the prefix is stripped on both sides before
   comparing rather than assuming one shape.

   Nick (tm37) is included at Matt's instruction. Daisy (tm20) and Brandon
   (tm16) are here deliberately: they are Directors as of 7/24 but their HR
   ROLE still reads "Assistant Director", so the role test alone would keep
   them out of a class they now help lead. */
const normId = (v) => String(v == null ? "" : v).trim().toLowerCase().replace(/^tm/, "");
/* ★ MOVED TO storeConfig owners.leadershipDev.instructorIds. The five ids are
   unchanged, and Bri's exclusion of Daisy (20) and Brandon (16) is recorded
   there in full — the prose that used to sit above this list said they were
   included, which was stale and contradicted the array itself. */

const isInstructor = (u) =>
  LEAD_ROLES.has(normRole(u && u.role))
  || leadershipDevNames("directors").includes(normRole(u && u.name))
  || leadershipDevInstructorIds().includes(normId(u && u.id));

// Demo class PIN. Real value lives in KV, editable by Bri.
const DEMO_CLASS_PIN = "2026";

const TYPE_META = {
  hub: { label: "In the Hub", fg: C.green, bg: C.greenSoft },
  workbook: { label: "Student Workbook", fg: C.red, bg: "#FBE7EC" },
  inperson: { label: "In person", fg: C.blue, bg: C.blueSoft },
};

// url: "" — populate from KV at runtime. Never commit share tokens.
const seedWeeks = [
  {
    n: 1,
    title: "Intro to Leadership",
    modules: [
      { id: "m1", title: "L101: Intro to Leadership", type: "hub", hub: "w1", note: "Runs in the Hub" },
    ],
  },
  /* ★ THE WELCOME CLASS SITS BETWEEN W1 AND W2 WITHOUT RENUMBERING ANYTHING.
     Bri, Jul 26: "a new module/videos between W1 and W2 … kind of like an
     addition class set up similarly to W1 and W4, but labeled differently."

     ⚠️ THE OBVIOUS BUILD — insert it as week 2 and push the rest up — WOULD
     HAVE BEEN DESTRUCTIVE. Everything hangs off the week number: submission
     records (`submit:w4`), saved content (`ld:l101:content:w4`), due dates,
     the hub key, and the `after:` anchor on every prep section Bri has
     written. Renumbering would orphan three students' live progress and
     silently detach her prep work.

     Instead: `n: 1.5` orders it correctly, `key` gives it a storage identity
     of its own, and `label` frees the display from the number. Weeks 1-4 keep
     their numbers, their keys and their records exactly as they are. */
  {
    n: 1.5,
    key: "welcome",
    label: "WELCOME",
    title: "Welcome to Leadership 101",
    modules: [
      { id: "mw", title: "Welcome to Leadership 101", type: "hub", hub: "welcome", note: "Runs in the Hub" },
    ],
  },
  {
    n: 2,
    title: "Conflict & Coaching",
    modules: [
      { id: "m3", title: "L101: Conflict & Coaching", type: "hub", hub: "w2", note: "Runs in the Hub" },
    ],
  },
  {
    n: 3,
    title: "Food Safety",
    modules: [
      { id: "m5", title: "L101: Food Safety", type: "hub", hub: "w3", note: "Runs in the Hub" },
    ],
  },
  {
    n: 4,
    title: "Catering",
    modules: [
      { id: "m6", title: "L101: Catering", type: "hub", hub: "w4", note: "Runs in the Hub" },
    ],
  },
];

// ★ PREP WORK IS SECTIONED NOW (Bri's item 6: "add and delete your own
// prep-work sections between modules"). Shape: [{ id, title, items:[{id,text}] }].
// ⚠️ BACKWARD COMPATIBLE — the stored value may still be the OLD FLAT ARRAY of
// {id,text}. `normalisePrep` lifts that into a single untitled section rather
// than showing her an empty list, and nothing is migrated until she saves.
function normalisePrep(raw) {
  const list = Array.isArray(raw) ? raw : [];
  if (!list.length) return [];
  if (list[0] && Array.isArray(list[0].items)) {
    // ⚠️ EVERY section is repaired, not just the first. The earlier version
    // checked list[0] and returned the array untouched — so one malformed
    // section further down reached `sec.items.map` and threw, which renders as
    // a BLANK WHITE PAGE rather than an error anyone can read.
    /* 🐛 REPAIR, DON'T REBUILD (Bri, Jul 31: "Prep work sections are no longer
       staying anchored... the position is not staying and those sections are
       needing to be reassigned each time."). When the stored value started
       routing through here (Jul 31, the census fix), this map rebuilt each
       section as {id, title, items} ONLY — which silently dropped `after`
       (the anchor) and `files` (her attached handouts). Every load stripped
       the anchors she had just set, and the autosave then wrote the stripped
       shape back over storage. She was right, and re-anchoring could never
       stick. The spread keeps every field a section carries; the three
       repairs below still apply on top. */
    return list.map((sec, i) => ({
      ...(sec && typeof sec === "object" ? sec : {}),
      id: sec && sec.id ? sec.id : `pwsec-${i}`,
      title: sec && typeof sec.title === "string" ? sec.title : "Prep work",
      items: Array.isArray(sec && sec.items) ? sec.items.filter((t) => t && t.id) : [],
    }));
  }
  return [{ id: "pwsec-legacy", title: "Prep work", items: list.filter((t) => t && t.id) }];
}

/* A week's storage identity. Defaults to the old `w<n>` shape so every existing
   record, due date and content key keeps working untouched.
   ⚠️ MODULE LEVEL ON PURPOSE. This lived inside the component, ~320 lines below
   the `courseRows` useMemo that calls it — and a useMemo body runs IMMEDIATELY
   on first render, so it read keyOf inside its temporal dead zone and the tile
   threw "Cannot access 'be' before initialization". A pure function of its
   argument has no reason to be inside the component at all. */
const keyOf = (w) => w.key || `w${w.n}`;

/* ★ A CLASS BRI ADDS HERSELF HAS NO SEED IN CODE, AND STILL HAS TO BE OWNED
   (Bri, Aug 8 2026: "I need the full access to name it… as well as the actual
   'open the class' space to build it. This is not visible.")

   ⚠️⚠️ THIS IS THE HALF THAT KEEPS HER ROSTER WHOLE, AND IT WAS ALREADY BROKEN.
   `PG.seeds` is how Class Progress decides which work belongs to this program,
   and the note on it says so in as many words: a class missing from that map
   "has all of its work counted as orphans, and its students don't appear on the
   roster at all". Every class added through Add a class was missing from it,
   because that map is a code constant and her classes are not in code. So the
   first person to do work in one would have dropped off her roster with nothing
   anywhere saying why.

   ★ AN EMPTY SEED IS THE RIGHT ANSWER, NOT A SPECIAL CASE. `idsForClass` reads
   the STORED content for every class and falls back to the seed only for a
   class nobody has saved yet. A class she has built has stored content; a class
   she has just created has no items to own. Both are correct with `{sections:
   []}`, and no other reader needs to learn about custom classes.

   ⚠️ NEVER OVERWRITES A REAL SEED. w1–w4 and welcome keep theirs — this only
   fills in keys the map has never heard of. */
const EMPTY_SEED = { sections: [] };
const seedsWithCustom = (baseSeeds, ws) => {
  const out = { ...(baseSeeds || {}) };
  (Array.isArray(ws) ? ws : []).forEach((w) => {
    if (!w) return;
    const k = keyOf(w);
    if (k && !out[k]) out[k] = EMPTY_SEED;
  });
  return out;
};

const seedPrepWork = [
  { id: "pw1", text: "Read the Leadership Handbook, cover to cover" },
  { id: "pw3", text: "Bring one example of a conflict you handled on shift" },
];

/* ⛔ `seedStudents` IS DELETED, NOT MOVED, AND MUST NOT COME BACK.
   It held five REAL team members — Jamar, Karla, Katia, Valerie, Ashley — with
   INVENTED completion data. Its only render site was removed when that was
   caught (see the Class Progress roster below, which now says plainly that
   nothing is recorded yet). The array itself stayed behind, unreferenced, and
   went on shipping five of Gate City's people in the bundle every store would
   clone. A fake progress report is bad; a fake progress report about somebody
   else's team is worse. When real tracking lands it reads from
   `ld:l101:progress:{personId}`, not from a literal here. */

function Card({ children, className = "", style = {} }) {
  return (
    <div className={`rounded-xl p-4 ${className}`} style={{ backgroundColor: C.card, border: `1px solid ${C.line}`, ...style }}>
      {children}
    </div>
  );
}

// Weeks that live INSIDE the Hub rather than pointing out to Google Classroom.
// Keyed by the module's `hub` field below. Adding a week here is the whole
// wiring — no route, no tile, no App.jsx change.
/* ⚠️ `sequential={false}` ON BOTH. Bri delivers these live and her order varies
   — Week 3 in particular breaks in the middle for a 20-30 minute mock
   inspection, so items get answered out of order by design. A lock would make
   the tool argue with her in front of a class. Submit-to-complete still
   applies, so completion is recorded; it simply isn't gated.
   ⚠️ W2 and W3 have no module FILE of their own, unlike w1/w4/welcome — they
   are a seed plus three lines, rendered by the shared L101Week. That is the
   pattern to copy for any future class. */
function L101W2Module() {
  return <L101Week weekId="w2" weekLabel="Conflict & Coaching" seed={L101_W2} sequential={false} />;
}
function L101W3Module() {
  return <L101Week weekId="w3" weekLabel="Food Safety" seed={L101_W3} sequential={false} />;
}

const HUB_MODULES = {
  w1: { title: "Intro to Leadership", Component: L101IntroModule },
  w2: { title: "Conflict & Coaching", Component: L101W2Module },
  w3: { title: "Food Safety", Component: L101W3Module },
  w4: { title: "Catering", Component: L101CateringModule },
  welcome: { title: "Welcome to Leadership 101", Component: L101WelcomeModule },
};

// ⚠️ TWO TRAPS FIXED HERE (Jul 25), both live the moment this became reachable
// from Peak Reachers rather than only from Bri's director-only tile:
//
//  1. `user` DEFAULTED TO BRI MOORE. Any caller that didn't pass a user got
//     instructor rights — admin panel, class PIN in plain sight, the lot.
//     Harmless while the only caller was her own tile. Not harmless now.
//     The default is gone; identity is read from the signed-in session, and a
//     caller may still pass `user` explicitly to override it.
//  2. NO `onBack`. Opening the class from the Team Site would have stranded
//     someone with no way out but a browser reload.
function l101Viewer() {
  try {
    const u = JSON.parse(localStorage.getItem("gcfcr-access-user"));
    return u && u.name ? u : null;
  } catch { return null; }
}

/* ── ERROR BOUNDARY ─────────────────────────────────────────────────────────
   Bri, twice: "blank white page." A React component that throws during render
   unmounts its whole tree and leaves nothing on screen — no message, no clue,
   and on an iPad no console to read either. Two rounds of guessing at the cause
   from source have now failed, which is the same way two outages this week ate
   an hour each.
   So the page reports its own fault instead. Anyone hitting it can screenshot
   the message and we know the file and line immediately, rather than reasoning
   about code that looks fine.
   ⚠️ This is a permanent improvement, not scaffolding — leave it in.          */
/* The Leadership 101 program. A second program is an object this shape plus a
   seed per class — see TrainerOrientation.jsx. */
export const L101_PROGRAM = {
  ns: "ld:l101",
  name: "Leadership 101",
  /* ⚠️ EVERY PROGRAM MUST SET `tagline`. The header, the PIN screen, the closed
     notice and the hub back-link all read `name`/`tagline` off the running
     program now. They used to be the literal string "Leadership 101", which is
     correct here and WRONG in every other program sharing this file — Trainer
     Orientation showed "Leadership 101 · Four weeks · complete before entering
     leadership" on its own page and its own PIN screen (Bri, Aug 1 2026). */
  tagline: "Four weeks · complete before entering leadership",
  weeks: seedWeeks,
  prepSeed: seedPrepWork,
  hubModules: HUB_MODULES,
  /* ★ SPLIT PINS ARE AN L101 CONCEPT, NOT A GENERAL ONE. Week 1 gates the
     Trainer application and has its own cohort; Weeks 2-4 are the course
     proper. A program with one audience sets this false and uses one PIN. */
  splitPins: true,
  // Class content used by Class Progress to know which item ids belong where.
  /* ⚠️ EVERY CLASS MUST APPEAR HERE. Class Progress derives item ownership from
     this map — a class missing from it has all of its work counted as orphans,
     and (since Jul 27) its students don't appear on the roster at all. */
  seeds: { w1: INTRO_TO_LEADERSHIP, welcome: WELCOME_SEED, w2: L101_W2, w3: L101_W3, w4: CATERING_W4 },
};
registerProgram(L101_PROGRAM);

class L101Boundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null, info: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { this.setState({ info }); try { console.error("L101 crash:", err, info); } catch {} }
  render() {
    if (!this.state.err) return this.props.children;
    const e = this.state.err;
    const stack = (this.state.info && this.state.info.componentStack) || "";
    return (
      <div style={{ padding: 20, fontFamily: "'Inter', system-ui, sans-serif", color: "#14243D" }}>
        <div style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", ...accentEdge("#DC2626", 3), borderRadius: 12, boxShadow: CARD_3D, padding: 16, maxWidth: 720 }}>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>Leadership 101 hit an error</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 10 }}>
            Nothing you did — the page failed to load. Screenshot this and send it to Matt;
            it says exactly what went wrong.
          </div>
          <div style={{ fontFamily: "monospace", fontSize: 12, background: "#fff", border: "1px solid #FCA5A5",
            borderRadius: 8, padding: 10, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {String((e && e.message) || e)}
            {stack ? "\n" + stack.split("\n").slice(0, 6).join("\n") : ""}
          </div>
        </div>
      </div>
    );
  }
}

/* ═══ COPY CLASS ════════════════════════════════════════════════════════════
   Bri, Aug 10 2026: "May I have a 'Copy Class' option that copies the weeks and
   sections/items already existing in my Leadership 101, Trainer Orientation,
   and the L101 - Store Template?"

   ★ MODULE LEVEL, outside the component that renders it (design rule 7).
   ⚠️ THE RULES ARE IN l101Copy.js. This screen decides nothing about what a
   copy is; it reads, shows her what would change, and writes what she confirms.

   ⚠️ A FAILED READ REFUSES THE WEEK. Twice over, and both matter:
     • On the SOURCE, `kvGetResult` cannot tell "never edited" from "could not
       be read" — the seed renders either way. Copying on a failed read would
       write the code defaults over her real class, which is the exact trap
       useEditableCourse carries a note about.
     • On the TARGET, a failed read means we do not know whether that week
       already holds work. Copying into it might silently replace something.
   Both come back as "could not be read" on the row rather than a silent skip. */
function CopyClass({ PG, weeks, prepWork, onPrep, onClose }) {
  const others = PROGRAM_REGISTRY.filter((p) => p && p.ns !== PG.ns);
  const [fromNs, setFromNs] = useState("");
  const [plan, setPlan] = useState(null);        // null = nothing picked / loading
  const [pick, setPick] = useState({});          // { toKey: true }
  const [withPrep, setWithPrep] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(null);

  const src = others.find((p) => p.ns === fromNs) || null;

  /* Build the plan: for every week that lines up, what is on each side. */
  const build = async (ns) => {
    setFromNs(ns); setPlan(null); setPick({}); setMsg(""); setDone(null);
    const from = others.find((p) => p.ns === ns);
    if (!from) return;
    setBusy(true);
    /* ⚠️ THE LIVE WEEK LISTS, NOT THE CODE CONSTANTS, AND KEYS RESOLVED THROUGH
       `keyOf`. Both halves were bugs found in the real records:
         • Bri has added two classes to the store template, so its stored list is
           seven weeks where L101Template.jsx declares five. Reading PG.weeks
           would have offered her a copy that ignored the classes she built.
         • The live Leadership 101's stored weeks carry `key: null` on 1, 2, 3
           and 4 — the key is derived at render — so reading `w.key` raw would
           have silently skipped most of the class she is copying FROM.
       A failed read falls back to the code list rather than to nothing, which is
       the same precedence the page itself uses to draw the weeks. */
    const srcStored = await kvRead(kvFor(from.ns).weeks);
    const srcWeeks = (Array.isArray(srcStored) && srcStored.length ? srcStored : from.weeks || [])
      .map((w) => ({ ...w, key: keyOf(w) }));
    const dstWeeks = (Array.isArray(weeks) && weeks.length ? weeks : PG.weeks || [])
      .map((w) => ({ ...w, key: keyOf(w) }));
    const { pairs, noHome, noSource, sameRecord } = weekPairs(srcWeeks, dstWeeks);
    const rows = [];
    for (const p of pairs) {
      const [a, b] = await Promise.all([kvReadResult(contentKey(p.fromKey)), kvReadResult(contentKey(p.toKey))]);
      const seed = (from.seeds || {})[p.fromKey] || null;
      const valid = (v) => !!(v && Array.isArray(v.sections) && v.sections.length);
      /* An unreadable source is refused. An unreadable TARGET is refused too —
         "I do not know what is in there" is not "it is empty". */
      const readOk = a.ok && b.ok;
      const source = a.ok ? (valid(a.value) ? a.value : (valid(seed) ? seed : null)) : null;
      const hasAt = b.ok && valid(b.value) ? b.value.sections.length : 0;
      rows.push({ ...p, source, hasAt, readOk,
        why: !readOk ? "could not be read" : !source ? "nothing to copy" : "" });
    }
    /* Ticked by default only where nothing would be lost. Replacing something
       she has already built has to be a thing she reaches for. */
    const start = {};
    rows.forEach((r) => { if (!r.why && r.hasAt === 0) start[r.toKey] = true; });
    setPick(start);
    setPlan({ rows, noHome, noSource, sameRecord, tag: progTag(PG.ns), fromName: from.name });
    setBusy(false);
  };

  const chosen = plan ? plan.rows.filter((r) => !r.why && pick[r.toKey]) : [];

  const run = async () => {
    if (!chosen.length || busy) return;
    setBusy(true); setMsg("");
    let wrote = 0; const failed = [];
    for (const r of chosen) {
      const next = copyWeek(r.source, r.toKey);
      /* copyWeek returns null on any shape it does not recognise. Design rule 1
         — refuse rather than write a week that would open blank. */
      if (!next) { failed.push(`Week ${r.n}`); continue; }
      const okWrite = await kvWrite(contentKey(r.toKey), next);
      if (okWrite === false) failed.push(`Week ${r.n}`); else wrote += 1;
    }
    let prepCount = 0;
    if (withPrep && src) {
      const keep = new Set(chosen.map((r) => String(r.n)));
      const srcPrep = await kvRead(kvFor(src.ns).prepwork);
      /* Her stored prep work if she has any, otherwise whatever that class was
         seeded with. Same precedence the class itself uses. */
      const base = Array.isArray(srcPrep) && srcPrep.length ? srcPrep : (src.prepSeed || []);
      const copied = copyPrep(base, plan.tag, keep);
      if (copied.length) {
        /* ⚠️ HANDED TO THE PAGE, NOT WRITTEN HERE. Leadership101Inner owns the
           prep record and already persists it on change, with its own failed-read
           guard. A second writer is how the two disagree. */
        const keepMine = (Array.isArray(prepWork) ? prepWork : [])
          .filter((s) => !copied.some((c) => c.id === s.id));
        onPrep([...keepMine, ...copied]);
        prepCount = copied.length;
      }
    }
    setBusy(false);
    setDone({ wrote, prepCount, failed });
    if (failed.length) setMsg(`These did not save: ${failed.join(", ")}. Nothing else was affected.`);
  };

  const box = { border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 12px", marginBottom: 8, backgroundColor: C.card };

  return (
    <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${C.line}` }}>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <span className="text-sm font-bold" style={{ color: C.ink }}>Copy a class into this one</span>
        <button onClick={onClose} className="text-xs font-semibold px-3 py-1.5 rounded-lg"
          style={{ color: C.sub, border: `1px solid ${C.line}` }}>Close</button>
      </div>
      <p className="text-xs mb-3" style={{ color: C.sub, lineHeight: 1.5 }}>
        This fills <b>{PG.name}</b> with the weeks, sections and items from another class.
        Everything copied gets a new id, so nobody&rsquo;s completed work follows it across.
        What never copies: {COPY_EXCLUDES.join(", ")}.
      </p>

      {others.length === 0 ? (
        <p className="text-xs" style={{ color: C.sub }}>There is no other class to copy from.</p>
      ) : (
        <select value={fromNs} onChange={(e) => build(e.target.value)}
          className="text-sm px-3 py-2 rounded-lg mb-3" style={{ border: `1px solid ${C.line}`, backgroundColor: C.card }}>
          <option value="">Copy from&hellip;</option>
          {others.map((p) => <option key={p.ns} value={p.ns}>{p.name}</option>)}
        </select>
      )}

      {busy && !plan && <p className="text-xs" style={{ color: C.sub }}>Reading that class&hellip;</p>}

      {plan && (
        <>
          {plan.rows.map((r) => (
            <label key={r.toKey} style={{ ...box, display: "flex", gap: 10, alignItems: "flex-start",
              cursor: r.why ? "default" : "pointer", opacity: r.why ? 0.55 : 1 }}>
              <input type="checkbox" disabled={!!r.why} checked={!!pick[r.toKey]}
                onChange={(e) => { const v = e.target.checked; setPick((d) => ({ ...d, [r.toKey]: v })); }}
                style={{ marginTop: 3 }} />
              <span className="text-sm" style={{ color: C.ink }}>
                <b>Week {r.n}</b> {r.title && <span style={{ color: C.sub }}>· {r.title}</span>}
                <span className="block text-xs" style={{ color: r.why ? C.red : r.hasAt ? "#B7791F" : C.sub, marginTop: 2 }}>
                  {r.why ? r.why
                    : r.hasAt ? `This week already has ${r.hasAt} section${r.hasAt === 1 ? "" : "s"}. Copying replaces them.`
                    : "Empty. Nothing to lose."}
                </span>
              </span>
            </label>
          ))}

          {plan.noHome.length > 0 && (
            <p className="text-xs mb-2" style={{ color: "#B7791F" }}>
              No home here for Week {plan.noHome.map((w) => w.n).join(", ")}. {PG.name} has no week with that number,
              so {plan.noHome.length === 1 ? "it stays" : "they stay"} behind.
            </p>
          )}
          {plan.sameRecord.length > 0 && (
            <p className="text-xs mb-2" style={{ color: C.red }}>
              Week {plan.sameRecord.map((w) => w.n).join(", ")} in both classes points at the same saved
              record, so copying would write over the original. Skipped.
            </p>
          )}

          <label className="text-sm flex items-center gap-2 mb-3" style={{ color: C.ink }}>
            <input type="checkbox" checked={withPrep} onChange={(e) => setWithPrep(e.target.checked)} />
            <span>Copy the prep work sections too</span>
          </label>

          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={run} disabled={busy || chosen.length === 0}
              className="text-sm font-semibold px-4 py-2 rounded-lg"
              style={{ color: "#fff", backgroundColor: chosen.length ? C.blue : C.sub, opacity: busy ? 0.6 : 1 }}>
              {busy ? "Copying…" : `Copy ${chosen.length} week${chosen.length === 1 ? "" : "s"}`}
            </button>
            {chosen.some((r) => r.hasAt > 0) && (
              <span className="text-xs" style={{ color: "#B7791F" }}>
                {chosen.filter((r) => r.hasAt > 0).length} of these replaces work already here.
              </span>
            )}
          </div>
        </>
      )}

      {msg && <p className="text-xs mt-3" style={{ color: C.red }}>{msg}</p>}
      {done && !msg && (
        <p className="text-xs mt-3" style={{ color: C.green }}>
          Copied {done.wrote} week{done.wrote === 1 ? "" : "s"}
          {done.prepCount ? ` and ${done.prepCount} prep section${done.prepCount === 1 ? "" : "s"}` : ""}.
          Open a week to see it.
        </p>
      )}
    </div>
  );
}

export default function Leadership101(props) {
  return <L101Boundary><Leadership101Inner {...props} /></L101Boundary>;
}

function Leadership101Inner({ user, embedded = false, onBack, program = L101_PROGRAM }) {
  // ⚠️ Defaults to L101 so every existing caller — PeakReachers, the LD tile, the
  // Professional Growth step — keeps working with no change at all.
  const PG = program || L101_PROGRAM;
  const KV = kvFor(PG.ns);
  /* A failed read blocks the writer, the same rule prepwork, the survey and the
     dues already follow here. Without it, one edit after an unreadable read would
     save the CODE defaults over whatever Bri had actually built. */
  const weeksOk = useRef(true);
  // Signed-in person wins; an explicit prop overrides; nobody signed in is
  // NOT an instructor.
  const viewer = user || l101Viewer() || { id: "", name: "" };
  const instructor = isInstructor(viewer);

  const [pinEntry, setPinEntry] = useState("");
  /* ★ AN INSTRUCTOR IS NEVER LOCKED OUT OF THEIR OWN CLASS (Bri, Jul 27:
     "I'm concerned that I might forget the entrance PINs or misplace that info
     and get locked out of my own classes as the admin because these PINs will
     likely change every so often").

     She is right, and it gets worse with two programs and rotating PINs. The
     class PIN exists to control who ENROLS — it was never meant to stand
     between the person who wrote the class and their own content.

     ⚠️ WHY THIS AND NOT "ACCEPT HER PERSONAL PIN AT THE CLASS GATE", WHICH IS
     WHAT SHE PROPOSED: verifying a personal PIN means calling /api/pin-verify,
     which is rate-limited at 8 failures per IP with a 15-minute lockout. Every
     student mistyping the CLASS pin on store wifi would spend that shared
     allowance, and a locked-out IP means nobody can sign in to the Hub at all.
     Being signed in already proves she typed her personal PIN, so the identity
     the endpoint would return is the identity we already have. */
  /* ★ A PROGRAM MAY OPEN ITSELF TO A ROLE (Bri, Jul 27: "Trainer role being
     the access point for the Trainer Orientation class. Once their role is
     adjusted to Trainer, they can access automatically without a pin").
     ⚠️ LEADERSHIP 101 DELIBERATELY HAS NO `autoRoles` — same message, first
     line: "keep the pins only in place for Leadership 101 with no additional
     gates." Two programs, two different rules, on purpose. Do not add one to
     L101 for symmetry.
     ⚠️ The PIN still works alongside this. She said she likes having one, and
     it is what lets her admit somebody whose role has not caught up yet. */
  const autoOpen = (u) => {
    const roles = (program && program.autoRoles) || [];
    if (!roles.length) return false;
    return roles.map(normRole).includes(normRole(u && u.role));
  };
  const [unlocked, setUnlocked] = useState(() => {
    const v = user || l101Viewer() || {};
    return isInstructor(v) || autoOpen(v);
  });
  const [pinError, setPinError] = useState(false);

  const [classOpen, setClassOpen] = useState(true);
  const [weeks, setWeeks] = useState(PG.weeks);
  const [prepWork, setPrepWork] = useState(() => normalisePrep(PG.prepSeed));
  /* Survey config: { title, blurb, questions:[{id,text}], openAt, closeAt,
     manual }. `manual` is null by default so the dates govern until Bri
     deliberately forces it one way. */
  const [survey, setSurvey] = useState({ questions: [], manual: null });
  const [newPrep, setNewPrep] = useState({});     // per-section draft text
  const [newSection, setNewSection] = useState({});   // per-week draft title
  // ★ PER-STUDENT NOW, not local state (Bri's item 4). Prep completion and
  // uploads live in the same record as the rest of their work, so her roster
  // view shows them alongside quizzes and answers.
  const P = useProgress();
  const [busyUpload, setBusyUpload] = useState("");
  const [dues, setDues] = useState({});
  /* Which weeks are in-person, and their timeframe. `true` = in person with no
     time set yet; a string = the timeframe Bri typed. Stored beside the dates
     because it changes what the SAME date means, and splitting them would let
     the two drift into a week that is both in-person and overdue. */
  const [inPerson, setInPersonMap] = useState({});
  /* 🐛 Bri, Jul 26: "it still appears that students can manually check off the
     classes as complete on their main page. I'd like this to be only automatic
     when submitted."

     What was here: `useState(["m1"])` — a LOCAL array, never read from storage
     and never written to it, seeded with one module already ticked. So the
     checkboxes on this page did three wrong things at once: they let a student
     mark work complete (against her submit-to-complete rule), they saved
     nothing, and they showed every single person the first module of Week 1
     pre-completed. Her roster never saw any of it — real progress lives in
     `ld:l101:progress:<personId>` via P.

     ⇒ This page now REFLECTS completion rather than accepting it. A week's
     modules read as done when that week has actually been submitted — the same
     `submit:w<n>` record her roster reads. There is no student-facing
     completion control left anywhere. */
  const [showRoster, setShowRoster] = useState(false);
  /* ★ COMPLETED IN-PERSON CLASSES (Bri, Jul 31: "I want to view 'Completed
     In-Person Classes' somewhere to see when class was completed, who the
     instructor assigned was, and the instructor notes they completed.")
     Sessions are recorded by the Class Complete button in the week view
     (l101Instructors.js); this is the one place that lists them. Only rendered
     for a program that actually has in-person weeks. */
  const [showSessions, setShowSessions] = useState(false);
  const [sessions, setSessions] = useState(null);          // null = not loaded
  const [sessionsFailed, setSessionsFailed] = useState(false);
  const [assignsView, setAssignsView] = useState(null);    // { [weekId]: [people] }
  /* ⚠️ FROM THE REAL WEEK LIST, NOT `PG.seeds`. Seeds are the weeks that ship
     in code; a week Bri added or copied exists only in the stored list, so
     asking the seeds meant her own classes could never qualify — which is the
     whole of what she reported. One list, used by the print buttons and the
     assigned-instructors panel below, so the two can never disagree about which
     classes have instructors. */
  const instructorWeeks = (weeks || [])
    .filter((w) => weekHasInstructors(keyOf(w), PG.ns))
    .map((w) => ({ id: keyOf(w), title: w.title || keyOf(w), label: w.label || `WK ${w.n}` }));
  const hasInPerson = instructorWeeks.length > 0;
  /* Printable copy of an in-person week (Bri: "spotty internet… someone simply
     doesn't have a device"). null = not printing. Held here rather than inside
     the print view so switching Instructor/Student keeps your place. */
  const [printing, setPrinting] = useState(null);   // { weekId, variant } | null

  /* ── PREP WORK IN SPANISH ──────────────────────────────────────────────
     Bri, Aug 3 2026: "I'd also like the option for prep work sections to be
     translated if someone needs it." The class toggle only ever reached the
     week content; prep work is a different shape in a different file.

     ⚠️ ENGLISH REMAINS THE ONLY THING SAVED. `prepWork` is what every editor
     writes and what the autosave persists. Only what is RENDERED swaps, so a
     translation can never be written back over her real wording. */
  const [prepLang, setPrepLang] = useState("en");
  const [prepEs, setPrepEs] = useState(null);
  const [prepEsState, setPrepEsState] = useState("");   // "" | "loading" | "failed"

  useEffect(() => {
    if (prepLang !== "es" || !Array.isArray(prepWork) || !prepWork.length) return undefined;
    let alive = true;
    setPrepEs(null); setPrepEsState("loading");
    (async () => {
      try {
        const texts = collectPrepStrings(prepWork);
        if (!texts.length) { if (alive) { setPrepEsState(""); } return; }
        const r = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-hub-token": store.hubToken() },
          body: JSON.stringify({ lang: "es", texts }),
        });
        const d = await r.json().catch(() => null);
        if (!alive) return;
        if (!r.ok || !d || d.ok !== true) { setPrepEsState("failed"); return; }
        const built = applyPrepStrings(prepWork, d.texts);
        if (!built) { setPrepEsState("failed"); return; }
        setPrepEs(built); setPrepEsState("");
      } catch { if (alive) setPrepEsState("failed"); }
    })();
    return () => { alive = false; };
  }, [prepLang, prepWork]);

  const prepShown = prepLang === "es" && prepEs ? prepEs : prepWork;
  useEffect(() => {
    if (!showSessions || sessions !== null) return;
    let live = true;
    (async () => {
      const [s, a] = await Promise.all([loadSessions(), loadAssignments()]);
      if (!live) return;
      setSessions(s.list);
      setSessionsFailed(!s.ok);
      setAssignsView(a.ok ? a.map : {});
    })();
    return () => { live = false; };
  }, [showSessions, sessions]);
  // Real per-student progress. Loaded ONLY when Bri opens the roster — this is
  // one storage read per person on the roster, and nobody should pay that on
  // every page load just in case.
  const [roster, setRoster] = useState(null);   // null = not loaded yet
  // Which student's work is expanded. Bri asked for "some kind of dropdown to
  // view each individual's answers/scores/assignments, with the option to hide
  // if I don't want the clutter" — so one at a time, collapsed by default.
  const [openStudent, setOpenStudent] = useState(null);
  const [openClass, setOpenClass] = useState(null);   // "<studentId>|<classKey>"
  const [hidden, setHidden] = useState([]);
  const [showHidden, setShowHidden] = useState(false);
  // Bri's own view preference for the grouped tick counts. Touches no record.
  const [countsHidden, setCountsHiddenState] = useState(false);
  /* ★ COLLAPSIBLE BLOCKS (Matt, Aug 12 2026: "I want the LD sections to be
     collapsible. It's too much to take in when opening up and for a new store
     they will skip it").

     Counted against the real courses before building rather than guessed at:
     Bri's live L101 is ELEVEN stacked blocks (6 classes, 5 prep sections, 16
     tasks), and the TEMPLATE a new store opens is THIRTEEN. Nobody scrolls
     thirteen full-height blocks to decide whether they want the course, which is
     the second half of what Matt said.

     ⚠️⚠️ INSTRUCTORS ONLY, AND THAT IS THE LOAD-BEARING DECISION. `blockOpen`
     returns true for everyone who is not an instructor, so the student page
     renders exactly as it did today, byte for byte. The prep sections were moved
     INTO the module flow on purpose — this file's own comment says "so a student
     reads top to bottom through the whole course" — and putting a live cohort's
     homework behind a tap would undo that mid-course. Bri has students in Week 2
     right now. Their screen is not the thing Matt was complaining about.

     ⚠️ CLOSED IS UNMOUNTED, AND THAT IS SAFE HERE BECAUSE IT WAS CHECKED. Every
     editor in these blocks writes to state on CHANGE, not on save —
     renameSection, editTask, setWeekTitle, setWeekLabel all call their setter
     from onChange — so closing a block cannot lose a keystroke. The one piece of
     per-block scratch text, the "Add a task" box, lives in `newPrep` keyed by
     section id, which is component state and outlives the block being closed.

     ⚠️ NOTHING CLOSES ITSELF. A block opens and closes when a person taps its
     header and at no other time. A block that collapsed as a side effect of
     saving or reordering would read as work disappearing.

     ⚠️ A VIEW PREFERENCE, NOT DATA. Nothing here is written to KV, to the course
     or to anybody's progress, and it is deliberately NOT remembered between
     visits — that would mean a new stored shape and a read on every page load to
     save one tap. If Matt wants it remembered, that is its own later change. */
  const [openBlocks, setOpenBlocks] = useState({});
  /* ⚠️ A BLOCK IS IDENTIFIED BY WHAT IT IS, NEVER BY WHERE IT SITS. A class is
     keyed by keyOf(w) — the same identity its content, its due date and every
     student's progress record already use — and a prep section by its own id.
     Keying by index would mean reordering a class, or moving a prep section to
     another week, silently opens or closes a different block. That is the exact
     shape of the stored-index bug L101Week's comment warns about, and it is just
     as wrong for a view as it is for an answer key. */
  const blockOpen = (id) => !instructor || !!openBlocks[id];
  const toggleBlock = (id) => setOpenBlocks((d) => ({ ...d, [id]: !d[id] }));
  /* Open all / Close all. Built from the CURRENT course each time it is tapped,
     so a class added a moment ago is included without anything having to keep a
     second list in step. */
  const openEveryBlock = () => {
    const next = {};
    for (const w of (weeks || [])) next[`wk:${keyOf(w)}`] = true;
    for (const s of (prepWork || [])) next[`sec:${s.id}`] = true;
    setOpenBlocks(next);
  };
  const closeEveryBlock = () => setOpenBlocks({});
  const anyBlockOpen = Object.values(openBlocks).some(Boolean);
  /* People Bri is finished with. Off the roster AND off the removed-from-view
     list. Their record is untouched — see the note in L101Progress.jsx. */
  const [cleared, setCleared] = useState([]);
  const [content, setContent] = useState(null);       // { classKey: [itemId] }
  // Item ids belonging to a sibling program's classes. Never displayed here —
  // only used to keep them out of this program's orphan list.
  const [foreign, setForeign] = useState(null);
  const [busyMark, setBusyMark] = useState("");

  /* ★ WHICH ITEMS BELONG TO WHICH CLASS.
     A progress record is one flat map of item ids and says nothing about class
     membership, so the ids have to come from the CONTENT. Stored content wins
     (Bri's own edits); the code seed is the fallback for a class she has never
     saved. ⚠️ The tempting shortcut — grouping on an "w1-" prefix — silently
     drops every item she adds through the editor, since those get ids like
     `it-1785…` with no class prefix at all. */
  /* Custom classes folded in — see seedsWithCustom. Without this, work done in
     a class Bri added counts as an orphan and its students vanish off her
     roster. Plain object, no useMemo: it is read inside an effect that does not
     list it as a dependency, so a fresh identity each render costs nothing. */
  const SEEDS = seedsWithCustom(PG.seeds, weeks);
  // Stored content wins over the seed for ANY class, in this program or another
  // — one reader so the two can never diverge.
  const idsForClass = async (k, seed) => {
    let course = seed;
    try {
      const saved = await store.kvGet(`ld:l101:content:${k}`);
      if (saved && Array.isArray(saved.sections) && saved.sections.length) course = saved;
    } catch { /* seed stands */ }
    return ((course && course.sections) || []).flatMap((sec) => (sec.items || []).map((it) => it.id));
  };
  useEffect(() => {
    if (!showRoster || content !== null) return;
    let live = true;
    (async () => {
      const out = {};
      for (const [k, seed] of Object.entries(SEEDS)) out[k] = await idsForClass(k, seed);
      /* ★ EVERY ITEM ID OWNED BY A *DIFFERENT* PROGRAM. Not to display — to
         exclude from this program's orphan list. Prep work is namespaced per
         program, so a sibling's prep tasks have to be read from its own key. */
      const fset = new Set();
      for (const other of PROGRAM_REGISTRY) {
        if (!other || other.ns === PG.ns) continue;
        /* ⚠️ A SIBLING'S CUSTOM CLASSES COUNT TOO. `other.seeds` is that
           program's code constant, so a class Bri added over there is missing
           from it for exactly the reason it was missing here — and an item this
           program cannot attribute is an item it calls an orphan. Its saved
           week list is the only place those classes exist, so it is read the
           same way its prep work is, one line down. Falls back to the program's
           seed weeks when nothing is stored. */
        let otherWeeks = null;
        try { otherWeeks = await kvRead(kvFor(other.ns).weeks); } catch { otherWeeks = null; }
        const otherSeeds = seedsWithCustom(
          other.seeds,
          Array.isArray(otherWeeks) ? otherWeeks : other.weeks,
        );
        for (const [k, seed] of Object.entries(otherSeeds)) {
          (await idsForClass(k, seed)).forEach((id) => fset.add(id));
        }
        try {
          const prep = await kvRead(kvFor(other.ns).prepwork);
          if (Array.isArray(prep)) prep.forEach((sec) => (sec.items || []).forEach((t) => fset.add(`pw:${t.id}`)));
        } catch { /* a sibling's prep is optional context, never a failure */ }
      }
      if (live) { setForeign(fset); setContent(out); }
    })();
    return () => { live = false; };
  }, [showRoster, content]);

  useEffect(() => {
    if (!showRoster) return;
    let live = true;
    (async () => { const h = await loadHidden(KV.progressHidden); if (live) setHidden(h); })();
    // Same gate and same lifetime as the hidden list — one preference, read when
    // the roster opens rather than at mount, so it cannot fetch before Bri is in.
    (async () => { const c = await loadCountsHidden(); if (live) setCountsHiddenState(c); })();
    (async () => { const c = await loadCleared(KV.progressCleared); if (live) setCleared(c); })();
    return () => { live = false; };
  }, [showRoster]);

  /* The course in the order it is actually taken: each class, with any prep
     work anchored after it sitting in its own row underneath. Same ordering the
     students see, so her roster reads like the course rather than like storage. */
  const courseRows = useMemo(() => {
    const rows = [];
    for (const w of weeks) {
      const key = keyOf(w);
      /* `week` carries the week NUMBER through to the roster so the tick counts
         can be grouped (Bri, Jul 29: a total for W2-W4 and a separate one for
         W5/W6). Prep work inherits the week it sits after, because that is
         where it belongs in the course and where she counts it. */
      rows.push({ key, label: w.label ? w.title : `Week ${w.n} · ${w.title}`,
        kind: "class", week: Number(w.n) || null, itemIds: (content && content[key]) || [] });
      for (const sec of (prepWork || []).filter((x) => String(x.after) === String(w.n))) {
        rows.push({ key: `prep:${sec.id}`, label: sec.title || "Prep work", kind: "prep",
          week: Number(w.n) || null, itemIds: (sec.items || []).map((t) => `pw:${t.id}`) });
      }
    }
    return rows;
  }, [weeks, prepWork, content]);

  /* ★ WHOSE ROW THIS PROGRAM DRAWS (Jul 27 — Bri: "this needs to be a fresh
     view for only those signed into the orientation").
     The roster used to filter on `summarise().started`, which is true if the
     person has recorded ANYTHING in their shared record — so everyone who had
     ever opened Leadership 101 appeared in Trainer Orientation's roster with
     nothing of their own to show.
     ⚠️ FILTERED AT RENDER, NOT IN THE LOAD EFFECT. `courseRows` is empty until
     the class content arrives; filtering during the fetch would have written an
     empty roster once and never recomputed, and "nobody has started" is a
     believable-looking wrong answer. */
  const visibleRoster = useMemo(
    () => (roster || [])
      .filter((r) => !hidden.includes(String(r.id)))
      .filter((r) => !cleared.includes(String(r.id)))
      .filter((r) => hasProgramWork(r.rec, courseRows)),
    [roster, hidden, cleared, courseRows]
  );

  const markClass = async (studentId, row, done) => {
    setBusyMark(`${studentId}|${row.key}`);
    await overrideWeekComplete(studentId, row.key, row.label, viewer.name || "", done);
    setBusyMark("");
    setRoster(null);   // force a re-read so the row reflects what was written
  };
  useEffect(() => {
    if (!showRoster || roster !== null) return;
    let live = true;
    (async () => {
      try {
        const team = await loadHRTeam();
        const people = (team || []).map((m) => ({ id: String(m.id), name: m.name }));
        const all = await loadAllProgress(people);
        // Only people who have actually started appear. A list of 100 names at
        // 0% is noise; the ones who've begun are the ones she's looking for.
        const rows = people
          .map((pp) => ({ ...pp, s: summarise(all[pp.id], 0), rec: all[pp.id] }))
          .filter((r) => r.s.started);
        if (live) setRoster(rows);
      } catch { if (live) setRoster([]); }
    })();
    return () => { live = false; };
  }, [showRoster, roster]);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showCopy, setShowCopy] = useState(false);   // Bri's Copy Class panel
  const [openHub, setOpenHub] = useState(null); // which in-Hub week is open

  // Admin-editable values, hydrated from KV on mount
  const [classPin, setClassPin] = useState(DEMO_CLASS_PIN);
  // ★ SPLIT PINS (Bri's item 7): "one opening W1 only with W2-4 prep greyed out,
  // another opening W2-4."
  // The original single PIN is KEPT and still opens everything — deploying this
  // must not lock out anyone already holding it, and Bri may not want two.
  // Blank means "not in use", so the split is opt-in.
  const [pinW1, setPinW1] = useState("");
  const [pinRest, setPinRest] = useState("");
  // Which weeks this person's PIN opened: "all" | "w1" | "rest".
  const [scope, setScope] = useState("all");
  const [materials, setMaterials] = useState({}); // { moduleId: url }
  const [saveState, setSaveState] = useState(""); // "", "saving", "saved", "error"
  const [loaded, setLoaded] = useState(false);
  // ⚠️ ok:false on either ref = that record's read FAILED. `loaded` guards the
  // hydration RACE; these guard the failed READ, which `loaded` cannot see —
  // the effect below fires the moment `loaded` flips, and on a dropped read
  // that wrote the SEED over Bri's real prep work with no user action at all.
  const prepOk = useRef(true);
  const survOk = useRef(true);
  const ipOk = useRef(true);
  const survFirst = useRef(true);
  /* ⚠️ NOT the same thing as prepOk. That one means "the read succeeded";
     this one means "the first run after hydration is the stored value coming
     back, not an edit". Without it the autosave below fires the instant
     `loaded` flips and writes the record straight back exactly as read — the
     same pattern TeamGoals guards with `first.current`. Harmless to the data,
     but it is most of why `ld:l101:prepwork` sat near the top of the
     untokened-write census: a save per open, by every viewer, forever. */
  const prepFirst = useRef(true);
  const duesOk = useRef(true);
  // Pins, open flag and materials — the five records the admin panel saves.
  const cfgOk = useRef(true);

  // 🐛🐛 THIS EFFECT CAUSED BRI'S BLANK WHITE PAGE (Jul 25) AND MUST STAY BELOW
  // `loaded`. It was originally placed ~45 lines ABOVE that declaration. A
  // dependency array is evaluated IMMEDIATELY on every render, so `[prepWork,
  // loaded]` read `loaded` while it was still in its temporal dead zone →
  // "Cannot access 'I' before initialization" → the whole component threw and
  // rendered nothing at all.
  // ⚠️ NEITHER `tsc` NOR THE HOOK-ORDER CHECK CAN SEE THIS — it is valid syntax
  // and the hook order is fine. Only running it finds it. When adding a hook,
  // put it BELOW every state it names.
  //
  // What it does: prep-work edits were NEVER SAVED before this. `addPrep` and
  // the delete button only touched local state, so Bri could add a task, reload
  // and find it gone. Persisted in one place rather than five handlers.
  // Guarded on `loaded` so the first render can't overwrite stored sections
  // with the seed before hydration lands.
  useEffect(() => {
    if (!loaded || !prepOk.current) return;
    if (prepFirst.current) { prepFirst.current = false; return; }
    kvWrite(KV.prepwork, prepWork).catch(() => {});
  }, [prepWork, loaded]);

  /* Survey autosave, same shape and the same guards as prepwork above. */
  useEffect(() => {
    if (!loaded || !survOk.current) return;
    if (survFirst.current) { survFirst.current = false; return; }
    kvWrite(KV.survey, survey).catch(() => {});
    /* ⚠️ [survey], not [prepWork]. This was copied from the effect above and
       the dependency came with it — the survey would then only have saved when
       somebody happened to edit a prep section, and Bri's questions would have
       vanished on reload with nothing to explain why. */
  }, [survey, loaded]);

  // Hydrate admin config from KV (falls back to demo values)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        /* EVERY config record loads result-style now. The pins were the last
           blind reads here: on a failed read classPin stayed on the DEMO pin,
           and pressing Save on the PIN panel wrote the demo over the real
           class PIN — locking out every student holding the real one. Same
           shape for the materials map (one save would wipe every link). */
        const [pinR, openR, matsR, prepR, p1R, prR, duesR, survR, ipR, wkR] = await Promise.all([
          kvReadResult(KV.pin), kvReadResult(KV.open), kvReadResult(KV.materials), kvReadResult(KV.prepwork),
          kvReadResult(KV.pinW1), kvReadResult(KV.pinRest), kvReadResult(KV_DUE_SHARED), kvReadResult(KV.survey), kvReadResult(KV_INPERSON_SHARED), kvReadResult(KV.weeks),
        ]);
        if (!alive) return;
        // A failed read must block that record's writer, or seed replaces
        // real work. cfgOk covers the five records the admin panel saves.
        prepOk.current = prepR.ok;
        /* Same rule as prepwork: a FAILED read blocks the writer, or the empty
           default would be saved over Bri's real questions on her next edit. */
        survOk.current = survR.ok;
        if (survR.ok && survR.value && typeof survR.value === "object") {
          setSurvey({ questions: [], manual: null, ...survR.value });
        }
        duesOk.current = duesR.ok;
        cfgOk.current = pinR.ok && p1R.ok && prR.ok && openR.ok && matsR.ok;
        const pin = pinR.value, open = openR.value, mats = matsR.value,
          p1 = p1R.value, pr = prR.value;
        const prep = prepR.value, dueMap = duesR.value;
        if (pin) setClassPin(String(pin));
        if (p1) setPinW1(String(p1));
        if (pr) setPinRest(String(pr));
        if (typeof open === "boolean") setClassOpen(open);
        /* ⚠️ STRUCTURE FIRST, LINKS SECOND. The materials merge below maps a url
           onto a module BY ID, so the stored structure has to be in state before
           it runs or the links land on the code defaults and are then replaced. */
        weeksOk.current = wkR.ok;
        if (wkR.ok && Array.isArray(wkR.value) && wkR.value.length) {
          setWeeks(wkR.value.map((w) => ({ ...w, modules: Array.isArray(w.modules) ? w.modules : [] })));
        }
        if (mats && typeof mats === "object") {
          setMaterials(mats);
          setWeeks((ws) => ws.map((w) => ({
            ...w,
            modules: w.modules.map((m) => (mats[m.id] ? { ...m, url: mats[m.id] } : m)),
          })));
        }
        // Through normalisePrep like the SEED — the stored value used to set
        // raw, bypassing the exact repair whose comment says it prevents a
        // blank page (census note, Jul 31). Same repair on both paths now.
        if (Array.isArray(prep)) setPrepWork(normalisePrep(prep));
        if (dueMap && typeof dueMap === "object") setDues(dueMap);
        /* A failed read blocks the writer, same rule as prepwork and the survey
           — otherwise the empty default saves over Bri's real class times. */
        ipOk.current = ipR.ok;
        if (ipR.ok && ipR.value && typeof ipR.value === "object") setInPersonMap(ipR.value);
      } catch {} finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  const saveConfig = async (partial) => {
    setSaveState("saving");
    try {
      /* kvWrite passes kvSet's boolean through and kvSet never throws — the
         catch below could not fire on a refused write, so "error" had never
         once shown (and saveState was not rendered anywhere either; it is
         now, next to the Save button). */
      let ok = true;
      const w = async (k, v) => { if ((await kvWrite(k, v)) === false) ok = false; };
      // The five panel records refuse while their reads never succeeded —
      // saving then would write the demo PIN / empty maps over the real ones.
      const cfgWritable = cfgOk.current;
      if (partial.pin !== undefined) { if (cfgWritable) await w(KV.pin, partial.pin); else ok = false; }
      if (partial.pinW1 !== undefined) { if (cfgWritable) await w(KV.pinW1, partial.pinW1); else ok = false; }
      if (partial.pinRest !== undefined) { if (cfgWritable) await w(KV.pinRest, partial.pinRest); else ok = false; }
      if (partial.open !== undefined) { if (cfgWritable) await w(KV.open, partial.open); else ok = false; }
      if (partial.materials !== undefined) { if (cfgWritable) await w(KV.materials, partial.materials); else ok = false; }
      if (partial.prepwork !== undefined) { if (prepOk.current) await w(KV.prepwork, partial.prepwork); else ok = false; }
      if (partial.dues !== undefined) { if (duesOk.current) await w(KV_DUE_SHARED, partial.dues); else ok = false; }
      if (partial.inPerson !== undefined) { if (ipOk.current) await w(KV_INPERSON_SHARED, partial.inPerson); else ok = false; }
      setSaveState(ok ? "saved" : "error");
      if (ok) setTimeout(() => setSaveState(""), 2000);
    } catch {
      setSaveState("error");
    }
  };

  const setMaterialLink = (moduleId, url) => {
    const next = { ...materials, [moduleId]: url };
    setMaterials(next);
    setWeeks((ws) => ws.map((w) => ({
      ...w,
      modules: w.modules.map((m) => (m.id === moduleId ? { ...m, url } : m)),
    })));
  };

  // A date is stored as plain YYYY-MM-DD and compared against LOCAL today, so a
  // task due today is never already late. Overdue is strictly "before today".
  const setInPerson = (key, val) => {
    const next = { ...inPerson };
    if (val == null || val === false) delete next[key]; else next[key] = val;
    setInPersonMap(next);
    saveConfig({ inPerson: next });
  };
  const setDue = (key, iso) => {
    const next = { ...dues };
    if (iso) next[key] = iso; else delete next[key];
    setDues(next);
    saveConfig({ dues: next });
  };
  const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const dueLabel = (iso) => {
    if (!iso) return null;
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };
  const isOverdue = (iso) => !!iso && iso < todayIso();

  const allModules = useMemo(() => weeks.flatMap((w) => w.modules), [weeks]);

  // ★ Prep sections render INSIDE the module flow now, directly beneath the week
  // they follow (Bri's `after: n`). Identical JSX to the old standalone block —
  // it is simply CALLED from the weeks map instead of living in a section of its
  // own, so a student reads top to bottom through the whole course.
  // A plain function, not a hook, and it sits below every hook above.
  const renderPrepSection = (sec) => {
    const blockId = `sec:${sec.id}`;
    const shown = blockOpen(blockId);
    const taskN = (sec.items || []).length;
    return (
    <Card key={sec.id} style={{ borderLeft: `3px solid ${C.red}`, borderTop: `3px solid ${C.red}` }}>
      <div className="flex items-center gap-2 flex-wrap mb-1">
        {/* ★ THE WHOLE EYEBROW IS THE CONTROL, not a small chevron parked beside
            it. This is opened on a shared store iPad and a 12px target is a
            mis-tap. Instructor only — a student sees the plain label it has
            always been, in the same place, at the same size. */}
        {instructor ? (
          <button type="button" onClick={() => toggleBlock(blockId)} aria-expanded={shown}
            className="l1-display text-xs font-bold uppercase tracking-widest flex items-center gap-1.5"
            style={{ color: C.sub, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
            <span style={{ width: 10, display: "inline-block" }}>{shown ? "▾" : "▸"}</span>
            Prep work
          </button>
        ) : (
          <div className="l1-display text-xs font-bold uppercase tracking-widest" style={{ color: C.sub }}>
            Prep work
          </div>
        )}
        {/* ⚠️ A CLOSED BLOCK STILL SAYS WHAT IS IN IT. Thirteen identical
            "PREP WORK" headers would be a worse page than the long one, not a
            better one — the whole point is to skim the course, and skimming
            needs the name and the size. */}
        {!shown && (
          <span className="text-xs" style={{ color: C.sub }}>
            {sec.title || "Untitled"} · {taskN} task{taskN === 1 ? "" : "s"}
          </span>
        )}
        {/* ★ ENGLISH / ESPAÑOL, matching the class toggle (Bri, Aug 3 2026).
            Reading only. Every editor here still writes the English, which is
            the one thing saved — a translation must never be written back over
            her real wording. */}
        {shown && (
          <div className="flex gap-1 ml-auto">
            {[["en", "EN"], ["es", "ES"]].map(([v, label]) => (
              <button key={v} type="button" onClick={() => setPrepLang(v)}
                className="text-[11px] font-bold rounded-full px-2.5 py-0.5"
                style={prepLang === v
                  ? { background: C.blue, color: "#fff", border: `1px solid ${C.blue}` }
                  : { background: "transparent", color: C.sub, border: `1px solid ${C.line}` }}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      {shown && (<>
      {prepLang === "es" && prepEsState === "loading" && (
        <div className="text-xs mb-2" style={{ color: C.sub }}>Traduciendo…</div>
      )}
      {prepLang === "es" && prepEsState === "failed" && (
        <div className="text-xs mb-2" style={{ color: C.red }}>
          No se pudo traducir. Mostrando la versión en inglés.
        </div>
      )}
      {scope === "w1" && (
        <div className="text-xs mb-2" style={{ color: C.sub }}>
          Prep work opens once you're through Week 1.
        </div>
      )}
      <ul className="space-y-2">
                <li key={sec.id} className="mb-4 list-none">
                  <div className="flex items-center gap-2 mb-1">
                    {instructor ? (
                      <input value={sec.title || ""} onChange={(e) => renameSection(sec.id, e.target.value)}
                        className="flex-1 text-sm font-semibold px-2 py-1 rounded"
                        style={{ border: `1px solid ${C.line}`, backgroundColor: C.paper }} />
                    ) : (
                      <span className="text-sm font-semibold">{sec.title}</span>
                    )}
                    {instructor && (
                      <button onClick={() => delSection(sec.id)} className="text-xs px-1.5 rounded"
                        style={{ color: C.red, border: `1px solid ${C.line}` }} aria-label="Delete section">×</button>
                    )}
                  </div>

                  {/* Move it to another week, or release it back to the unfiled
                      block. Instructor only — students see neither control. */}
                  {instructor && (
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <select value="" onChange={(e) => { const v = e.target.value; if (v) placeSection(sec.id, Number(v)); }}
                        className="text-xs px-2 py-1 rounded"
                        style={{ border: `1px solid ${C.line}`, backgroundColor: C.card, color: C.sub }}>
                        <option value="">Move to…</option>
                        {String(sec.after) !== "0" && <option value="0">Before the first class</option>}
                        {weeks.filter((w) => String(w.n) !== String(sec.after)).map((w) => (
                          <option key={w.n} value={w.n}>After {w.label ? w.title : `Week ${w.n}`}</option>
                        ))}
                      </select>
                      <button onClick={() => releaseSection(sec.id)} className="text-xs px-2 py-1 rounded font-semibold"
                        style={{ border: `1px solid ${C.line}`, color: C.sub }}>
                        Unanchor
                      </button>
                      <span className="text-xs" style={{ color: C.sub }}>
                        Unanchoring keeps the tasks and everyone's ticks — it just hides the block until you place it again.
                      </span>
                      {/* ★ FILE-DROP ON A PREP SECTION — Bri's ask (Jul 29):
                          a handout, workbook or PDF attached to the section
                          itself, for students to open. Author side; the
                          student-side "+ Attach a file" on each task is turn-in
                          and stays separate. Removing drops the link only —
                          the stored file survives a mis-tap. */}
                      <label className="text-xs font-semibold" style={{ color: C.blue, cursor: "pointer" }}>
                        {busyUpload === `sec:${sec.id}` ? "Uploading…" : "+ Attach a handout"}
                        <input type="file" style={{ display: "none" }}
                          onChange={async (e) => {
                            const file = e.target.files && e.target.files[0];
                            e.target.value = "";
                            if (!file) return;
                            setBusyUpload(`sec:${sec.id}`);
                            try {
                              const rec = await uploadCourseAsset(`prep/${sec.id}`, file);
                              setPrepWork((ps) => (ps || []).map((s) => s.id !== sec.id ? s
                                : { ...s, files: [...(s.files || []), rec] }));
                            } catch (err) { /* real reason, not a guess about size — see L101Editor */
                              window.alert((err && err.message) || "That didn't upload. Try again, or a smaller file."); }
                            setBusyUpload("");
                          }} />
                      </label>
                    </div>
                  )}

                  {/* 🐛 Bri, Aug 3 2026: "My attachments for prep work are not
                      visible to the students." Checked against the real data
                      before changing anything: all five prep sections hold ZERO
                      files and the bucket has no prep object at all, while her
                      W3 module images uploaded fine the same morning. So the
                      uploads never landed — they were attempted before the
                      bucket gained its insert policy on Aug 1, and failed then.
                      Nothing was lost afterwards and nothing here was broken.

                      What the screen did wrong was stay silent about it. An
                      empty section looks identical whether nothing was ever
                      attached or everything attached has gone, so she had no
                      way to tell which had happened to her. Instructors now get
                      told plainly. Students still see nothing, because to them
                      a section with no handouts simply has no handouts. */}
                  {instructor && !(sec.files || []).length && (
                    <div className="text-xs" style={{ color: C.sub, fontStyle: "italic", marginTop: 2 }}>
                      No handouts attached to this section yet.
                    </div>
                  )}

                  {/* Section handouts — visible to EVERYONE, unlike the
                      instructor controls above. Each opens through the same
                      short-lived signed URL as a student's own turn-in. */}
                  {(sec.files || []).length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {(sec.files || []).map((f, fi) => (
                        <span key={fi} className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded"
                          style={{ border: `1px solid ${C.line}`, backgroundColor: C.card }}>
                          <button onClick={async () => { const u = await openUpload(f); if (u) window.open(u, "_blank"); }}
                            style={{ all: "unset", cursor: "pointer", color: C.blue, fontWeight: 700, textDecoration: "underline" }}>
                            📎 {f.name}
                          </button>
                          {instructor && (
                            <button onClick={() => setPrepWork((ps) => (ps || []).map((s) => s.id !== sec.id ? s
                              : { ...s, files: (s.files || []).filter((_, k) => k !== fi) }))}
                              style={{ all: "unset", cursor: "pointer", color: C.red, fontWeight: 800 }}
                              aria-label={`Remove ${f.name}`}>×</button>
                          )}
                        </span>
                      ))}
                    </div>
                  )}

                  <ul className="space-y-2">
                    {(sec.items || []).map((p, ti) => {
                      const pid = `pw:${p.id}`;
                      const files = P.uploadsOf(pid);
                      return (
                        <li key={p.id} className="flex items-start gap-2 text-sm">
                          <input type="checkbox" disabled={scope === "w1" || !P.person}
                            checked={P.isDone(pid)}
                            onChange={(e) => P.markDone(pid, e.target.checked, p.text)}
                            className="mt-0.5" aria-label={p.text} />
                          <div className="flex-1 min-w-0">
                            {/* ⚠️ `const v = e.target.value` BEFORE the updater, for
                                exactly the reason documented forty lines below on
                                the Add field: React may run the updater after the
                                handler returns, by which point e.target is null. */}
                            {instructor ? (
                              <input value={p.text || ""}
                                onChange={(e) => { const v = e.target.value; editTask(sec.id, p.id, v); }}
                                className="w-full text-sm leading-snug px-2 py-1 rounded"
                                style={{ border: `1px solid ${C.line}`, backgroundColor: C.paper, color: C.ink }}
                                aria-label="Task wording" />
                            ) : (
                              <span className="leading-snug" style={{ textDecoration: P.isDone(pid) ? "line-through" : "none", color: P.isDone(pid) ? C.sub : C.ink }}>
                                {p.text}
                              </span>
                            )}
                            {/* A finished task never reads as overdue — the date
                                stops mattering the moment it's done. */}
                            {dues[pid] && (
                              <span className="text-xs ml-2 font-semibold"
                                style={{ color: (!P.isDone(pid) && isOverdue(dues[pid])) ? C.red : C.sub }}>
                                due {dueLabel(dues[pid])}{(!P.isDone(pid) && isOverdue(dues[pid])) ? " — overdue" : ""}
                              </span>
                            )}
                            {instructor && (
                              <input type="date" value={dues[pid] || ""}
                                onChange={(e) => { const v = e.target.value; setDue(pid, v); }}
                                className="text-xs px-1 py-0.5 rounded ml-2"
                                style={{ border: `1px solid ${C.line}`, color: C.sub }} />
                            )}
                            {/* Anything they've turned in against this task. Private
                                bucket — each opens through a short-lived signed URL. */}
                            {files.map((f, fi) => (
                              <div key={fi} className="text-xs mt-0.5">
                                <button onClick={async () => { const u = await openUpload(f); if (u) window.open(u, "_blank"); }}
                                  style={{ color: C.blue, background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}>
                                  {f.name}
                                </button>
                              </div>
                            ))}
                            {P.person && scope !== "w1" && (
                              <label className="text-xs mt-1 inline-block" style={{ color: C.sub, cursor: "pointer" }}>
                                {busyUpload === pid ? "Uploading…" : "+ Attach a file"}
                                <input type="file" style={{ display: "none" }}
                                  onChange={async (e) => {
                                    const file = e.target.files && e.target.files[0];
                                    e.target.value = "";
                                    if (!file) return;
                                    setBusyUpload(pid);
                                    try { await P.saveUpload(pid, file, p.text); }
                                    catch (err) { window.alert((err && err.message) || "That didn't upload. Try again, or a smaller file."); }
                                    setBusyUpload("");
                                  }} />
                              </label>
                            )}
                          </div>
                          {instructor && (
                            <span className="flex items-center gap-1 shrink-0">
                              <button onClick={() => moveTask(sec.id, ti, -1)} disabled={ti === 0}
                                className="text-xs px-1.5 rounded" aria-label="Move up"
                                style={{ color: ti === 0 ? C.line : C.sub, border: `1px solid ${C.line}`,
                                  cursor: ti === 0 ? "default" : "pointer" }}>▲</button>
                              <button onClick={() => moveTask(sec.id, ti, 1)} disabled={ti === (sec.items || []).length - 1}
                                className="text-xs px-1.5 rounded" aria-label="Move down"
                                style={{ color: ti === (sec.items || []).length - 1 ? C.line : C.sub,
                                  border: `1px solid ${C.line}`, cursor: ti === (sec.items || []).length - 1 ? "default" : "pointer" }}>▼</button>
                              <button onClick={() => delTask(sec.id, p.id)} className="text-xs px-1.5 rounded"
                                style={{ color: C.red, border: `1px solid ${C.line}` }} aria-label="Delete">×</button>
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>

                  {instructor && (
                    <div className="flex gap-2 mt-2">
                      {/* 🐛 THE ERROR BRI HIT TYPING HERE. `e.target.value` was read
                          INSIDE the setNewPrep updater. React can run that updater
                          after the handler has returned — and twice in StrictMode —
                          by which point the synthetic event is recycled and
                          `e.target` is null. Every keystroke threw.
                          ⚠️ ALWAYS capture the value BEFORE the updater. */}
                      <input value={newPrep[sec.id] || ""}
                        onChange={(e) => { const v = e.target.value; setNewPrep((d) => ({ ...d, [sec.id]: v })); }}
                        onKeyDown={(e) => e.key === "Enter" && addPrep(sec.id)}
                        placeholder="Add a task to this section"
                        className="flex-1 text-sm px-3 py-2 rounded-lg outline-none"
                        style={{ border: `1px solid ${C.line}`, backgroundColor: C.paper }} />
                      <button onClick={() => addPrep(sec.id)} className="text-sm font-semibold px-3 py-2 rounded-lg text-white" style={{ backgroundColor: C.ink }}>Add</button>
                    </div>
                  )}
                </li>
      </ul>
      </>)}
    </Card>
    );
  };
  /* The header progress bar counted the same phantom array the checkboxes wrote
     to, so it read 1/N for everyone on first load and never moved. Counted from
     the real submitted-week records instead — the unit a student actually
     completes, and the same thing Bri sees on her roster. */

  const weeksDone = weeks.filter((w) => P.isDone(`submit:${keyOf(w)}`)).length;
  const pct = weeks.length ? Math.round((weeksDone / weeks.length) * 100) : 0;

  // Checked most-permissive first: if Bri sets the same value in two boxes, the
  // wider scope wins rather than the narrower one silently hiding weeks.
  const tryPin = () => {
    const v = pinEntry.trim();
    if (!v) { setPinError(true); return; }
    if (v === String(classPin)) { setUnlocked(true); setScope("all"); setPinError(false); return; }
    // ⚠️ `PG.splitPins` guards these too, not just the admin boxes. A stale
    // value left in a one-PIN program's KV must never open a narrowed scope.
    if (PG.splitPins && pinW1 && v === String(pinW1)) { setUnlocked(true); setScope("w1"); setPinError(false); return; }
    if (PG.splitPins && pinRest && v === String(pinRest)) { setUnlocked(true); setScope("rest"); setPinError(false); return; }
    /* Belt and braces for the case she actually described — she is signed in
       as herself but somehow still at this screen. Costs one comparison and no
       network call. */
    if (instructor || autoOpen(viewer)) { setUnlocked(true); setScope("all"); setPinError(false); return; }
    setPinError(true);
  };

  // Week 1 is the application gate and has its own cohort; Weeks 2-4 are the
  // course proper. That split is Bri's, not a technical one.
  // ⚠️ `n > 1`, not `n >= 2` — the Welcome class is n 1.5 and belongs to the
  // Weeks 2-4 cohort, not the Week 1 application cohort. Identical for every
  // whole-numbered week, so nothing else changes.
  // A single-audience program has one cohort, so one PIN opens everything.
  const weekOpen = (n) => !PG.splitPins || scope === "all" || (scope === "w1" ? n === 1 : n > 1);


  /* ⚠️ EVERY STRUCTURE CHANGE GOES THROUGH HERE, AND IT WRITES. Before this,
     moveModule changed state and nothing saved it. Strips `url` on the way out so
     links stay solely in `materials`. */
  /* ⚠️ THIS ONLY PERSISTS. IT MUST NOT CALL setWeeks. Every caller runs it from
     INSIDE a setWeeks updater, and setting state from within an updater is a
     React anti-pattern that can double-apply or drop the change. The updater
     returns the new value; this just writes it. */
  const commitWeeks = (next) => {
    if (!weeksOk.current) return;   // unreadable read: never save over real work
    const bare = next.map((w) => ({
      ...w,
      modules: (w.modules || []).map(({ url, ...rest }) => rest),
    }));
    kvWrite(KV.weeks, bare).catch(() => {});
  };

  const moveModule = (weekIdx, modIdx, dir) => {
    setWeeks((ws) => {
      const copy = ws.map((w) => ({ ...w, modules: [...(w.modules || [])] }));
      const mods = copy[weekIdx].modules;
      const target = modIdx + dir;
      if (target < 0 || target >= mods.length) return ws;
      [mods[modIdx], mods[target]] = [mods[target], mods[modIdx]];
      commitWeeks(copy);
      return copy;
    });
  };

  /* ⚠️ addModule WAS HERE and went with its button (Bri: "having that
     button is noise"). Removed rather than left uncalled, because a helper
     with no caller is the second copy problem waiting to happen — somebody
     wires it back up without reading why it went. build-log.md has the story. */

  /* ★ DELETE. Confirms by NAME rather than "are you sure", because the rows sit
     close together and the destructive one is the same size as the reorder ones.
     ⚠️ THE MODULE'S LINK IS LEFT IN `materials`. Deleting the row does not delete
     the video, so putting the module back by the same name is not a data-loss
     event — and an orphaned entry costs nothing. */
  const deleteModule = (weekIdx, modIdx) => {
    const m = (weeks[weekIdx] || {}).modules?.[modIdx];
    if (!m) return;
    if (!window.confirm(`Remove "${m.title}" from this week?\n\nThe link stays saved, so you can add it back.`)) return;
    setWeeks((ws) => {
      const copy = ws.map((w) => ({ ...w, modules: [...(w.modules || [])] }));
      copy[weekIdx].modules.splice(modIdx, 1);
      commitWeeks(copy);
      return copy;
    });
  };

  /* ── CLASSES, NOT MODULES ───────────────────────────────────────────────
     🐛 I BUILT THIS ONE LEVEL TOO DEEP. Aug 8 2026, morning: add, delete and
     reorder shipped for MODULES inside a class. What Bri asked for was the
     CLASSES themselves.
     Bri, the same afternoon: "when I asked to add modules, I meant completely
     new classes to build inside? Like I have W1, Welcome to Leadership 101, W2,
     W3, and W4 -- but I want to add another class onto these to add after W4.
     When I click 'Add Module' it adds still attached to whichever module I'm
     in." And: "what I am wanting is separate classes to be added or removed and
     those to be able to be reordered."
     ⚠️ THE VOCABULARY IS THE WHOLE BUG. This file calls them `weeks`; she calls
     them classes; "module" means the rows inside one. Her word and the code's
     word pointed at different levels and nobody noticed for a day. */

  const moveWeek = (weekIdx, dir) => {
    setWeeks((ws) => {
      const target = weekIdx + dir;
      if (target < 0 || target >= ws.length) return ws;
      const copy = ws.map((w) => ({ ...w, modules: [...(w.modules || [])] }));
      [copy[weekIdx], copy[target]] = [copy[target], copy[weekIdx]];
      commitWeeks(copy);
      return copy;
    });
  };

  /* ★ ADD A CLASS. Appended rather than inserted, because Bri's ask is "add
     another class onto these to add after W4" and every existing class keeps its
     own number.
     ⚠️ IT GETS AN EXPLICIT `key`, NEVER A BARE `n`. keyOf falls back to `w${n}`,
     and due dates, the in-person map and every student's progress are all filed
     under that key. So a new class numbered 5 would silently inherit every
     record left behind by a class 5 that was deleted — a team member would open
     it and find it already complete. A timestamped key cannot collide with one
     that existed before. */
  /* ★★ IT IS BORN WITH A BODY (Bri, Aug 8 2026, testing the button she had just
     been given): "testing the add class function and it's just a label with a
     due date. I need the full access to name it… as well as the actual 'open
     the class' space to build it. This is not visible."

     🐛 SHE WAS DESCRIBING THE SHAPE OF THE BUG EXACTLY. A class holds modules
     and "Open the class →" is a button on a MODULE, so a class created with
     `modules: []` had nothing to open and no way to grow one — the "Add a
     module" button had been removed the same afternoon, at her request, as
     noise. So Add a class produced a row that could be named, dated, reordered
     and deleted, and never opened. A label with a due date.

     ★ ONE BODY, CREATED WITH IT, NOT A PICKER. She does not think in modules;
     she thinks in classes you open and build inside. Handing back a "what kind
     of module?" chooser would reintroduce the exact thing she called noise.

     ⚠️ THE MODULE'S `hub` IS THE CLASS'S OWN KEY, which is how the seeded
     classes already work (week "w1" holds a module with `hub: "w1"`). That
     keeps ONE identity per class across content, due dates, the in-person map
     and `submit:` progress, instead of a second id that could drift from it.

     ⚠️ IT GETS AN EXPLICIT `key`, NEVER A BARE `n`. keyOf falls back to `w${n}`,
     and due dates, the in-person map and every student's progress are all filed
     under that key. So a new class numbered 5 would silently inherit every
     record left behind by a class 5 that was deleted — a team member would open
     it and find it already complete. A timestamped key cannot collide with one
     that existed before.
     ⚠️ Appended rather than inserted, because her ask is "add another class onto
     these to add after W4" and every existing class keeps its own number. */
  const addWeek = () => {
    const title = String(window.prompt("Name the new class") || "").trim();
    if (!title) return;
    setWeeks((ws) => {
      const maxN = ws.reduce((m, w) => Math.max(m, Number(w.n) || 0), 0);
      const copy = ws.map((w) => ({ ...w, modules: [...(w.modules || [])] }));
      const key = `wk${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
      copy.push({
        key,
        n: maxN + 1,
        label: `WK ${maxN + 1}`,
        title,
        modules: [{ id: `m-${key}`, type: "hub", hub: key, title, note: "Runs in the Hub" }],
      });
      commitWeeks(copy);
      return copy;
    });
  };

  /* ★ THE WK LABEL IS EDITABLE (Bri, Aug 8 2026: "Let's make the WK 1, WK 2, and
     so on labels on the classes editable as well. If I want to reorder the
     classes, these will need to be adjusted. Same with the ONE and TWO labels on
     Trainer Orientation").
     ⚠️ NOTHING IS RENUMBERED AUTOMATICALLY, and that is her ask read literally —
     she wants to adjust them, not have the Hub guess. `n` is a storage and
     ordering concern and stays exactly where it is; only the words change.
     ⚠️ TYPING DOES NOT WRITE. commitWeeks puts the whole week list to KV on
     every call, so committing per keystroke would be one network write per
     character on a shared iPad. State on change, save on blur. */
  const setWeekLabel = (weekIdx, label) => {
    setWeeks((ws) => {
      if (!ws[weekIdx]) return ws;
      const copy = ws.map((w) => ({ ...w, modules: [...(w.modules || [])] }));
      copy[weekIdx] = { ...copy[weekIdx], label };
      return copy;
    });
  };

  /* ★ AND THE CLASS NAME ITSELF (Bri, Aug 11 2026: "Please allow me editing
     access to all class week names (Intro to Leadership, Catering, Food Safety,
     etc.) across all courses"). The WK label has been editable since Aug 8; the
     name beside it was plain text, so renaming a class still came through Matt.

     ⚠️ THE WEEK'S `title` ONLY — IT MUST NOT TOUCH THE MODULE'S. They are
     deliberately different sentences on the live class: the week reads "Intro to
     Leadership" and its module reads "L101: Intro to Leadership". `addWeek` sets
     both from one prompt because a brand new class has no distinction yet, but
     rewriting the module here would strip the "L101: " prefix off four classes
     the first time she corrected a typo.
     ⚠️ Same save-on-blur rule as the label, and for the same reason: commitWeeks
     writes the whole week list, so per-keystroke would be one network write per
     character on a shared iPad. */
  const setWeekTitle = (weekIdx, title) => {
    setWeeks((ws) => {
      if (!ws[weekIdx]) return ws;
      const copy = ws.map((w) => ({ ...w, modules: [...(w.modules || [])] }));
      copy[weekIdx] = { ...copy[weekIdx], title };
      return copy;
    });
  };

  /* ★ DUPLICATE A CLASS INSIDE ITS OWN COURSE (Bri, Aug 11 2026: "I would also
     like to copy weeks within each class… I want to create in person versions of
     some of the classes, but copy existing weeks as the bones to my edits. So
     for example, in the template -- I want to copy the Week 1 Intro to
     Leadership to create another version of this same week class but tailored
     for in person without all the videos").

     Copy Class fills an EXISTING week from ANOTHER course. This makes a NEW week
     in THIS one. Different operation, which is why weekPairs is not involved —
     it refuses a pair pointing at the same record on purpose, and that guard has
     to stay exactly as it is.

     ⚠️⚠️ CONTENT IS WRITTEN BEFORE THE WEEK LIST, AND THE ORDER IS THE WHOLE
     CARE. The other way round gives her a class on screen that opens blank if
     the second write fails. This way a failure leaves an unreferenced content
     row nobody reads, which costs nothing.
     ⚠️ A FAILED READ REFUSES OUTRIGHT. Design rule 1 — creating the week anyway
     would look like a successful copy and hand her an empty class to discover
     later.
     ⚠️ EVERY ID IS REWRITTEN by copyWeek, which is what stops the duplicate
     arriving already ticked for everyone who finished the original. */
  const duplicateWeek = async (weekIdx) => {
    const w = weeks[weekIdx];
    if (!w) return;
    const srcKey = keyOf(w);
    const title = String(window.prompt(
      `Name the copy of "${w.title}"`, `${w.title} — In Person`) || "").trim();
    if (!title) return;

    const got = await kvReadResult(contentKey(srcKey));
    if (!got.ok) { window.alert("That class could not be read, so nothing was copied. Check your connection and try again."); return; }
    const maxN = weeks.reduce((m, x) => Math.max(m, Number(x.n) || 0), 0);
    const key = `wk${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
    const next = copyWeek(got.value, key);
    if (!next) { window.alert(`"${w.title}" has nothing in it yet, so there is nothing to copy. Add its sections first.`); return; }
    if ((await kvWrite(contentKey(key), next)) === false) {
      window.alert("The copy did not save, so no class was added. Try again."); return;
    }
    setWeeks((ws) => {
      const copy = ws.map((x) => ({ ...x, modules: [...(x.modules || [])] }));
      copy.push({ key, n: maxN + 1, label: `WK ${maxN + 1}`, title,
        modules: [{ id: `m-${key}`, type: "hub", hub: key, title, note: "Runs in the Hub" }] });
      commitWeeks(copy);
      return copy;
    });
  };

  /* ★ DELETE A CLASS. The confirm names it and says how many modules go with it,
     because this removes a whole class rather than one row.
     ⚠️ NOTHING ELSE IS TOUCHED. Its due date, its in-person setting, its saved
     links and every student's completed progress stay filed under its key, the
     same rule deleteModule follows for a module's link. Those records simply go
     unread. Deleting somebody's completion record to tidy up after an editor
     action is the one direction that cannot be undone. */
  const deleteWeek = (weekIdx) => {
    const w = weeks[weekIdx];
    if (!w) return;
    const count = (w.modules || []).length;
    if (!window.confirm(
      `Remove the class "${w.title}"?\n\n` +
      (count ? `The ${count} module${count === 1 ? "" : "s"} inside it go with it.\n\n` : "") +
      "Saved links and anyone's completed progress are not deleted."
    )) return;
    setWeeks((ws) => {
      const copy = ws.map((x) => ({ ...x, modules: [...(x.modules || [])] }));
      copy.splice(weekIdx, 1);
      commitWeeks(copy);
      return copy;
    });
  };

  // ⚠️ EVERY `sec.items` READ BELOW IS GUARDED. A section that reached state
  // without an `items` array — from an older stored shape, or a section created
  // before normalisePrep repaired all of them — makes `[...sec.items]` throw,
  // and a throw inside a state updater takes the whole page down rather than
  // failing quietly. Cheap insurance on a path Bri hits constantly.
  const addPrep = (secId) => {
    const t = String(newPrep[secId] || "").trim();
    if (!t) return;
    setPrepWork((ps) => (ps || []).map((sec) => sec.id !== secId ? sec
      : { ...sec, items: [...(sec.items || []), { id: `pw${Date.now()}`, text: t }] }));
    setNewPrep((d) => ({ ...d, [secId]: "" }));
  };
  // A section belongs to the week it FOLLOWS, so adding one is always "after
  // Week n" rather than a free-floating item that then has to be positioned.
  const addSection = (afterWeek) => {
    const t = String(newSection[afterWeek] || "").trim();
    if (!t) return;
    setPrepWork((ps) => [...(ps || []), { id: `pwsec${Date.now()}`, after: afterWeek, title: t, items: [] }]);
    setNewSection((d) => ({ ...d, [afterWeek]: "" }));
  };
  const delSection = (secId) => {
    const sec = (prepWork || []).find((x) => x.id === secId);
    const n = ((sec && sec.items) || []).length;
    if (n && !window.confirm(
      `Delete "${(sec && sec.title) || "this section"}" and its ${n} task(s)? Students' ticks against them stay on their record but won't be shown.`)) return;
    setPrepWork((ps) => (ps || []).filter((x) => x.id !== secId));
  };
  /* ── SECTIONS THAT AREN'T ANCHORED TO A WEEK ─────────────────────────
     A prep section renders only where `after` matches a week number
     (`prepWork.filter((sec) => sec.after === w.n)`). A section with no `after`
     therefore renders NOWHERE — invisible to students and to Bri, with no way
     to reach it, rename it or delete it.

     Found Jul 26: FOUR of the eight stored sections were in that state. Two
     were demo leftovers (the Enneagram task, a conflict-example task), one was
     a duplicate "W2 Prep" — and one, "Welcome to Leadership 101!", was a real
     section Bri had written with a real task in it that nobody had ever seen.

     ⚠️ The answer is NOT to delete them on load or to quietly re-anchor them —
     both decide something for her that is hers to decide. They surface in an
     instructor-only block instead, where she can place each one against a week
     or remove it herself. */
  /* Bri, Jul 27: "I would like an option to delete or release anchored prep
     work if it's no longer needed or if it needs to be moved in a different
     place later." Anchoring was one-way — an oversight, not a decision.
     ⚠️ Releasing does NOT delete: the section returns to the "not attached to a
     week" block above, with its tasks and every student tick intact. */
  const releaseSection = (secId) =>
    setPrepWork((ps) => (ps || []).map((sec) => sec.id === secId ? { ...sec, after: null } : sec));

  const placeSection = (secId, afterWeek) =>
    setPrepWork((ps) => (ps || []).map((sec) => sec.id === secId
      ? { ...sec, after: afterWeek, items: Array.isArray(sec.items) ? sec.items : [] }
      : sec));

  const renameSection = (secId, title) =>
    setPrepWork((ps) => (ps || []).map((sec) => sec.id === secId ? { ...sec, title } : sec));

  // 🐛 Bri, Jul 26: "on the W2 assignment, the part A label and Part B
  // (Enneagram portion) are still there. I attempted to manually edit, but
  // there's not an option for me to do that."
  // She was right — a section title had an input, a task's WORDING never did.
  // Tasks could be added, deleted, reordered and dated, but the one thing you
  // cannot do to a typo is any of those four. Editing in place is also the only
  // option that keeps the task's id, so students' existing ticks and uploads
  // stay attached; delete-and-retype would silently orphan both.
  const editTask = (secId, taskId, text) =>
    setPrepWork((ps) => (ps || []).map((sec) => sec.id !== secId ? sec
      : { ...sec, items: (sec.items || []).map((t) => t.id === taskId ? { ...t, text } : t) }));
  const delTask = (secId, taskId) =>
    setPrepWork((ps) => (ps || []).map((sec) => sec.id !== secId ? sec
      : { ...sec, items: (sec.items || []).filter((t) => t.id !== taskId) }));

  // Bri, Jul 25: "can I also add reordering arrows to move tasks up and down
  // within each section?" Moves WITHIN a section only — a task belongs to the
  // prep block it was written for, and letting one jump between sections by
  // arrow would be a different (and easily mistaken) action.
  // ⚠️ Bounds-checked: the first item's ▲ and the last item's ▼ are disabled
  // rather than silently doing nothing.
  const moveTask = (secId, idx, dir) =>
    setPrepWork((ps) => (ps || []).map((sec) => {
      if (sec.id !== secId) return sec;
      const items = (sec.items || []).slice();
      const j = idx + dir;
      if (j < 0 || j >= items.length) return sec;
      [items[idx], items[j]] = [items[j], items[idx]];
      return { ...sec, items };
    }));

  // ---------- Gate ----------
  if (!unlocked) {
    return (
      <div className={embedded ? "flex items-center justify-center px-4 py-12" : "min-h-screen flex items-center justify-center px-4"} style={embedded ? {} : { backgroundColor: C.paper }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@700;800&family=Inter:wght@400;500;600&display=swap');
          .l1-display{font-family:'Archivo',sans-serif} .l1-body{font-family:'Inter',sans-serif}`}</style>
        <div className="rounded-xl p-8 max-w-sm w-full text-center l1-body" style={{ backgroundColor: C.card, border: `1px solid ${C.line}` }}>
          <div className="text-3xl mb-3">🔑</div>
          <div className="l1-display font-bold text-lg mb-1" style={{ color: C.ink }}>{PG.name}</div>
          <p className="text-sm mb-1" style={{ color: C.sub }}>
            Signed in as <b style={{ color: C.ink }}>{viewer.name}</b>
          </p>
          <p className="text-xs mb-4" style={{ color: C.sub }}>
            Enter the class PIN from {courseOwnerLabel()}. Your personal PIN got you this far — the class PIN opens the course.
          </p>
          <input
            value={pinEntry}
            onChange={(e) => { setPinEntry(e.target.value); setPinError(false); }}
            onKeyDown={(e) => e.key === "Enter" && tryPin()}
            placeholder="Class PIN"
            inputMode="numeric"
            className="w-full text-center text-lg px-3 py-2 rounded-lg outline-none mb-2"
            style={{ border: `1px solid ${pinError ? C.red : C.line}`, backgroundColor: C.paper, letterSpacing: "0.3em" }}
          />
          {pinError && <div className="text-xs mb-2" style={{ color: C.red }}>That PIN isn't right.</div>}
          <button onClick={tryPin} className="w-full text-sm font-semibold px-3 py-2.5 rounded-lg text-white" style={{ backgroundColor: C.ink }}>
            Enter class
          </button>
          {/* ⚠️ THIS USED TO PRINT THE CLASS PIN ON THE SIGN-IN SCREEN — "Demo
              PIN: 2026 — change it in Admin" — to anyone who opened the page,
              signed in or not. A gate that displays its own key is not a gate.
              It now says the default is still in use WITHOUT naming it, which
              still tells Bri to change it and tells a student nothing useful. */}
          {classPin === DEMO_CLASS_PIN && (
            <div className="text-xs mt-3" style={{ color: C.sub }}>
              The class PIN hasn't been changed from the default yet — your instructor can set it in Admin.
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------- Closed ----------
  if (!classOpen && !instructor) {
    return (
      <div className={embedded ? "flex items-center justify-center px-4 py-12" : "min-h-screen flex items-center justify-center px-4"} style={embedded ? {} : { backgroundColor: C.paper }}>
        <Card className="max-w-sm text-center">
          <div className="text-3xl mb-2">📕</div>
          <div className="font-bold mb-1">{PG.name} is closed</div>
          <p className="text-sm" style={{ color: C.sub }}>{courseOwnerLabelCap()} will reopen enrollment for the next cohort.</p>
        </Card>
      </div>
    );
  }

  // ---------- An in-Hub week is open ----------
  // Weeks 1 and 4 run inside the Hub rather than linking out to Google
  // Classroom. Rendered here, below every hook, with a way back to the list.
  /* ★★ A CLASS BRI BUILT HERSELF OPENS HERE TOO (Bri, Aug 8 2026: "the actual
     'open the class' space to build it. This is not visible.")

     🐛 `hubModules` is a code constant holding w1–w4 and welcome. A class she
     added is not in it and never can be, so the old test — `PG.hubModules[
     openHub]` — simply fell through and the button did NOTHING. No screen, no
     message, no error. That is the "visible but does nothing" shape the checks
     list names, and it is the second half of why her new class was "just a
     label with a due date".

     ★ HER CLASSES ARE FOUND IN THE SAVED WEEK LIST INSTEAD, and render through
     the SAME shared L101Week that W2 and W3 use. This file already calls that
     "the pattern to copy for any future class", so a custom class gets every
     item type, instructor notes, printing, Spanish and progress for free — the
     "build it like W1 or W4, or like W2 or W4 more module style with Instructor
     notes" she asked for is one body either way. It is what she puts in it.

     ⚠️ EMPTY SEED, ON PURPOSE. L101Week reads stored content first and falls
     back to the seed, so an empty seed means "nothing until she builds it"
     rather than a starter class she has to empty out first.
     ⚠️ sequential={false}, matching W2 and W3. She delivers these live and her
     order varies, so a lock would argue with her in front of a class.
     ⚠️ ONE PIECE OF CHROME, TWO BODIES. The back link is identical either way;
     duplicating this block for the custom case is how the two drift. */
  if (openHub) {
    /* ⚠️ `|| {}` — a program is not REQUIRED to declare hubModules, and all
       three that exist today only do so because they happen to. Before Add a
       class grew a body, a program without one could never set `openHub` at
       all, so the bare read was unreachable. Now every program can create a
       class that sets it, which would have turned a missing hubModules into a
       blank page the first time Bri opened her new class in one. */
    const fixed = (PG.hubModules || {})[openHub];
    const custom = fixed ? null : (weeks || []).find((w) => keyOf(w) === openHub);
    if (fixed || custom) {
      const M = fixed ? fixed.Component : null;
      return (
        <div className={embedded ? "" : "min-h-screen"} style={embedded ? {} : { backgroundColor: C.paper }}>
          <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.line}`, backgroundColor: "#fff" }}>
            <button onClick={() => setOpenHub(null)}
              className="text-sm font-semibold" style={{ color: C.ink }}>
              ← Back to {PG.name}
            </button>
          </div>
          {M
            ? <M />
            : <L101Week weekId={openHub} weekLabel={custom.title} seed={EMPTY_SEED} sequential={false}
                instructors={weekHasInstructors(openHub, PG.ns)} />}
        </div>
      );
    }
  }

  /* ⚠️ RENDERED INSTEAD OF THE PORTAL, NOT OVER IT. An overlay would leave the
     whole portal in the DOM, and window.print() prints the document, not what
     is on top of it — so every page behind would print too. Declared after
     every hook above, so no hook is skipped on this path. */
  if (printing) {
    const wk = (PG.seeds || {})[printing.weekId];
    return (
      <L101Print
        weekId={printing.weekId}
        weekLabel={(wk && wk.title) || printing.weekId}
        seed={wk}
        variant={printing.variant}
        onVariant={(v) => setPrinting((p) => (p ? { ...p, variant: v } : p))}
        onBack={() => setPrinting(null)}
      />
    );
  }

  return (
    <div className={embedded ? "" : "min-h-screen"} style={embedded ? { color: C.ink } : { backgroundColor: C.paper, color: C.ink }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap');
        .l1-display { font-family: 'Archivo', sans-serif; }
        .l1-body { font-family: 'Inter', sans-serif; }
        .l1-mono { font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
      `}</style>

      <div className="max-w-3xl mx-auto px-4 py-6 l1-body">
        {/* Only when a caller passed onBack — Bri's own tile doesn't, so her
            view is unchanged. Without this, entering from the Team Site left
            someone with no way out but a browser reload. */}
        {onBack && (
          <button onClick={onBack} className="text-sm font-semibold mb-3"
            style={{ color: C.sub, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
            ← Back
          </button>
        )}
        <header className="mb-4" style={{ margin: "-1.5rem -1rem 1rem", background: "linear-gradient(120deg,#B5548A 0%,#6E2458 55%)", color: "#fff", padding: "18px 16px 16px" }}>
          <div className="text-xs font-semibold tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.78)" }}>
            {STORE.appName} · Leadership Development
          </div>
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <h1 className="l1-display text-2xl" style={{ fontWeight: 800, color: "#fff" }}>{PG.name}</h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ color: "#fff", backgroundColor: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.32)" }}>
              {classOpen ? "Open" : "Closed"}
            </span>
          </div>
          <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.75)" }}>
            {PG.tagline}
          </p>

          {/* Progress */}
          {!instructor && (
            <div className="mt-3">
              <div className="flex justify-between text-xs mb-1">
                <span style={{ color: "rgba(255,255,255,0.8)" }}>Your progress</span>
                <span className="l1-mono font-semibold">{weeksDone}/{weeks.length} classes · {pct}%</span>
              </div>
              <div className="h-2 rounded" style={{ backgroundColor: "rgba(255,255,255,0.25)" }}>
                <div className="h-2 rounded" style={{ width: `${pct}%`, backgroundColor: pct === 100 ? C.green : C.red }} />
              </div>
            </div>
          )}
        </header>

        {/* Instructor controls */}
        {instructor && (
          <Card className="mb-4" style={{ borderColor: C.blue }}>
            <div className="flex flex-wrap items-center gap-3 justify-between">
              <span className="text-xs font-semibold" style={{ color: C.blue }}>Instructor controls — {viewer.name}</span>
              <div className="flex items-center gap-3 flex-wrap">
                <label className="text-sm flex items-center gap-2">
                  <input type="checkbox" checked={classOpen} onChange={(e) => setClassOpen(e.target.checked)} />
                  <span>Class open</span>
                </label>
                <button onClick={() => setShowRoster((s) => !s)} className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ color: C.blue, border: `1px solid ${C.blue}` }}>
                  {showRoster ? "Hide" : "Show"} student progress
                </button>
                {hasInPerson && (
                  <button onClick={() => setShowSessions((s) => !s)} className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ color: C.blue, border: `1px solid ${C.blue}` }}>
                    {showSessions ? "Hide in-person classes" : "In-person classes"}
                  </button>
                )}
                {/* One button per in-person week, which is exactly what Bri
                    asked for: "one button specifically for W2 and another for
                    W3." Instructor / Student is chosen on the print screen. */}
                {/* ⚠️ THE LABEL, NOT THE ID. A copied week's key is
                    `wkmso0kydv6o9`, and "Print WKMSO0KYDV6O9" is not a button
                    anybody can read. */}
                {instructorWeeks.map((w) => (
                  <button key={`print-${w.id}`} onClick={() => setPrinting({ weekId: w.id, variant: "instructor" })}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ color: C.blue, border: `1px solid ${C.blue}` }}>
                    Print {w.label}
                  </button>
                ))}
                {/* Bri, Aug 10 2026. Sits beside the other class-wide controls
                    because it acts on the whole class, not on one week. */}
                <button onClick={() => setShowCopy((s) => !s)} className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ color: C.blue, border: `1px solid ${C.blue}` }}>
                  {showCopy ? "Close copy" : "Copy a class"}
                </button>
                <button onClick={() => setShowAdmin((s) => !s)} className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ color: "#fff", backgroundColor: C.blue }}>
                  {showAdmin ? "Close admin" : "Admin — links & PIN"}
                </button>
              </div>
            </div>

            {/* ★ COMPLETED IN-PERSON CLASSES — when, who completed it, and the
                notes snapshotted at completion. Assignment lines show who is
                CURRENTLY assigned per class ("who the instructor assigned
                was"); the session rows carry who actually pressed complete. */}
            {showSessions && (
              <div className="mt-3 pt-3 space-y-3" style={{ borderTop: `1px solid ${C.line}` }}>
                <div className="text-xs font-semibold" style={{ color: C.blue }}>Completed In-Person Classes</div>
                {assignsView !== null && (
                  <div className="space-y-1">
                    {instructorWeeks.map((w) => {
                      const wid = w.id;
                      const list = (assignsView && assignsView[wid]) || [];
                      const title = w.title;
                      return (
                        <div key={wid} className="text-sm" style={{ color: C.ink }}>
                          <b>{title}</b>
                          <span style={{ color: C.sub }}> · instructors: {list.length ? list.map((p) => p.name).join(", ") : "none assigned"}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {sessionsFailed && (
                  <div className="text-sm font-semibold" style={{ color: "#7A5410" }}>
                    The completed-classes list could not be reached — entries may be missing
                    below. Close and reopen this panel to retry.
                  </div>
                )}
                {sessions === null && <div className="text-sm" style={{ color: C.sub }}>Loading…</div>}
                {sessions !== null && !sessionsFailed && sessions.filter((s) => PG.seeds && PG.seeds[s.weekId]).length === 0 && (
                  <div className="text-sm" style={{ color: C.sub, lineHeight: 1.5 }}>
                    No in-person classes completed yet. When an instructor presses
                    Class Complete inside W2 or W3, it lands here with their notes.
                  </div>
                )}
                {sessions !== null && sessions.filter((s) => PG.seeds && PG.seeds[s.weekId]).slice().reverse().map((s, i) => (
                  <div key={i} className="text-sm" style={{ borderLeft: `3px solid ${C.blue}`, borderTop: `3px solid ${C.blue}`, paddingLeft: 10 }}>
                    <div>
                      <b>{s.weekLabel || s.weekId}</b>
                      <span style={{ color: C.sub }}> · {s.at ? new Date(s.at).toLocaleString() : "no date"} · completed by </span>
                      <b>{s.byName || "unknown"}</b>
                    </div>
                    {s.notes ? (
                      <div style={{ color: C.sub, whiteSpace: "pre-wrap", marginTop: 2 }}>{s.notes}</div>
                    ) : (
                      <div style={{ color: C.sub, fontStyle: "italic", marginTop: 2 }}>No notes left.</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {showRoster && (
              <div className="mt-3 pt-3 space-y-2" style={{ borderTop: `1px solid ${C.line}` }}>
                {/* ⚠️ THIS USED TO RENDER `seedStudents` — five REAL team members
                    (Jamar, Karla, Katia, Valerie, Ashley) with INVENTED completion
                    data. It looked exactly like a live report. Anyone opening this
                    would have read fabricated progress as fact about named people,
                    and acted on it in a promotion conversation.
                    Progress isn't recorded yet (ld:l101:progress:{personId} is
                    declared and unused), so the honest thing is to say so. When
                    real tracking lands, this is where it renders. */}
                {(roster === null || content === null) && (
                  <div className="text-sm" style={{ color: C.sub }}>Loading…</div>
                )}
                {/* ⚠️ Waits for `content` too. Class membership is what decides
                    who belongs on this roster, and until the content lands
                    nobody matches — an empty list here would read as a finding
                    rather than a load state. */}
                {roster !== null && content !== null && visibleRoster.length === 0 && (
                  <div className="text-sm" style={{ color: C.sub, lineHeight: 1.5 }}>
                    Nobody has started yet. As people work through the class, their completed
                    items and quiz scores appear here.
                  </div>
                )}

                {visibleRoster.map((r) => {
                  const open = openStudent === r.id;
                  const cp = classProgress(r.rec, courseRows, { ignoreIds: foreign });
                  const doneCount = cp.classes.filter((c) => c.status === "complete").length;
                  /* ⚠️ COUNTED FROM `cp`, NOT FROM `summarise()`. The summary
                     walks the whole shared record, so an Orientation row was
                     reporting Leadership 101 quiz scores next to a student's
                     name — the same bleed as the roster itself, one line lower
                     and much easier to miss. */
                  const qz = cp.classes.flatMap((c) => c.detail).filter((d) => d.kind === "quiz");
                  const qScore = qz.reduce((n, d) => n + (Number(d.score) || 0), 0);
                  const qOutOf = qz.reduce((n, d) => n + (Number(d.total) || 0), 0);
                  return (
                  <div key={r.id}>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setOpenStudent(open ? null : r.id)}
                        className="flex items-center gap-3 text-sm flex-1 text-left py-1"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}>
                        <span style={{ color: C.sub, width: 12 }}>{open ? "▾" : "▸"}</span>
                        <span className="w-40 shrink-0 truncate">{r.name}</span>
                        {/* One-line summary, as she asked: how far through the
                            course, not a raw count of ticked items. */}
                        <span className="l1-mono text-xs" style={{ color: C.sub }}>
                          {doneCount} of {cp.classes.length} complete
                        </span>
                        {/* ★ LABELLED, GROUPED TICK COUNTS (Bri, Jul 29). The
                            denominators are counted from the course content at
                            render, so adding or removing checklist items moves
                            every student's total on the next load with nothing
                            to migrate. A stored total would be a second copy of
                            the truth and would drift the first time somebody
                            edited a week.
                            ⚠️ A group with no items renders NOTHING rather than
                            "0/0" — weeks 5 and 6 may have no content yet, and
                            0/0 reads like a student who has done nothing rather
                            than a group that does not exist. */}
                        {!countsHidden && groupCounts(cp.classes, courseRows).map((g) => (
                          <span key={g.id} className="l1-mono text-xs" style={{ color: C.sub }}>
                            {g.label} {g.done}/{g.total}
                          </span>
                        ))}
                        {qz.length > 0 && (
                          <span className="l1-mono text-xs" style={{ color: C.ink }}>
                            {qScore}/{qOutOf} on {qz.length} quiz{qz.length === 1 ? "" : "zes"}
                          </span>
                        )}
                      </button>
                      {/* ⚠️ HIDES THE ROW, DELETES NOTHING. Their record stays
                          exactly as it is in their own Hub account. */}
                      <button onClick={async () => setHidden(await hideStudent(r.id, KV.progressHidden))}
                        className="text-xs px-2 py-1 rounded" title="Remove from this view"
                        style={{ color: C.sub, border: `1px solid ${C.line}` }}>Remove</button>
                    </div>

                    {open && (
                      <div className="mt-1 mb-3 ml-5 pl-3 space-y-1" style={{ borderLeft: `3px solid ${C.line}`, borderTop: `3px solid ${C.line}` }}>
                        {content === null && <div className="text-xs" style={{ color: C.sub }}>Loading the course…</div>}
                        {cp.classes.map((c) => {
                          const ck = `${r.id}|${c.key}`;
                          const co = openClass === ck;
                          const tone = c.status === "complete" ? C.green : c.status === "in-progress" ? C.red : C.sub;
                          const word = c.status === "complete" ? (c.override ? "marked complete" : "complete")
                            : c.status === "in-progress" ? `${c.done} of ${c.total}` : "not started";
                          return (
                            <div key={c.key}>
                              <button onClick={() => setOpenClass(co ? null : ck)}
                                className="flex items-center gap-2 text-sm w-full text-left py-0.5"
                                style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}>
                                <span style={{ color: C.sub, width: 10, fontSize: 11 }}>{co ? "▾" : "▸"}</span>
                                <span style={{ color: tone, width: 14 }}>{c.status === "complete" ? "✓" : "○"}</span>
                                <span className="flex-1 truncate" style={{ fontSize: 13,
                                  fontWeight: c.kind === "prep" ? 400 : 600,
                                  fontStyle: c.kind === "prep" ? "italic" : "normal" }}>{c.label}</span>
                                <span className="l1-mono text-xs" style={{ color: tone }}>{word}</span>
                              </button>

                              {co && (
                                <div className="ml-6 mb-2 space-y-2">
                                  {/* Her override. Students can only ever complete a
                                      class by submitting it; this is the one manual path,
                                      and it stamps itself so the two never look alike. */}
                                  {c.kind === "class" && (
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <button disabled={busyMark === ck}
                                        onClick={() => markClass(r.id, c, !c.submitted)}
                                        className="text-xs px-2 py-1 rounded font-semibold"
                                        style={{ border: `1px solid ${C.line}`, color: c.submitted ? C.red : C.blue, opacity: busyMark === ck ? 0.5 : 1 }}>
                                        {busyMark === ck ? "Saving…" : c.submitted ? "Undo completion" : "Mark complete"}
                                      </button>
                                      {c.override && (
                                        <span className="text-xs" style={{ color: C.sub }}>
                                          Marked by {c.overrideBy || "an instructor"}, not submitted by them
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  {c.detail.length === 0 && (
                                    <div className="text-xs" style={{ color: C.sub }}>Nothing recorded in this one yet.</div>
                                  )}
                                  {c.detail.map((d) => (
                                    <div key={d.id} className="text-sm">
                                      <div className="flex items-baseline gap-2 flex-wrap">
                                        <span className="font-semibold" style={{ fontSize: 13 }}>{d.title}</span>
                                        {d.kind === "quiz" && (
                                          <span className="l1-mono text-xs"
                                            style={{ color: d.total && d.score === d.total ? C.green : C.ink }}>
                                            {d.score}/{d.total}
                                          </span>
                                        )}
                                        {d.kind === "done" && <span className="text-xs" style={{ color: C.sub }}>done</span>}
                                        {d.at && <span className="l1-mono text-xs" style={{ color: C.sub }}>{String(d.at).slice(0, 10)}</span>}
                                      </div>
                                      {/* ★ THE ANSWERS THEMSELVES (Bri's ask).
                                          Question then their words, with the
                                          right answer shown only where they
                                          missed it — a correct row doesn't need
                                          restating and doubles the reading. */}
                                      {d.kind === "quiz" && d.responses && (
                                        <div className="mt-1 space-y-1.5">
                                          {d.responses.map((rp, ri) => (
                                            <div key={ri} className="text-xs" style={{ lineHeight: 1.45 }}>
                                              <div style={{ color: C.sub }}>{rp.q}</div>
                                              <div style={{ color: rp.right ? C.green : C.red, fontWeight: 600 }}>
                                                {(rp.chose || []).length ? rp.chose.join(" · ") : "no answer"}
                                                {!rp.right && (rp.correct || []).length > 0 && (
                                                  <span style={{ color: C.sub, fontWeight: 400 }}> — correct: {rp.correct.join(" · ")}</span>
                                                )}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                      {/* Graded before answers were recorded.
                                          Says so rather than rendering nothing,
                                          which would read as "they answered
                                          nothing". These cannot be recovered. */}
                                      {d.kind === "quiz" && !d.responses && (
                                        <div className="text-xs mt-0.5" style={{ color: C.sub, fontStyle: "italic" }}>
                                          Answers weren't recorded for this attempt — only the score.
                                        </div>
                                      )}
                                      {d.kind === "upload" && (
                                        <div className="mt-0.5">
                                          {(d.files || []).map((f, fi) => (
                                            <button key={fi}
                                              onClick={async () => { const u = await openUpload(f); if (u) window.open(u, "_blank"); }}
                                              className="text-xs block"
                                              style={{ color: C.blue, background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}>
                                              {f.name}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                      {/* Their own words, rendered as written — line
                                          breaks kept, not collapsed into a paragraph. */}
                                      {d.kind === "answer" && (
                                        <div className="text-sm mt-0.5" style={{ color: C.ink, whiteSpace: "pre-line", lineHeight: 1.45 }}>
                                          {d.text}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {/* ⚠️ NEVER DROPPED. Work whose item id matches no class —
                            because content was renamed or an item deleted — surfaces
                            here rather than vanishing from her review. */}
                        {cp.orphans.length > 0 && (
                          <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${C.line}` }}>
                            <div className="text-xs mb-1" style={{ color: C.sub }}>
                              Recorded, but no longer part of any class
                            </div>
                            {cp.orphans.map((d) => (
                              <div key={d.id} className="text-sm">
                                <span className="font-semibold" style={{ fontSize: 13 }}>{d.title}</span>
                                {d.kind === "answer" && (
                                  <div className="text-sm mt-0.5" style={{ color: C.ink, whiteSpace: "pre-line" }}>{d.text}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  );
                })}

                {/* Removed rows are recoverable — "remove" that cannot be undone
                    is a delete wearing a friendlier word. */}
                {/* Bri: "the ability to remove these counts from the roster page
                    once they are no longer needed (but their progress on the
                    personal checklist stays put)". A VIEW preference only — it
                    writes one boolean to her own key and never touches a single
                    progress record, the same separation as hide-vs-delete above. */}
                <div className="pt-2" style={{ borderTop: `1px solid ${C.line}` }}>
                  <button onClick={async () => setCountsHiddenState(await setCountsHidden(!countsHidden))}
                    className="text-xs" style={{ color: C.sub, background: "none", border: "none", cursor: "pointer" }}>
                    {countsHidden ? "Show the W2-W4 and W5-W6 counts" : "Hide the W2-W4 and W5-W6 counts"}
                  </button>
                  {countsHidden && (
                    <span className="text-xs ml-2" style={{ color: C.sub }}>
                      Counts are hidden here only. Everyone&rsquo;s checklist progress is untouched.
                    </span>
                  )}
                </div>

                {/* ★ ONE HOLDING AREA, NOT TWO (Bri, Aug 10 2026): "I like having
                    the removed area where I can put back if needed, but I don't
                    need a secondary cleared holding place. I want to permanently
                    delete OR put back in just the one area."
                    ⚠️ THE SECOND PANEL IS GONE, THE LIST BEHIND IT IS NOT. Delete
                    still writes to `cleared`; it simply has no door back, which is
                    what "permanently" means from her side. Nothing is destroyed,
                    so anyone already cleared stays recoverable by hand if she ever
                    asks — and the student's own record was never involved either
                    way. See the note on clearStudent in L101Progress.jsx for why
                    this file will not delete a progress record. */}

                {hidden.length > 0 && (
                  <div className="pt-2" style={{ borderTop: `1px solid ${C.line}` }}>
                    <button onClick={() => setShowHidden((v) => !v)} className="text-xs"
                      style={{ color: C.sub, background: "none", border: "none", cursor: "pointer" }}>
                      {showHidden ? "▾" : "▸"} {hidden.length} removed from this view
                    </button>
                    {showHidden && (roster || []).filter((r) => hidden.includes(String(r.id)) && hasProgramWork(r.rec, courseRows)).map((r) => (
                      <div key={r.id} className="flex items-center gap-2 text-sm py-0.5 ml-4">
                        <span className="flex-1 truncate" style={{ color: C.sub }}>{r.name}</span>
                        <button onClick={async () => setHidden(await unhideStudent(r.id, KV.progressHidden))}
                          className="text-xs px-2 py-1 rounded"
                          style={{ color: C.blue, border: `1px solid ${C.line}` }}>Put back</button>
                        {/* 🐛 THIS BUTTON USED TO DELETE THEIR CLASS WORK. Bri asked
                            for "delete" and I built exactly that; she then said what
                            she meant: "I don't want it to remove the class work
                            they've completed on their personal Hub account, just
                            delete from my view." One tap expecting a tidier list
                            would have destroyed a student's coursework.
                            Now it only clears them off this list. Their record is
                            untouched and their own Hub account is unchanged. */}
                        <button onClick={async () => {
                          /* One-way from her side, so it asks first — and it says
                             what it does NOT do, because she asked for "delete"
                             once before and got a button that erased a student's
                             coursework. */
                          if (!window.confirm(`Delete ${r.name} from your list?\n\nThey come off this page for good. Their class work is not touched — they keep everything on their own Hub account.`)) return;
                          const res = await clearStudent(r.id, KV.progressCleared, KV.progressHidden);
                          if (!res.ok) { window.alert("That didn't save — check your connection and try again."); return; }
                          setCleared(res.cleared); setHidden(res.hidden);
                        }}
                          className="text-xs px-2 py-1 rounded"
                          title="Takes them off your list for good. Their class work is not touched."
                          style={{ color: C.sub, border: `1px solid ${C.line}` }}>Delete</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {showCopy && (
              <CopyClass PG={PG} weeks={weeks} prepWork={prepWork} onPrep={setPrepWork} onClose={() => setShowCopy(false)} />
            )}

            {showAdmin && (
              <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${C.line}` }}>
                {/* Class PIN + open toggle */}
                <div className="flex flex-wrap items-end gap-3 mb-4">
                  <div>
                    <label className="text-xs font-semibold block mb-1" style={{ color: C.sub }}>Class PIN{PG.splitPins && <span style={{ fontWeight: 400 }}> · opens everything</span>}</label>
                    <input
                      value={classPin}
                      onChange={(e) => setClassPin(e.target.value.replace(/\D/g, ""))}
                      inputMode="numeric"
                      className="text-sm px-3 py-2 rounded-lg outline-none w-28"
                      style={{ border: `1px solid ${C.line}`, backgroundColor: C.paper, letterSpacing: "0.2em" }}
                    />
                  </div>
                  {/* ★ SPLIT PINS ARE AN L101 CONCEPT (Bri, Jul 27: "I just need
                      a single Pin space there, not the separate spaces for W1
                      and W2-4 like with Leadership 101"). These rendered
                      unconditionally, so Trainer Orientation — a single cohort
                      that has already been through Week 1 — showed two extra
                      boxes labelled for weeks it doesn't have.
                      Optional even in L101: leave both blank and one PIN still
                      opens the whole class, exactly as before. */}
                  {PG.splitPins && (
                    <>
                      <div>
                        <label className="text-xs font-semibold block mb-1" style={{ color: C.sub }}>Week 1 only <span style={{ fontWeight: 400 }}>· optional</span></label>
                        <input
                          value={pinW1}
                          onChange={(e) => setPinW1(e.target.value.replace(/\D/g, ""))}
                          inputMode="numeric" placeholder="—"
                          className="text-sm px-3 py-2 rounded-lg outline-none w-28"
                          style={{ border: `1px solid ${C.line}`, backgroundColor: C.paper, letterSpacing: "0.2em" }}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold block mb-1" style={{ color: C.sub }}>Weeks 2&ndash;4 <span style={{ fontWeight: 400 }}>· optional</span></label>
                        <input
                          value={pinRest}
                          onChange={(e) => setPinRest(e.target.value.replace(/\D/g, ""))}
                          inputMode="numeric" placeholder="—"
                          className="text-sm px-3 py-2 rounded-lg outline-none w-28"
                          style={{ border: `1px solid ${C.line}`, backgroundColor: C.paper, letterSpacing: "0.2em" }}
                        />
                      </div>
                    </>
                  )}
                  {/* ⚠️ A one-PIN program must not WRITE the split keys — saving
                      "" over them is harmless today but would silently clear a
                      program that later turns the split on. */}
                  <button onClick={() => saveConfig(PG.splitPins ? { pin: classPin, pinW1, pinRest } : { pin: classPin })} className="text-sm font-semibold px-3 py-2 rounded-lg text-white" style={{ backgroundColor: C.ink }}>
                    Save PIN
                  </button>
                  {saveState && (
                    <span className="text-xs font-semibold" style={{ color: saveState === "error" ? "#B91C1C" : saveState === "saved" ? "#15803D" : "#92400E" }}>
                      {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved ✓" : "Did not save — try again"}
                    </span>
                  )}
                  <label className="text-sm flex items-center gap-2 ml-auto">
                    <input type="checkbox" checked={classOpen} onChange={(e) => { setClassOpen(e.target.checked); saveConfig({ open: e.target.checked }); }} />
                    <span>Class open to students</span>
                  </label>
                </div>

                {/* Module links section removed Jul 23 — Bri: "we can remove the
                    links section in the Admin & Links as the classes are in the
                    Hub." Weeks 1 and 4 run in the Hub, and Weeks 2 and 3 are
                    coming in too, so there is nothing left to paste a share link
                    for. `materials` stays in KV so nothing is destroyed. */}
              </div>
            )}
          </Card>
        )}


        {/* Weeks */}
        <section className="mb-5">
          {/* ★ ONE CONTROL, NOT TWO. It reads "Open all" until something is open
              and "Close all" after that, so there is one button to find rather
              than a pair where one of them is always the wrong one. Instructor
              only, like everything else in this pass. */}
          <div className="flex items-center gap-2 mb-2">
            <h2 className="l1-display text-xs font-bold uppercase tracking-widest" style={{ color: C.sub }}>Modules</h2>
            {instructor && (
              <button type="button" onClick={anyBlockOpen ? closeEveryBlock : openEveryBlock}
                className="text-xs font-semibold px-2 py-0.5 rounded ml-auto"
                style={{ border: `1px solid ${C.line}`, color: C.sub, background: "none", cursor: "pointer" }}>
                {anyBlockOpen ? "Close all" : "Open all"}
              </button>
            )}
          </div>
          <div className="space-y-3">
            {/* `open` gates BOTH the card's appearance and its "Open the class"
                button. Greying a card without disabling the button would let a
                Week-1 PIN walk straight into Week 4. */}
            {/* ★ PREP WORK BEFORE THE FIRST CLASS. Bri, Jul 27, on Trainer
                Orientation: "a single class with info in it and prep work before
                and after". L101 has nothing before Week 1 by design — the
                Trainer application is its prep — but a program whose people are
                already promoted needs tasks done BEFORE they sit down.
                ⚠️ `after: 0` means before the first class. It is NOT the same as
                a missing `after`, which still means unanchored and still shows
                in the instructor block above — an unplaced section and a
                deliberately-first section must never be confused. */}
            {prepShown.filter((sec) => String(sec.after) === "0").map(renderPrepSection)}

            {weeks.map((w, wi) => {
              const open = weekOpen(w.n);
              /* ⚠️ `expanded`, NOT `open`. `open` already means something else on
                 this card and has since it was written — whether the class is
                 unlocked to students by its PIN. Reusing the name would make a
                 collapsed card look locked and a locked card look collapsed, and
                 the two are answered by different people. */
              const blockId = `wk:${keyOf(w)}`;
              const expanded = blockOpen(blockId);
              const moduleN = (w.modules || []).length;
              /* Keyed by identity, not by week number: a class carries its own
                 `key` once it is added in the editor, and keyOf is the one
                 function that decides what a class IS everywhere else.
                 ⚠️ A JS COMMENT, ABOVE THE RETURN, AND THAT IS THE POINT.
                 Wrapped in braces inside the return it becomes a second child
                 with no element wrapping it, and the whole file stops parsing.
                 That is exactly what happened while writing this. */
              return (
              <React.Fragment key={keyOf(w)}>
              <Card key={keyOf(w)} style={open ? {} : { opacity: 0.55 }}>
                <div className="flex items-baseline gap-2 mb-2 flex-wrap">
                  {/* ★ THE CHEVRON, instructor only. Everything else on this row
                      keeps its place, so the header a student reads is unmoved. */}
                  {instructor && (
                    <button type="button" onClick={() => toggleBlock(blockId)} aria-expanded={expanded}
                      aria-label={`${expanded ? "Close" : "Open"} ${w.title || `Week ${w.n}`}`}
                      style={{ color: C.sub, background: "none", border: "none", padding: 0,
                        cursor: "pointer", fontSize: 13, lineHeight: 1, width: 10 }}>
                      {expanded ? "▾" : "▸"}
                    </button>
                  )}
                  {/* ★ EDITABLE FOR AN INSTRUCTOR, PLAIN TEXT FOR EVERYONE ELSE
                      (Bri, Aug 8 2026: "Let's make the WK 1, WK 2, and so on
                      labels on the classes editable as well… Same with the ONE
                      and TWO labels on Trainer Orientation").
                      Trainer Orientation runs this same shell, so its ONE and
                      TWO become editable here with no change of its own.
                      ⚠️ SAVES ON BLUR, NOT PER KEYSTROKE — see setWeekLabel.
                      ⚠️ The value captured before the state updater runs, never
                      read off the event inside it. */}
                  {/* ⚠️ `&& expanded` ON EVERY EDITOR IN THIS HEADER, NOT JUST ON
                      the body below. A closed card carrying four edit boxes and
                      six buttons is still the wall Matt is describing; closed has
                      to mean READ ONE LINE AND MOVE ON. The controls come back
                      untouched the moment it opens, and a student never had them
                      either way. */}
                  {instructor && expanded ? (
                    <input
                      value={w.label || `WK ${w.n}`}
                      onChange={(e) => { const v = e.target.value; setWeekLabel(wi, v); }}
                      onBlur={() => commitWeeks(weeks)}
                      aria-label={`Label for ${w.title}`}
                      className="l1-mono text-xs font-bold px-2 py-0.5 rounded"
                      style={{ color: C.red, backgroundColor: "#FBE7EC",
                        border: `1px solid ${C.line}`, width: 72 }} />
                  ) : (
                    <span className="l1-mono text-xs font-bold px-2 py-0.5 rounded" style={{ color: C.red, backgroundColor: "#FBE7EC" }}>
                      {w.label || `WK ${w.n}`}
                    </span>
                  )}
                  {/* ★ THE CLASS NAME IS EDITABLE FOR AN INSTRUCTOR NOW TOO
                      (Bri, Aug 11 2026). Same shape and same blur-to-save rule
                      as the WK label beside it, so the two read as one control
                      rather than an editable box next to a fixed one. Everyone
                      else still sees plain text. */}
                  {instructor && expanded ? (
                    <input
                      value={w.title || ""}
                      onChange={(e) => { const v = e.target.value; setWeekTitle(wi, v); }}
                      onBlur={() => commitWeeks(weeks)}
                      aria-label="Class name"
                      className="l1-display font-bold text-sm px-2 py-0.5 rounded"
                      style={{ color: C.ink, backgroundColor: C.card,
                        border: `1px solid ${C.line}`, minWidth: 0, flex: "1 1 200px" }} />
                  ) : (
                    <span className="l1-display font-bold text-sm">{w.title}</span>
                  )}
                  {/* ⚠️ A CLOSED CARD SAYS HOW BIG IT IS. Without this the whole
                      course reads as a list of names with no sense of what is
                      inside any of them, which is a different kind of useless. */}
                  {instructor && !expanded && (
                    <span className="text-xs" style={{ color: C.sub }}>
                      · {moduleN} module{moduleN === 1 ? "" : "s"}
                    </span>
                  )}
                  {instructor && expanded && (
                    /* ★ CLASS CONTROLS. Same three shapes as the module row's,
                       one level up, so "reorder" means the same thing wherever
                       you see arrows. `order-last` keeps them at the end of a
                       wrapping header rather than between the class name and
                       its due date. */
                    <span className="flex gap-1 ml-auto order-last shrink-0">
                      <button onClick={() => moveWeek(wi, -1)} className="text-xs px-1.5 rounded"
                        style={{ color: C.sub, border: `1px solid ${C.line}` }} aria-label="Move class up">↑</button>
                      <button onClick={() => moveWeek(wi, 1)} className="text-xs px-1.5 rounded"
                        style={{ color: C.sub, border: `1px solid ${C.line}` }} aria-label="Move class down">↓</button>
                      {/* ★ Duplicate. Sits with the other class controls rather
                          than beside "+ Add a class", because it acts on THIS
                          class — the same distinction that made the old
                          "+ Add a module" button read wrong. */}
                      <button onClick={() => duplicateWeek(wi)} className="text-xs px-1.5 rounded"
                        style={{ color: C.sub, border: `1px solid ${C.line}` }}
                        title={`Make a copy of "${w.title}" to edit`} aria-label="Duplicate this class">⧉</button>
                      <button onClick={() => deleteWeek(wi)} className="text-xs px-1.5 rounded"
                        style={{ color: C.red || "#B91C1C", border: `1px solid ${C.red || "#B91C1C"}33` }}
                        title="Remove this class">✕</button>
                    </span>
                  )}
                  {/* Greyed AND labelled. A dimmed card with no explanation reads
                      as broken; this says it's a different PIN, not an error. */}
                  {!open && (
                    <span className="text-xs" style={{ color: C.sub }}>· opens with a different class PIN</span>
                  )}
                  {/* ★ IN-PERSON WEEKS SHOW A CLASS TIME, NOT A DEADLINE (Bri,
                      Aug 4 2026: "For my in person calsses (W2 and W3) I need an
                      option to set a class time in place of a due date if I
                      choose. It needs to read something like In Person [SET
                      DATE] [SET TIMEFRAME] — I like where the due dates are
                      placed, this would just show in that spot").
                      ⚠️ AN IN-PERSON WEEK IS NEVER OVERDUE. A due date passing
                      means somebody is late; a class date passing means the
                      class happened. Running the red overdue styling on a
                      calendar event would tell a whole cohort they had failed
                      something they attended. Same slot, different meaning. */}
                  {dues[keyOf(w)] && !inPerson[keyOf(w)] && (
                    <span className="text-xs font-semibold"
                      style={{ color: isOverdue(dues[keyOf(w)]) ? C.red : C.sub }}>
                      · due {dueLabel(dues[keyOf(w)])}{isOverdue(dues[keyOf(w)]) ? " — overdue" : ""}
                    </span>
                  )}
                  {inPerson[keyOf(w)] && dues[keyOf(w)] && (
                    <span className="text-xs font-semibold" style={{ color: C.blue }}>
                      · In Person {dueLabel(dues[keyOf(w)])}
                      {inPerson[keyOf(w)] !== true ? ` · ${inPerson[keyOf(w)]}` : ""}
                    </span>
                  )}
                  {/* ⚠️ THE DUE DATE ITSELF STAYS VISIBLE WHEN CLOSED (the two
                      blocks above), only its EDITOR folds away. "· due Aug 23"
                      and "· In Person" are exactly what somebody skimming the
                      course is looking for; a date picker is not. */}
                  {instructor && expanded && (
                    <span className="flex items-center gap-1 ml-auto">
                      <input type="date" value={dues[keyOf(w)] || ""}
                        onChange={(e) => { const v = e.target.value; setDue(keyOf(w), v); }}
                        className="text-xs px-1 py-0.5 rounded"
                        style={{ border: `1px solid ${C.line}`, color: C.sub }} />
                      {inPerson[keyOf(w)] && (
                        <input
                          value={inPerson[keyOf(w)] === true ? "" : inPerson[keyOf(w)]}
                          onChange={(e) => { const v = e.target.value; setInPerson(keyOf(w), v || true); }}
                          placeholder="9–11 AM"
                          className="text-xs px-1 py-0.5 rounded"
                          style={{ border: `1px solid ${C.line}`, color: C.sub, width: 78 }} />
                      )}
                      <button
                        type="button"
                        onClick={() => setInPerson(keyOf(w), inPerson[keyOf(w)] ? null : true)}
                        className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                        style={{ border: `1px solid ${C.line}`, color: inPerson[keyOf(w)] ? C.blue : C.sub }}>
                        {inPerson[keyOf(w)] ? "In person" : "Due"}
                      </button>
                    </span>
                  )}
                </div>
                {expanded && (<>
                <ul className="space-y-2">
                  {/* One read per week, not per module — the unit of completion
                      is the submitted week, which is the only thing anybody
                      actually records. */}
                  {(() => { const wkDone = P.isDone(`submit:${keyOf(w)}`); return w.modules.map((m, mi) => {
                    const t = TYPE_META[m.type];
                    const done = wkDone;
                    return (
                      <li key={m.id} className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium" style={{ textDecoration: done && !instructor ? "line-through" : "none", color: done && !instructor ? C.sub : C.ink }}>
                              {m.title}
                            </span>
                            <span className="text-xs font-semibold px-1.5 py-0.5 rounded" style={{ color: t.fg, backgroundColor: t.bg }}>
                              {t.label}
                            </span>
                          </div>
                          <div className="text-xs mt-0.5" style={{ color: C.sub }}>{m.note}</div>
                          {m.hub ? (
                            <button disabled={!open} onClick={() => open && setOpenHub(m.hub)}
                              className="text-xs mt-1 font-semibold px-2 py-1 rounded"
                              style={{ color: "#fff", backgroundColor: C.ink }}>
                              Open the class →
                            </button>
                          ) : !m.url ? (
                            <div className="text-xs mt-0.5 font-semibold" style={{ color: C.amber }}>
                              ⚠ Link loads from KV — not stored in code
                            </div>
                          ) : null}
                        </div>
                        {instructor && (
                          <div className="flex flex-col gap-0.5 shrink-0">
                            <button onClick={() => moveModule(wi, mi, -1)} className="text-xs px-1.5 rounded" style={{ color: C.sub, border: `1px solid ${C.line}` }} aria-label="Move up">↑</button>
                            <button onClick={() => moveModule(wi, mi, 1)} className="text-xs px-1.5 rounded" style={{ color: C.sub, border: `1px solid ${C.line}` }} aria-label="Move down">↓</button>
                            {/* ⚠️ RED, AND CONFIRMS BY NAME. It sits in the same
                                small column as the two arrows, so the destructive
                                control is the same size and shape as a harmless
                                one. The confirm names the module rather than
                                asking "are you sure". */}
                            <button onClick={() => deleteModule(wi, mi)} className="text-xs px-1.5 rounded" style={{ color: C.red || "#B91C1C", border: `1px solid ${C.red || "#B91C1C"}33` }} title="Remove this module">✕</button>
                          </div>
                        )}
                      </li>
                    );
                  }); })()}
                </ul>
                {/* 🐛 "+ Add a module" WAS HERE AND IS GONE. Bri, Aug 8 2026:
                    "You can completely remove the add module where it was added
                    because it doesn't serve the function I need. Having that
                    button is noise."
                    It did exactly what it said and that was the problem — it
                    added a row INSIDE the class she was looking at, when what
                    she wanted was a new class. Adding classes lives in the
                    header controls and under the list. The module reorder and
                    delete stay, because she confirmed those work. */}
                </>)}
              </Card>

              {/* Bri's flow: the prep work for the NEXT class sits directly under
                  the one you've just finished. Nothing renders under a week that
                  has no section anchored to it — Week 1 has none by design,
                  because the Trainer application is its prep work. */}
              {prepShown.filter((sec) => String(sec.after) === String(w.n)).map(renderPrepSection)}

              {instructor && (
                <div className="flex gap-2 mb-1">
                  <input value={newSection[w.n] || ""}
                    onChange={(e) => { const v = e.target.value; setNewSection((d) => ({ ...d, [w.n]: v })); }}
                    onKeyDown={(e) => e.key === "Enter" && addSection(w.n)}
                    placeholder={`Add a prep-work section after Week ${w.n}`}
                    className="flex-1 text-sm px-3 py-2 rounded-lg outline-none"
                    style={{ border: `1px solid ${C.line}`, backgroundColor: C.card }} />
                  <button onClick={() => addSection(w.n)} className="text-sm font-semibold px-3 py-2 rounded-lg"
                    style={{ border: `1px solid ${C.ink}`, color: C.ink }}>+ Section</button>
                </div>
              )}
              </React.Fragment>
              );
            })}
            {instructor && (
              /* ★ ADD A CLASS. Under the whole list rather than inside any one
                 class, which is the distinction that went wrong the first time:
                 a control sitting inside W3 reads as "add something to W3".
                 New classes append to the end, which is what Bri asked for
                 ("add another class onto these to add after W4"). */
              <button onClick={addWeek} className="mt-1 text-xs px-2 py-1 rounded font-semibold"
                style={{ color: "#fff", background: C.navy || "#1D4ED8" }}>
                + Add a class
              </button>
            )}
          </div>
        </section>

        {/* Instructor-only. Renders nothing at all when everything is anchored,
            so a tidy setup never sees this block. */}
        {instructor && (prepWork || []).some((s) => s.after === undefined || s.after === null) && (
          <section className="mb-6">
            <div className="rounded-xl p-4" style={{ backgroundColor: C.card, border: `1px solid ${C.red}` }}>
              <div className="l1-display font-bold text-sm mb-1" style={{ color: C.ink }}>
                Prep work not attached to a week
              </div>
              <p className="text-xs mb-3" style={{ color: C.sub }}>
                These sections aren't showing anywhere on this page, including to you — a prep section
                only appears underneath the week it's set to follow. Choose a week for each one, or
                delete it. Some of these are likely left over from the original demo setup.
              </p>
              {(prepWork || []).filter((s) => s.after === undefined || s.after === null).map((sec) => (
                <div key={sec.id} className="rounded-lg p-3 mb-2" style={{ backgroundColor: C.paper, border: `1px solid ${C.line}` }}>
                  <div className="flex items-center gap-2 mb-2">
                    <input value={sec.title || ""} placeholder="Untitled section"
                      onChange={(e) => { const v = e.target.value; renameSection(sec.id, v); }}
                      className="flex-1 text-sm font-semibold px-2 py-1 rounded"
                      style={{ border: `1px solid ${C.line}`, backgroundColor: C.card }} />
                    <button onClick={() => delSection(sec.id)} className="text-xs px-2 py-1 rounded font-semibold"
                      style={{ color: C.red, border: `1px solid ${C.line}` }}>Delete</button>
                  </div>
                  {/* A legacy row can carry its wording on `text` with no items
                      array at all — show it, or she is deciding blind. */}
                  {!!sec.text && !((sec.items || []).length) && (
                    <div className="text-xs mb-2 italic" style={{ color: C.sub }}>{sec.text}</div>
                  )}
                  <div className="text-xs mb-2" style={{ color: C.sub }}>
                    {((sec.items || []).length)} task{((sec.items || []).length) === 1 ? "" : "s"} inside
                  </div>
                  <select value="" onChange={(e) => { const v = e.target.value; if (v) placeSection(sec.id, Number(v)); }}
                    className="text-xs px-2 py-1 rounded"
                    style={{ border: `1px solid ${C.line}`, backgroundColor: C.card, color: C.ink }}>
                    <option value="">Move to…</option>
                    <option value="0">Before the first class</option>
                    {weeks.map((w) => <option key={w.n} value={w.n}>After {w.label ? w.title : `Week ${w.n}`}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── THE END-OF-CLASS SURVEY ────────────────────────────────────────
            Bri, Aug 3 2026: "a survey added somewhere at the end of the L101
            class — maybe upon completing the last module it can open the survey
            as a final step to completing the class."

            ★ ANONYMOUS. Answers never touch the student's record; see the header
            of L101Survey.jsx for why that decided the whole design. What lands
            on their record is a completed item, so she can give credit without
            being able to read back who wrote what.

            ⚠️ THE EDITOR AND THE STUDENT VIEW READ THE SAME RECORD. This file
            has already shipped three item types where the editor wrote one shape
            and the renderer read another, so the questions Bri edits below are
            literally the array L101Survey maps over — not a copy of it. */}
        <section className="mb-6">
          {instructor && (
            <div className="rounded-xl p-4 mb-3" style={{ backgroundColor: C.card, border: `1px solid ${C.line}` }}>
              <div className="l1-display font-bold text-sm mb-1" style={{ color: C.ink }}>Survey settings</div>
              <p className="text-xs mb-3" style={{ color: C.sub }}>
                Students only. You see the questions here; the panel underneath is what they get.
                Answers come back with no name attached, so this is the one thing on the page you
                can't trace to a person.
              </p>

              {/* ★ NOT EVERY CLASS WANTS ONE (Bri, Aug 4 2026: "I'd like the
                  option to hide the surveys as requirements if I don't want to
                  require them for certain classes").
                  ⚠️ OFF hides it from students entirely rather than showing an
                  optional one they can skip. A survey on screen that nobody has
                  to do still reads as a task, and a class that ends on an
                  ignorable task ends badly. Off means gone.
                  ⚠️ Undefined counts as ON, so the two classes already running
                  keep their survey without Bri touching anything. Rule 1: a
                  field the old writer never set must not change behaviour. */}
              <label className="flex items-center gap-2 mb-3 text-xs font-semibold" style={{ color: C.ink }}>
                <input
                  type="checkbox"
                  checked={survey.enabled !== false}
                  onChange={(e) => { const v = e.target.checked; setSurvey((c) => ({ ...c, enabled: v })); }} />
                Use a survey in this class
              </label>

              <div className="flex flex-wrap items-center gap-2 mb-3" style={{ opacity: survey.enabled === false ? 0.45 : 1 }}>
                <span className="text-xs font-semibold" style={{ color: C.sub }}>Opens</span>
                <input type="date" value={survey.openAt || ""}
                  onChange={(e) => { const v = e.target.value; setSurvey((c) => ({ ...c, openAt: v })); }}
                  className="text-xs px-2 py-1 rounded" style={{ border: `1px solid ${C.line}`, backgroundColor: C.card, color: C.ink }} />
                <span className="text-xs font-semibold" style={{ color: C.sub }}>Closes</span>
                <input type="date" value={survey.closeAt || ""}
                  onChange={(e) => { const v = e.target.value; setSurvey((c) => ({ ...c, closeAt: v })); }}
                  className="text-xs px-2 py-1 rounded" style={{ border: `1px solid ${C.line}`, backgroundColor: C.card, color: C.ink }} />
                {/* The override she asked for, and it BEATS the dates in both
                    directions — "open it now" that waits for a date to agree is
                    not an override. Three states, not a checkbox, because
                    "force closed" and "following the dates" are different. */}
                <select value={survey.manual === true ? "open" : survey.manual === false ? "shut" : "auto"}
                  onChange={(e) => { const v = e.target.value; setSurvey((c) => ({ ...c, manual: v === "open" ? true : v === "shut" ? false : null })); }}
                  className="text-xs px-2 py-1 rounded" style={{ border: `1px solid ${C.line}`, backgroundColor: C.card, color: C.ink }}>
                  <option value="auto">Follow the dates</option>
                  <option value="open">Force open now</option>
                  <option value="shut">Force closed now</option>
                </select>
              </div>

              {/* Says the ANSWER, not the settings. She should never have to
                  work out what her own dates add up to today. */}
              <div className="text-xs font-semibold mb-3" style={{ color: surveyIsOpen(survey, todayIso()) ? C.green : C.sub }}>
                {surveyIsOpen(survey, todayIso()) ? "Students can fill it in right now." : "Students cannot fill it in right now."}
              </div>

              {!(survey.questions || []).length ? (
                <div>
                  <p className="text-xs mb-2" style={{ color: C.sub }}>
                    Your seven Google Form questions are already what students see. Press this only when
                    you want to change them.
                  </p>
                  <button onClick={() => setSurvey((c) => ({ ...c, questions: SURVEY_SEED.map((q) => ({ ...q })) }))}
                    className="text-sm font-semibold px-3 py-2 rounded-lg" style={{ border: `1px solid ${C.ink}`, color: C.ink }}>
                    Edit the questions
                  </button>
                </div>
              ) : (
                <div>
                  {survey.questions.map((q, i) => (
                    <div key={q.id} className="rounded-lg p-3 mb-2" style={{ backgroundColor: C.paper, border: `1px solid ${C.line}` }}>
                      <div className="flex items-start gap-2 mb-2">
                        <span className="text-xs font-bold pt-2" style={{ color: C.sub, fontFamily: "monospace" }}>{i + 1}.</span>
                        <textarea value={q.text || ""} rows={2}
                          onChange={(e) => { const v = e.target.value; setSurvey((c) => ({ ...c, questions: c.questions.map((x) => (x.id === q.id ? { ...x, text: v } : x)) })); }}
                          className="flex-1 text-sm px-2 py-1 rounded" style={{ border: `1px solid ${C.line}`, backgroundColor: C.card, resize: "vertical" }} />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <select value={q.type || "text"}
                          onChange={(e) => { const v = e.target.value; setSurvey((c) => ({ ...c, questions: c.questions.map((x) => (x.id === q.id ? { ...x, type: v } : x)) })); }}
                          className="text-xs px-2 py-1 rounded" style={{ border: `1px solid ${C.line}`, backgroundColor: C.card, color: C.ink }}>
                          <option value="text">Written answer</option>
                          <option value="scale">Rating 1 to 5</option>
                          <option value="choice">Yes or No</option>
                        </select>
                        <label className="text-xs flex items-center gap-1" style={{ color: C.sub }}>
                          <input type="checkbox" checked={!!q.req}
                            onChange={(e) => { const v = e.target.checked; setSurvey((c) => ({ ...c, questions: c.questions.map((x) => (x.id === q.id ? { ...x, req: v } : x)) })); }} />
                          Required
                        </label>
                        <button onClick={() => setSurvey((c) => ({ ...c, questions: c.questions.filter((x) => x.id !== q.id) }))}
                          className="text-xs px-2 py-1 rounded font-semibold ml-auto" style={{ color: C.red, border: `1px solid ${C.line}` }}>
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                  {/* ⚠️ The id is stamped from the clock and never reused. Answers
                      are stored against question TEXT, but the id is what the
                      editor edits by — two questions sharing one would edit as a
                      pair, which is the kind of thing nobody notices until a
                      class has already filled it in. */}
                  <button onClick={() => setSurvey((c) => ({ ...c, questions: [...(c.questions || []), { id: "q" + Date.now(), type: "text", req: false, text: "" }] }))}
                    className="text-sm font-semibold px-3 py-2 rounded-lg" style={{ border: `1px solid ${C.ink}`, color: C.ink }}>
                    + Question
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ⚠️ SHOWN TO THE INSTRUCTOR TOO, on purpose. Bri asked to see what
              students see on every other part of this page, and a preview that
              lives somewhere else drifts from the real thing. She can submit it
              like anyone else; her answers are anonymous like anyone else's. */}
          {/* 🐛 THIS WAS HARDCODED program="l101" AND IT IS THE SAME COMPONENT
              TRAINER ORIENTATION RENDERS (Bri, Aug 4 2026: "I also need the
              title of the survey in Trainer Orientation to be changed to this
              (it shows Leadership 101 right now)").
              The title was the visible half. The DATA half is worse: every
              Trainer Orientation response was being stored tagged as an L101
              response, so Bri's two classes would have arrived mixed in one
              pile with no way to tell them apart afterwards. Caught before
              anyone submitted one.
              ⇒ Both the tag and the default title come from the running
              program, which is the thing that already knows which class this
              is. */}
          {survey.enabled !== false && (
            <L101Survey cfg={survey} P={P} todayIso={todayIso()} program={PG.ns} programName={PG.name} />
          )}
        </section>

        {/* The "Before this goes live" panel that sat here was a note to whoever
            was BUILDING this page — Canva tokens, KV keys, "that's her hours,
            not your code". Weeks 1 and 4 are live and students read this page,
            so build notes don't belong on it. Removed at Bri's request, Jul 24. */}
      </div>
    </div>
  );
}
