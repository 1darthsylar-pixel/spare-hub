/* ============================================================================
   signalReport.test.mjs — the Signal DM says what actually went in.

       node signalReport.test.mjs

   Matt, Aug 22 2026: "i want to know what date range and items were input in
   signal so please build that option however that looks."

   ⚠️⚠️ THIS IS THE FIRST TEST THIS MESSAGE HAS EVER HAD. The rules lived inside
   `WasteTracker.jsx`, which no Node test can import and nothing in `checks/`
   can execute, so the one thing a store's ops lead acts on was ungraded. That
   is the same argument `setupRows.js`, `jobHealth.js` and `cashCount.js` each
   already make, and each of those was hiding a real bug when it moved.
   ============================================================================ */
import { rangeFor, buildSignalReport, signalMessage, shiftIso, MAX_SPAN } from "./signalReport.js";

let pass = 0; const fails = [];
const t = (label, cond, extra) => {
  if (cond) { pass++; console.log(`  ok    ${label}`); }
  else { fails.push(label); console.log(`  FAIL  ${label}${extra === undefined ? "" : "\n        " + extra}`); }
};

/* Invented people-free fixtures. Item names are food, never a roster name —
   this file travels to three other operators' repos (namesTravel.test.mjs). */
const ITEMS = [
  { id: "nug",  name: "Nuggets (single)", price: 2.00 },
  { id: "fil",  name: "Spicy Filet",      price: 3.00 },
  { id: "bisc", name: "Chicken Biscuit",  price: 1.50 },
  { id: "gone", name: "Retired Item",     price: 5.00 },
];
const FMT = {
  date: (d) => d,
  money: (n) => `$${n.toFixed(2)}`,
  wt: (oz) => `${oz}oz`,
  vol: (qt) => `${qt}qt`,
};

console.log("\n── 0. the stretch this press covers");
t("no marker at all means just today", (() => {
  const r = rangeFor(null, "2026-08-22");
  return r.from === "2026-08-22" && r.to === "2026-08-22";
})());
/* ⚠️ A FIRST PRESS MUST NOT REPORT SIX MONTHS. An unreadable marker reads the
   same as no marker on purpose: a giant first message is one nobody reads
   twice, and this is the message the whole feature rests on. */
t("an unreadable marker reads the same as none", (() => {
  const r = rangeFor({ nonsense: true }, "2026-08-22");
  return r.from === "2026-08-22";
})());
t("a marker three days back opens the range the day AFTER it", (() => {
  const r = rangeFor({ lastDoneIso: "2026-08-19" }, "2026-08-22");
  return r.from === "2026-08-20" && r.to === "2026-08-22";
})());
/* ⚠️ THE MARKER MOVES FORWARD ONLY. Re-pressing an old day must not open a
   backwards range, which would print a stretch that ends before it starts. */
t("a marker in the FUTURE collapses to today, never a backwards range", (() => {
  const r = rangeFor({ lastDoneIso: "2026-09-01" }, "2026-08-22");
  return r.from === "2026-08-22" && r.to === "2026-08-22";
})());
t("★ dates shift at noon, so no timezone can move the range a day", shiftIso("2026-08-22", 1) === "2026-08-23" && shiftIso("2026-01-01", -1) === "2025-12-31");

console.log("\n── 1. ★★ the items are what the message is FOR");
{
  const data = {
    "2026-08-20": { "BOH - AM": { nug: 3 }, "FOH - PM": { fil: 2 } },
    "2026-08-22": { "BOH - AM": { nug: 1, bisc: 4 } },
  };
  const r = buildSignalReport({ from: "2026-08-20", to: "2026-08-22", data, allItems: ITEMS });
  t("it totals the money across the whole range", r.totals.waste === 3 * 2 + 2 * 3 + 1 * 2 + 4 * 1.5, String(r.totals.waste));
  t("it totals the count across the whole range", r.totals.items === 10, String(r.totals.items));
  /* ★★ THE SAME ITEM ON TWO DIFFERENT DAYS IS ONE LINE. Printing it twice is
     what makes a range message unreadable, and it is the whole reason this
     accumulates by name rather than per day. */
  const nug = r.items.find((i) => i.name === "Nuggets (single)");
  t("★★ one item logged on two days is ONE line, summed", nug && nug.qty === 4 && nug.val === 8, JSON.stringify(nug));
  /* ⚠️ NUGGETS, NOT THE DEARER ITEM. 4 x $2.00 beats 2 x $3.00 — this ranks by
     what the stretch COST, not by unit price, which is the number somebody
     chasing waste can act on. The first draft of this assertion said Filet and
     was simply wrong about the arithmetic. */
  t("★ the biggest dollar value leads, summed across the range", r.items[0].name === "Nuggets (single)" && r.items[0].val === 8, `${r.items[0].name} ${r.items[0].val}`);
  t("a day inside the range with nothing logged is named as a hole", r.holes.length === 1 && r.holes[0] === "2026-08-21", JSON.stringify(r.holes));
}

console.log("\n── 2. ⛔ pricing reads every item ever, not the picker list");
{
  /* 🐛 THE SCAR THIS GUARDS. WasteTracker priced from the VISIBLE menu, so a
     removed item scored zero and its dollars vanished from every past day while
     the quantities stayed. This report covers a RANGE, so it reads more history
     than anything else in the tile and would show that bug loudest. */
  const data = { "2026-08-22": { "BOH - AM": { gone: 2 } } };
  const withAll = buildSignalReport({ from: "2026-08-22", to: "2026-08-22", data, allItems: ITEMS });
  t("★★ a retired item still carries its dollars", withAll.totals.waste === 10, String(withAll.totals.waste));
  /* THE CONTROL. Handed a list that has forgotten the item, the money really
     does vanish — so the assertion above is measuring the list, not luck. */
  const without = buildSignalReport({ from: "2026-08-22", to: "2026-08-22", data, allItems: ITEMS.filter((i) => i.id !== "gone") });
  t("★ control: drop it from the list and the money really does disappear", without.totals.waste === 0, String(without.totals.waste));
  t("★ and it is still counted and named, never silently dropped", without.items.length === 1 && without.items[0].qty === 2);
  const over = buildSignalReport({ from: "2026-08-22", to: "2026-08-22", data, allItems: ITEMS, prices: { gone: 9 } });
  t("a typed price override wins over the built-in", over.totals.waste === 18, String(over.totals.waste));
}

console.log("\n── 3. donations, and what counts as a hole");
{
  const don = { "2026-08-21": { a: { u: "wt", lb: 2, oz: 4 }, b: { u: "vol", gal: 1, qt: 1 }, c: { ea: 3 } } };
  const r = buildSignalReport({ from: "2026-08-21", to: "2026-08-21", data: {}, don, allItems: ITEMS });
  t("weight, volume and each all add up", r.donations.oz === 36 && r.donations.qt === 5 && r.donations.ea === 3);
  /* ⚠️ A DAY WITH ONLY DONATIONS IS NOT A HOLE. Somebody was there and wrote
     something down, which is the question the hole line answers. */
  t("★★ a day with only donations is NOT reported as a hole", r.holes.length === 0, JSON.stringify(r.holes));
  const empty = buildSignalReport({ from: "2026-08-21", to: "2026-08-21", data: {}, don: {}, allItems: ITEMS });
  t("★ control: a genuinely empty day IS a hole", empty.holes.length === 1);
  /* ⚠️ A ZERO QUANTITY IS NOT AN ENTRY. Storage can hold a 0 after somebody
     bumps a counter up and back down; counting it would report a day as logged
     when nothing was. */
  const zero = buildSignalReport({ from: "2026-08-21", to: "2026-08-21", data: { "2026-08-21": { "BOH - AM": { nug: 0 } } }, allItems: ITEMS });
  t("★★ a zero quantity does not make a day look logged", zero.holes.length === 1 && zero.totals.items === 0);
}

console.log("\n── 4. the cap says so rather than under-reporting");
{
  const far = shiftIso("2026-08-22", -400);
  const r = buildSignalReport({ from: far, to: "2026-08-22", data: {}, allItems: ITEMS });
  t(`it stops at ${MAX_SPAN} days`, r.days.length === MAX_SPAN, String(r.days.length));
  /* ⛔ SILENTLY REPORTING TWO MONTHS OF A LONGER STRETCH IS THE "LOOKS COMPLETE
     AND IS NOT" FAILURE. Here it would under-report waste to the person chasing
     it, which is the opposite of what the message is for. */
  t("★★ and it SAYS the stretch was cut short", r.truncated === true);
  const short = buildSignalReport({ from: "2026-08-20", to: "2026-08-22", data: {}, allItems: ITEMS });
  t("★ control: an ordinary range is not marked truncated", short.truncated === false);
}

console.log("\n── 5. the message a person actually reads");
{
  const data = { "2026-08-22": { "BOH - AM": { nug: 3, fil: 1 } } };
  const r = buildSignalReport({ from: "2026-08-20", to: "2026-08-22", data, allItems: ITEMS });
  const msg = signalMessage(r, FMT, { storeName: "the Test Hub" });
  t("it names the range", msg.includes("2026-08-20 through 2026-08-22"));
  t("★★ it lists the items by name, with money and count", msg.includes("Nuggets (single) — $6.00 (×3)"), msg);
  t("it names the days with nothing on them", msg.includes("2026-08-20") && msg.includes("No waste logged on:"));
  t("a single-day range prints one date, not 'through'", !signalMessage(buildSignalReport({ from: "2026-08-22", to: "2026-08-22", data, allItems: ITEMS }), FMT).includes("through"));
  /* ⛔ AN EMPTY STRETCH MUST SAY SO IN WORDS. A message with a total of $0.00
     and no item section reads as a formatting glitch; "nothing was logged" is
     the answer the reader most needs, because it means the stretch went in
     blank. */
  const blank = signalMessage(buildSignalReport({ from: "2026-08-22", to: "2026-08-22", data: {}, allItems: ITEMS }), FMT);
  t("★★ an empty stretch says 'nothing was logged' in words", /Nothing was logged/i.test(blank), blank);
  /* ⚠️ THE LONG TAIL IS COUNTED, NOT DROPPED. A message that silently shows 12
     of 40 items understates the stretch to the person chasing it. */
  const many = { "2026-08-22": { "BOH - AM": Object.fromEntries(ITEMS.map((i, n) => [i.id, n + 1])) } };
  const cut = signalMessage(buildSignalReport({ from: "2026-08-22", to: "2026-08-22", data: many, allItems: ITEMS }), FMT, { topN: 2 });
  t("★ past the top N it says how many more there are", /\+2 more items/.test(cut), cut);
}

console.log(`\n${fails.length ? `${fails.length} FAILED, ` : ""}${pass} passed`);
process.exit(fails.length ? 1 : 0);
