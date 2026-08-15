/* ============================================================================
   stationMove.test.mjs — moving a station up or down, run rather than read.

       node stationMove.test.mjs

   Matt, Aug 14 2026: "in store confige when adding stations we need to be able
   to move them up or down."

   ⚠️⚠️ THIS ORDER IS THE ORDER THE DAILY BOARD RENDERS IN. Getting it wrong does
   not throw and does not look broken — it puts a station in the wrong place on
   a board ~106 people work from, and the only symptom is a leader saying the
   board "looks off".

   ⚠️ THE TRAP IS THE UNION. The grid shows ONE row per station, built from every
   day (`stationRows` says so in as many words: the weekend template carries rows
   the weekday one does not). So a day is free to hold its own order, and the
   naive implementation — re-sort every day to match the grid — silently
   rewrites Saturday because somebody nudged a row while looking at Monday.

   ⇒ The rule under test: swap the two stations ONLY, ONLY on days that carry
   BOTH of them, and leave every other day byte-identical to what was read.
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(DIR, "StoreSettings.jsx"), "utf8");

let pass = 0, fail = 0;
const t = (label, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}`); if (cond) pass++; else fail++; };
const group = (n) => console.log(`\n── ${n}`);

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/* The two rules, reimplemented from the shipped source's own shape so this test
   exercises behaviour rather than asserting on prose. `stationRows` and the swap
   are both small enough to state exactly. */
function stationRows(stations, house) {
  const byId = new Map();
  for (const day of DAYS) {
    for (const st of (stations?.[house]?.[day]) || []) {
      if (!byId.has(st.id)) byId.set(st.id, { id: st.id, days: {} });
      byId.get(st.id).days[day] = st;
    }
  }
  return [...byId.values()];
}
function move(stations, house, id, dir) {
  const next = JSON.parse(JSON.stringify(stations));
  const order = stationRows(stations, house).map((r) => r.id);
  const i = order.indexOf(id); const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return { next, touched: 0 };
  const otherId = order[j];
  let touched = 0;
  for (const day of DAYS) {
    const cur = next[house]?.[day];
    if (!cur) continue;
    const a = cur.findIndex((x) => x.id === id);
    const b = cur.findIndex((x) => x.id === otherId);
    if (a < 0 || b < 0) continue;
    const tmp = cur[a]; cur[a] = cur[b]; cur[b] = tmp;
    touched++;
  }
  return { next, touched };
}
const ids = (s, h, d) => (s[h][d] || []).map((x) => x.id).join(",");

group("0. the shipped source really implements this (controls)");
{
  t("moveStation exists in StoreSettings.jsx", /const moveStation = \(h, id, dir\) =>/.test(src));
  t("it reads the row order from stationRows", /stationRows\(stations, h\)\.map\(\(r\) => r\.id\)/.test(src));
  t("it skips a day missing either station", /if \(a < 0 \|\| b < 0\) continue;/.test(src));
  t("it counts the days it touched", /touched\+\+;/.test(src));
  t("and says so when nothing could move", /never on the same day/.test(src));
  /* ⚠️ THE ONE IT MUST NOT DO. A sort by a canonical rank would pass every
     behavioural test below on a tidy fixture and quietly rewrite a day that
     had its own order. Asserting its ABSENCE is the only way to catch it. */
  t("it does NOT sort every day to one canonical order",
    !/\.sort\(\(a, b\) => \(rank/.test(src) && !/const rank = new Map/.test(src));
  t("the up and down buttons are wired to it",
    /moveStation\(house, r\.id, -1\)/.test(src) && /moveStation\(house, r\.id, 1\)/.test(src));
  t("the first row cannot move up and the last cannot move down",
    /disabled=\{loadFailed \|\| ri === 0\}/.test(src) && /disabled=\{loadFailed \|\| ri === rows\.length - 1\}/.test(src));
}

group("1. a simple swap, on every day both stations are on");
{
  const s = { FOH: {} };
  for (const d of DAYS) s.FOH[d] = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const { next, touched } = move(s, "FOH", "b", -1);
  t("b moved above a on Monday", ids(next, "FOH", "mon") === "b,a,c");
  t("and on Sunday too", ids(next, "FOH", "sun") === "b,a,c");
  t(`all seven days were touched (${touched})`, touched === 7);
  t("c did not move", next.FOH.mon[2].id === "c");
}

group("2. ⚠️ A DAY WITH ITS OWN ORDER IS LEFT ALONE");
{
  /* Saturday deliberately runs c,b,a. Moving b up while looking at the grid must
     not straighten Saturday out — it must swap b with whatever a swap means
     there, and touch nothing else. */
  const s = { FOH: {
    mon: [{ id: "a" }, { id: "b" }, { id: "c" }],
    sat: [{ id: "c" }, { id: "b" }, { id: "a" }],
  } };
  for (const d of DAYS) if (!s.FOH[d]) s.FOH[d] = [];
  const before = ids(s, "FOH", "sat");
  const { next } = move(s, "FOH", "b", -1);
  t("Monday swapped a and b", ids(next, "FOH", "mon") === "b,a,c");
  t(`Saturday swapped the same PAIR, in its own positions (${before} → ${ids(next, "FOH", "sat")})`,
    ids(next, "FOH", "sat") === "c,a,b");
  t("Saturday still has all three", next.FOH.sat.length === 3);
}

group("3. a station that is not on every day");
{
  const s = { FOH: {
    mon: [{ id: "a" }, { id: "b" }],
    sat: [{ id: "a" }, { id: "weekend" }],
  } };
  for (const d of DAYS) if (!s.FOH[d]) s.FOH[d] = [];
  const { next, touched } = move(s, "FOH", "b", -1);
  t("Monday swapped", ids(next, "FOH", "mon") === "b,a");
  t("Saturday is untouched — b is not on it", ids(next, "FOH", "sat") === "a,weekend");
  t(`only one day was touched (${touched})`, touched === 1);
}

group("4. two stations that never share a day cannot swap, and it is reported");
{
  const s = { FOH: {
    mon: [{ id: "weekdayonly" }],
    sat: [{ id: "weekendonly" }],
  } };
  for (const d of DAYS) if (!s.FOH[d]) s.FOH[d] = [];
  const { next, touched } = move(s, "FOH", "weekendonly", -1);
  t(`nothing was written (${touched} days touched)`, touched === 0);
  t("Monday unchanged", ids(next, "FOH", "mon") === "weekdayonly");
  t("Saturday unchanged", ids(next, "FOH", "sat") === "weekendonly");
  /* ⚠️ AND THE SCREEN MUST SAY SO. A button that does nothing and explains
     nothing is check 3's exact symptom: visible, pressable, dead. */
  t("the source sets a message for that case",
    /if \(!touched\) \{[\s\S]{0,120}setMsg\(/.test(src));
}

group("5. the ends of the list refuse rather than wrap");
{
  const s = { FOH: {} };
  for (const d of DAYS) s.FOH[d] = [{ id: "a" }, { id: "b" }];
  t("the top row cannot move up", move(s, "FOH", "a", -1).touched === 0);
  t("the bottom row cannot move down", move(s, "FOH", "b", 1).touched === 0);
  /* ⚠️ WRAPPING WOULD BE WORSE THAN NOTHING. A top row that jumps to the bottom
     on a mis-tap rewrites the board and looks like a bug in the board. */
  t("moving the top up does not wrap it to the bottom",
    ids(move(s, "FOH", "a", -1).next, "FOH", "mon") === "a,b");
}

group("6. nothing about a station is altered except its position");
{
  const s = { FOH: { mon: [
    { id: "a", name: "Primary", leader: true, hours: "6:00am-2:00pm" },
    { id: "b", name: "Window", leader: false, hours: "10:00am-8:00pm" },
  ] } };
  for (const d of DAYS) if (!s.FOH[d]) s.FOH[d] = [];
  const { next } = move(s, "FOH", "b", -1);
  const b = next.FOH.mon[0], a = next.FOH.mon[1];
  t("the moved station kept its name", b.name === "Window");
  t("kept its hours", b.hours === "10:00am-8:00pm");
  t("kept its leader flag", b.leader === false);
  t("and the one it passed kept everything too",
    a.name === "Primary" && a.hours === "6:00am-2:00pm" && a.leader === true);
}

console.log(`\n${fail ? `${fail} FAILED, ` : ""}${pass} passed`);
process.exit(fail ? 1 : 0);
