/* ============================================================================
   thawCabinets.test.mjs — whose walk-in does this store's Thaw tile draw?

       node thawCabinets.test.mjs

   ⚠️⚠️ THE BUG THIS EXISTS FOR. Until Aug 13 2026 the built-in cabinet map in
   ThawAllocation.jsx was Gate City's physical walk-in, and EVERY store running
   this code got it. The Village had the tile switched on for leaders and
   trainers, so a leader there opened Thaw Allocation and read five doors and 22
   nugget slots as if they described their own cooler.

   That is worse than the tile being missing. A missing tile gets asked about. A
   confident, wrong cabinet map in a food handling tool gets followed.

   ⚠️ THE SAME FILE RUNS IN EVERY STORE'S REPO. It reads this repo's own FSR and
   expects accordingly: the store that owns the built-in board still gets it,
   and everybody else gets nothing and says so. Do not fork it per store — a
   test that only asserts "empty" would pass at Gate City with the board gone.

   ⚠️ THE CODE UNDER TEST IS LIFTED OUT OF ThawAllocation.jsx AS TEXT, because
   the file is JSX and imports React so node cannot import it. Retyping the
   helper here would test this file's copy and keep passing after the real one
   drifted.
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const GATE_CITY_FSR = "04010";

let failures = 0;
const ok = (cond, label) => { console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}`); if (!cond) failures++; };

const src = fs.readFileSync(path.join(DIR, "ThawAllocation.jsx"), "utf8");
const { storeCfg, isGateCity, applyStoreOverrides, STORE_CONFIG } =
  await import(`file://${path.join(DIR, "storeConfig.js")}`);

/* ── lift the built-in board and the helper, verbatim ────────────────────── */
const cabsLit = src.match(/^const CABINETS = \[\];$|^const CABINETS = \[[\s\S]*?^\];$/m);
const helper = src.match(/^export function liveCabinets\([\s\S]*?^\}$/m);
ok(!!cabsLit, "found the CABINETS literal in ThawAllocation.jsx");
ok(!!helper, "found `liveCabinets` in ThawAllocation.jsx");
if (!cabsLit || !helper) { console.log("\nextraction failed, nothing was graded"); process.exit(1); }

const build = new Function("isGateCity", `
  ${cabsLit[0]}
  ${helper[0].replace(/^export /, "")}
  return { liveCabinets, CABINETS };
`);
/* `stored` is what came back from KV; `undefined` here means "call it the way
   the tile does, with the built-in board as the fallback". */
const board = (stored) => {
  const { liveCabinets, CABINETS } = build(isGateCity);
  return liveCabinets(stored, CABINETS);
};

const ownFsr = String(storeCfg("identity.fsr", ""));
const isOwner = ownFsr === GATE_CITY_FSR;
const builtIn = (cabsLit[0].match(/name: "Thaw/g) || []).length;
console.log(`\nthis repo ships as FSR ${ownFsr}, built-in doors: ${builtIn}\n`);

if (isOwner) {
  /* ⚠️ THE CONTROL THAT MUST BE FOUND. A helper that returned [] for everyone
     would satisfy every "it is empty elsewhere" assertion perfectly, and this
     is the only assertion here that would catch it. */
  ok(builtIn > 0, `this store carries its own board of ${builtIn} doors (control)`);
  ok(board([]).length === builtIn, "IT STILL GETS ITS OWN BOARD (control)");
} else {
  ok(builtIn === 0, "this store carries no built-in board");
  /* ⚠️ THE DATA IS GONE, NOT MERELY UNREACHABLE. A gate stops a thing
     RENDERING, never SHIPPING — gated-off slot labels would still sit in this
     store's bundle for anyone who opened it.
     ⚠️ THE CLOSING QUOTE IS REQUIRED. Without it this matched "Nuggets 1 AHA
     Pan" out of SupplyCentral and reported a leak that was not there. A slot
     label ENDS with its number; a product name has none. */
  const slots = src.match(/"[A-Za-z][A-Za-z ]* \d+"/g) || [];
  ok(slots.length === 0, `no slot labels remain in the source${slots.length ? " — found " + slots.slice(0, 3).join(", ") : ""}`);
  ok(board([]).length === 0, "it renders no walk-in");
}

/* ── null is LOADING, and it is not the same as "nothing saved" ──────────── */
/* ⚠️ COLLAPSE THESE TWO AND THE TILE FLASHES ITS EMPTY STATE ON EVERY OPEN,
   which reads as "my board was deleted" to whoever saved it. */
ok(board(null) === null, "an unread layout is null, not an empty board");
ok(board(undefined) === null, "undefined is null too");
ok(board([]) !== null, "a landed-but-empty read is a real answer, not loading");

/* ── a saved layout is the store's board, whoever they are ───────────────── */
const SAVED = [
  { name: "Thaw 1", slots: ["Nuggets", "Nuggets", ""] },
  { name: "Thaw 2", slots: ["Filets", "", "Filets"] },
];
ok(board(SAVED).length === 2, "a saved layout is used");
ok(JSON.stringify(board(SAVED)) === JSON.stringify(SAVED), "it is used verbatim, not merged with the built-in board");
/* ⚠️ THE SAVED BOARD BEATS THE BUILT-IN ONE EVEN AT GATE CITY. Importing is how
   a store corrects its own walk-in; a built-in that quietly won would make the
   import button lie. */
/* ── the answer must be read at CALL time, not captured at module load ───── */
applyStoreOverrides({ identity: { fsr: "99999" } });
ok(isGateCity() === false, "a different FSR is not Gate City");
ok(board([]).length === 0, "a store that is not Gate City gets an EMPTY board");
ok(JSON.stringify(board(SAVED)) === JSON.stringify(SAVED), "but a saved layout still wins there");

applyStoreOverrides({ identity: { fsr: GATE_CITY_FSR } });
ok(isGateCity() === true, "back to 04010 reads as Gate City again");
/* ⚠️ THE ONE THAT PROVES RENDER-TIME READING. If the answer were captured in a
   module const this would still be empty at Gate City. */
ok(board([]).length === builtIn, "the board comes back — the answer is read at call time");
ok(JSON.stringify(board(SAVED)) === JSON.stringify(SAVED), "a saved layout beats the built-in board at Gate City too");
applyStoreOverrides(STORE_CONFIG);

/* ── the render guards that stop a blank red warning ─────────────────────── */
ok(/hasBoard && !fits/.test(src), "the overflow banner is guarded by hasBoard");
ok(/display: hasBoard \? "grid" : "none"/.test(src), "the cabinet grid is hidden when there is no board");
ok(/loaded && !hasBoard && \(/.test(src), "the empty state waits for the read to land");
ok(!/^\s*(const|let) [A-Z_]+ = isGateCity\(\)/m.test(src), "isGateCity is NOT captured in a module const");

/* ── the importer's own refusals, at the source ──────────────────────────── */
/* ⚠️ THESE ARE STRUCTURAL ON PURPOSE. saveLayout lives inside a React
   component and cannot be called from node, but each of these guards was a
   real defect at some point today and a silent removal must not pass. */
ok(/if \(readFailed\)/.test(src), "a failed read blocks saving");
ok(/if \(!parsed\.ok\)/.test(src), "a bad paste is refused");
ok(/if \(unknown\.length\)/.test(src), "products with no thaw factor are refused");
/* ⚠️⚠️ THE ONE THAT BIT. DEFAULT_FACTORS is an array of [name, factor] pairs,
   so Object.keys() returns "0","1","2" and every product looks unmatched —
   which refused every paste while looking like a careful safety check. */
ok(!/unknownProducts\([^)]*Object\.keys/.test(src), "factor names are not read with Object.keys");
ok(/\.map\(\(f\) => f\[0\]\)/.test(src), "factor names come from the pair's first element");
ok(/THAW_IMPORT_MIN_TIER/.test(src) && /canImport/.test(src), "importing is tier gated");

console.log(failures ? `\n${failures} FAILED` : "\nall assertions pass");
process.exit(failures ? 1 : 0);
