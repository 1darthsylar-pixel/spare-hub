/* ============================================================================
   laborDaypartPush.js — Gate City Hub

   WHO GETS TOLD WHAT, BEFORE EACH DAYPART.

   Matt, Aug 6 2026: "Can it send as a push notification for the leader on shift
   for each daypart?", then "kitchen director gets the back number", "does the
   FOH director get it too", and "and the boh shift leads too?".

   ★ NEAR-LEAF. Imports boardHistory.js only, for the one shared rule below;
   that file imports nameMatch.js and nameMatch imports nothing, so the graph
   terminates one step down. Given a day's board and today's numbers it returns a
   list of {seat, name, text} — it does not know what Slack is and cannot send
   anything. That is the point: who-gets-what is the part worth testing, and it
   is testable here without a single real DM going out.

   ⚠️⚠️ IT IS TODAY'S PLAN, AND THE MESSAGE NOW SAYS SO (corrected Aug 7 2026).
   This header used to describe the number as a weekday average over four
   weeks, and seatText said so in every DM. It never was. The figure is
   `todayOver` from laborEngine.js:765 — today's typed schedule against today's
   budget. The Aug 7 sweep caught the mismatch.
   It is still not a live floor reading: it is what was SCHEDULED versus what
   was BUDGETED, before anybody clocks in. The wording claims exactly that and
   nothing more.

   ⚠️ EACH SEAT GETS ONLY ITS OWN NUMBER. The DT leader gets DT. Nobody gets a
   figure they cannot act on, and nobody gets somebody else's.
   ============================================================================ */

import { personInCell as boardPersonInCell } from "./boardHistory.js";


/* The six seats, and which slice of the day each one is sent.
   ⚠️ MATCHED ON THE ROLE STRING THE BOARD ACTUALLY CARRIES, which includes
   hours: "LEADER DT (5:15AM-11PM)". Anchored prefixes, never equality. */
export const SEATS = [
  { seat: "Leader DT",       side: "foh", test: /^LEADER DT/i,          part: "dt" },
  { seat: "Leader FC",       side: "foh", test: /^LEADER FC/i,          part: "fc" },
  { seat: "FOH Director",    side: "foh", test: /^(DIRECTOR|ASSISTANT DIRECTOR)/i, part: "front" },
  { seat: "Kitchen Lead",    side: "boh", test: /Kitchen Lead/i,        part: "back" },
  { seat: "Kitchen Manager", side: "boh", test: /Kitchen Manager/i,     part: "back" },
];

/* ⚠️⚠️ THIS SAID "THE SAME NAME-OUT-OF-A-CELL RULE THE BOARD USES" AND WAS A
   SECOND, LOOSER COPY OF IT. Measured Aug 20 2026: six of thirteen real cells
   answered differently, and every difference was this copy being too generous.

     cell              the board          this copy
     "6am"             ""                 "6am"          ← a time, DM'd
     "Split Duties"    ""                 "Split Duties" ← a marker, DM'd
     "x"               ""                 "x"

   The board's rule carries a dated fix this one never got: a cell STARTING
   WITH A DIGIT is a time or a count, never a person. Its comment records that
   "6am" once became a team member called "am", and that it was found by a test
   rather than by reading — which is exactly what a claim of sameness kept true
   by memory costs.

   ⇒ IT IS THE BOARD'S RULE NOW, IMPORTED. A comment promising sameness is not
   sameness; an import is.

   ⚠️ THE COMMA SPLIT IS KEPT, DELIBERATELY, AND IT IS THE ONE THING THIS COPY
   DID BETTER. A seat cell reading "Ana, Ben" is two people sharing one
   leadership seat; the board's rule answers "" for it, which would DM neither,
   while taking the first part reaches one of them. Fewer people told is the
   worse direction for a DM, so the split runs FIRST and the board's rule then
   grades what comes out of it — "6am, Ben" still answers "".

   ⚠️ THE HEADER'S "imports nothing" IS NOW "imports boardHistory". That file
   imports only nameMatch.js, which imports nothing, so the graph still
   terminates one step down and this file is still testable on its own. */
export function personInCell(cell) {
  return boardPersonInCell(String(cell == null ? "" : cell).split(",")[0]);
}

/* Walk a day's board for the first station whose role matches, and read that
   daypart's cell. Returns "" when the board is missing, unimported, or the
   cell is blank — all of which mean "do not send", never "guess". */
export function seatName(day, test, dpKey) {
  if (!day) return "";
  const foh = Array.isArray(day.stations) ? day.stations : null;
  const boh = Array.isArray(day.sections)
    ? day.sections.flatMap((s) => (Array.isArray(s.stations) ? s.stations : []))
    : null;
  const rows = foh || boh || [];
  for (const st of rows) {
    if (st && test.test(String(st.role || ""))) {
      const who = personInCell(st[dpKey]);
      if (who) return who;
    }
  }
  return "";
}

const round1 = (n) => Math.round(Number(n) || 0);

/* ⚠️ "on budget" IS NOT A MESSAGE. Under half an hour either way is noise, and
   a job that DMs four people "nothing to do" four times a day is muted inside a
   week. Returns null, and the caller sends nothing. */
export function seatText({ seat, dpLabel, weekday, weeks, dayTotal, mine }) {
  if (!(Math.abs(mine) >= 0.5)) return null;
  const over = mine > 0;
  const head = over
    ? `${dpLabel} usually runs about ${round1(Math.abs(dayTotal))} hrs over budget.`
    : `${dpLabel} usually has about ${round1(Math.abs(dayTotal))} hrs of room.`;
  const yours = over
    ? `Yours is about ${round1(Math.abs(mine))}.`
    : `About ${round1(Math.abs(mine))} of that is yours.`;
  /* ⚠️⚠️ THE BASIS LINE USED TO BE FALSE (Aug 7 2026 sweep).
     It said "Based on {weekday}s, last {weeks} weeks — not live", and the
     worker hardcoded weeks: 4. The number was never a four-week average: it is
     `todayOver`, today's typed schedule against today's budget
     (laborEngine.js:765). On a day Matt had zeroed a holiday or planned heavy,
     a leader was told a one-off was the routine. A leader who catches a stated
     basis being wrong once stops believing the next one, which costs more than
     the sentence was ever worth.
     ⚠️ `weekday` and `weeks` are still accepted so every caller keeps working;
     they are simply no longer claimed in the text. */
  return `${head} ${yours} Today's schedule against today's budget.`;
}

/* ★ THE WHOLE DECISION, IN ONE PURE FUNCTION.
   nums: { dt, fc, back } — this daypart's forecast variance per side.
   Returns [{ seat, name, text }] for the seats that should actually be told
   something. Everything else is dropped here rather than in the sender. */
export function daypartRecipients({ fohDay, bohDay, dpKey, dpLabel, weekday, weeks = 4, nums = {} }) {
  const dt = Number(nums.dt) || 0;
  const fc = Number(nums.fc) || 0;
  const back = Number(nums.back) || 0;
  const slice = { dt, fc, front: dt + fc, back };
  const dayTotal = dt + fc + back;

  const out = [];
  for (const s of SEATS) {
    const name = seatName(s.side === "foh" ? fohDay : bohDay, s.test, dpKey);
    if (!name) continue;                       // nobody on that seat this daypart
    const text = seatText({ seat: s.seat, dpLabel, weekday, weeks, dayTotal, mine: slice[s.part] });
    if (!text) continue;                       // their side is on budget
    out.push({ seat: s.seat, name, text });
  }

  /* ⚠️ ONE MESSAGE PER PERSON. Kitchen Lead and Kitchen Manager can be the same
     human on a thin shift, and Leader FC can be covering as Director. Sending
     the same sentence twice reads as a bug and gets the job muted. First seat
     in SEATS order wins, which puts the doing-the-shift seat ahead of the
     oversight one. */
  const seen = new Set();
  return out.filter((r) => {
    const k = r.name.trim().toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
