/* ============================================================================
   tierMath.js — the month-level tier maths, and nothing else.

   ★ LEAF-ISH. Imports `benchmarkHours` from laborEngine.js and nothing more.

   ═══ WHY IT EXISTS ═════════════════════════════════════════════════════════
   These five functions used to live in productivityTiers.js, which imports
   store.js, whose top-level `import.meta.env` throws the moment Node loads it.
   So none of this arithmetic could be tested outside a browser — the labor
   goal, the productivity goal, the benchmark hours and the tier fit, all of it
   unreachable from a test.

   That is the same argument jobHealth.js and schedule.js already make in this
   repo: anything that DECIDES a number cannot live where nothing can execute
   it. Money maths deserves it more than most.

   ⚠️ NO BEHAVIOUR CHANGED. The bodies below are the bodies that were there,
   moved. productivityTiers.js re-exports every one of them, so every existing
   import still resolves and every caller is untouched.
   ============================================================================ */
import { benchmarkHours } from "./laborEngine.js";

/** Sales per benchmark hour for a whole month. Null when nothing is open. */
export function monthProductivityGoal(tier, dayForecasts = []) {
  let sales = 0;
  let hours = 0;
  for (const f of dayForecasts) {
    if (!(f > 0)) continue; // closed day — no fixed hours, no sales
    sales += f;
    hours += benchmarkHours(tier, f);
  }
  return hours > 0 ? sales / hours : null;
}

/** Total benchmark hours for a month. */
export function monthBenchmarkHours(tier, dayForecasts = []) {
  return dayForecasts.reduce(
    (s, f) => (f > 0 ? s + benchmarkHours(tier, f) : s),
    0
  );
}

/**
 * Labor % goal, derived — never entered.
 *   laborPct = wage / productivity
 * Returns a decimal (0.2123), not a percent.
 */
export function laborPctFromProductivity(plannedWage, productivity) {
  if (!(plannedWage > 0) || !(productivity > 0)) return null;
  return plannedWage / productivity;
}

/** Convenience: labor % goal straight from a tier + forecasts + wage. */
export function monthLaborGoal(tier, dayForecasts, plannedWage) {
  const prod = monthProductivityGoal(tier, dayForecasts);
  return laborPctFromProductivity(plannedWage, prod);
}

// ── Re-fitting against a new week ──────────────────────────────────
/**
 * Least-squares fit of { fixedHours, marginalRate } from a HotSchedules
 * Labor Productivity week. Pass the report's own numbers:
 *
 *   fitTier([
 *     { forecastSales: 29776.31, benchmarkHours: 331.37 },  // Mon
 *     { forecastSales: 28238.50, benchmarkHours: 316.67 },  // Tue
 *     ...
 *   ])
 *
 * Regresses hours = a + b·sales, then returns fixedHours = a and
 * marginalRate = 1/b. Use this to verify the fitted constants against a
 * second week before relying on them.
 */
export function fitTier(rows = []) {
  const pts = rows.filter((r) => r.forecastSales > 0 && r.benchmarkHours > 0);
  const n = pts.length;
  if (n < 2) return null;

  const sx = pts.reduce((s, r) => s + r.forecastSales, 0);
  const sy = pts.reduce((s, r) => s + r.benchmarkHours, 0);
  const sxx = pts.reduce((s, r) => s + r.forecastSales ** 2, 0);
  const sxy = pts.reduce((s, r) => s + r.forecastSales * r.benchmarkHours, 0);

  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-9) return null;

  const b = (n * sxy - sx * sy) / denom; // hours per sales-dollar
  const a = (sy - b * sx) / n; // fixed hours
  if (!(b > 0)) return null;

  // Residuals so you can see whether the linear model actually holds.
  const maxResid = Math.max(
    ...pts.map((r) => Math.abs(a + b * r.forecastSales - r.benchmarkHours))
  );

  return { fixedHours: a, marginalRate: 1 / b, maxResidualHours: maxResid, n };
}
