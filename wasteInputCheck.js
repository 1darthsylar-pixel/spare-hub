/* ══════════════════════════════════════════════════════════════════════════
   wasteInputCheck.js — WHICH WASTE PERIODS GOT LOGGED YESTERDAY, AND WHICH
   DID NOT.

   Matt, Aug 7 2026: "i also want a slack dm daily to know what day-parts are
   and aren't inputting waste from the gatecityhub."

   ★ LEAF. Imports nothing. The worker sends; this decides what to say, which
   is the part worth testing, and it is testable without a single real DM.

   ⚠️ IT REPORTS BOTH SIDES ON PURPOSE. Matt asked what IS and what IS NOT
   inputting, so a period that logged is named too. The one exception is the
   all-clear: four green ticks every morning is wallpaper and gets muted inside
   a week, so that collapses to a single line.

   ⚠️ "LOGGED" MEANS AT LEAST ONE ITEM WITH A REAL QUANTITY. A period key that
   exists with an empty object, or with every quantity at zero, is somebody
   opening the tile and not entering anything — which is exactly the case this
   job exists to catch. Counting the key's presence would report it as done.
   ══════════════════════════════════════════════════════════════════════════ */

/* ⚠️ THE ONE DEFINITION. worker.js and WasteTracker.jsx both carried their own
   copy of this list. Consolidated here on Aug 7 2026, the same day a
   three-way drift in parseRanges was traced and merged — a second list of the
   four periods is the same bug waiting to happen, and this one decides which
   shifts get chased. */
export const WASTE_PERIODS = ["BOH - AM", "BOH - PM", "FOH - AM", "FOH - PM"];

/**
 * What one day's waste data says, per period.
 * `data` is gcfcr-waste-v4: { [dateIso]: { [period]: { [itemId]: qty } } }.
 *
 * Returns { date, logged: [{period, items, units}], missing: [period], any }.
 * A missing date, a missing period, an empty period and an all-zero period all
 * read the same way: nothing was entered.
 */
export function wasteDayStatus(data, dateIso, periods = WASTE_PERIODS) {
  const day = (data && typeof data === "object" && data[dateIso]) || {};
  const logged = [];
  const missing = [];
  for (const p of periods) {
    const entries = day && typeof day[p] === "object" && day[p] ? day[p] : null;
    let items = 0, units = 0;
    if (entries) {
      for (const qty of Object.values(entries)) {
        const n = Number(qty) || 0;
        if (n > 0) { items += 1; units += n; }
      }
    }
    if (items > 0) logged.push({ period: p, items, units });
    else missing.push(p);
  }
  return { date: dateIso, logged, missing, any: logged.length > 0 };
}

/**
 * The DM text, or null when there is nothing worth sending.
 *
 * ⚠️ NULL ON A DAY WITH NO DATA AT ALL. If all four are empty the likeliest
 * cause is that the store was closed or the day has not happened yet, not that
 * four shifts each forgot. Shouting "nobody logged anything" on a closed
 * Sunday is how a job gets muted, and a muted job cannot do its one task.
 * The caller decides whether the day should have had waste.
 */
export function wasteCheckMessage(status, dayLabel) {
  if (!status) return null;
  const { logged, missing } = status;
  if (!logged.length) return null;              // see the note above
  const label = dayLabel || status.date;

  if (!missing.length) {
    return `Waste input · ${label}\nAll four periods logged.`;
  }
  const lines = [`Waste input · ${label}`];
  for (const p of WASTE_PERIODS) {
    const hit = logged.find((l) => l.period === p);
    lines.push(hit
      ? `✅ ${p} — ${hit.items} ${hit.items === 1 ? "item" : "items"}`
      : `❌ ${p} — nothing logged`);
  }
  return lines.join("\n");
}
