/* ══════════════════════════════════════════════════════════════════════════
   jobCodes.js — WHAT JOBS THIS STORE HAS, WHICH SIDE EACH ONE IS, AND WHICH
   ONES MEAN SOMEBODY IS LEADING.

   ★ NEAR-LEAF. Imports FOHAutoAssign.js for `isBohJob` and nothing else, which
   bottoms out in storeConfig / nameMatch / shiftHours. No React, no storage.

   ────────────────────────────────────────────────────────────────────────
   ⚠️⚠️ WHY THIS EXISTS: A REGEX WAS DECIDING WHICH SIDE A JOB IS ON.
   ────────────────────────────────────────────────────────────────────────
   `isBohJob` matches kitchen words — bread, fry, machine, prep, dish, biscuit.
   That is exactly right for the job codes HotSchedules sends, because it was
   written from them. It is a guess for anything a store invents afterwards.

   Matt, Aug 13 2026: "we need the abilty to change and add job codes as well as
   job skill", and "for leadership add FOH and DT leaders". The moment a store
   can type a new code, a regex that has never seen it is deciding whether that
   person works the kitchen or the front counter — silently, and only for people
   holding the new code.

   ⇒ A typed code carries its OWN side. `isBohJob` stays as the FALLBACK for
   codes nobody has classified yet, so nothing that works today changes and the
   engines keep one definition of "is this kitchen work" (rule 8).

   ⚠️ THE SEED IS A STARTING POINT, NOT A CONSTANT. It lists the codes this
   store's own HotSchedules export actually contains plus the two leadership
   codes Matt asked for, and every one of them is editable on screen. A store
   that renames a station or adds a job types it once (rule 18).

   ⚠️ AN EMPTY LIST IS A WORKING STATE. With nothing typed, `sideOf` falls back
   to the regex and `isLeaderCode` to the word "lead", which is exactly how the
   Hub behaved before this file existed.
   ══════════════════════════════════════════════════════════════════════════ */

import { isBohJob } from "./FOHAutoAssign.js";

export const JOBCODES_KEY = "gcfcr-jobcodes-v1";

export const SIDES = Object.freeze(["FOH", "BOH"]);

/* ══════════════════════════════════════════════════════════════════════════
   ★★ ZONE — WHERE INSIDE THE FRONT, so the tool can say WHERE to cut.

   Matt, Aug 14 2026: "for job codes have DT and foh you know where to cut
   exactly." The labor advice can already say "you are two over at lunch"; it
   cannot say which half of the front to take them from, and those are two
   different decisions with two different queues out of the window.

   ⚠️⚠️ A ZONE, NOT A THIRD SIDE, AND THAT IS NOT A NAMING PREFERENCE. `side`
   decides which BOARD somebody can be scheduled onto — scheduleEngine tests
   `sideOf(job) !== side` with side being exactly "FOH" or "BOH". Add "DT" to
   that list and every drive-thru code matches neither board, so the people who
   hold them silently stop being schedulable at all. Zone sits beside side and
   nothing that reads side changes.

   ⚠️ IT ONLY MEANS ANYTHING ON THE FRONT. The kitchen is one zone and pretending
   otherwise would put an empty picker on 17 rows.

   ⚠️ NULL IS A REAL, NORMAL VALUE. Every job code stored before today has no
   zone, and a code that genuinely serves both halves — the window, expo — should
   stay null rather than be forced into one. Design rule 1: the old shape still
   reads, and `zoneOf` answers null rather than guessing.

   ⚠️⚠️ "DT" AND "FC" ARE THE LABOR PLANNER'S OWN TWO BUCKETS AND MUST NOT BE
   RENAMED. `splitFohHours` in dayparts.js returns `{ dt, fc }`, split on real
   sales through `dtShareOfFoh` — drive thru against carry out, dine in and on
   demand. Matt, Aug 14 2026: "its important because the planners says to cut
   from dt and from foh."

   ⇒ That is the whole point of this field. The planner already says "you are
   two hours over on DT"; these zones are what let the board answer "and here
   are the codes that are DT". Two vocabularies for one split would make the
   advice unactionable in exactly the moment somebody is trying to act on it.
   He says "foh" out loud for the second bucket; the planner's field is `fc`,
   and matching the planner is what makes the two line up. */
export const ZONES = Object.freeze(["DT", "FC"]);

/* What to call a zone on screen. ⚠️ ONE definition — a screen writing "Front
   counter" beside a planner saying "FC" is the same drift in words. */
export const ZONE_LABEL = Object.freeze({ DT: "Drive Thru", FC: "Front Counter" });

/* Skill words, in the order HotSchedules sends them. The engines read these
   words, so the list is here and nowhere else. */
export const SKILL_WORDS = Object.freeze(["beginner", "intermediate", "advanced"]);

/* ⚠️ THE TWO LEADERSHIP CODES MATT ASKED FOR ARE IN HERE, and the plain
   LEADERSHIP code stays beside them. A store that has been tagging people
   "LEADERSHIP" for a year does not lose that the day a finer code appears —
   `isLeaderCode` answers true for all three, so nobody drops off a leader row
   because their record uses the older word. */
export const DEFAULT_CODES = Object.freeze([
  { code: "LEADERSHIP", side: "FOH", leader: true },
  { code: "FOH LEADER", side: "FOH", leader: true },
  { code: "DT LEADER", side: "FOH", leader: true },
  { code: "DRIVE THRU", side: "FOH", leader: false },
  { code: "IN TRAINING", side: "FOH", leader: false },
  { code: "TRAINER", side: "FOH", leader: false },
  { code: "BOARDS 1 SANDWICHES", side: "BOH", leader: false },
  { code: "BOARDS 2 NUGGETS STRIPS SOUP", side: "BOH", leader: false },
  { code: "BISCUITS", side: "BOH", leader: false },
  { code: "BREADER", side: "BOH", leader: false },
  { code: "DISHES", side: "BOH", leader: false },
  { code: "FRIES", side: "BOH", leader: false },
  { code: "MACHINES", side: "BOH", leader: false },
  { code: "PREP", side: "BOH", leader: false },
  { code: "TRUCK", side: "BOH", leader: false },
]);

export const normCode = (c) => String(c || "").trim().toUpperCase().replace(/\s+/g, " ");

/* Guard the read. An empty or unreadable record answers "nothing typed yet",
   which is a working state — see the header. Rule 1. */
export function readJobCodes(raw) {
  const rows = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.codes) ? raw.codes : null);
  if (!rows) return { v: 1, codes: [] };
  const seen = new Set();
  const codes = [];
  rows.forEach((r) => {
    const code = normCode(r && r.code);
    if (!code || seen.has(code)) return;
    seen.add(code);
    codes.push({
      code,
      side: SIDES.includes(r.side) ? r.side : null,
      /* ⚠️ KEPT, NOT DEFAULTED. A row written before zones existed comes back
         null, which is the truthful answer — nobody has said. */
      zone: ZONES.includes(r && r.zone) ? r.zone : null,
      leader: !!(r && r.leader),
      /* ⚠️⚠️ CARRIED THROUGH, AND IT WAS NOT BEFORE. This marks a row that came
         from the BOARD rather than from somebody typing a job title, and
         `codeGroups` uses it to tell a STATION that leads (Machines 1,2,3 — DT
         Lead) from a RANK (DT Leader). Dropping it here meant the moment a
         store SAVED one of those board rows — setting its zone, say — it stopped
         being a station and jumped into the Leadership group, so the next bulk
         skill apply would silently skip it again. Found by this file's own test
         within minutes of the bug it was written for. */
      fromStations: !!(r && r.fromStations),
    });
  });
  return { v: 1, codes };
}

/* A quick lookup keyed by normalised code. */
export function codeIndex(store) {
  const map = new Map();
  readJobCodes(store).codes.forEach((c) => map.set(c.code, c));
  return map;
}

/* Which side a job code belongs to.
   ⚠️ THE TYPED ANSWER WINS. The regex is only consulted for a code nobody has
   classified, so a store can correct a wrong guess permanently instead of
   living with it. */
export function sideOf(code, index) {
  const key = normCode(code);
  const hit = index && index.get ? index.get(key) : null;
  if (hit && hit.side) return hit.side;
  return isBohJob(key) ? "BOH" : "FOH";
}

/* Which half of the front a job code sits in, or null.

   ⚠️ THE TYPED ANSWER WINS, exactly like `sideOf` above, and there is NO regex
   fallback here on purpose. `sideOf` can guess from a name because "is this
   kitchen work" is a question about the trade; "is this drive thru or front
   counter" is a question about THIS BUILDING, and a store that runs a single
   line or three lanes would get a confident wrong answer. Unclassified stays
   null and the screen says so.

   ⚠️ NULL IS NOT "BOTH" AND MUST NOT BE READ AS EITHER. The window and the expo
   really do serve both halves; a cut suggestion that quietly counted them under
   one would take somebody off a position the other half was relying on. */
export function zoneOf(code, index) {
  const key = normCode(code);
  const hit = index && index.get ? index.get(key) : null;
  return hit && hit.zone && ZONES.includes(hit.zone) ? hit.zone : null;
}

/* Does holding this code mean somebody is leading?
   ⚠️ THE FALLBACK IS THE WORD "LEAD", not a fixed list, so a store that types
   "SHIFT LEAD" without ticking the box still gets sensible behaviour rather
   than a leader row that silently accepts anybody. */
export function isLeaderCode(code, index) {
  const key = normCode(code);
  const hit = index && index.get ? index.get(key) : null;
  if (hit) return !!hit.leader;
  return /\blead/i.test(key);
}

/* Every code a person holds that sits on one side, with the best skill on it. */
export function codesOnSide(jobs, side, index) {
  const out = [];
  const map = jobs && typeof jobs === "object" ? jobs : {};
  Object.keys(map).forEach((j) => {
    if (sideOf(j, index) !== side) return;
    out.push({ code: normCode(j), skill: String(map[j] || "") });
  });
  return out.sort((a, b) => a.code.localeCompare(b.code));
}

/* Codes seen in the stored skills that nobody has classified yet. This is what
   lets the screen say "you have 3 job codes the import brought in that you have
   not told us about" rather than quietly guessing at them for ever. */
export function unclassified(skills, store) {
  const index = codeIndex(store);
  const people = (skills && skills.people) || skills || {};
  const seen = new Set();
  Object.keys(people).forEach((id) => {
    const jobs = (people[id] || {}).jobs || {};
    Object.keys(jobs).forEach((j) => {
      const k = normCode(j);
      if (k && !index.has(k)) seen.add(k);
    });
  });
  return [...seen].sort();
}

/* Merge one edit into the list without disturbing the rest. */
export function upsertCode(store, entry) {
  const codes = readJobCodes(store).codes.slice();
  const code = normCode(entry && entry.code);
  if (!code) return { v: 1, codes };
  const i = codes.findIndex((c) => c.code === code);
  const row = {
    code,
    side: SIDES.includes(entry.side) ? entry.side : null,
    /* ⚠️ A ZONE ON A KITCHEN CODE IS DROPPED, not stored and ignored. Stored,
       it would come back out of `zoneOf` and a cut suggestion would start
       naming a drive thru in the kitchen. */
    zone: entry.side === "FOH" && ZONES.includes(entry.zone) ? entry.zone : null,
    leader: !!entry.leader,
  };
  if (i >= 0) codes[i] = row; else codes.push(row);
  codes.sort((a, b) => a.code.localeCompare(b.code));
  return { v: 1, codes };
}

export function removeCode(store, code) {
  const key = normCode(code);
  return { v: 1, codes: readJobCodes(store).codes.filter((c) => c.code !== key) };
}

/* ── every position on the board, as a job role ───────────────────────────
   Matt, Aug 13 2026: "i want all positions as job roles as well." And earlier,
   on why the generic list cannot simply be replaced: "I will want other stores
   to adopt this so they will probably need the generic positions and more
   flexibility on the hrs but my store is more specific."

   ⇒ SO THIS ADDS, IT NEVER REPLACES. The 15 generic codes stay exactly as they
   are — they are what HotSchedules exports, what 313 existing ratings are
   keyed to, and what a store with no station matrix has on day one. Station
   positions land alongside them.

   ⚠️⚠️ DERIVED, NEVER TYPED, AND THAT IS DESIGN RULE 18. A store's positions
   ARE its stations; typing them a second time into a job code list would give
   every store two lists that drift, and the drifting one would be the one
   nobody looks at. This reads `stations.FOH` / `stations.BOH` and returns what
   is there. Another store gets its own; a store with no stations gets none.

   ⚠️ SIDE COMES FROM WHICH LIST IT IS IN, which is the only place that fact
   has ever lived, rather than from guessing at the name.

   ⚠️ `leader` COMES FROM THE STATION'S OWN SECTION AND NAME, through the SAME
   test scheduleEngine already uses to decide whether a row needs somebody
   certified to lead. A second opinion about what "LEADER DT" means is exactly
   the drift rule 8 exists to stop, so the pattern lives here and that engine's
   local copy should be pointed at it next time anybody is in that file.

   ⚠️ A POSITION THAT COLLIDES WITH A TYPED CODE LOSES. If a store has already
   typed BREADER by hand, that row wins and keeps whatever side and leader flag
   somebody chose; the derived one is dropped rather than silently overriding a
   human's answer.

   ⚠️ MANUAL-ONLY ROWS ARE STILL POSITIONS. TRAINER and the leader rows carry
   `hours: null` because nobody is ROSTERED to them, but people are certainly
   certified on them, and a job role is about what somebody can do rather than
   about whether the engine fills it. */
const LEADERISH = /lead|director|manager|supervis|captain/i;

export function positionsFromStations(stations) {
  const src = stations && typeof stations === "object" ? stations : {};
  const out = [];
  const seen = new Set();
  SIDES.forEach((side) => {
    const byDay = src[side] && typeof src[side] === "object" ? src[side] : {};
    Object.keys(byDay).forEach((day) => {
      (Array.isArray(byDay[day]) ? byDay[day] : []).forEach((st) => {
        const code = normCode(st && st.name);
        if (!code || seen.has(code)) return;
        seen.add(code);
        out.push({
          code,
          side,
          leader: LEADERISH.test(String((st && st.section) || "")) || LEADERISH.test(String((st && st.name) || "")),
          fromStations: true,
        });
      });
    });
  });
  return out.sort((a, b) => a.side.localeCompare(b.side) || a.code.localeCompare(b.code));
}

/* The list a screen or the engine should actually use: what the store typed,
   plus every position it did not. Typed rows keep their place at the front so
   an existing list does not reshuffle under somebody mid-edit. */
export function allCodes(store, stations) {
  const typed = readJobCodes(store).codes;
  const have = new Set(typed.map((c) => c.code));
  const derived = positionsFromStations(stations).filter((c) => !have.has(c.code));
  return { v: 1, codes: [...typed, ...derived] };
}

/* ══════════════════════════════════════════════════════════════════════════
   ★★ JOB CODES GROUPED THE WAY A LEADER THINKS ABOUT THEM.

   Matt, Aug 14 2026: "for job skill i want an option to apply the same skill to
   all jobs" — then, asked which grouping: "by section", and the example
   "brandon should be advanced for all boh jobs. hes the director."

   Setting one person's kitchen rating today is fifteen separate taps on
   fifteen separate menus, and the person it is most obviously true for is the
   Director, who is advanced at all of it.

   ⇒ The groups are built from the codes THEMSELVES — side, zone, leader — so a
   store that adds a code gets it in the right group with nothing extra to type
   (rule 18). No new stored field, no second list to keep in step.

   ⚠️⚠️ A LEADERSHIP CODE IS NEVER INSIDE A SIDE GROUP. "Advanced at every
   kitchen job" must not quietly also say "advanced at LEADING the kitchen".
   That is a rank, not a station, and it is a different sentence about a person.
   Leadership is its own group so it can be chosen on purpose.

   ⚠️ AN EMPTY GROUP IS DROPPED rather than shown greyed out. A store that has
   not set zones on its front-counter codes should not be offered two pickers
   that would change nothing.

   Returns [{ id, label, codes: [CODE, ...] }], `all` first.
   ══════════════════════════════════════════════════════════════════════════ */
export function codeGroups(codes, index) {
  const list = (Array.isArray(codes) ? codes : [])
    .map((c) => normCode(typeof c === "string" ? c : (c && c.code)))
    .filter(Boolean)
    .filter((c, i, a) => a.indexOf(c) === i);
  if (!list.length) return [];

  /* ══════════════════════════════════════════════════════════════════════
     ⚠️⚠️ A STATION ON THE BOARD IS A STATION, EVEN WHEN IT LEADS.

     Matt, Aug 14 2026, looking at his own screen after pressing Kitchen →
     advanced: "Machines is BOH." Three BOH rows had stayed "not trained" —
     KITCHEN LEAD / DT, MACHINES 1,2,3 — DT LEAD and MACHINES 4,5 / GRILLS —
     FOH LEAD. Every one of them is a real station in his kitchen, and every one
     of them was skipped because `isLeaderCode` matches the word "lead" and this
     function put every leader code outside the side groups.

     ⇒ The distinction is not the word. It is where the code CAME FROM.
     `positionsFromStations` stamps `fromStations: true` on anything derived
     from the board, so a row that is a place somebody stands stays with its
     side, and only a TYPED rank code — LEADERSHIP, FOH LEADER, DT LEADER —
     sits in Leadership.

     ⚠️ THE RULE ABOVE STILL HOLDS FOR THOSE. "Advanced at every kitchen job"
     must not say "advanced at LEADING the kitchen", and it still does not: a
     rank is a rank and is chosen on purpose. Being able to run Machines 4,5 is
     a station skill, and a leader rating their kitchen means to include it.
     ══════════════════════════════════════════════════════════════════════ */
  const byCode = new Map();
  (Array.isArray(codes) ? codes : []).forEach((c) => {
    if (c && typeof c === "object" && c.code) byCode.set(normCode(c.code), c);
  });
  const fromBoard = (c) => {
    const rec = byCode.get(c) || (index && index.get ? index.get(c) : null);
    return !!(rec && rec.fromStations);
  };
  const isRank = (c) => isLeaderCode(c, index) && !fromBoard(c);

  const leader = list.filter(isRank);
  const station = list.filter((c) => !isRank(c));
  const boh = station.filter((c) => sideOf(c, index) === "BOH");
  const foh = station.filter((c) => sideOf(c, index) === "FOH");
  const dt = foh.filter((c) => zoneOf(c, index) === "DT");
  const fc = foh.filter((c) => zoneOf(c, index) === "FC");

  const out = [{ id: "all", label: "Every job", codes: list }];
  /* Kitchen before front, matching SIDE_ORDER in scheduleEngine and the order
     the board itself is built in. */
  if (boh.length) out.push({ id: "BOH", label: "Kitchen", codes: boh });
  if (foh.length) out.push({ id: "FOH", label: "Front", codes: foh });
  /* ⚠️ ONLY WHEN THEY ARE A REAL SUBSET. With every front code in one zone,
     that picker is the Front picker under a second name. */
  if (dt.length && dt.length < foh.length) out.push({ id: "DT", label: `Front · ${ZONE_LABEL.DT}`, codes: dt });
  if (fc.length && fc.length < foh.length) out.push({ id: "FC", label: `Front · ${ZONE_LABEL.FC}`, codes: fc });
  if (leader.length) out.push({ id: "leader", label: "Leadership", codes: leader });
  return out;
}
