/* ══════════════════════════════════════════════════════════════════════════
   seedPresence.mjs — DOES THIS STORE HAVE THAT DATA YET?

   ⛔ WHY THIS EXISTS, MEASURED Aug 19 2026. A generated store ran its own
   checks for the first time and 6 test files were red. Every one of them was a
   CONTROL — the kind this repo insists on, the string that MUST be found or the
   scan is lying — and every one of those controls read one of the origin
   store's seed files. In a new store those seeds are deliberately empty, so the
   control correctly refused, and a brand new store's first impression of its
   own repo was six failing files about data it is not supposed to have.

   ⚠️⚠️ THE CONTROLS ARE RIGHT AND MUST NOT BE WEAKENED. That is the whole trap
   here. Deleting them would make those tests report clean off empty data, which
   is the exact failure they were written to stop. `portcheck` says it out loud
   in its own words: "refusing to report a clean sweep off that".

   ⇒ So the answer is not to soften a control, it is to ASK WHICH REPO WE ARE
   IN. A store with no history yet is a working state, not a broken one. The
   data-dependent assertions grade wherever the data exists and say plainly,
   out loud, where they did not grade. They never report "skipped" and pass.

   ⚠️⚠️ IT ASKS THE EXPORT, NEVER THE FILE TEXT. The obvious version greps the
   seed for the `.empty.js` header its twin carries. MEASURED, AND IT IS WRONG:
   five real seeds — ecosureSeed, eosSeed, ownerSeed, teamResourcesSeed,
   workerSeed — mention `.empty.js` in their own comments, so a text marker
   reports the ORIGIN's live data as scrubbed. That would turn every one of
   these controls off at the one store where they matter most.
   ══════════════════════════════════════════════════════════════════════════ */

/* Empty is a working state. `{}`, `[]`, null and undefined all mean the same
   thing here: this store has not been given that data. */
export function isEmptySeed(v) {
  if (v == null) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (v instanceof Map || v instanceof Set) return v.size === 0;
  if (typeof v === "object") return Object.keys(v).length === 0;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

/* Print it, never swallow it. A line the reader can see is the difference
   between "not graded here, and here is why" and a silent pass. */
export function sayNotGraded(what, why) {
  console.log(`     ⚠️  NOT GRADED HERE: ${what}`);
  console.log(`         ${why}`);
  console.log("         This is a store with no such data yet, not a failure. It is graded wherever the data exists.");
}
