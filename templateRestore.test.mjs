/* ============================================================================
   templateRestore.test.mjs — does the Leadership 101 restore tell the truth?

       node templateRestore.test.mjs

   ⚠️⚠️ THE BUG THIS EXISTS FOR. The restore wrote five things and checked one.
   Week CONTENT was checked and aborted honestly. The instructor notes, the prep
   sections and the survey were written with their answer thrown away, so any of
   them could fail and the screen still finished with:

       "Loaded 8 weeks, 42 activities, 3 prep sections. Refresh to see them."

   A success message NAMING THE EXACT THINGS THAT DID NOT SAVE is worse than no
   message, because the store stops looking. This is the same class Matt was
   burned by on Aug 15, where three real bugs all failed silently while the Hub
   reported success.

   ⚠️ THIS ONE IS STRUCTURAL ON PURPOSE, unlike boardMerge.test.mjs which runs
   the real function. The property being protected is "no write in this block
   throws its answer away", which is a shape, not a behaviour — and the thing
   that will regress it is somebody adding a SIXTH write and forgetting. A
   behavioural test would not see that write at all.
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(DIR, "L101Template.jsx"), "utf8");

let pass = 0, fail = 0;
const t = (label, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}`); if (cond) pass++; else fail++; };
const group = (n) => console.log(`\n── ${n}`);

group("0. the restore block was found (controls)");
/* ⚠️ IF THIS CONTROL FAILS, EVERY ASSERTION BELOW IS VACUOUS. A renamed
   variable would make the block unfindable and this file would report a clean
   sweep of nothing, which is the failure mode CLAUDE.md warns about by name. */
const m = SRC.match(/const failed = \[\];([\s\S]*?)setNote\(`Loaded /);
t("L101Template.jsx was read (control)", SRC.length > 5000);
t("the restore block was located (control)", !!m);
const block = m ? m[1] : "";
t("and it is not empty (control)", block.length > 200);

if (block) {
  group("1. ★★ every write in the restore reports its answer");
  const writes = block.match(/await kvSet\(/g) || [];
  console.log(`        ${writes.length} writes in the restore block`);
  t(`there are still writes to check (control: ${writes.length})`, writes.length >= 4);

  /* A BARE write is `await kvSet(...)` that is NOT wrapped in a test and NOT
     assigned. The three forms that count as reporting:
       (await kvSet(...)) === false      → tested
       const ok = await kvSet(...)       → assigned
       return await kvSet(...)           → handed to the caller             */
  const bare = block
    .split("\n")
    .filter((ln) => /await kvSet\(/.test(ln))
    .filter((ln) => !/\(await kvSet\([^\n]*\)\)\s*===\s*false/.test(ln))
    .filter((ln) => !/(const|let|var)\s+\w+\s*=\s*await kvSet\(/.test(ln))
    .filter((ln) => !/return\s+await kvSet\(/.test(ln))
    .map((ln) => ln.trim().slice(0, 80));

  if (bare.length) bare.forEach((b) => console.log(`        BARE: ${b}`));
  t(`★ no write throws its answer away${bare.length ? ` — ${bare.length} bare` : ""}`, bare.length === 0);

  group("2. a partial restore says so instead of claiming success");
  t("a `partial` list is collected", /const partial = \[\]/.test(block));
  t("instructor notes go on it", /instructor notes/.test(block));
  t("the prep sections go on it", /the prep sections/.test(block));
  t("the survey goes on it", /the survey/.test(block));

  group("3. the two failure kinds stay different");
  /* ⚠️ CONTENT failing means NOTHING landed, so aborting and saying "nothing
     changed" is true. The other three land AFTER content, so by then the course
     really is partly restored and refusing would be a second lie in the other
     direction. Collapsing these into one path is the likely "tidy-up". */
  t("content failure still aborts and leaves the week list alone",
    /if \(failed\.length\)/.test(block) && /the week list was left alone/.test(SRC));
  t("★ a partial does NOT abort, it reports", /if \(partial\.length\)/.test(SRC));
  t("and it tells them what to do about it", /Press Load again to finish/.test(SRC));
}

group("4. the success line cannot fire on a partial restore");
/* ⚠️ THE ORDER IS THE WHOLE FIX. The summary counts what was in the BUNDLE, not
   what landed, so the partial report has to return BEFORE it. */
const partialIdx = SRC.indexOf("if (partial.length)");
const noteIdx = SRC.indexOf("setNote(`Loaded ");
t("the partial check exists (control)", partialIdx > -1);
t("the success line exists (control)", noteIdx > -1);
t("★ the partial report comes first and returns", partialIdx > -1 && noteIdx > -1 && partialIdx < noteIdx);

console.log(`\n${fail ? `${fail} FAILED, ` : ""}${pass} passed`);
process.exit(fail ? 1 : 0);
