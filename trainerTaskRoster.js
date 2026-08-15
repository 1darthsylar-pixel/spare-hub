// trainerTaskRoster.js — shared between the frontend (TrainerTaskSubmit.jsx,
// TrainerTasksTile.jsx) and worker.js. Plain JS, no framework imports, so
// both the Vite-built SPA and the Cloudflare Worker bundle can import it
// directly without conflict.
//
// ⚠️ THAT LINE ABOUT EDITING THIS FILE WHEN TASHIANA ROTATES ASSIGNMENTS IS
// GONE, AND IT WAS WRONG BY AUG 11 2026. Assignments are edited in the app and
// live in KV `gcfcr-trainer-roster-v1`; the submission screen, oversight tile,
// Shift Leader Scorecard, Slack summary and completion email all read THAT.
// This file is only the fallback for a failed read. Editing it does not change
// who owns a task, and the proof is below: it says 12 and the live roster says
// 10. A stale instruction is how a source file drifts two people out of date
// without anybody noticing.

import { isGateCity } from "./storeConfig.js";
/* ⚠️ THIS FILE USED TO IMPORT NOTHING AND NOW IMPORTS ONE THING.
   storeConfig.js is itself a strict leaf, so the chain still terminates and
   cyclecheck proves no cycle. It is safe for the same reason it was safe in
   stationTemplates.js and hrTeam.js: storeConfig is read by browser tiles AND
   by worker.js, which is exactly the pair this file has to serve. Nothing
   else may be added here. */

import { STORE_CONFIG } from "./storeConfig.js";
/* ⚠️⚠️ THIS IS A FALLBACK, NOT THE ROSTER. The live one is KV
   `gcfcr-trainer-roster-v1`, written by TrainerTasks.jsx when somebody edits
   assignments in-app, and every consumer reads that first. This array only
   answers when the KV read is empty or fails, so the scheduled job never posts
   an empty checklist because a read blipped.

   ⚠️ IT IS GATE CITY'S AND ONLY GATE CITY'S. Call `trainerTaskFallback()`,
   never this array directly: a second store would otherwise get twelve of
   Matt's trainers posted into their Slack, by name, on the first blip.

   ⚠️⚠️ FULL NAMES, INCLUDING BOTH SURNAMES. THIS IS NOT A PLACE TO SHORTEN.
   Matt, Aug 11 2026: "most of our team is hispanic and the names will be that
   way." Two surnames is the norm here, not an exception to tidy away.

   The Jul 26 2026 note on slackIdForName already settled this: this file also
   feeds the submission screen, the oversight tile and the Shift Leader
   Scorecard, so shortening a name to match Slack "would put shortened names in
   front of everyone. So the CODE moves, not the roster." The resolver handles
   Slack's short forms (josea · joselinv · mariag) off the avatars map.

   ⚠️ EVERY NAME HERE IS THE HR ROSTER SPELLING, checked against it rather than
   typed: 10 of 10 match exactly. Three were wrong before and all three the same
   way, a second surname dropped —
       Jose Arias        → Jose Arias Cortez
       Joselin Vargas    → Joselin Vargas-Teodoro
       Maria Garcia      → Maria Garcia-Perez
   The last also fixes a real misspelling Matt caught: it was "Gracia-Perez"
   here, and Gracia is a different surname from Garcia. There are nine Garcias
   on the roster, so "Maria Garcia" is ambiguous as well as incomplete.

   ⚠️ THE LIVE KV ROSTER STILL CARRIES THE THREE SHORT FORMS and that is
   Tashiana's to correct through the screen, not mine in a source file. Until
   it is, this fallback and the live roster disagree about three names — in the
   direction of this file being right. */
/* ⚠️ THE TRAINERS MOVED TO ownerSeed.js. The TASKS are standard cleaning
   assignments and stay; the people against them were this store's, shipped to
   every clone as a fallback rota naming strangers.
   ⚠️ READ FROM `STORE_CONFIG`, NOT `storeCfg`, and at module level, which is
   the same thing orgSeats.js does with the seat map and for the same reason:
   this file is imported by the Worker, and a live-config read here would look
   dynamic and never be. */
export const TRAINER_TASK_ROSTER = STORE_CONFIG.owners.trainerTasks;

/* The roster to fall back on when the live KV copy is empty or unreadable.
   ★ ONE PLACE, so the Worker job and the screen cannot disagree about what a
   blip should show (design rule 8).
   ⚠️ A second store gets [], which posts nothing rather than posting Gate
   City's trainers into their Slack. Empty is the honest answer to "who owns
   these tasks" at a store that has not said yet. */
export function trainerTaskFallback() {
  return isGateCity() ? TRAINER_TASK_ROSTER : [];
}

/* ═══ THE FORTNIGHT ════════════════════════════════════════════════════════
   Matt, Aug 11 2026: "lets change trainer tasks to bi weekly as well", then
   "every trainer does their task once a fortnight". Every task on the list is
   still due; it is due every OTHER week. Half the work, same coverage.

   ⚠️ IT NEEDS AN ANCHOR OR IT DRIFTS. "Every two weeks" is not a fact about a
   date on its own — it only means something counted from a fixed Monday. Pick
   it implicitly (say, even-numbered ISO weeks) and the answer changes at a year
   boundary, which is the kind of bug that shows up once, in January, and gets
   blamed on the trainer.
   ⚠️ THE ANCHOR IS THE MONDAY OF THE WEEK IT WAS ASKED FOR, written down rather
   than computed. Aug 10 2026 is a Monday. Changing it re-phases all twelve
   trainers at once, so it is a decision, not a constant to tidy.

   ⚠️ Math.round, NOT floor, ON THE WEEK COUNT. Two Mondays either side of a
   daylight-saving change are 7 days minus an hour apart, so a floor would land
   a week early twice a year — in March and November, and only then.
   ⚠️ THE DOUBLE MODULO handles dates BEFORE the anchor. `-1 % 2` is -1 in
   JavaScript, which would push `start` a week FORWARD into the future for any
   history older than the anchor; `((n % 2) + 2) % 2` is the positive remainder.

   Mon–Sat is still the business week (store closed Sunday); a period is simply
   two of them, so `start` is always a Monday exactly as before. */
export const TRAINER_PERIOD_ANCHOR = "2026-08-10";   // a Monday
const DAY_MS = 86400000;

/* The Monday of whatever week `now` falls in. Kept separate because the
   fortnight is built out of it and both halves are easier to read apart. */
function mondayOf(now) {
  const d = new Date(now);
  const day = d.getDay(); // 0 Sun … 6 Sat
  const m = new Date(d);
  m.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  m.setHours(0, 0, 0, 0);
  return m;
}

/* The two-week period containing `now`. Accepts a Date (defaults to now) so
   callers can pass an ET-adjusted date. */
export function trainerTasksPeriodBounds(now = new Date()) {
  const monday = mondayOf(now);
  const anchor = mondayOf(new Date(`${TRAINER_PERIOD_ANCHOR}T12:00:00`));
  const weeks = Math.round((monday - anchor) / (7 * DAY_MS));
  const start = new Date(monday);
  start.setDate(monday.getDate() - (((weeks % 2) + 2) % 2) * 7);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 13);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/* ⚠️ THROUGH THE GATE, not the raw array — a second store looking up one of
   their trainers must not be handed one of Matt's because the names happened
   to collide. Same reason every other caller uses trainerTaskFallback(). */
export function trainerTaskFor(trainerName) {
  return trainerTaskFallback().find((t) => t.trainer === trainerName) || null;
}
