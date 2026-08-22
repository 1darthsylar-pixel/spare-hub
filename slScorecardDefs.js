/* ============================================================================
   slScorecardDefs.js — Gate City Hub

   WHO IS CREDITED FOR WHICH SHIFT NUMBER. One definition, for the Shift Leader
   Scorecard and for the morning leader digest.

   🐛 WHY THIS FILE EXISTS (Aug 4 2026). The digest in `aiSummary.js` carried its
   own hand-written copy of the lead slots and the metric owners, and the copy
   had drifted from the Scorecard in two ways that both landed on real people:

     · IT READ TWO OF THE FOUR LEAD SLOTS. The board fills dtLeadId, fohLeadId,
       bohLeadId and bohLead2Id; the digest looked only at fohLeadId and
       bohLeadId. So a drive-thru lead, and the second BOH lead, got a morning
       digest with no mention of the shift they had just run.
     · IT CREDITED DT SOS TO THE FRONT COUNTER LEAD. The Scorecard owns dtSos
       under "dt". A front counter lead was told their drive-thru time ran slow
       when it was somebody else's number, and the person actually marked down
       never heard about it.

   ⚠️ A LEAF ON PURPOSE — THIS FILE IMPORTS NOTHING. `aiSummary.js` is pulled
   into the Worker bundle and `ShiftLeaderScorecard.jsx` is a React component;
   the only safe way for both to share a fact is a module that depends on
   neither. Same rule `nameMatch.js` exists under. Do not add an import here.

   ⚠️ ADD A METRIC OR A SLOT HERE, NEVER IN A CALLER. Two copies of this table
   is exactly the bug above, and it went unnoticed for as long as it did because
   both copies looked plausible on their own.
   ============================================================================ */

/* ★★ THE FOUR DAYPARTS. THE ONE LIST, AND IT WAS THREE.
   Every daily scorecard record is an object keyed by these four strings, so
   this is the fact that decides whether a reader sees the data or sees
   nothing. It was written out in `ShiftLeaderScorecard.jsx` (as objects),
   `aiSummary.js` and `inputRegistry.js` (as bare key arrays) — three copies of
   the same four words, which is rule 8 broken twice over on the most
   load-bearing string in the tile.

   ⚠️⚠️ AND THERE IS A NEAR-MISS SET IN THE SAME FILE THAT LOOKS EXACTLY LIKE
   THIS ONE. `SL_SHIFT_KEYS` in the Scorecard is `breakfast · lunch · mid ·
   night` — those are the DAILY SETUP BOARD's column names, used only to
   prefill leader names off the board. `DP_TO_SHIFT` maps between the two.
   A reader that aggregates a stored record under "mid" and "night" finds
   nothing, reports zero, and looks like a store that stopped entering half its
   day. Reach for this list, never that one, unless you are reading the board.

   `window` is display only; nothing computes from it. */
export const SL_DAYPARTS = [
  { key: "breakfast", label: "Breakfast", window: "6-10:30" },
  { key: "lunch", label: "Lunch", window: "10:30-2" },
  { key: "afternoon", label: "Afternoon", window: "2-5" },
  { key: "dinner", label: "Dinner", window: "5-10" },
];

/* The same four, as bare keys — what a caller that never renders them wants.
   Derived, so the two can never disagree. */
export const SL_DAYPART_KEYS = SL_DAYPARTS.map((d) => d.key);

/* The lead slots on each daypart. `owner` is the tag matched against a metric's
   `owner`; `field` is the id stored on the daypart entry. Two slots share the
   "boh" tag deliberately — BOH runs a drive-thru side and a front counter side,
   and both are credited for the BOH numbers. */
export const SL_LEAD_SLOTS = [
  { owner: "dt",  field: "dtLeadId",   label: "DT lead" },
  { owner: "foh", field: "fohLeadId",  label: "FOH lead" },
  { owner: "boh", field: "bohLeadId",  label: "BOH DT lead" },
  { owner: "boh", field: "bohLead2Id", label: "BOH FOH lead" },
];

/* `w` is the metric's weight inside its owner's composite, totalling 100 per
   owner. `wBoh` is the smaller weight the same metric carries inside the BOH
   composite, for the two speed numbers BOH also moves. */
export const SL_METRIC_DEFS = [
  // DT
  { key: "dtSos", label: "DT SOS",     dir: "low",  owner: "dt",  score: "sosTime", w: 70, wBoh: 20, unit: "" },
  { key: "cars",  label: "DT Cars",    dir: "high", owner: "dt",  score: "ratio",   w: 30, unit: "" },
  // FOH
  { key: "fcSos", label: "FC SOS",     dir: "low",  owner: "foh", score: "sosTime", w: 70, wBoh: 20, unit: "" },
  { key: "transactions", label: "FC Transactions", dir: "high", owner: "foh", score: "ratio", w: 30, unit: "" },
  // BOH
  { key: "txNoAha", label: "Trans w/o AHA", dir: "low", owner: "boh", score: "txCount", w: 50, unit: "" },
  { key: "aha",   label: "AHA (%<20 min)", dir: "high", owner: "boh", score: "ahaPct",  w: 25, unit: "%" },
  { key: "goodScans", label: "Good Scans", dir: "high", owner: "boh", score: "scanPct", w: 25, unit: "%" },
];

/* Which of a daypart's lead slots this person filled, as owner tags.
   ⚠️ Returns a Set of TAGS, not slot fields, because two different slots share
   the "boh" tag and a caller asking "am I credited for a boh metric" must get
   the same answer from either seat. */
export function slOwnerTagsFor(entry, personId) {
  const tags = new Set();
  if (!entry || personId == null || personId === "") return tags;
  const me = String(personId);
  for (const slot of SL_LEAD_SLOTS) {
    const v = entry[slot.field];
    if (v && String(v) === me) tags.add(slot.owner);
  }
  return tags;
}

/* Is this person credited for this metric on this daypart?
   A metric belongs to exactly one owner tag; holding that slot is the credit. */
export function slCreditedFor(entry, personId, metric) {
  if (!metric || !metric.owner) return false;
  return slOwnerTagsFor(entry, personId).has(metric.owner);
}

/* ═══ READING A STORED VALUE ═══════════════════════════════════════════════
   Every SOS number is typed as "3:44" and stored as typed, so anything that
   averages or compares one has to turn it into seconds first.

   ⚠️ THIS WAS TWO COPIES TOO — `parseMSS` in ShiftLeaderScorecard.jsx and
   `slParseMSS` in aiSummary.js, byte-for-byte the same logic under two names.
   They had not drifted yet, which is the only reason converging them is a
   no-op rather than a decision about whose answer wins. Verified identical
   before the move.

   ⚠️ A BARE NUMBER IS READ AS SECONDS, not as minutes. "224" is 3:44, not
   3 hours 44. That is the existing behaviour at both call sites and it is kept
   deliberately: the entry boxes accept a pasted raw figure from the SOS report,
   which is already in seconds.
   ⚠️ RETURNS null, NEVER 0, for a blank. Zero is a real and excellent SOS
   time; averaging blanks as zero would report a store getting faster every day
   nobody typed anything. Callers must skip null rather than default it. */
export function slParseMSS(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  if (s.includes(":")) {
    const parts = s.split(":");
    const m = Number(parts[0]), sec = Number(parts[1]);
    if (Number.isNaN(m) || Number.isNaN(sec)) return null;
    return m * 60 + sec;
  }
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}

export function slFmtMSS(sec) {
  if (sec === null || sec === undefined) return "—";
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/* ═══ GRADING THRESHOLDS ═══════════════════════════════════════════════════
   The numbers that turn a reading into green / amber / red.

   🐛 THEY LIVED ONLY IN THE SCORECARD, AND THE DIGEST GUESSED (Aug 4 2026).
   aiSummary's slRag handled sosTime and ahaPct and fell through to a
   "value ÷ cars goal" ratio for everything else. That is right for DT Cars and
   nonsense for the other two:
     · Good Scans 99% ÷ a 165-car goal = 0.6 → graded RED, on a near-perfect
       number.
     · Trans w/o AHA is a MISS COUNT where lower is better and zero is perfect;
       dividing it by a car goal grades a great shift as a disaster.
   It went unnoticed because the digest carried its own shorter metric list that
   happened to exclude both. Unifying that list on Aug 4 exposed it, and the
   first symptom was a kitchen lead who could never be recognised no matter how
   well they ran the shift.
   ⇒ The thresholds live here now and both sides read them. */

/* ★ SPEED OF SERVICE AND AHA THRESHOLDS (Aug 5 2026 sweep).

   🐛 SOS HAD DRIFTED AND THE DIGEST WAS A QUARTER BEHIND. Matt widened the red
   edge on Jul 25 — "Under 2 good, 2-5 middle and over 5 bad" — so the Scorecard
   moved SOS_RED from 210 to 300. `aiSummary.js` kept its own copy at 210 and
   nobody updated it. A 4:00 shift therefore read AMBER on the Shift Leader
   Scorecard and RED in the morning digest, about the same leader on the same
   day. Two verdicts, one number, and the digest is the one the whole store
   sees before open.

   ⚠️ GREEN DELIBERATELY DID NOT MOVE. SOS_GREEN is also the EOS s4 goal
   published to the L10 board, so leaving it at 120 keeps that board reading
   ≤2:00. Only the middle band widened.

   ⚠️ 5:00 EXACTLY IS AMBER, matching the `<` green / `<=` amber convention the
   rest of the file uses rather than inventing a third rule for the boundary.

   AHA already agreed in both places at 95 / 90. It moves here anyway: the point
   is that there is one home for these, not that this one had drifted yet. */
export const SOS_GREEN = 120;  // < 2:00 green
export const SOS_RED = 300;    // > 5:00 red · 120-300 inclusive is amber
export const AHA_GREEN = 95;
export const AHA_RED = 90;

export const SCAN_GREEN = 99;
export const SCAN_AMBER = 96;

/* Trans w/o AHA: a raw miss count against per-daypart bands, target zero. No
   goal and no denominator, which is exactly why the ratio fallback could never
   have worked on it. */
export const TX_BANDS = {
  breakfast: { green: 2, amber: 6 },
  lunch:     { green: 5, amber: 15 },
  afternoon: { green: 0, amber: 3 },
  dinner:    { green: 0, amber: 3 },
};
export const TX_BANDS_FALLBACK = { green: 5, amber: 15 };
