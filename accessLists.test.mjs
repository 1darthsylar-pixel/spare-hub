/* ============================================================================
   accessLists.test.mjs — a malformed access list is REFUSED, not saved.

       node accessLists.test.mjs

   ★ WHY. `owners.tileAllow`, `profitEdit`, `handbookExempt` and `hrConsole`
   decide who may open a tier 4 tile, who may edit PROFIT SHARE, and who may
   open a personnel file. Until Aug 16 2026 every one of them arrived from a
   browser and went into storage unexamined: `checkStoreSettings` shape-checks
   the keys it knows and passes the rest through.

   ⚠️⚠️ THE FAILURE IS SILENT AND IT LEANS OPEN, which is why this file leads
   with it. These lists are read with `.includes(id)`, so a malformed one does
   not throw — it answers:

       tileAllow.schedule = "1733"   → .includes("17") is TRUE. Also "33",
                                       "3", "7", "173". A STRING admits people
                                       by substring.
       tileAllow.schedule = [17, 33] → admits NOBODY. Ids are compared as
                                       strings, and this reads as "the setting
                                       did not save".

   Neither is visible anywhere. Design rule 1: fail loudly without saving rather
   than save something wrong. A refused save gets reported; a quietly malformed
   ACL does not, because nobody re-checks an access list that appeared to work.

   ⚠️ EMPTY IS VALID AND MUST STAY VALID. Empty means nobody, which is a real
   answer and the correct starting point for a new store. Only a wrong SHAPE is
   an error. Section 3 is entirely that.
   ============================================================================ */
import assert from "node:assert";
import { checkStoreSettings } from "./storeSettingsImport.js";

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log(`  ok    ${name}`); pass++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${e.message}`); fail++; }
};
const check = (owners) => checkStoreSettings({ owners });
const refused = (owners, why) => {
  const r = check(owners);
  assert.equal(r.ok, false, `${why} was ACCEPTED — ${JSON.stringify(owners)}`);
  assert.ok(r.errors.length > 0, "refused with no reason to show");
};
const accepted = (owners, why) => {
  const r = check(owners);
  assert.equal(r.ok, true, `${why} was refused: ${r.errors.join(" ")}`);
};

/* ── 1. ⚠️ THE SUBSTRING HOLE — the one that leans OPEN ──────────────────── */
console.log("\n1. a string where a list belongs");

t("⚠️⚠️ a STRING access list is refused", () => {
  /* "1733".includes("17") is true, and so is "33", "3", "7". This is the shape
     that hands a tier 4 tile to people nobody named. */
  refused({ tileAllow: { schedule: "1733" } }, "a string tile list");
});

t("a string profit share list is refused", () => {
  refused({ profitEdit: "33" }, "a string profitEdit");
});

t("tileAllow that is not an object at all is refused", () => {
  refused({ tileAllow: ["17"] }, "an array tileAllow");
  refused({ tileAllow: "everyone" }, "a string tileAllow");
});

/* ── 2. the shapes that lean CLOSED but read as a broken save ────────────── */
console.log("\n2. shapes that admit nobody and look like a failed save");

t("numbers instead of id strings are refused", () => {
  /* Ids are compared as strings everywhere, so [17, 33] admits nobody and the
     person who typed it has no way to find that out. */
  refused({ tileAllow: { schedule: [17, 33] } }, "numeric ids");
});

t("a blank or whitespace id is refused", () => {
  refused({ tileAllow: { schedule: ["17", ""] } }, "a blank id");
  refused({ tileAllow: { schedule: ["   "] } }, "a whitespace id");
});

t("null and undefined entries are refused", () => {
  refused({ tileAllow: { requestApprove: [null] } }, "a null id");
  refused({ handbookExempt: [undefined] }, "an undefined id");
});

/* ── 3. ⚠️ EMPTY AND ABSENT MUST BOTH STILL WORK ─────────────────────────── */
console.log("\n3. empty is a real answer, not an error");

t("an empty list is accepted", () => {
  accepted({ tileAllow: { schedule: [], requestApprove: [], scheduleEdit: [] } }, "empty lists");
  accepted({ profitEdit: [], handbookExempt: [] }, "empty profitEdit and handbookExempt");
});

t("an absent list is accepted", () => {
  accepted({ seats: [] }, "owners with no access lists at all");
  accepted({}, "an empty owners object");
});

t("a real list is accepted", () => {
  accepted({ tileAllow: { schedule: ["17", "21", "33", "37"], requestApprove: ["21", "33"] } }, "this store's own lists");
});

t("a tile name this build has never heard of is still shape-checked", () => {
  /* New tier 4 tiles get added. The check must not be a list of known tiles,
     or the next one ships unguarded. */
  accepted({ tileAllow: { somethingNew: ["17"] } }, "an unknown tile with a good list");
  refused({ tileAllow: { somethingNew: "17" } }, "an unknown tile with a string list");
});

/* ── 4. the HR Console list, whose rows are a different shape ────────────── */
console.log("\n4. the HR Console list");

t("a well-formed row is accepted, by id or by name", () => {
  accepted({ hrConsole: [{ id: "21", names: ["hannah"] }] }, "id and names");
  accepted({ hrConsole: [{ id: null, names: ["matt jackson"] }] }, "a name-only row");
  accepted({ hrConsole: [] }, "an empty HR Console list");
});

t("a row that is not an object is refused", () => {
  refused({ hrConsole: ["21"] }, "a bare id string as a row");
  refused({ hrConsole: [null] }, "a null row");
});

t("a numeric id or a non-list names field is refused", () => {
  refused({ hrConsole: [{ id: 21 }] }, "a numeric id");
  refused({ hrConsole: [{ id: "21", names: "hannah" }] }, "names as a string");
  refused({ hrConsole: [{ id: "21", names: [""] }] }, "a blank name");
});

t("the whole list not being a list is refused", () => {
  refused({ hrConsole: { id: "21" } }, "an object instead of a list");
});

/* ── 5. a refusal has to say what is wrong ───────────────────────────────── */
console.log("\n5. the refusal is readable");

t("the message names the list that is wrong", () => {
  const r = check({ tileAllow: { schedule: "1733" } });
  assert.ok(/schedule/.test(r.errors.join(" ")), `errors do not name the list: ${r.errors.join(" ")}`);
});

console.log(`\n${fail ? "FAILED" : "PASSED"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
