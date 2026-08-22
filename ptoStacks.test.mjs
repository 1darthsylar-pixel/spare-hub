/* ══════════════════════════════════════════════════════════════════════════
   ptoStacks.test.mjs — ADDING PTO ADDS. IT DOES NOT REPLACE.

   🐛🐛 Matt, Aug 19 2026: "adding pto didnt stack or add up. it erased the
   firsts. entry."

   PTO shipped as ONE box holding the TOTAL. It summed an expression, so
   "400 + 100" worked inside a single typing session — but he updates PTO twice
   monthly, weeks apart. Typing the second pay period on its own REPLACED the
   first, with no warning and no undo. His live August record held one figure
   where two pay periods had been entered.

   ⚠️ HIS ORIGINAL ASK WAS "PTO can be one as long as it auto adds" (Jul 29).
   The box was one, and it did not auto add across sessions. This closes that
   gap rather than adding a second box back.

   ⇒ The entry list is the source of truth and `pto` is derived from it, so
   labor %, projected wages and the MTD stat keep reading the one field they
   already read.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(DIR, "FCRPage.jsx"), "utf8");
/* ⚠️ Comments stripped: the comment recording this fix quotes the old
   behaviour, and a grep over prose grades the prose. */
const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

let pass = 0, fail = 0;
const t = (n, fn) => {
  try { fn(); console.log(`  ok    ${n}`); pass++; }
  catch (e) { console.log(`  FAIL  ${n}\n        ${e.message}`); fail++; }
};
const group = (n) => console.log(`\n${n}`);

/* The rule, extracted with the same shape as the code, so this grades
   behaviour and not spelling. */
const round2 = (n) => String(Math.round(n * 100) / 100);
const listOf = (o) => (Array.isArray(o.ptoEntries) ? o.ptoEntries : []);
const totalOf = (o) => { const l = listOf(o); return l.length ? round2(l.reduce((s, e) => s + (Number(e.amount) || 0), 0)) : ""; };
const addEntry = (mtd, amount) => {
  if (!(amount > 0)) return mtd;
  const next = { ...mtd, ptoEntries: [...listOf(mtd), { id: `p${listOf(mtd).length}`, amount: round2(amount), at: "2026-08-19" }] };
  next.pto = totalOf(next) || "";
  return next;
};
const removeEntry = (mtd, id) => {
  const next = { ...mtd, ptoEntries: listOf(mtd).filter((e) => e.id !== id) };
  next.pto = totalOf(next) || "";
  return next;
};

group("1. the reported bug, run");

t("★★ a second pay period ADDS to the first", () => {
  let m = { pto: "", ptoEntries: [] };
  m = addEntry(m, 776);
  assert.equal(m.pto, "776");
  m = addEntry(m, 400);
  assert.equal(m.pto, "1176", "the second entry replaced the first, which is the bug");
  assert.equal(listOf(m).length, 2, "both pay periods should still be on file");
});

t("★★ control: the old rule erases, exactly as reported", () => {
  /* One box holding the total. Typing 400 on its own is the whole bug. */
  const oldRule = (mtd, typed) => ({ ...mtd, pto: round2(typed) });
  let m = oldRule({ pto: "" }, 776);
  m = oldRule(m, 400);
  assert.equal(m.pto, "400", "the repro is wrong");
  /* And the fixed rule must NOT agree with it. */
  let f = addEntry({ pto: "", ptoEntries: [] }, 776);
  f = addEntry(f, 400);
  assert.notEqual(f.pto, "400", "the fix agrees with the bug, so nothing was fixed");
});

group("2. a typo is one tap, not a retype");

t("★ removing an entry recomputes the total", () => {
  let m = addEntry(addEntry({ pto: "", ptoEntries: [] }, 776), 4000);
  assert.equal(m.pto, "4776");
  m = removeEntry(m, listOf(m)[1].id);
  assert.equal(m.pto, "776", "removing the mistake did not restore the total");
  assert.equal(listOf(m).length, 1);
});

t("removing the last entry leaves an empty total, never a stray zero", () => {
  let m = addEntry({ pto: "", ptoEntries: [] }, 776);
  m = removeEntry(m, listOf(m)[0].id);
  assert.equal(m.pto, "", "an empty PTO total should be blank, not \"0\"");
});

t("an unreadable or zero amount adds nothing", () => {
  const m = { pto: "776", ptoEntries: [{ id: "a", amount: "776" }] };
  assert.equal(addEntry(m, 0).pto, "776");
  assert.equal(addEntry(m, NaN).pto, "776");
  assert.equal(listOf(addEntry(m, 0)).length, 1);
});

group("3. ⛔ nothing already saved is lost (rule 1)");

/* ⚠️ A MONTH SAVED BEFORE THIS EXISTED MUST OPEN SHOWING ITS REAL FIGURE.
   Three shapes exist in storage: a bare `pto` total, the three slots, and now
   the entry list. */
const seed = (next) => {
  if (!Array.isArray(next.ptoEntries)) {
    const fromSlots = ["ptoA", "ptoB", "ptoC"].map((k) => Number(next[k]) || 0).filter((n) => n > 0);
    const s = fromSlots.length ? fromSlots : (Number(next.pto) > 0 ? [Number(next.pto)] : []);
    next.ptoEntries = s.map((amount, i) => ({ id: `seed${i}`, amount: round2(amount), at: "" }));
  }
  return next;
};

t("★★ this store's live August record opens intact", () => {
  /* Read from the live record on Aug 19 2026. */
  const m = seed({ pto: "776", ptoA: "776", ptoB: "", ptoC: "" });
  assert.equal(listOf(m).length, 1);
  assert.equal(totalOf(m), "776", "the figure already inside the labor % changed on open");
});

t("★★ three separate pay periods stay three, never merged into one", () => {
  const m = seed({ pto: "1276", ptoA: "776", ptoB: "400", ptoC: "100" });
  assert.equal(listOf(m).length, 3, "the slots were merged, losing which pay period was which");
  assert.equal(totalOf(m), "1276");
});

t("a bare total with no slots becomes one entry", () => {
  const m = seed({ pto: "520", ptoA: "", ptoB: "", ptoC: "" });
  assert.equal(listOf(m).length, 1);
  assert.equal(totalOf(m), "520");
});

t("a month with no PTO stays empty, and does not invent an entry", () => {
  const m = seed({ pto: "", ptoA: "", ptoB: "", ptoC: "" });
  assert.equal(listOf(m).length, 0);
  assert.equal(totalOf(m), "", "an empty month should read blank, not zero");
});

t("★ an existing entry list is never re-seeded over", () => {
  const m = seed({ pto: "776", ptoA: "776", ptoEntries: [{ id: "x", amount: "400" }] });
  assert.equal(listOf(m).length, 1);
  assert.equal(listOf(m)[0].amount, "400", "the seed overwrote real entries");
});

group("4. the screen and the wiring");

t("★ pto stays the derived field every reader already uses", () => {
  assert.ok(/next\.pto = ptoTotalOf\(next\) \|\| "";/.test(code), "the total is no longer derived from the list");
  const fn = code.slice(code.indexOf("const ptoTotalOf"), code.indexOf("const addPtoEntry"));
  assert.ok(/ptoListOf\(o\)/.test(fn), "the total is computed from something other than the entry list");
  assert.ok(/if \(!list\.length\) return "";/.test(fn),
    "an empty month stores \"0\", which is truthy — absent and zero must not read the same");
});

t("★★ the box adds and clears, so the natural action is the safe one", () => {
  assert.ok(/const addPtoEntry = \(\) => \{/.test(code), "there is no add action");
  assert.ok(/setPtoDraft\(""\);/.test(code), "the box does not clear, so the amount can be added twice");
  assert.ok(!/onBlur=\{\(\) => commitMtdField\("pto"\)\}/.test(code),
    "the old replace-on-blur box is still wired up");
});

t("★ every entry can be removed", () => {
  assert.ok(/const removePtoEntry = \(id\) => \{/.test(code), "there is no way to undo a typo");
  assert.ok(/onClick=\{\(\) => removePtoEntry\(e\.id\)\}/.test(code), "the remove control is not wired");
});

/* ⚠️ PTO CORRECTS A NUMBER INSIDE A WINDOW ALREADY AGREED. Re-pinning on it
   would move the payroll window every time he added a pay period. */
t("★★ adding PTO never pins the payroll window", () => {
  assert.ok(/if \(field !== "wages" && field !== "hours"\) return next;/.test(code),
    "the pin guard changed — PTO may now be moving the payroll window");
  const add = code.slice(code.indexOf("const addPtoEntry"), code.indexOf("const removePtoEntry"));
  assert.ok(!/pinWindowOnPayroll/.test(add), "the add path pins the window");
});

t("Enter adds, so the keyboard path matches the button", () => {
  assert.ok(/e\.key === "Enter"[\s\S]{0,60}addPtoEntry\(\)/.test(code), "Enter does not add");
});

console.log(`\n${fail ? "FAILED" : "PASSED"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
