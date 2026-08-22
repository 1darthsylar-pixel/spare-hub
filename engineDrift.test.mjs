/* ══════════════════════════════════════════════════════════════════════════
   engineDrift.test.mjs — DOES THE DRIFT CHECK ACTUALLY FIND DRIFT?

   ⚠️⚠️ IT RUNS THE SCRIPT. It does not read it. This repo has paid for that
   distinction once already and expensively: every test of `newstore.mjs` read
   it as text, all of them were green, and the script was shipping DEAD — it
   exited 1 before writing a byte. `newstoreRuns.test.mjs` exists because of
   that, and its rule is the one followed here: IF A TOOL MATTERS, WRITE A TEST
   THAT RUNS IT.

   ⛔ AND A DRIFT CHECK IS EXACTLY THE KIND THAT FAILS SILENTLY. Its healthy
   output and its broken output are the same sentence: "No drift." A regex that
   stops matching, a file list that empties, a path that does not resolve —
   every one of those prints a clean report. So this plants known drift into
   fake repos and demands the tool find it.
   ══════════════════════════════════════════════════════════════════════════ */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const SCRIPT = path.join(ROOT, "scripts", "engineDrift.mjs");

let pass = 0;
const fails = [];
const ok = (label, cond) => { if (cond) pass += 1; else fails.push(label); };

/* Run it and hand back stdout plus the exit code. It must never throw. */
function run(cwd, args = []) {
  try {
    const out = execFileSync(process.execPath, [SCRIPT, ...args],
      { cwd, encoding: "utf8", timeout: 120000 });
    return { out, code: 0 };
  } catch (e) {
    return { out: String(e.stdout || ""), code: e.status ?? 1 };
  }
}

/* ── 1 · THE CONTROL ─────────────────────────────────────────────────────────
   ⛔ A test whose subject is not there reports clean for everything. */
ok("★ control — the drift script is in this repo", fs.existsSync(SCRIPT));

const SRC = fs.existsSync(SCRIPT) ? fs.readFileSync(SCRIPT, "utf8") : "";
ok("★ control — the script is real, not a stub", SRC.length > 4000);

/* ── 2 · THE LIST IS ONE OBVIOUS CONSTANT ────────────────────────────────── */
const listM = SRC.match(/const SHARED_ENGINE = \[([\s\S]*?)\];/);
ok("SHARED_ENGINE is one named constant", !!listM);
const LIST = listM
  ? [...listM[1].matchAll(/"([^"]+)"/g)].map((m) => m[1])
  : [];
ok("the list holds the shared engine files", LIST.length >= 15);
for (const f of ["worker.js", "laborEngine.js", "tierMath.js", "nameMatch.js", "finShared.js"]) {
  ok(`the list holds ${f}`, LIST.includes(f));
}
/* ⭐ The file the whole tool exists for. `walkBucket` lives here, not in
   worker.js, so leaving it off would make this blind to its own founding bug. */
ok("★★ the list holds backupWalk.js, where walkBucket actually lives",
   LIST.includes("backupWalk.js"));

/* ── 3 · STORE-SPECIFIC FILES ARE NOT ON IT, AND THIS IS A REAL ASSERTION ─────
   ⛔⛔ Rosters, seeds, branding and `storeConfig.js` are SUPPOSED to differ per
   store. One of them on this list reports drift on every run forever, for
   something working exactly as designed, and a report that is always wrong is
   one nobody reads. */
const BANNED = ["storeConfig.js", "workerSeed.js", "ownerSeed.js", "eosSeed.js",
                "stationTemplates.js", "TermArchive.js", "profitShareSeed.js",
                "facilitiesSeed.js", "hubTraining.js", "uniformCatalog.js"];
for (const b of BANNED) {
  ok(`★★ ${b} is NOT compared, because stores are meant to differ there`,
     !LIST.includes(b));
}

/* ── 4 · IT NEVER FAILS THE BUILD ────────────────────────────────────────────
   ⚠️ It runs inside `npm run doctor`. A repo with no sibling checked out is the
   normal state in most containers, and refusing there would break the one
   command somebody runs before starting work. */
const missing = run(ROOT, ["/no/such/path/at/all"]);
ok("a path that does not exist exits 0", missing.code === 0);
ok("a path that does not exist says so plainly", /not a Hub repo/.test(missing.out));

/* ── 5 · A DIFFERENT PRODUCT IS NOT A HUB ────────────────────────────────────
   ⛔⛔ Caught on the first run. `backline-books` has a worker.js, a
   package.json and a git repo, so a looser test picked it up and printed 341
   lines of noise that buried every real finding. It is a different product
   with none of this engine, and its own rules say nothing there belongs here. */
const books = path.join(path.dirname(ROOT), "backline-books");
if (fs.existsSync(books)) {
  const r = run(ROOT, [books]);
  ok("★★ a different product is refused rather than compared", /not a Hub repo/.test(r.out));
  ok("and it says how many engine files it found, so the refusal is checkable",
     /\d+ of the \d+ shared engine files/.test(r.out));
  ok("refusing a different product still exits 0", r.code === 0);
} else {
  /* ⚠️ NOT GRADED, SAID OUT LOUD. A clone has no sibling books repo, and a test
     that passes on an absence keeps passing on the day the absence ends. */
  ok("NOT GRADED here — no backline-books beside this repo to refuse", true);
}

/* ── 6 · IT FINDS PLANTED DRIFT ──────────────────────────────────────────────
   Two fake Hub repos, built to hold most of the engine so the sniffer accepts
   them, with known differences planted. */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "driftfix-"));
const mk = (name) => {
  const d = path.join(tmp, name);
  fs.mkdirSync(d, { recursive: true });
  fs.mkdirSync(path.join(d, ".git"), { recursive: true });
  fs.writeFileSync(path.join(d, "package.json"), "{}\n");
  for (const f of LIST) fs.writeFileSync(path.join(d, f), "export const shared = 1;\n");
  return d;
};
const A = mk("alpha-hub");
const B = mk("beta-hub");

/* Both worker.js files start identical, then alpha gains a function and a job. */
const baseWorker = [
  "function common() { return 1; }",
  "async function alsoCommon() { return 2; }",
  'const jobA = () => (job === "shared-job");',
  "export default { fetch() {} };",
].join("\n") + "\n";
fs.writeFileSync(path.join(B, "worker.js"), baseWorker);
fs.writeFileSync(path.join(A, "worker.js"), baseWorker +
  "function onlyInAlpha() { return 3; }\n" +
  'const jobB = () => (job === "alpha-only-job");\n' +
  "/* function commentedOnly() {} and the job === \"ghost-job\" in prose */\n");

const planted = run(A, [B]);
ok("★★ it finds a function one repo has and the other does not",
   /onlyInAlpha/.test(planted.out));
ok("★★ it finds a job one repo has and the other does not",
   /alpha-only-job/.test(planted.out));
ok("it names which file the missing function is in", /onlyInAlpha.*worker\.js/.test(planted.out));
ok("it says which repo has the extra, in plain words",
   /alpha-hub has \d+ things beta-hub does not/.test(planted.out));

/* ⚠️⚠️ COMMENTS ARE NOT CODE, AND THIS REPO WRITES MORE COMMENT THAN CODE.
   `hubCopies.test.mjs` already paid for this exact fault: a comment explaining
   a helper made a function that posts nowhere report as a channel poster. */
ok("★★ a function named only in a comment is not reported",
   !/commentedOnly/.test(planted.out));
ok("★★ a job named only in a comment is not reported",
   !/ghost-job/.test(planted.out));

/* ── 7 · MOVED IS NOT MISSING ────────────────────────────────────────────────
   ⛔⛔ The false alarm this caught on its first real run. `isJobLate` came back
   as missing from gate-city; it is there, in `jobHealth.js`, moved out of
   worker.js on purpose so `checks/` could execute it. Reporting that as a
   missing fix sends somebody to rebuild what already exists, and a warning
   that is usually wrong is one people stop reading. */
fs.writeFileSync(path.join(B, "elsewhere.js"), "export function onlyInAlpha() { return 3; }\n");
const movedRun = run(A, [B]);
ok("★★ a name that lives in another file is NOT called missing",
   !/alpha-hub has \d+ things[\s\S]*?onlyInAlpha  \(in worker\.js\)/.test(movedRun.out));
ok("★★ and it is reported separately, naming both files",
   /onlyInAlpha\s+worker\.js here, elsewhere\.js at beta-hub/.test(movedRun.out));
ok("the separate line says it is not a missing fix",
   /[Nn]ot a missing fix/.test(movedRun.out));
/* ⚠️ And it must not overclaim. A shared short word is not proof of a move. */
ok("★ it does not assert the function moved, only that the name is in both",
   /[Pp]robably moved, possibly just the same word twice/.test(movedRun.out));

/* ── 8 · IDENTICAL REPOS REPORT NOTHING ──────────────────────────────────────
   ⚠️ THE VACUOUS-PASS GUARD. If this said "No drift" whatever it was handed,
   every assertion above would be meaningless. */
const C = mk("gamma-hub");
const D = mk("delta-hub");
const clean = run(C, [D]);
ok("★★ two identical repos report No drift", /No drift/.test(clean.out));
ok("and nothing else", !/things .* does not/.test(clean.out));

/* ── 8b · THE CONTROL FIRES ON A FILE IT COULD NOT READ ──────────────────────
   ⛔⛔ THE WHOLE POINT OF THIS TOOL IS THAT ITS BROKEN OUTPUT AND ITS HEALTHY
   OUTPUT ARE THE SAME SENTENCE. If the name regex ever stops matching, every
   function in a file becomes invisible and the report says "No drift" — the
   most dangerous possible answer. So a big file that yields NO names must
   refuse to report rather than report clean.

   ⚠️ THE FIRST VERSION OF THIS CONTROL WAS AN ABSOLUTE FLOOR OF 40 NAMES and it
   was measured failing on two perfectly readable small fixtures. A small file
   yielding few names is just a small file. A BIG one yielding none has not been
   read, and that is the only thing a name count can honestly detect. */
const E = mk("epsilon-hub");
const F = mk("zeta-hub");
/* Substantial, and deliberately holding nothing the name patterns can match. */
const opaque = "// ".concat("x".repeat(120), "\n").repeat(60);
fs.writeFileSync(path.join(E, "worker.js"), opaque + "\nexport default {};\n");
fs.writeFileSync(path.join(F, "worker.js"), opaque + "\nexport default {};\nfunction extra(){}\n");
const blind = run(E, [F]);
ok("★★ a big file it could not read makes it refuse to report",
   /PROVED NOTHING/.test(blind.out));
ok("and it names the file it could not read", /worker\.js/.test(blind.out));
ok("★★ it does NOT say 'No drift' when it read nothing",
   !/No drift/.test(blind.out));
ok("refusing to report still exits 0", blind.code === 0);

/* ── 9 · THE SUMMARY LINE IS STABLE ──────────────────────────────────────────
   ⚠️ `npm run doctor` reads this. `drift.mjs` already wrote down why a caller
   must never parse prose: it breaks the first time somebody improves the
   wording, and it breaks SILENTLY, reporting zero drift. */
const sum = run(A, [B, "--summary"]);
ok("--summary emits a tab-separated DRIFT line", /^DRIFT\t/m.test(sum.out));
ok("--summary carries the counts doctor renders",
   /mineOnly=\d+/.test(sum.out) && /theirsOnly=\d+/.test(sum.out) && /namesRead=\d+/.test(sum.out));
ok("--summary prints no prose", !/things .* does not/.test(sum.out));

/* ── 10 · DOCTOR RUNS IT, AND NEVER FAILS BECAUSE OF IT ──────────────────────
   ⛔ Drift between two live stores is the normal state every day of the year.
   Counted as a fault, `npm run doctor` would fail forever, and a check that
   always fails is one people learn to ignore — costing the other five. */
const doc = fs.existsSync(path.join(ROOT, "scripts", "doctor.mjs"))
  ? fs.readFileSync(path.join(ROOT, "scripts", "doctor.mjs"), "utf8") : "";
ok("★★ doctor runs the drift check", /engineDrift\.mjs/.test(doc));
ok("★★ doctor reads the stable summary line, not the prose", /"--summary"/.test(doc));
ok("★★ drift is a note in doctor, never a problem",
   /notes\.push\([^)]*npm run drift/.test(doc) &&
   !/problems\.push\([^)]*drift/i.test(doc));
ok("doctor skips it in --quick, so npm test is not slowed",
   /if \(!QUICK\) \{[\s\S]{0,900}engineDrift/.test(doc));
ok("★★ doctor says so when the check could not run, rather than staying silent",
   /the drift check would not run/.test(doc));

fs.rmSync(tmp, { recursive: true, force: true });

console.log(`engineDrift: ${pass} passed, ${fails.length} failed`);
for (const f of fails) console.log(`  FAILED: ${f}`);
if (fails.length) process.exit(1);
