/* ============================================================================
   ahaMonthly.js — Gate City Hub

   THE MONTH'S AHA DASHBOARD, PASTED WHOLE.

   Matt, Aug 5 2026: "its actually AHA dashboard", then pasted the page itself.

   ★ IT PARSES THE PAGE, IT DOES NOT ASK FOR A FORMAT. The first cut wanted
   "YYYY-MM | total | goal | pct" typed by hand. That was wrong twice: the
   dashboard has FIVE scores, not one, and asking a person to distil a page into
   four numbers is asking them to do the parsing and to make the transcription
   mistakes. Copy the page, paste the page.

   ⚠️ AHA IS NOT A GUEST EXPERIENCE NUMBER. That tile holds CEM and Smart Shop,
   which is what a guest SAID about us. This is what the kitchen DID. Two
   unrelated jobs answering to one name is the QIV mistake, where a reader blames
   the wrong thing because the labels collide.

   ⚠️ A LEAF — IT IMPORTS NOTHING, so the Scorecard component and
   inputRegistry.js (which worker.js pulls in) can both read it without dragging
   React into the worker bundle. Same rule foodItemGaps.js lives under.

   THE FIVE SCORES, and why each is here:
     systemUsage   — % of days the AHA system was actually used. Everything else
                     on the dashboard is only eligible when this is 90+.
     holdTimes     — % of cycles held under the target duration. The food-safety
                     one.
     targetZone    — % of cycles cooked in the right quantity. Over target is
                     waste, under target is a stock-out. Gate City's worst score
                     by a distance and nothing in the Hub tracked it before.
     scans         — % of scans without errors.
     demandVariance— how spiky demand was. It is the band Target Zone is judged
                     against, so storing the score without it makes the score
                     unreadable later.

   Shape: { "YYYY-MM": { systemUsage, daysAtGoal, totalDays, txNoAha,
                         holdTimes, cyclesClean, cyclesOver, cyclesUnder,
                         targetZone, onTarget, overTarget, underTarget,
                         scans, demandVariance, at } }
   ⚠️ EVERY FIELD OPTIONAL ON READ. The dashboard is a live product and its
   wording will change. A month stored before a field existed, or pasted from a
   page that no longer prints one, must still render. Guard the read.
   ============================================================================ */

export const AHA_MONTHLY_KEY = "gcfcr-aha-monthly-v1";

/* No seed. Nothing has ever been entered, and seeding invented history would put
   numbers on a screen nobody typed. Empty reads as "not entered yet". */
export const SEED = {};

const num = (s) => {
  if (s === undefined || s === null) return null;
  const n = Number(String(s).replace(/[,%\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};

/* Pull the number that sits directly BEFORE or AFTER a label. The dashboard
   copies out as alternating label/value lines and the order flips between
   sections — "Days >= 90 Count\n23" but "42\nAverage daily # of transactions".
   Looking both ways is what makes one parser handle the whole page. */
/* ★ THE DASHBOARD DEFINES EVERY METRIC BEFORE IT SHOWS ONE, AND THOSE
   DEFINITIONS CONTAIN THE SAME WORDS AS THE LABELS (found Aug 5 2026 when
   Matt's real July paste stored two wrong numbers).

   The page reads:

       Hold Times Score
       98%
       Hold Times
       Score = (Cycles w/o Errors <= Target Duration) / (Cycles w/o Errors)
       Largest Impact
       Cycles w/o errors
       8131

   `/Cycles w\/o errors/i` hits the `Score = (...)` line FIRST. That line carries
   no number of its own, so the search looked outward and found "98%" two lines
   back — the Hold Times score. Cycles w/o errors was stored as 98 instead of
   8131, and Cycles On Target as 35 instead of 2822, by exactly the same route.

   ⚠️ THE TEST IS `^Score =`, NOT A BARE `=`. Real labels on this page contain
   ">=" and "<=" — "Days >= 90 Count", "Cycles <= 21 min." — so anything looser
   would skip the very lines this parser exists to read. Every formula on the
   page starts the line with "Score =". */
const IS_FORMULA = /^Score\s*=/i;

function near(lines, labelRe, { after = true, before = true } = {}) {
  for (let i = 0; i < lines.length; i++) {
    if (!labelRe.test(lines[i])) continue;
    if (IS_FORMULA.test(lines[i])) continue;
    const self = lines[i].match(/(-?[\d,]+(?:\.\d+)?)\s*%?\s*$/);
    if (self && !/^\d/.test(lines[i].trim())) { const v = num(self[1]); if (v !== null) return v; }
    /* ⚠️ A WINDOW OF TWO, NOT ONE. Demand Variance copies out as three lines —
       "26", "Low", "Average Demand Variance" — with the band sitting between the
       number and its label. Looking only one line back found "Low" and gave up.
       Two is enough for every case on the real page and still tight enough that
       it cannot reach into a neighbouring metric. */
    for (let d = 1; d <= 2; d++) {
      if (after) { const v = num((lines[i + d] || "").match(/^(-?[\d,]+(?:\.\d+)?)\s*%?$/)?.[1]); if (v !== null) return v; }
      if (before) { const v = num((lines[i - d] || "").match(/^(-?[\d,]+(?:\.\d+)?)\s*%?$/)?.[1]); if (v !== null) return v; }
    }
  }
  return null;
}

/**
 * parseAhaDashboard(text, { ym })
 *
 * `ym` is the month the caller is on. The page prints its range as "(7/1 -
 * 7/31)" so the year is absent; when the range is present its MONTH is checked
 * against `ym` and a mismatch is refused outright.
 *
 * ⚠️ REFUSING A MISMATCH IS THE POINT. Pasting July's page while August is
 * selected would file a whole month of kitchen numbers under the wrong month,
 * and nothing downstream could ever tell. A blocked paste is a five-second
 * annoyance; a misfiled month is wrong forever.
 */
export function parseAhaDashboard(text, { ym } = {}) {
  const raw = String(text || "").trim();
  if (!raw) return { ok: false, error: "Nothing pasted." };
  if (!/^\d{4}-\d{2}$/.test(String(ym || ""))) {
    return { ok: false, error: "No month selected." };
  }
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const range = raw.match(/\((\d{1,2})\/\d{1,2}\s*-\s*(\d{1,2})\/\d{1,2}\)/);
  if (range) {
    const pageMonth = Number(range[1]);
    const wantMonth = Number(String(ym).slice(5, 7));
    if (pageMonth !== wantMonth) {
      return { ok: false, error: `That page is month ${pageMonth}, but ${ym} is selected. Switch the month or paste the right page.` };
    }
  }

  const rec = {
    systemUsage:    near(lines, /Days with Usage >=\s*90|System Usage score is 90/i),
    daysAtGoal:     near(lines, /Days >=\s*90 Count/i),
    totalDays:      near(lines, /Total Days Count/i),
    txNoAha:        near(lines, /transactions without AHA timer/i),
    holdTimes:      near(lines, /Hold Times Score|Timers <\s*Target Duration/i),
    cyclesClean:    near(lines, /Cycles w\/o errors/i),
    cyclesOver:     near(lines, /Cycles >\s*\d+\s*min/i),
    cyclesUnder:    near(lines, /Cycles <=\s*\d+\s*min/i),
    targetZone:     near(lines, /Target Zone Score/i),
    onTarget:       near(lines, /Cycles On Target/i),
    overTarget:     near(lines, /Cycles Over Target/i),
    underTarget:    near(lines, /Cycles Under Target/i),
    scans:          near(lines, /Scans Without Errors/i),
    demandVariance: near(lines, /Average Demand Variance/i),
  };

  /* ⚠️ SYSTEM USAGE IS THE ONE THAT MUST BE THERE. Every other chart on the
     dashboard says it is only eligible when usage is 90 or higher, so a paste
     that did not even capture that is a paste of the wrong page. Storing the
     rest off a page we clearly misread would be worse than storing nothing. */
  if (rec.systemUsage === null && rec.holdTimes === null && rec.targetZone === null) {
    return { ok: false, error: "Could not find the AHA scores in that. Copy the whole dashboard page, not one chart." };
  }

  /* ★ THE CYCLE COUNTS MUST ADD UP, AND CHECKING THAT CATCHES A MISPARSE THAT
     LOOKS PERFECTLY REASONABLE (added Aug 5 2026, after two fields stored wrong
     from Matt's real July page and nothing complained).

     The dashboard's own arithmetic gives three identities for free:
       on + over + under      === cycles w/o errors
       over-21 + under-21     === cycles w/o errors
       on / cycles w/o errors === the target zone score

     A number pulled off the wrong line breaks at least one of them. On the July
     page cyclesClean came back as 98 and onTarget as 35 — both plausible
     percentages, neither flagged by anything, and both silently wrong in a
     record feeding half the BOH composite.

     ⚠️ REPORTED, NOT REFUSED. A dashboard that changes layout could break an
     identity while every number is still right, and refusing the paste would
     leave a leader with no way to file the month at all. It says loudly that
     the numbers disagree so somebody looks, which is what nothing did before. */
  const sums = [];
  const near3 = (a, b) => a != null && b != null && Math.abs(a - b) <= 1;
  if (rec.cyclesClean != null) {
    if (rec.onTarget != null && rec.overTarget != null && rec.underTarget != null
        && !near3(rec.onTarget + rec.overTarget + rec.underTarget, rec.cyclesClean)) {
      sums.push(`on+over+under (${rec.onTarget + rec.overTarget + rec.underTarget}) does not equal cycles w/o errors (${rec.cyclesClean})`);
    }
    if (rec.cyclesOver != null && rec.cyclesUnder != null
        && !near3(rec.cyclesOver + rec.cyclesUnder, rec.cyclesClean)) {
      sums.push(`over+under 21min (${rec.cyclesOver + rec.cyclesUnder}) does not equal cycles w/o errors (${rec.cyclesClean})`);
    }
  }

  const got = Object.entries(rec).filter(([, v]) => v !== null).map(([k]) => k);
  const missed = Object.entries(rec).filter(([, v]) => v === null).map(([k]) => k);
  return {
    ok: true,
    ym,
    rec: { ...rec, at: new Date().toISOString() },
    found: got.length,
    /* Named, not counted. "3 fields missing" sends somebody hunting; naming them
       lets them see at a glance whether it was the one they cared about.
       A sum that does not balance goes FIRST, because a wrong number that looks
       right is worse than a missing one that obviously is not. */
    error: [
      sums.length ? `Numbers do not add up: ${sums.join("; ")}. Check them against the page before trusting this month.` : "",
      missed.length ? `Read ${got.length} of ${got.length + missed.length}. Not found: ${missed.join(", ")}` : "",
    ].filter(Boolean).join(" "),
  };
}

/* The newest month on file, and whether the month that just closed is in.
   `want` is the LAST CLOSED month, never the open one, which cannot be reported
   yet. Same convention as the daypart labor and labor-opportunity rows. */
export function ahaStatus(all, now = new Date()) {
  const rec = all && typeof all === "object" ? all : {};
  const keys = Object.keys(rec).filter((k) => /^\d{4}-\d{2}$/.test(k)).sort();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const want = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  if (!keys.length) return { has: false, want, latest: null, months: 0, current: false };
  const latest = keys[keys.length - 1];
  return { has: true, want, latest, months: keys.length, current: latest >= want, rec: rec[latest] };
}

/* ★ THE CHECK THAT MATTERS MOST (Aug 5 2026).
   The dashboard reports the average daily count of transactions with no AHA
   timer activity. The Shift Leader Scorecard asks leaders to type that same
   figure per daypart, and grades the BOH composite on it at 50% weight.
   In July the dashboard said 42 a day while leaders were typing 0.
   ⚠️ IT COMPARES, IT DOES NOT CORRECT. Overwriting what a leader typed would
   destroy the only evidence the two disagree, and the disagreement is the
   finding. Returns null when either side is unknown, so a missing month never
   manufactures an alarm. */
export function txNoAhaGap(monthRec, enteredDailyAvg) {
  const dash = monthRec && Number.isFinite(Number(monthRec.txNoAha)) ? Number(monthRec.txNoAha) : null;
  const typed = Number.isFinite(Number(enteredDailyAvg)) ? Number(enteredDailyAvg) : null;
  if (dash === null || typed === null) return null;
  return { dashboard: dash, entered: typed, gap: dash - typed, agrees: Math.abs(dash - typed) <= 3 };
}

/* ★ THE MONTH COMES OFF THE PAGE, so nobody has to pick one and nobody can pick
   the wrong one. The dashboard prints its range as "(7/1 - 7/31)" with no year,
   so the year is inferred: a month AHEAD of the current one must be last year's
   (pasting December's page in January).
   ⚠️ Returns null when the page carries no range, and the caller then falls back
   to the last CLOSED month. Guessing a month from nothing is how a year of
   kitchen numbers ends up filed under one heading. */
export function monthFromPage(text, now = new Date()) {
  const m = String(text || "").match(/\((\d{1,2})\/\d{1,2}\s*-\s*(\d{1,2})\/\d{1,2}\)/);
  if (!m) return null;
  const mon = Number(m[1]);
  if (!(mon >= 1 && mon <= 12)) return null;
  const y = mon > (now.getMonth() + 1) ? now.getFullYear() - 1 : now.getFullYear();
  return `${y}-${String(mon).padStart(2, "0")}`;
}

/* The last CLOSED month — what the register asks for and the sane default when
   a page carries no range. */
export function lastClosedMonth(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/* ★ THE GOALS, so a stored month can be GRADED and not just kept.
   Three come off the dashboard itself, which prints "Requirement: 100%" and
   "Goal: 100%". Scans was confirmed by Matt, Aug 5 2026: "Scan goal is 100%". */
export const AHA_GOALS = {
  systemUsage: 100,
  holdTimes: 100,
  scans: 100,
};

/* ★ TARGET ZONE IS GRADED AGAINST DEMAND VARIANCE, NOT A FLAT NUMBER.
   The dashboard's own guide: the spikier demand is, the lower a good Target
   Zone score can be. Gate City ran LOW variance at 26 in July, so it is judged
   on the toughest row.
     Low  DV  good > 45 · fair 35-44 · poor < 35
     Med  DV  good > 40 · fair 31-39 · poor < 31
     High DV  good > 35 · fair 26-34 · poor < 26
   ⚠️ WITHOUT THE VARIANCE THE SCORE IS UNREADABLE, which is why demandVariance
   is stored beside it. A 35% is a different result at low variance than at
   high, and a month kept without it can never be graded later. */
export const TZ_BANDS = [
  { band: "low",  maxDv: 30,       good: 45, fair: 35 },
  { band: "med",  maxDv: 40,       good: 40, fair: 31 },
  { band: "high", maxDv: Infinity, good: 35, fair: 26 },
];

export function targetZoneRag(targetZone, demandVariance) {
  /* ⚠️ `Number(null)` IS 0, AND 0 IS FINITE. Written as a bare Number() first,
     and a month with no demand variance was graded at the toughest band instead
     of being held — my own test caught it. Blank, null and undefined all have to
     be rejected BEFORE the conversion, not after. */
  const asNum = (v) => (v === null || v === undefined || v === "" ? NaN : Number(v));
  const tz = asNum(targetZone);
  const dv = asNum(demandVariance);
  if (!Number.isFinite(tz)) return null;
  /* No variance means no verdict. Guessing a band would grade a month against
     a difficulty nobody measured. */
  if (!Number.isFinite(dv)) return { rag: "gray", why: "no demand variance on file" };
  const b = TZ_BANDS.find((x) => dv <= x.maxDv) || TZ_BANDS[TZ_BANDS.length - 1];
  if (tz > b.good) return { rag: "green", why: `above ${b.good}% at ${b.band} variance` };
  if (tz >= b.fair) return { rag: "amber", why: `fair at ${b.band} variance, ${b.good}% is good` };
  return { rag: "red", why: `below ${b.fair}% at ${b.band} variance` };
}
