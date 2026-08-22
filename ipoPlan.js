// ---------------------------------------------------------------------------
// ipoPlan.js — single source of truth for the quarterly IPO plan.
// Imported by: worker.js (weekly Slack reminder), IPOActionItems.jsx (the screen),
// App.jsx (the Today-block pill). Plain JS on purpose so the Cloudflare Worker
// can import it, exactly like l10Schedule.js / trainerTaskRoster.js.
//
// WHAT ROLLS AUTOMATICALLY (never touch): the storage key (a fresh one per
// quarter so Q4 doesn't inherit Q3's checkmarks), the four week date ranges,
// which week is "active" today, whether the reminder fires, and the pill count.
//
// WHAT YOU AUTHOR EACH QUARTER (the ONE edit): add a block to QUARTER_PLANS
// keyed "YYYY-QN" with that quarter's categories + numbers from the FCR. If a
// quarter has no block yet, the engine AUTO-CARRIES the most recent quarter's
// category checklist (same cats + items) with a fresh empty key and the dollar
// figures blanked — so IPO recurs every quarter with zero setup, and you just
// refresh the variances/ledger when you have them. `carried:true` on the result
// tells the screen to show the "numbers not entered yet" banner.
// ---------------------------------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// The 4-week arc repeats every quarter; only the cats + numbers change.
const WEEK_TITLES = [
  "Diagnose & Audit",
  "Root Cause & Accountability",
  "Implement Controls",
  "Monitor & Validate",
];
const WEEK_PHASES = [
  "Pull invoices, calculate benchmarks, observe operations firsthand.",
  "Identify why each cost is over benchmark and assign clear ownership.",
  "Put systems in place — processes, approvals, training — to prevent recurrence.",
  "Check early gains, re-run the IPO report, set ongoing monthly cadence.",
];

// Q1=Jan–Mar, Q2=Apr–Jun, Q3=Jul–Sep, Q4=Oct–Dec.
export function quarterOf(now) {
  const d = now instanceof Date ? now : new Date(now);
  return { year: d.getFullYear(), q: Math.floor(d.getMonth() / 3) + 1 };
}

// The IPO sprint runs in the FIRST month of the quarter (Q1→Jan, Q2→Apr,
// Q3→Jul, Q4→Oct), weeks = days 1–7, 8–14, 15–21, 22–28.
function firstMonthOfQuarter(q) {
  return (q - 1) * 3; // 0-based: 0, 3, 6, 9
}

function two(n) {
  return n < 10 ? "0" + n : "" + n;
}

// Legacy alias: Q3-2026 was the original hardcoded key. Keep it so this
// quarter's in-flight checkoffs survive the switch. Every other quarter derives
// cleanly and starts empty. (Ages out harmlessly once Q3-2026 is past.)
export function keyFor(year, q) {
  if (year === 2026 && q === 3) return "gcfcr-ipo-q3-checklist";
  return `gcfcr-ipo-${year}-q${q}-checklist`;
}

// A stable ordinal so we can find "the most recent authored quarter <= target".
function ord(year, q) {
  return year * 4 + (q - 1);
}

// Build the 4 derived week shells for a quarter (dates only, no content).
function weekShells(year, q) {
  const m = firstMonthOfQuarter(q); // 0-based month
  const ranges = [[1, 7], [8, 14], [15, 21], [22, 28]];
  return ranges.map(([a, b], i) => ({
    week: `Week ${i + 1}`,
    title: WEEK_TITLES[i],
    phase: WEEK_PHASES[i],
    dates: `${MONTHS[m]} ${a}\u2013${b}`, // en dash
    start: `${year}-${two(m + 1)}-${two(a)}`,
    end: `${year}-${two(m + 1)}-${two(b)}`,
  }));
}

// ---------------------------------------------------------------------------
// AUTHORED CONTENT, per quarter. Dates are NOT stored here — they're derived
// from the quarter above. Each quarter = { fin, weeks:[{dollars, cats:[...]}] },
// one entry per week index 0–3. cats carry the full checklist + presentation:
//   { id, name, tier, variance, pct, detail, note?, items:[strings] }
// tier is one of: "Critical" | "Medium" | "Monitor".
// ---------------------------------------------------------------------------

// Deep-clone an authored plan and blank every dollar figure, so a carried-
// forward quarter shows the same checklist (cats + items) with no stale money.
function blankNumbers(plan) {
  return {
    fin: null,
    weeks: plan.weeks.map((w) => ({
      dollars: null,
      cats: w.cats.map((c) => ({
        id: c.id,
        name: c.name,
        tier: c.tier,
        variance: null,
        pct: "",
        detail: "",
        // drop quarter-specific notes on carry — they referenced last quarter
        items: c.items.slice(),
      })),
    })),
  };
}

// Find the most recent authored quarter with ordinal <= target; fall back to
// the single latest authored quarter if none precede the target.
/* ⚠️ `plans` IS AN ARGUMENT NOW (Aug 8 2026). It used to read a module
   constant in this file, which put every cost variance into the main client
   bundle. See ipoPlanData.js. */
function latestAuthored(year, q, plans) {
  const target = ord(year, q);
  let best = null, bestOrd = -Infinity, anyKey = null, anyOrd = -Infinity;
  for (const k of Object.keys(plans || {})) {
    const [y, qq] = k.split("-Q").map(Number);
    const o = ord(y, qq);
    if (o > anyOrd) { anyOrd = o; anyKey = k; }
    if (o <= target && o > bestOrd) { bestOrd = o; best = k; }
  }
  return best || anyKey; // key string or null (if QUARTER_PLANS empty)
}

// Resolve the active quarter's full plan for a given date.
// Returns { year, q, label, key, weeks, fin, carried }.
//   weeks[i] = { week, title, phase, dates, start, end, dollars, cats[] }
/* ⚠️ `plans` IS AN ARGUMENT, NOT A MODULE CONSTANT (Aug 8 2026).
   The worker passes the real table; the browser passes whatever the gated route
   returned, and {} when it was refused — which yields the empty week skeleton
   rather than a crash or a confidently wrong number.
   ⚠️ ONE IMPLEMENTATION, TWO CALLERS. Do not add a second ipoQuarter that
   imports the data directly; that is exactly how the browser copy comes back. */
export function ipoQuarter(now, plans = {}) {
  const { year, q } = quarterOf(now);
  const label = `Q${q} ${year}`;
  const key = keyFor(year, q);
  const shells = weekShells(year, q);

  const authoredKey = `${year}-Q${q}`;
  let content = plans[authoredKey];
  let carried = false;

  /* ⛔⛔ WHICH QUARTER IT CARRIED FROM IS RETURNED NOW, AND IT IS NOT ALWAYS THE
     ONE BEFORE. Matt, Aug 21 2026: "ipo action items for q3 disappeared and are
     in q4."

     🐛 `latestAuthored` prefers a plan at or before this quarter, and when there
     is none it falls back to the latest authored plan of any date — which can be
     a LATER quarter. Measured: the only plan this store has ever authored is
     `2026-Q4`, pasted Aug 14. So standing in Q3 today, the tile carries Q4's
     checklist BACKWARDS into Q3 with the numbers blanked, and the banner told
     him it was "the same category checklist as last quarter."

     ⇒ That sentence is what made it read as data moving. Nothing moved: there
     has never been a `2026-Q3` plan in this key. The screen simply could not say
     where its own content came from, so it guessed, and it guessed wrong in the
     one direction that looks like loss.

     ⚠️ THE FALLBACK ITSELF IS NOT CHANGED. Showing a later quarter's checklist
     with the money stripped is better than an empty screen, and it is what makes
     a plan authored ahead of time visible while you are still in the quarter
     before it. What was wrong was only that the screen could not NAME it. */
  let carriedFrom = null;
  if (!content) {
    const srcKey = latestAuthored(year, q, plans);
    content = srcKey ? blankNumbers(plans[srcKey]) : { fin: null, weeks: [] };
    carried = !!srcKey;
    carriedFrom = srcKey || null;
  }

  const weeks = shells.map((shell, i) => {
    const wc = (content.weeks && content.weeks[i]) || { dollars: null, cats: [] };
    return {
      ...shell,
      dollars: wc.dollars == null ? null : wc.dollars,
      cats: wc.cats || [],
    };
  });

  return { year, q, label, key, weeks, fin: content.fin || null, carried, carriedFrom };
}
