/* ============================================================================
   signalReport.js — what went into Signal, over the whole stretch since the
   last time somebody said so.

   Matt, Aug 22 2026: "i want to know what date range and items were input in
   signal so please build that option however that looks."

   ⚠️⚠️ THIS IS A LEAF AND IT IMPORTS ONE OTHER LEAF, ON PURPOSE. The rules
   lived inside `WasteTracker.jsx`, which no Node test can import and nothing in
   `checks/` can execute — so the message a store's ops lead acts on was the one
   thing here that could not be graded. `WASTE_PERIODS` is imported rather than
   retyped: a second copy of that list is rule 8, and the drift would show up as
   a whole daypart's waste silently missing from the total.

   ⛔⛔ PRICE FROM `allItems`, NEVER FROM THE PICKER LIST. `WasteTracker.jsx`
   already carries the scar: pricing walked the visible menu, a removed item was
   not in it, and its dollars vanished from every PAST day at once while the
   quantities stayed. This report covers a RANGE, so it reads more history than
   anything else in the tile and would show that bug more loudly than anything
   else. Callers pass the every-item-ever list.
   ============================================================================ */
import { WASTE_PERIODS } from "./wasteInputCheck.js";

/* ⚠️ NOON, NOT MIDNIGHT. A date-only string parsed as UTC midnight lands on the
   previous day for anybody behind UTC, which would shift every range by one. */
export function shiftIso(iso, days) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/* THE STRETCH THIS PRESS COVERS.
   ⚠️ THE MARKER MOVES FORWARD ONLY, and the read of it is deliberately
   forgiving: a missing or unreadable marker means "just today" rather than
   "everything", because a first press that reported six months would be
   noise nobody reads twice. */
export function rangeFor(marker, todayIso) {
  const last = marker && typeof marker.lastDoneIso === "string" ? marker.lastDoneIso : null;
  if (!last || last >= todayIso) return { from: todayIso, to: todayIso };
  const next = shiftIso(last, 1);
  return { from: next <= todayIso ? next : todayIso, to: todayIso };
}

/* ⚠️ A CAP, AND IT IS NOT COSMETIC. Without it a marker left behind by a store
   that stopped pressing for a year walks 365 days of objects on the main
   thread and prints a message nobody can read. 62 is two months. */
export const MAX_SPAN = 62;

export function buildSignalReport({ from, to, data = {}, don = {}, allItems = [], prices = {}, periods = WASTE_PERIODS }) {
  const priceOf = (item) => (item && prices[item.id] != null ? prices[item.id] : (item ? item.price : 0));
  const byId = new Map(allItems.map((m) => [m.id, m]));

  const days = [];
  for (let d = from, n = 0; d <= to && n < MAX_SPAN; d = shiftIso(d, 1), n++) {
    days.push(d);
    if (d === to) break;
  }
  /* ⚠️ SAY SO WHEN THE CAP BIT. Silently reporting two months of a six month
     stretch is the "looks complete and is not" failure this repo keeps paying
     for, and here it would under-report waste to the person chasing it. */
  const truncated = days.length >= MAX_SPAN && days[days.length - 1] !== to;

  const acc = new Map();
  const holes = [];
  let waste = 0, items = 0;
  let oz = 0, qt = 0, ea = 0, donItems = 0;

  for (const day of days) {
    let dayCount = 0;
    for (const p of periods) {
      const logged = (data[day] || {})[p] || {};
      for (const [id, q] of Object.entries(logged)) {
        const qty = Number(q) || 0;
        if (qty <= 0) continue;
        const m = byId.get(id);
        const name = m ? m.name : id;
        const val = priceOf(m) * qty;
        const row = acc.get(name) || { name, qty: 0, val: 0 };
        row.qty += qty; row.val += val;
        acc.set(name, row);
        waste += val; items += qty; dayCount += qty;
      }
    }
    const dday = don[day] || {};
    for (const v of Object.values(dday)) {
      if (v && v.u === "wt") { const o = Number(v.lb || 0) * 16 + Number(v.oz || 0); if (o > 0) { oz += o; donItems++; dayCount++; } }
      else if (v && v.u === "vol") { const g = Number(v.gal || 0) * 4 + Number(v.qt || 0); if (g > 0) { qt += g; donItems++; dayCount++; } }
      else { const c = Number(v && v.ea || 0); if (c > 0) { ea += c; donItems++; dayCount++; } }
    }
    /* ⚠️ A HOLE IS A DAY WITH NOTHING AT ALL, waste or donations. A day with
       only donations logged is not a hole — somebody was there and wrote
       something down, which is the question this line answers. */
    if (dayCount === 0) holes.push(day);
  }

  const ranked = [...acc.values()].sort((a, b) => (b.val - a.val) || (b.qty - a.qty) || a.name.localeCompare(b.name));

  return {
    from, to, days, truncated, holes,
    totals: { waste, items },
    donations: { oz, qt, ea, items: donItems },
    items: ranked,
  };
}

/* THE MESSAGE.
   ⚠️ THE FORMATTERS ARE PASSED IN, NEVER REDEFINED HERE. `fmtDate`, `f$`,
   `fmtWt` and `fmtVol` already exist in the tile and a second copy is rule 8 —
   the drift would print two different dollar figures for one number. */
export function signalMessage(report, fmt, opts = {}) {
  const topN = typeof opts.topN === "number" ? opts.topN : 12;
  const storeName = opts.storeName || "the Hub";
  const d = (x) => (fmt && fmt.date ? fmt.date(x) : x);
  const m = (x) => (fmt && fmt.money ? fmt.money(x) : String(x));

  const range = report.from === report.to ? d(report.to) : `${d(report.from)} through ${d(report.to)}`;
  const L = [`*Waste input into Signal* — ${range}`];

  if (report.truncated) L.push(`_Only the first ${report.days.length} days of a longer stretch are shown._`);

  L.push(`*Total:* ${m(report.totals.waste)} · ${report.totals.items} item${report.totals.items === 1 ? "" : "s"}`);

  if (report.donations.items > 0) {
    const parts = [];
    if (report.donations.oz > 0 && fmt && fmt.wt) parts.push(fmt.wt(report.donations.oz));
    if (report.donations.qt > 0 && fmt && fmt.vol) parts.push(fmt.vol(report.donations.qt));
    if (report.donations.ea > 0) parts.push(`${report.donations.ea} ea`);
    if (parts.length) L.push(`*Donations:* ${parts.join(" · ")}`);
  }

  /* ★ THE ITEMS ARE THE POINT OF THIS MESSAGE. Everything above is a header. */
  if (report.items.length) {
    L.push("", "*What went in:*");
    for (const it of report.items.slice(0, topN)) L.push(`   • ${it.name} — ${m(it.val)} (×${it.qty})`);
    const rest = report.items.length - topN;
    if (rest > 0) L.push(`   • +${rest} more item${rest === 1 ? "" : "s"}`);
  } else {
    /* ⚠️ NOT AN EMPTY SECTION. "Nothing was logged" is a real answer and the
       one the reader most needs, because it means the stretch went in blank. */
    L.push("", "_Nothing was logged in this stretch._");
  }

  if (report.holes.length) {
    const named = report.holes.slice(0, 8).map(d);
    L.push("", `*No waste logged on:* ${named.join(", ")}${report.holes.length > 8 ? ` +${report.holes.length - 8} more` : ""}`);
  }

  L.push("", `Marked done from ${storeName}.`);
  return L.join("\n");
}
