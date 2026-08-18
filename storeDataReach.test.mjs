#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   storeDataReach.test.mjs — CAN THIS STORE'S OWN NUMBERS REACH A CLONE'S
   BROWSER?

   ⚠️⚠️ THE INCIDENT, Aug 18 2026. Ten data files were byte-identical between
   this repo and `guilford-hub`: eighteen months of P&L, the cash counts with
   the counting leader named, the guest and mystery-shop scores, and the Ecosure
   round. The Village had been scrubbed BY HAND months earlier and the generator
   was never told, so every store cloned since kept them.

   ⭐ NINE OF THE TEN NEVER REACHED A PERSON, AND THAT IS THE WHOLE INSIGHT.
   `worker.js` already gates them: `seedFor(mine, empty)` hands a foreign store
   the empty value, and `/api/fcr-data` does the same through `ownHistory`.
   Those gates worked. They are why this was a repo problem and not an incident.

   ⛔ THE TENTH ESCAPED BECAUSE IT NEVER WENT THROUGH THE WORKER. `ECOSURE_SEED`
   was imported by `FoodSafetyWalkthrough.jsx`, so it was bundled and SHIPPED —
   this store's real inspection findings were measured inside guilford-hub's own
   `dist/` that morning. A Worker gate cannot protect a file the browser
   already has.

   ⇒ SO THIS ASKS THE ONE QUESTION THAT ACTUALLY DISTINGUISHES THEM: is a
   pure-data file reachable from the client bundle? If it is, a Worker gate
   cannot save it and it MUST have an `*.empty.js` sibling, which is what
   `newstore.mjs` hands a new store instead.

   ⚠️ IT IS DELIBERATELY NARROW, because a noisy blocking check gets switched
   off. A file `worker.js` alone imports is NOT flagged — that is what `seedFor`
   is for, and demanding a sibling there would be a second mechanism for a
   solved problem. A file exporting a function is NOT flagged — that is code,
   and code travels.

   ★ THE FIX WHEN THIS FAILS IS ONE FILE. Drop `<name>.empty.js` beside it with
   the same export names and empty values. Nothing lists it: `newstore.mjs`
   discovers every sibling by name, and this test discovers every data file the
   same way. Both are the convention, not a register somebody maintains.
   ══════════════════════════════════════════════════════════════════════════ */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
let pass = 0, fail = 0;
const t = (name, ok) => { if (ok) { pass++; console.log(`  ok    ${name}`); } else { fail++; console.log(`  FAIL  ${name}`); } };
const group = (n) => console.log(`\n── ${n}`);

/* ── Walk what the BROWSER actually gets ────────────────────────────────────
   Every `.jsx` is client code, and anything they reach transitively is bundled
   with them. `worker.js` is deliberately not a root here: it is the server. */
const readImports = (file) => {
  let src = "";
  try { src = readFileSync(path.join(ROOT, file), "utf8"); } catch { return []; }
  const out = [];
  /* import … from "./x"  ·  export … from "./x"  ·  import("./x") */
  const re = /(?:^|\n)\s*(?:import|export)[\s\S]{0,400}?from\s*["'](\.\/[^"']+)["']|import\(\s*["'](\.\/[^"']+)["']\s*\)/g;
  for (const m of src.matchAll(re)) {
    const raw = (m[1] || m[2] || "").replace(/^\.\//, "");
    if (!raw) continue;
    for (const cand of [raw, `${raw}.js`, `${raw}.jsx`]) {
      if (existsSync(path.join(ROOT, cand))) { out.push(cand); break; }
    }
  }
  return out;
};

const reachable = new Set();
const queue = readdirSync(ROOT).filter((f) => f.endsWith(".jsx"));
for (const f of queue) reachable.add(f);
for (let i = 0; i < queue.length; i++) {
  for (const dep of readImports(queue[i])) {
    if (reachable.has(dep)) continue;
    reachable.add(dep); queue.push(dep);
  }
}

group("the walk found the client bundle");
/* ⚠️⚠️ THE CONTROLS COME FIRST AND THEY ARE NOT DECORATION. If this walk
   silently finds nothing — a renamed entry point, a regex that stopped
   matching — then every assertion below passes for a repo shipping the lot.
   That is the exact shape of failure this whole file exists to catch, so it
   must not be able to happen here. */
t(`it reaches a real number of files (got ${reachable.size})`, reachable.size > 40);
t("it reaches storeConfig.js (control)", reachable.has("storeConfig.js"));
/* ⚠️ THIS CONTROL NAMED ONE FILE AND WAS WRONG FOR IT. It asserted
   `ecosureSeed.js`, which only exists where the Ecosure split has landed — so
   it reported "the walk is broken" in `village-hub`, where the walk was fine
   and the file simply is not there yet. A control has to test the CAPABILITY,
   never one repo's furniture, or it fails hardest in the repo furthest behind,
   which is the repo that needs it most. */
const directFromJsx = new Set(
  readdirSync(ROOT).filter((f) => f.endsWith(".jsx")).flatMap((f) => readImports(f)));
const transitive = [...reachable].filter((f) => f.endsWith(".js") && !directFromJsx.has(f));
t(`it follows a .js → .js hop, not just .jsx (control: ${transitive.length} reached only indirectly)`,
  transitive.length > 0);
t("it does NOT treat worker.js as client code (control)", !reachable.has("worker.js"));
if (fail) { console.log(`\n${fail} FAILED, ${pass} passed — the walk is broken, so nothing below can be trusted.`); process.exit(1); }

/* ── The one judgement a machine cannot make ────────────────────────────────
   ⚠️⚠️ NOT EVERY DATA FILE IS THIS STORE'S DATA, AND GETTING THAT BACKWARDS IS
   HARMFUL RATHER THAN MERELY NOISY. Chick-fil-A's menu, the Leadership 101
   curriculum and the standard expense categories are all pure data the browser
   reaches, and all of them are MEANT to travel: handing a new store an empty
   `wasteMenu.js` or an empty `L101W2.js` would take away its menu and its
   course. An empty twin is not a free "safe" default.

   ⇒ So a file is either scrubbed (it has an `*.empty.js` twin) or it is listed
   HERE with the reason. A file that is neither FAILS, which is the whole point:
   somebody adding a data file has to answer one question rather than remember
   a rule. That question is the guard.

   ⛔ EXACT FILENAMES ONLY, NEVER A PATTERN. A pattern is how the next
   `fcrProjectionData.js` gets waved through by a rule written for something
   else. Each line below is a person having looked. */
const TRAVELS_ON_PURPOSE = {
  "L101W2.js":          "Leadership 101 week 2, 'Conflict & Coaching'. CFA curriculum, identical at every store.",
  "L101W3.js":          "Leadership 101 week 3, 'Food Safety'. Same.",
  "adminRoles.js":      "Role-name strings only ('owner', 'executive director'). Names of titles, not of people.",
  "expenseDefaults.js": "The standard expense categories and their four groups. No amounts.",
  "skillsChecklists.js":"Training checklists. The class content, not anybody's progress through it.",
  "wasteMenu.js":       "The CFA menu, every price 0. A new store needs this on day one.",
};

/* ── Of those, which are pure data? ─────────────────────────────────────── */
group("every pure-data file the browser can reach has an empty twin");
const offenders = [];
let checked = 0;
for (const f of [...reachable].sort()) {
  if (!f.endsWith(".js") || f.endsWith(".empty.js")) continue;
  let m;
  try { m = await import(pathToFileURL(path.join(ROOT, f)).href); } catch { continue; }
  const vals = Object.values(m);
  if (!vals.length) continue;
  /* A file that exports a function is code. Code is meant to travel. */
  if (vals.some((v) => typeof v === "function")) continue;
  /* Only exports that actually hold something can carry a store's records. */
  const holdsSomething = vals.some((v) =>
    (Array.isArray(v) && v.length) ||
    (v && typeof v === "object" && Object.keys(v).length));
  if (!holdsSomething) continue;
  checked++;
  if (TRAVELS_ON_PURPOSE[f]) continue;
  if (!existsSync(path.join(ROOT, f.replace(/\.js$/, ".empty.js")))) offenders.push(f);
}
t(`there are pure-data files to check at all (control: ${checked})`, checked > 0);
for (const f of offenders) {
  console.log(`  FAIL  ${f} is data, the browser can reach it, and it has no ${f.replace(/\.js$/, ".empty.js")}`);
  fail++;
}
if (!offenders.length) t(`all ${checked} of them have one`, true);
else console.log(`\n  ⇒ ANSWER ONE QUESTION: does this file hold THIS STORE'S records?\n     YES  → create <name>.empty.js beside it, same export names, empty values\n            ({} or []). newstore.mjs hands a new store that one instead.\n     NO   → add it to TRAVELS_ON_PURPOSE above WITH THE REASON. Shared content\n            like the menu or the L101 course must reach a new store intact; an\n            empty twin would take it away, so do not reach for one to pass this.`);

console.log(`\n${fail ? `${fail} FAILED, ` : ""}${pass} passed`);
process.exit(fail ? 1 : 0);
