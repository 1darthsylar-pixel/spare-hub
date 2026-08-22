// ── Productivity Tiers ─────────────────────────────────────────────
// Single source of truth for the HotSchedules-style productivity
// benchmark. Both the Planner and the FCR read from here so the
// productivity target and the labor % goal can never drift apart.
//
// ★ THE PURE MATHS LIVE IN laborEngine.js NOW (Aug 6 2026). The worker
// computes the daypart labor DMs from the same tier model, and it cannot
// import this file — this file imports store.js, whose top-level
// `import.meta.env` throws in the worker. So the model constants and the
// pure functions (benchmarkHours, dayProductivityTarget, mergeConfig,
// activeTier, seedPlannedWage, the defaults) moved to the laborEngine leaf,
// and this file RE-EXPORTS them so every existing import keeps working.
// What stays here is the store-bound part: loading and saving the config.
//
// THE MODEL
// HotSchedules does not use a flat productivity target per weekday.
// Benchmark hours are LINEAR in forecast sales:
//
//     benchmarkHours(day) = fixedHours + (forecastSales / marginalRate)
//     productivityTarget  = forecastSales / benchmarkHours(day)
//
// `fixedHours` is the labor that does not scale with volume — opening,
// prep, close. `marginalRate` is the incremental sales each additional
// labor hour is expected to carry. Because fixed hours are constant,
// the EFFECTIVE productivity target rises as volume rises. That is why
// a flat 85 / 86 / 87 weekday table was always an approximation.
//
// LABOR % FALLS OUT OF IT
//     laborPct = (benchmarkHours × wage) / sales
//              = wage / productivity
// So the labor goal is never entered by hand. It is derived from the
// productivity goal and the planned wage. Two numbers, one source.
//
// PROVENANCE + WARNING
// The constants (now in laborEngine.js) were fitted against the
// HotSchedules Labor Productivity report for the week of Sun 7/5/26 –
// Sat 7/11/26. They reproduce every benchmark-hours cell in that report
// to within ±0.01 hrs. They are fitted from ONE WEEK. Before treating
// them as load-bearing, re-fit against a second week (see fitTier below).

import { kvGet, kvSet, kvGetResult } from "./store";
import {
  loadTierConfig as engineLoadTierConfig,
  mergeConfig,
  benchmarkHours,
  TIERS_KEY,
} from "./laborEngine.js";

/* Everything a caller used to import from here still imports from here. */
export {
  TIERS_KEY,
  TIER_DEFAULTS,
  TIER_ORDER,
  DEFAULT_TIER,
  DEFAULT_PLANNED_WAGE,
  benchmarkHours,
  dayProductivityTarget,
  defaultConfig,
  mergeConfig,
  activeTier,
  seedPlannedWage,
} from "./laborEngine.js";

/**
 * Month productivity goal = total forecast ÷ total benchmark hours.
 * Sales-weighted by construction: high-volume days carry more of the
 * denominator, exactly as they carry more of the numerator.
 *
 * `dayForecasts` — array of per-day forecast sales. Closed days (Sunday)
 * should be omitted or passed as 0; a 0 contributes no hours.
 */
/* ⚠️ NOT THE ONE THE HUB USES, AND THE NAME IS SHARED. `LaborPlanner.jsx` also
   exports a `monthProductivityGoal`; that is the live one, and FoodCostTracker
   reads it. This copy and `monthLaborGoal` below are currently called by
   nothing outside this file (checked repo-wide Aug 2 2026).

   They are NOT interchangeable. This one accumulates hours from
   `benchmarkHours(tier, f)`. LaborPlanner's divides by `targetFor(...)`, which
   honours a per-day target typed in by hand — so the two agree only when no
   manual day target is set. Wiring a screen to this one because the name
   matched would quietly show a different goal than the Labor Planner does.
   Left in place rather than deleted because the tier maths here is the
   reference implementation; do not call it without deciding which number you
   actually want. */
/* ⚠️ THE MONTH MATHS MOVED TO tierMath.js AND IS RE-EXPORTED HERE, so every
   existing import still resolves and no caller changed. It moved because this
   file imports store.js, whose top-level `import.meta.env` throws the moment
   Node loads it — so none of that arithmetic could be tested outside a browser.
   Same argument jobHealth.js and schedule.js already make: anything that
   decides a number cannot live where nothing can execute it. */
export {
  monthProductivityGoal,
  monthBenchmarkHours,
  laborPctFromProductivity,
  monthLaborGoal,
  fitTier,
} from "./tierMath.js";

// ── Persistence ────────────────────────────────────────────────────
// Shape: { selected: "top20", tiers: {...TIER_DEFAULTS}, plannedWage: 18.5 }
// The merge/defaults logic lives in laborEngine.js (mergeConfig); these are
// the browser doors onto it.

export async function loadTierConfig() {
  return engineLoadTierConfig(kvGet);
}

/* ⚠️ For callers that EDIT. ok:false = the read FAILED (not "never saved") —
   a caller that lets saveTierConfig run off that state writes the DEFAULT
   tiers and planned wage over the store's real ones, which silently moves
   the labor goal every budget derives from. Read-only callers can stay on
   loadTierConfig. */
export async function loadTierConfigResult() {
  const r = await kvGetResult(TIERS_KEY);
  return { ok: r.ok, cfg: mergeConfig(r.ok ? r.value : null) };
}

export async function saveTierConfig(cfg) {
  return kvSet(TIERS_KEY, mergeConfig(cfg));
}
