/* ============================================================================
   dupKeys.test.mjs — no object literal in the shipped client declares the same
   key twice.

       node dupKeys.test.mjs

   ★ WHY. `App.jsx` carried `shiftleader:` TWICE in the tile icon map, about
   twenty lines apart. In a JavaScript object literal the LATER key wins, so the
   first one — the commented, correctly-indented, deliberate-looking one — was
   dead code, and the tile rendered the other. Vite warned on every boot and
   nothing else did.

   ⚠️⚠️ THIS IS THE FAILURE MODE THE SIX CHECKS CANNOT SEE, and that is the
   whole reason for this file. A duplicate key is perfectly valid JavaScript:
   it parses, every identifier resolves, no hook moves, no TDZ, no synthetic
   event. All six run clean on it forever. The only symptom is a build warning
   nobody reads and a value that is quietly not the one written next to the
   comment explaining it.

   ⚠️ THE DANGEROUS SHAPE IS NOT A WRONG ICON. It is a duplicate in a map that
   decides something — a rank table, a role colour, a tier, a station. The two
   copies drift, the reader trusts the first one, and the code obeys the second.
   Design rule 8 says the same thing about functions; this is the object form.

   ⚠️ SPREADS AND COMPUTED KEYS ARE SKIPPED ON PURPOSE. `{...a, ...b}` is meant
   to override, and `{[k]: v}` cannot be judged without running it. Only two
   literal keys spelled identically in one literal are a defect.
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const FILES = fs.readdirSync(new URL(".", import.meta.url).pathname)
  .filter((f) => (f.endsWith(".jsx") || f.endsWith(".js")) && !f.endsWith(".test.mjs"))
  .filter((f) => !["vite.config.js", "eslint.config.js"].includes(f))
  .sort();

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log(`  ok    ${name}`); pass++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${e.message}`); fail++; }
};

/* Every duplicate literal key in one file, as {line, key, firstLine}. */
function dupesIn(file) {
  const src = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out = [];
  const nameOf = (p) => {
    if (!p.name) return null;                       // spread, or a method with none
    if (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) || ts.isNumericLiteral(p.name)) {
      return String(p.name.text);
    }
    return null;                                    // computed — cannot judge statically
  };
  const walk = (node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const seen = new Map();
      for (const p of node.properties) {
        /* ⚠️ GETTERS AND SETTERS LEGALLY PAIR ON ONE NAME. Counting them as a
           duplicate would make this test lie about correct code. */
        if (ts.isGetAccessorDeclaration(p) || ts.isSetAccessorDeclaration(p)) continue;
        const k = nameOf(p);
        if (k == null) continue;
        const line = sf.getLineAndCharacterOfPosition(p.getStart(sf)).line + 1;
        if (seen.has(k)) out.push({ key: k, line, firstLine: seen.get(k) });
        else seen.set(k, line);
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return out;
}

console.log(`\nscanning ${FILES.length} client files`);

const all = [];
for (const f of FILES) {
  const d = dupesIn(f);
  if (d.length) all.push({ file: f, dupes: d });
}

t("no object literal declares the same key twice", () => {
  if (!all.length) return;
  const lines = all.flatMap(({ file, dupes }) =>
    dupes.map((d) => `${file}:${d.line} "${d.key}" (already set at line ${d.firstLine} — the LATER one wins)`));
  throw new Error(`${lines.length} duplicate key(s):\n        ` + lines.join("\n        "));
});

/* ── the specific one this file was written for ──────────────────────────── */
t("App.jsx declares shiftleader exactly once", () => {
  const src = fs.readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  const hits = [...src.matchAll(/^\s*shiftleader:/gm)];
  if (hits.length !== 1) {
    throw new Error(`shiftleader appears ${hits.length} times as an object key; expected 1`);
  }
});

t("⚠️ and it kept the paths that were actually rendering", () => {
  /* The duplicate could have been resolved either way. Deleting the LIVE half
     would have changed a tile icon for everybody under cover of a lint fix, so
     the surviving entry must be the one that was winning before. */
  const src = fs.readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  const block = src.match(/shiftleader: \([\s\S]{0,400}?\),/);
  if (!block) throw new Error("shiftleader entry not found — this test is stale, not the code");
  if (!/M9 11l3 3L22 4/.test(block[0])) {
    throw new Error("the surviving shiftleader icon is not the one that was rendering before");
  }
});

console.log(`\n${fail ? "FAILED" : "PASSED"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
