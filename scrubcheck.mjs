#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   scrubcheck.mjs — WHICH SOURCE LINE PUTS THIS WORD ON A SCREEN?

     node scrubcheck.mjs Bri Hannah Nick            words to hunt
     node scrubcheck.mjs --count "Peak Reachers"    totals only, no lines
     node scrubcheck.mjs --dist Bri Hannah          sweep dist/ instead

   ★ WHY THIS EXISTS, AND WHY IT IS NOT drift.mjs. `drift.mjs --names` answers
   "did any of the origin store's name survive into a clone's BUILT output?"
   That is the right question at the end and it is useless at the start,
   because a count in a minified chunk cannot tell you which line to edit.
   This answers the other half: given a word, which source line SHIPS it.

   ⚠️ THE WHOLE PROBLEM IS COMMENTS. This repo's comments name its own people
   constantly and legitimately — they are provenance and they stay. Grepping
   source for a first name returns hundreds of hits, almost all comment, and a
   tool that cries wolf trains you to skim past the three that matter. On Aug 12
   2026 one clone's first name pass reported 60 hits, "almost all in comments",
   and three real ones were nearly skimmed past in that noise.

   ⇒ So this does not grep. It PARSES, and looks only at the node types that
   survive minification and can reach a screen:

       string literals · template literal text · JSX text · regex literals

   A comment is not a node, so it cannot produce a hit. An identifier is not
   included either: `const isDenise = ...` minifies to a single letter and the
   name never reaches the browser. **The regex INSIDE it does**, which is why
   regex literals are on the list — `/^denise\b/i` ships verbatim.

   ⚠️ IT IS A MAP, NOT A VERDICT. A hit inside `isGateCity() && ...` still
   ships; a gate stops a thing RENDERING, never SHIPPING. And a hit can be
   correct: "Gate City" in Gate City's own repo is the store's name. Read the
   line. The number that decides whether the job is done is the BUILT bundle,
   which is what `--dist` reports and what `drift.mjs --names` reports.

   ⚠️ A CLEAN RESULT PROVES NOTHING UNLESS THE SWEEP RAN. Pointing this at a
   directory with no matching files prints "0 hits", which reads exactly like
   success. It refuses to report unless it parsed at least one file, and it
   says how many.
   ══════════════════════════════════════════════════════════════════════════ */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const countOnly = argv.includes("--count");
const wantDist = argv.includes("--dist");
const words = argv.filter((a) => !a.startsWith("--"));

if (!words.length) {
  console.error('usage: node scrubcheck.mjs [--count] [--dist] "Word" "Two Words" ...');
  process.exit(2);
}

/* ⚠️ SKIPPED DIRECTORIES ARE NOT COSMETIC. `dist` is generated, `archive` is
   kept deliberately, and `checks` holds fixtures that name people ON PURPOSE
   so the checks have something to catch. Sweeping any of them buries the
   answer. */
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "archive", "checks", "public"]);
const CODE = /\.(jsx?|mjs)$/;

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = path.join(dir, n);
  if (statSync(p).isDirectory()) return SKIP_DIRS.has(n) ? [] : walk(p);
  return [p];
});

/* ── The dist half, for the number that actually decides ────────────────────
   Kept in the same tool so the "where" and the "how many" cannot drift apart,
   but deliberately a plain text scan: a minified chunk is not parseable as the
   source it came from, and it does not need to be. */
function sweepDist() {
  const dist = path.join(ROOT, "dist");
  if (!existsSync(dist)) {
    console.error("no dist/ — run `npx vite build` first. Reporting nothing.");
    process.exit(2);
  }
  const built = walk(dist).filter((f) => /\.(js|html|webmanifest)$/.test(f));
  /* ⚠️ CONTROL FIRST. A sweep of the wrong path reports a clean bundle. */
  const control = built.filter((f) => readFileSync(f, "utf8").includes("Hub"));
  if (!control.length) {
    console.error("⛔ control string not found in any built file. The path or the");
    console.error("   build is wrong, so this sweep proves nothing. Reporting nothing.");
    process.exit(2);
  }
  console.log(`built files: ${built.length}, control found in ${control.length}\n`);
  let total = 0;
  for (const w of words) {
    /* ⚠️ COUNT INSTANCES, NOT LINES. A minified chunk is one enormous line, so
       a line-based count answers 1 however many times the word appears. That
       made one store's tally read 6 when it was 11.

       ⚠️⚠️ CASE-INSENSITIVE, AND THIS ARM WAS CASE-SENSITIVE UNTIL AUG 13 2026.
       It is the same `i` the source arm below has always used, and the mismatch
       between the two is not cosmetic: **it undercounted this repo's own bundle
       by more than half**, 62 against a true 133. The access lists in
       `ownerSeed.js` are stored lower case, because every call site lowercases
       before comparing, so a sweep for "Bri" walks straight past "bri moore".
       The runbook's own worked example carried the same bug.
       ⇒ Two arms of one tool answering the same question must use one regex
       flag set, or the cheaper arm quietly becomes the one you trust. */
    const re = new RegExp(`${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "gi");
    const per = built.map((f) => [path.relative(ROOT, f), (readFileSync(f, "utf8").match(re) || []).length])
                     .filter(([, n]) => n > 0);
    const sum = per.reduce((a, [, n]) => a + n, 0);
    total += sum;
    if (!sum) continue;
    console.log(`${w}  x${sum}`);
    if (!countOnly) for (const [f, n] of per) console.log(`   ${String(n).padStart(4)}  ${f}`);
  }
  console.log(`\nTOTAL in built output: ${total}`);
  process.exit(total ? 1 : 0);
}

if (wantDist) sweepDist();

/* ── The source half ────────────────────────────────────────────────────────
   ⚠️ ScriptKind.TSX, not JSX or JS. The repo's own parse check uses TSX and
   says so; matching it means a file that parses there parses here. */
const files = walk(ROOT).filter((f) => CODE.test(f));
if (!files.length) {
  console.error("⛔ no source files found. Reporting nothing rather than a clean sweep.");
  process.exit(2);
}

const hits = [];
let parsed = 0;
let unparsed = [];

for (const file of files) {
  let src;
  try { src = readFileSync(file, "utf8"); } catch { continue; }
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  /* ⚠️ A FILE THAT FAILS TO PARSE IS REPORTED, NEVER SKIPPED QUIETLY. Silently
     dropping it is how a swept file gets a clean bill it never earned. */
  if (sf.parseDiagnostics && sf.parseDiagnostics.length) unparsed.push(path.relative(ROOT, file));
  parsed++;

  const visit = (node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) ||
      ts.isJsxText(node) ||
      ts.isRegularExpressionLiteral(node)
    ) {
      const text = node.getText(sf);
      for (const w of words) {
        /* Word boundaries so "Bri" does not match "Brian" or "bright", but a
           multi-word term like "Peak Reachers" still matches as written. */
        const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
        const n = (text.match(re) || []).length;
        if (!n) continue;
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        hits.push({
          file: path.relative(ROOT, file),
          line: line + 1,
          word: w,
          n,
          text: src.split("\n")[line].trim().slice(0, 120),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

console.log(`parsed ${parsed} source files`);
if (unparsed.length) {
  console.log(`⚠️  ${unparsed.length} file(s) had parse diagnostics: ${unparsed.join(", ")}`);
}
console.log("");

const byWord = new Map();
for (const h of hits) byWord.set(h.word, (byWord.get(h.word) || 0) + h.n);

if (!hits.length) {
  console.log(`no live occurrences of ${words.map((w) => `"${w}"`).join(", ")} in string, template, JSX or regex text`);
  process.exit(0);
}

if (countOnly) {
  for (const [w, n] of [...byWord].sort((a, b) => b[1] - a[1])) console.log(`${w}  x${n}`);
} else {
  const byFile = new Map();
  for (const h of hits) {
    if (!byFile.has(h.file)) byFile.set(h.file, []);
    byFile.get(h.file).push(h);
  }
  for (const [file, list] of [...byFile].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`── ${file}  (${list.reduce((a, h) => a + h.n, 0)})`);
    for (const h of list.sort((a, b) => a.line - b.line)) {
      console.log(`   ${String(h.line).padStart(5)}  ${h.word.padEnd(10)} ${h.text}`);
    }
    console.log("");
  }
}

console.log(`TOTAL live source occurrences: ${hits.reduce((a, h) => a + h.n, 0)}`);
process.exit(1);
