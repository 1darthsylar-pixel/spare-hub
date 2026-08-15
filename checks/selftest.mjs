#!/usr/bin/env node
// checks/selftest.mjs -- does the checker still work?
//
//   node checks/selftest.mjs
//
// Runs every check against a folder of files with KNOWN bugs, and one file
// that is deliberately clean. Fails if any check stops catching its bug, or
// starts flagging the clean file.
//
// Why this exists: on Jul 28 the hook check reported 18 findings that were all
// false, in legal code. A checker can be wrong in both directions, and a
// "clean" run from a broken checker looks exactly like a clean run from a
// working one. This is the only thing that tells them apart.
//
// RUN THIS AFTER ANY EDIT TO A CHECK. Never trust a clean sweep from a check
// you changed without running it.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "./validate.mjs";
import { hookcheck } from "./hookcheck.mjs";
import { scopecheck } from "./scope.mjs";
import { tdzcheck } from "./tdzcheck.mjs";
import { eventcheck } from "./eventcheck.mjs";
import { cyclecheck } from "./cyclecheck.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const bad = (f) => path.join(here, "fixtures", "bad", f);
const good = (f) => path.join(here, "fixtures", "good", f);

// Each case: the check, the file, and what it MUST find (or must not).
const CASES = [
  {
    name: "validate catches a syntax error",
    run: () => validate(bad("BrokenParse.jsx")),
    expect: "findings",
  },
  {
    name: "hookcheck catches a hook after an early return",
    run: () => hookcheck(bad("BrokenHooks.jsx")),
    expect: "findings",
  },
  {
    name: "hookcheck ignores a nested component (the Jul 28 false positive)",
    run: () => hookcheck(bad("NestedFn.jsx")),
    expect: "clean",
  },
  {
    name: "scope catches an unbound plain lowercase name",
    run: () => scopecheck(bad("BrokenScope.jsx")),
    expect: "findings",
    mustMention: "progress",
  },
  {
    name: "tdzcheck catches a useMemo body using a later const",
    run: () => tdzcheck(bad("BrokenTdz.jsx")),
    expect: "findings",
    mustMention: "keyOf",
  },
  {
    name: "tdzcheck catches a plain render-body const reading a later const (the HR crash)",
    run: () => tdzcheck(bad("BrokenTdzConst.jsx")),
    expect: "findings",
    mustMention: "roster",
  },
  {
    name: "eventcheck catches e.target inside a state updater",
    run: () => eventcheck(bad("BrokenEvent.jsx")),
    expect: "findings",
  },
  {
    name: "cyclecheck catches two files importing each other",
    run: () =>
      cyclecheck(path.join(here, "fixtures", "bad"), [
        bad("CycleA.jsx"),
        bad("CycleB.jsx"),
      ]),
    expect: "findings",
  },
  // The clean file. Every check must stay silent on it.
  ...[validate, hookcheck, scopecheck, tdzcheck, eventcheck].map((fn) => ({
    name: `${fn.name} stays silent on the clean file`,
    run: () => fn(good("Clean.jsx")),
    expect: "clean",
  })),
];

let failed = 0;

for (const c of CASES) {
  let result;
  try {
    result = c.run();
  } catch (err) {
    console.log(`BROKEN  ${c.name}\n        the check itself threw: ${err.message}`);
    failed++;
    continue;
  }

  const n = result.failures.length;

  if (c.expect === "findings" && n === 0) {
    console.log(`BROKEN  ${c.name}\n        expected a finding, got none`);
    failed++;
    continue;
  }
  if (c.expect === "clean" && n > 0) {
    console.log(`BROKEN  ${c.name}\n        expected silence, got ${n}:`);
    for (const f of result.failures) console.log(`          ${f}`);
    failed++;
    continue;
  }
  if (c.mustMention) {
    const hit = result.failures.some((f) => f.includes(c.mustMention));
    if (!hit) {
      console.log(
        `BROKEN  ${c.name}\n        found things, but never mentioned "${c.mustMention}"`
      );
      failed++;
      continue;
    }
  }
  console.log(`ok      ${c.name}`);
}

console.log("\n--------------------------------------------");
if (failed) {
  console.log(`${failed} of ${CASES.length} self-tests BROKEN.`);
  console.log("The checker is not trustworthy right now. Fix it before shipping.\n");
  process.exit(1);
}
console.log(`all ${CASES.length} self-tests pass. The checker works.\n`);
process.exit(0);
