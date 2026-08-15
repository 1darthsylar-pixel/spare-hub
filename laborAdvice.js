/* ══════════════════════════════════════════════════════════════════════════
   laborAdvice.js — WHAT TO CUT OR ADD, WHERE, AND WHEN, off the store's own
   daypart history.

   ★ STRICT LEAF. Imports NOTHING. No React, no storage, no config. The Worker
   will want this for the morning message and the browser wants it on the day
   board, so it takes its data as arguments and fetches nothing.

   Matt, Aug 14 2026: "i want built in the abilty to suggest what to cut or add
   and where as well as when", then, on the input: "I would like to avoid hourly
   sales rn because it's a lot to input so I'd like if based on daypart from the
   previous month report."

   ⚠️⚠️ HE ALREADY TYPES THE INPUT AND I NEARLY BUILT A SECOND ONE.
   `gcfcr-daypart-labor-v1` has held, per month, since at least June 2026:
       sales:  { Breakfast|Lunch|Afternoon|Dinner: [Mon..Sat] }
       hours:  { Breakfast|Lunch|Afternoon|Dinner: [Mon..Sat] }
   Sales AND hours, per daypart, per weekday. Productivity is one division away.
   Checked against the live database before a line of this was written; his July
   Tuesday breakfast really is $48.0/hr against $82.1 at lunch. Rule 8 — do not
   add a second place a store types its numbers.

   ────────────────────────────────────────────────────────────────────────
   ⚠️⚠️ MOVE BEFORE CUT. THAT IS THE WHOLE OPINION IN THIS FILE.
   ────────────────────────────────────────────────────────────────────────
   A daypart running below its goal is overstaffed FOR ITS SALES. That is not
   the same as the day being overstaffed. If another daypart the same day is
   short, the honest advice is to MOVE the hours, because:

     · the budget a leader is held to is the DAY, not the daypart, so moving
       costs nothing and cutting spends political capital for no gain;
     · cutting an hour that another part of the same day needed makes the day
       worse while making the number look better, which is the one outcome
       nobody wants from a labor tool;
     · his own setup rules already think this way ("The person scheduled to get
       off at 8 is supposed to be outside 5-8"), so moving matches how the store
       already reasons about a person's day.

   ⇒ So: find the surplus, look for a shortfall on the SAME DAY first, and only
   call it a cut when nothing else wants the hours.

   ⚠️ IT SUGGESTS. IT NEVER MOVES ANYBODY. Every return is a sentence and a
   number for a human to act on. Same posture as the training marks.

   ⚠️⚠️ AND IT IS SILENT RATHER THAN WRONG. Every unknown — no history, a
   daypart the store never filled in, zero hours, a month that is not there —
   returns nothing at all for that daypart. A labor tool that guesses is worse
   than one that says nothing, because a guess gets acted on.
   ══════════════════════════════════════════════════════════════════════════ */

/* The four the store's own report uses, in the order the day runs.
   ⚠️ THESE ARE THE KEYS IN HIS STORED RECORD, not a naming choice made here —
   `gcfcr-daypart-labor-v1` is keyed exactly this way and renaming them would
   read every month as empty. A store with different daypart names is handled by
   `partsIn`, which reads whatever the record actually holds. */
export const ADVICE_PARTS = Object.freeze(["Breakfast", "Lunch", "Afternoon", "Dinner"]);

/* Mon..Sat. Sunday is index -1 and answers nothing: this store is shut, and the
   stored arrays are six long, so a seventh lookup would read undefined. */
export const ADVICE_DAYS = Object.freeze(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/* ── reading the stored record ────────────────────────────────────────────
   Shape: an array of months, or `{ months: [...] }`. Both are accepted because
   the live key is a bare array and `todayDaypartSplit` in laborEngine already
   guards for both — matching it exactly rather than picking one. */
export function readMonths(raw) {
  const rows = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.months) ? raw.months : []);
  return rows.filter((m) => m && typeof m === "object" && m.id);
}

/* The most recent month in the record. String compare is correct and stable for
   "2026-07" style ids, which is the format the record uses. */
export function latestMonth(raw) {
  const rows = readMonths(raw);
  if (!rows.length) return null;
  return rows.reduce((a, b) => (String(b.id) > String(a.id) ? b : a));
}

export function monthById(raw, id) {
  return readMonths(raw).find((m) => String(m.id) === String(id)) || null;
}

/* Which dayparts this month actually carries BOTH sales and hours for.
   ⚠️ BOTH, NOT EITHER. A daypart with sales and no hours divides by nothing;
   one with hours and no sales reads as $0/hr, which looks like a catastrophe
   and is really a blank field. */
export function partsIn(month) {
  if (!month) return [];
  const s = month.sales && typeof month.sales === "object" ? month.sales : {};
  const h = month.hours && typeof month.hours === "object" ? month.hours : {};
  const seen = new Set([...Object.keys(s), ...Object.keys(h)]);
  return ADVICE_PARTS.filter((p) => seen.has(p) && Array.isArray(s[p]) && Array.isArray(h[p]))
    .concat([...seen].filter((p) => !ADVICE_PARTS.includes(p) && Array.isArray(s[p]) && Array.isArray(h[p])).sort());
}

/* ── the number itself ────────────────────────────────────────────────────
   Dollars of sales per labor hour, for one daypart on one weekday.
   ⚠️ ONE DEFINITION, AND IT MATCHES THE ONE THE HUB ALREADY USES.
   `laborEngine.dayProductivityTarget` is documented as "$/labor-hr" and
   `productivityGoal = forecast ÷ benchmarkHours`. Same division, same units, so
   a goal from there and a number from here are comparable without conversion.
   ⚠️ null, NEVER 0, for anything missing. Zero is a real and terrible
   productivity figure; "I do not know" is not. */
export function productivity(month, part, dayIndex) {
  if (!month || dayIndex < 0 || dayIndex >= ADVICE_DAYS.length) return null;
  const s = num(month.sales && month.sales[part] && month.sales[part][dayIndex]);
  const h = num(month.hours && month.hours[part] && month.hours[part][dayIndex]);
  if (s == null || h == null || h <= 0) return null;
  return s / h;
}

/* What this store actually ran, averaged across the weekdays it has data for.
   This is the "work it out from your own months" goal: it moves as the store
   moves and nobody maintains it.
   ⚠️ WEIGHTED BY HOURS, NOT A MEAN OF THE DAILY RATES. A plain average lets a
   quiet Tuesday count as much as a Saturday twice its size, which quietly
   flatters or punishes the goal depending on which days had data. */
export function partAverage(month, part) {
  let s = 0, h = 0;
  ADVICE_DAYS.forEach((_, i) => {
    const sv = num(month && month.sales && month.sales[part] && month.sales[part][i]);
    const hv = num(month && month.hours && month.hours[part] && month.hours[part][i]);
    if (sv == null || hv == null || hv <= 0) return;
    s += sv; h += hv;
  });
  return h > 0 ? s / h : null;
}

/* A goal per daypart, derived from the store's own latest month.
   Returns `{ [part]: number }`, missing dayparts simply absent. */
export function goalsFromHistory(raw) {
  const m = latestMonth(raw);
  const out = {};
  if (!m) return out;
  partsIn(m).forEach((p) => {
    const v = partAverage(m, p);
    if (v != null) out[p] = v;
  });
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   ⚠️⚠️ THE TWO HALVES OF THIS FEATURE NAME THE SAME FOUR DAYPARTS DIFFERENTLY,
   AND WIRING THEM NAIVELY PRODUCES A PANEL THAT SILENTLY SHOWS NOTHING.

   Measured against the live config, Aug 14 2026:
       the SCHEDULE   `stations.dayparts` → breakfast · lunch · mid   · night
       the REPORT     gcfcr-daypart-labor-v1 → Breakfast · Lunch · Afternoon · Dinner

   Not one key matches. Even the two that look identical differ in case, so a
   naive join finds zero dayparts, every lookup returns null, and the advice is
   empty on every day for ever — green, silent and wrong. This repo has shipped
   that exact class three times, which is why the project rules say to compare
   what one side writes against what the other side reads.

   ⚠️ MAPPED BY POSITION, NOT BY NAME. Both lists are "the four parts of a day"
   in the order the day runs, so the first is the first and the fourth is the
   fourth. That survives a store calling its third part "Mid", "Afternoon" or
   "Snack", which a name table would not — and rule 18 says another store's
   words are theirs, not ours to hardcode a translation for.

   ⚠️ IT REFUSES RATHER THAN GUESSES WHEN THE SHAPES DISAGREE. A store whose
   schedule has five dayparts and whose report has four has a real setup problem,
   and quietly pairing the first four would put dinner's hours against the
   afternoon's sales — a wrong number presented confidently, which is worse than
   a blank panel.
   ══════════════════════════════════════════════════════════════════════════ */
export function plannedByPart(hoursByKey, dayparts, month) {
  const parts = partsIn(month);
  const keys = (Array.isArray(dayparts) ? dayparts : []).map((d) => d && d.key).filter(Boolean);
  if (!parts.length || keys.length !== parts.length) return null;
  const out = {};
  keys.forEach((k, i) => {
    const v = num(hoursByKey && hoursByKey[k]);
    if (v != null && v > 0) out[parts[i]] = v;
  });
  return Object.keys(out).length ? out : null;
}

/* ── the advice ───────────────────────────────────────────────────────────
   `plannedHours` is what the week being built puts into each daypart on this
   day: `{ Breakfast: 88, Lunch: 106, … }`. The caller supplies it, because the
   schedule owns that number and this file owns no schedule.

   `tolerance` is how far off goal is worth mentioning, as a share. The default
   of 0.08 is not a measured constant — it is a deliberately quiet starting
   point so the first version does not shout on every daypart of every day, and
   it is a parameter so it can be tuned against real use rather than argued
   about here.

   Returns a list of `{ kind, part, from, to, hours, ran, goal }` where `kind`
   is "move" | "cut" | "add". Empty when there is nothing worth saying, which is
   the common and correct case on a well-staffed day. */
export function adviceForDay({ month, goals, dayIndex, plannedHours, tolerance = 0.08 } = {}) {
  if (!month || !plannedHours || dayIndex < 0 || dayIndex >= ADVICE_DAYS.length) return [];
  const g = goals && typeof goals === "object" ? goals : {};

  /* Every daypart we can say something honest about. */
  const rows = [];
  partsIn(month).forEach((part) => {
    const ran = productivity(month, part, dayIndex);
    const goal = num(g[part]);
    const planned = num(plannedHours[part]);
    if (ran == null || goal == null || goal <= 0 || planned == null || planned <= 0) return;
    const off = (ran - goal) / goal;
    rows.push({ part, ran, goal, planned, off });
  });

  /* ⚠️ BELOW GOAL MEANS OVERSTAFFED FOR THE SALES, which is the direction that
     confuses people every time: a LOW dollars-per-hour is TOO MANY hours. */
  const surplus = rows.filter((r) => r.off < -tolerance).sort((a, b) => a.off - b.off);
  const shortfall = rows.filter((r) => r.off > tolerance).sort((a, b) => b.off - a.off);

  /* Hours that would bring a daypart back to its goal. Never more than a third
     of what is planned there — a suggestion to remove half a daypart is one
     nobody will act on, and it usually means the history is thin rather than
     the day being wrong. */
  const gap = (r) => {
    const ideal = (r.ran * r.planned) / r.goal;      // hours that would hit goal
    return Math.min(Math.abs(r.planned - ideal), r.planned / 3);
  };

  const out = [];
  const wants = shortfall.map((r) => ({ r, need: gap(r) }));

  surplus.forEach((s) => {
    let spare = gap(s);
    if (spare < 0.5) return;                         // under half an hour is noise
    /* MOVE FIRST: give the hours to whoever on this day is short. */
    for (const w of wants) {
      if (spare < 0.5 || w.need < 0.5) continue;
      const moved = Math.min(spare, w.need);
      out.push({
        kind: "move", part: s.part, from: s.part, to: w.r.part,
        hours: moved, ran: s.ran, goal: s.goal,
      });
      spare -= moved; w.need -= moved;
    }
    /* Only what nobody wanted is a cut. */
    if (spare >= 0.5) {
      out.push({ kind: "cut", part: s.part, from: s.part, to: "", hours: spare, ran: s.ran, goal: s.goal });
    }
  });

  /* A shortfall nothing could be moved into is a genuine add. */
  wants.forEach((w) => {
    if (w.need >= 0.5) {
      out.push({ kind: "add", part: w.r.part, from: "", to: w.r.part, hours: w.need, ran: w.r.ran, goal: w.r.goal });
    }
  });

  return out;
}

/* One plain sentence for a leader. Kept here so the screen and the Worker's
   morning message cannot word the same advice two different ways (rule 8).
   ⚠️ SHORT ON PURPOSE. These land on a phone mid-shift, and the project rule
   about automated messages applies: the ask first, then the number. */
export function adviceLine(a, dayName) {
  if (!a) return "";
  const hrs = `${Math.round(a.hours * 10) / 10}h`;
  const when = dayName ? `${dayName} ` : "";
  if (a.kind === "move") return `${when}move ${hrs} from ${a.from} to ${a.to}.`;
  if (a.kind === "cut") return `${when}cut ${hrs} from ${a.from}. It ran $${Math.round(a.ran)}/hr against $${Math.round(a.goal)}.`;
  return `${when}add ${hrs} to ${a.to}. It ran $${Math.round(a.ran)}/hr against $${Math.round(a.goal)}.`;
}
