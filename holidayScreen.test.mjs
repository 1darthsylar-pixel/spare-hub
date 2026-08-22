/* ============================================================================
   holidayScreen.test.mjs — the holiday screen writes what the engine reads.

       node holidayScreen.test.mjs

   Matt asked for this screen on Aug 21 2026, after the whole path underneath it
   had been ported and there was nowhere to type a number.

   ⛔⛔ THE FAILURE THIS FILE EXISTS FOR IS A SCREEN THAT LOOKS LIKE IT WORKS.
   Every control here writes into `holidays`, and every reader of `holidays` is
   in a different file. A control that saved "10:30" instead of 630, or wrote
   `{ closed: true, open: 360 }` on one row, would save cleanly, render its own
   value back, and be wrong the first time a week was budgeted.

   ⇒ SO THIS DRIVES THE WHOLE PATH: it writes exactly the shapes the controls
   write, through the real `applyStoreOverrides`, and reads the answer out of
   the real `forecastFor`. It does not read the JSX.

   ⚠️ FAKE FIGURES ONLY. Nothing here is this store's real volume.
   ============================================================================ */
import { readFileSync, existsSync } from "node:fs";
import { applyStoreOverrides, storeCfg } from "./storeConfig.js";
import { loadMonthBasis, forecastFor } from "./laborEngine.js";
import { HOLIDAY_KEYS } from "./usHolidays.js";

let pass = 0; const fails = [];
const t = (label, cond, extra) => {
  if (cond) { pass++; console.log(`  ok    ${label}`); }
  else { fails.push(label); console.log(`  FAIL  ${label}${extra === undefined ? "" : "\n        " + extra}`); }
};
const group = (n) => console.log(`\n── ${n}`);

const days = {};
for (let d = 1; d <= 28; d++) days[`2026-10-${String(d).padStart(2, "0")}`] = { dt: 18000, co: 6000, di: 4000, od: 2000 };
const get = async (k) => (String(k).includes("2026-10") || String(k).includes("2026-11") ? { days } : null);

group("0. ★★ the open map — without it every row below is discarded on load");
{
  /* ⛔ `mergeDeep` only lets an override fill a key the defaults already know,
     so a typo cannot invent a setting. `holidays.byKey` is the opposite shape:
     its KEYS are the store's answer. Measured at the origin before this was
     fixed: `{ laborDay: { closed: true } }` came back undefined. */
  applyStoreOverrides({ holidays: { byKey: { laborDay: { closed: true }, independenceDay: { normal: true } } } });
  const k = storeCfg("holidays").byKey || {};
  t("★★ a holiday the shipped default has no row for still saves",
    k.laborDay && k.laborDay.closed === true, JSON.stringify(k.laborDay));
  t("★ and so does a second one", k.independenceDay && k.independenceDay.normal === true);
  const cfg = readFileSync(new URL("./storeConfig.js", import.meta.url), "utf8");
  t("★ it is open because storeConfig says so (control)", /"holidays\.byKey"/.test(cfg));
}

group("1. ★★ each control's shape reaches the forecast");
{
  /* Exactly what the four states write, byte for byte. */
  applyStoreOverrides({ holidays: {
    open: 630, close: 960, baseSales: 9000,
    byKey: { christmasDay: { closed: true }, blackFriday: { normal: true }, christmasEve: { open: 360 } },
  } });
  const pol = storeCfg("holidays", null);
  const dec = await loadMonthBasis("2026-12", get, pol);
  const nov = await loadMonthBasis("2026-11", get, pol);

  t("control: an ordinary December Thursday forecasts off the weekday average",
    forecastFor("2026-12-17", dec.p, dec.wk) === dec.wk[4], `${forecastFor("2026-12-17", dec.p, dec.wk)} vs ${dec.wk[4]}`);
  t("★★ a day on the store's holiday hours takes the short-day figure",
    forecastFor("2026-12-24", dec.p, dec.wk) === 9000, `${forecastFor("2026-12-24", dec.p, dec.wk)}`);
  t("★★ CLOSED forecasts zero, never the weekday average",
    forecastFor("2026-12-25", dec.p, dec.wk) === 0, `${forecastFor("2026-12-25", dec.p, dec.wk)}`);
  /* ⚠️⚠️ THE ONE THAT LOOKS REDUNDANT AND IS NOT. Once holiday hours are set,
     every holiday without a row falls to them — including the ones the store
     trades normally. A store open 6am to 9pm on Black Friday would be rostered
     to a short holiday window, silently. */
  t("★★ NORMAL DAY trades like an ordinary day of that weekday",
    forecastFor("2026-11-27", nov.p, nov.wk) === nov.wk[5],
    `${forecastFor("2026-11-27", nov.p, nov.wk)} vs an ordinary Friday ${nov.wk[5]}`);
}

group("2. ★★ the unit the time control writes");
{
  /* ⚠️ MINUTES FROM MIDNIGHT, which is storeHours.js's unit and what every
     reader expects. A "10:30" string would read as NaN at the first resolve. */
  applyStoreOverrides({ holidays: { open: 630, close: 960, baseSales: 9000, byKey: {} } });
  const h = storeCfg("holidays");
  t("★★ open and close are numbers, not clock strings",
    typeof h.open === "number" && typeof h.close === "number", `${typeof h.open} / ${typeof h.close}`);
  t("★ 630 really is 10:30", Math.floor(h.open / 60) === 10 && h.open % 60 === 30);
}

group("3. ★★ a row carries ONE state, never two");
{
  /* Each control REPLACES the row rather than merging into it. A record holding
     both `closed` and an opening time is one somebody edited twice, and the
     resolver would have to pick — a rule living in two places. */
  const src = existsSync(new URL("./StoreSettings.jsx", import.meta.url))
    ? readFileSync(new URL("./StoreSettings.jsx", import.meta.url), "utf8") : "";
  t("control: the screen was read", src.length > 1000);
  const sec = src.slice(src.indexOf("Days that are different"));
  t("control: the per-holiday block was found", sec.length > 500 && sec.includes("holidays.byKey"));
  /* ⚠️ EVERY WRITE IS A WHOLE OBJECT LITERAL. A spread of the old row would let
     two states coexist, which is the exact thing this section grades. */
  const spreads = (sec.match(/holidays\.byKey\.\$\{k\}`,\s*\{\s*\.\.\./g) || []).length;
  t("★★ no write merges into the row it replaces", spreads === 0, `${spreads} spread(s)`);
  const writes = (sec.match(/edit\(`holidays\.byKey\.\$\{k\}`/g) || []).length;
  t(`★ and the scan really found the writes (control) — ${writes}`, writes >= 4, writes);
}

group("4. ★ every holiday the Hub knows is offered");
{
  const src = readFileSync(new URL("./StoreSettings.jsx", import.meta.url), "utf8");
  t("★★ the list is HOLIDAY_KEYS, never a typed list of names",
    /HOLIDAY_KEYS\.map/.test(src));
  t(`★ and there are holidays to offer (control) — ${HOLIDAY_KEYS.length}`, HOLIDAY_KEYS.length >= 6);
}

console.log(`\n${fails.length ? `${fails.length} FAILED, ` : ""}${pass} passed`);
process.exit(fails.length ? 1 : 0);
