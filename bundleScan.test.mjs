/* ============================================================================
   bundleScan.test.mjs — EVERY chunk, before it ever reaches a phone.

       npx vite build && node bundleScan.test.mjs

   ⚠️⚠️ THE GAP THIS CLOSES. The 5am sweep scans the live bundle, and it stops
   at 24 chunks. The build produces 63. So 39 of them — 62% — were never looked
   at by anything, and the sweep says so every morning: "BUNDLE SCAN STOPPED AT
   24 CHUNKS — the rest were NOT scanned. Not an all-clear."

   ⚠️ THE SWEEP'S CAP IS CORRECT AND MUST NOT BE RAISED. Every chunk there is a
   network request, and that job died partway through on Aug 13 2026. The census
   snapshot, the state write and the whole report all come AFTER the scan, so a
   scan that costs the job its ability to finish has taken more than it found.

   ⇒ This is the other half. Reading `dist/` off the disk is free, so it scans
   ALL of it, and it runs before anything ships rather than the morning after.

   ═══ THE TWO CHECKS ANSWER DIFFERENT QUESTIONS, KEEP BOTH ══════════════════
   This one:   "did we BUILD something with a name or an address in it?"
   The sweep:  "is what is actually being SERVED clean?" — which catches a bad
               deploy and a stale edge cache, both of which have happened here.

   ⚠️ ONE LIST, NOT TWO. The forbidden names are read out of worker.js rather
   than retyped, so this file and the sweep can never disagree about who counts
   (design rule 8). At the origin that list is empty and that is CORRECT —
   "someone else's people" means nobody at the store the Hub was written for.
   In a clone it holds the origin's names.

   ⚠️ A MISSING OR STALE dist/ IS A FAILURE, NEVER A SKIP. A scan of yesterday's
   build reports on code nobody is shipping, and "0 findings" from a bundle that
   was never rebuilt is the exact shape of a false all-clear this repo keeps
   getting caught by.
   ============================================================================ */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(DIR, "dist", "assets");

let pass = 0, fail = 0;
const t = (label, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}`); if (cond) pass++; else fail++; };
const group = (n) => console.log(`\n── ${n}`);

/* ── the one list, read from the sweep's own source ───────────────────────── */
const workerSrc = fs.readFileSync(path.join(DIR, "worker.js"), "utf8");
const namesBlock = workerSrc.match(/const SWEEP_FORBIDDEN_NAMES = \[([\s\S]*?)\];/);
const FORBIDDEN = namesBlock
  ? [...namesBlock[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).filter(Boolean)
  : null;

/* The store's own From: address is allowed — it is a store SETTING, edited on
   screen, so storeConfig has to ship it. It was never a secret; it is the From:
   header every recipient already sees. */
const cfgSrc = fs.readFileSync(path.join(DIR, "storeConfig.js"), "utf8");
const ownEmails = new Set(
  [...cfgSrc.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)].map((m) => m[0].toLowerCase()),
);

let rebuilt = false;
group("0. there is a fresh build to scan");
{
  const exists = fs.existsSync(DIST);
  t("dist/assets exists — run `npx vite build` first if this fails", exists);
  if (!exists) { console.log(`\n1 FAILED, ${pass} passed`); process.exit(1); }

  const chunks = fs.readdirSync(DIST).filter((f) => f.endsWith(".js"));
  t(`it holds chunks (${chunks.length})`, chunks.length > 1);

  /* ⚠️ STALENESS IS THE QUIET FAILURE. A dist/ older than the newest source
     file describes code nobody is shipping, and it answers every question below
     with a confident, meaningless zero. */
  const newestSrc = fs.readdirSync(DIR)
    .filter((f) => /\.(jsx?|mjs)$/.test(f) && f !== "bundleScan.test.mjs")
    .map((f) => fs.statSync(path.join(DIR, f)).mtimeMs)
    .reduce((a, b) => Math.max(a, b), 0);
  const newestDist = chunks
    .map((f) => fs.statSync(path.join(DIST, f)).mtimeMs)
    .reduce((a, b) => Math.max(a, b), 0);
  /* ⚠️⚠️ IT BUILDS ITSELF RATHER THAN FAILING, AND THAT IS A DELIBERATE TRADE.
     `checks/run.mjs` runs every root test on every invocation, and mid-edit
     `dist/` is stale almost always. A scan that fails all day for a reason
     nobody can act on gets muted, and a muted security scan is worse than none.
     ⚠️ THE ALTERNATIVE — skipping when stale — is worse still. It answers every
     question below with a confident zero about code nobody is shipping, which
     is the exact false all-clear this file exists to prevent.
     ⇒ So it rebuilds, says that it did, and scans something true. This is the
     one test here that costs real seconds; every other one is instant. */
  if (newestDist < newestSrc) {
    console.log(`        dist was ${Math.round((newestSrc - newestDist) / 1000)}s behind the source — rebuilding`);
    try {
      execFileSync("npx", ["vite", "build"], { cwd: DIR, stdio: "ignore" });
      rebuilt = true;
    } catch {
      t("dist was stale and the rebuild FAILED — nothing below is trustworthy", false);
    }
  }
  t("the bundle being scanned is current", rebuilt || newestDist >= newestSrc);
}

const chunks = fs.readdirSync(DIST).filter((f) => f.endsWith(".js"));
const bodies = chunks.map((f) => [f, fs.readFileSync(path.join(DIST, f), "utf8")]);

group("1. EVERY chunk is read, not a sample");
{
  /* ⚠️ THE NUMBER IS PRINTED SO THE COVERAGE IS VISIBLE. The whole reason this
     file exists is that a scan quietly covering a third of the bundle reads
     exactly like one covering all of it. */
  const bytes = bodies.reduce((n, [, b]) => n + b.length, 0);
  /* ⚠️ THE SWEEP'S CAP IS READ, NOT TYPED. It was hardcoded as "24" here and
     went stale the same day the cap moved to 6 — a line that states a number
     about another file is a line that will eventually be wrong out loud. */
  const capM = workerSrc.match(/const SWEEP_BUNDLE_CHUNK_CAP = (\d+);/);
  const cap = capM ? Number(capM[1]) : null;
  console.log(`        ${chunks.length} chunks, ${Math.round(bytes / 1024)}kb — the 5am sweep spot-checks ${cap ?? "?"}`);
  t("the sweep's chunk cap was readable (control)", cap !== null);
  t(`this scan is broader than the sweep's (${chunks.length} vs ${cap})`, cap !== null && chunks.length > cap);
  t(`all ${chunks.length} chunks were read`, bodies.length === chunks.length);
  t("and they hold real code (control)", bytes > 200_000);
}

group("2. nobody else's people ship to a phone");
{
  /* ⚠️ A CONTROL THAT CANNOT PASS VACUOUSLY. An empty list is the correct state
     at the origin, so "no names found" must be distinguished from "no names
     looked for". The run says which it is. */
  t("the forbidden-name list was read from worker.js (control)", FORBIDDEN !== null);
  if (!FORBIDDEN || FORBIDDEN.length === 0) {
    console.log("        the list is empty — correct at the origin store, where");
    console.log("        \"someone else's people\" means nobody. In a clone it holds");
    console.log("        the origin's names, and this section does real work.");
  } else {
    const hits = [];
    for (const [file, body] of bodies) {
      for (const nm of FORBIDDEN) {
        const re = new RegExp("\\b" + nm.replace(/[.*+?^${}()|[\]\\]/g, (c) => "\\" + c) + "\\b", "g");
        for (const m of body.matchAll(re)) {
          hits.push(`${nm} in ${file}: …${body.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, " ")}…`);
        }
      }
    }
    if (hits.length) hits.slice(0, 10).forEach((h) => console.log(`        ${h}`));
    t(`no forbidden name is in the bundle${hits.length ? ` — ${hits.length} hit(s)` : ""}`, hits.length === 0);
  }
}

/* Every entry here is a UI hint that happens to be shaped like an address.
   Checked by hand against the source before it was added. */
const PLACEHOLDERS = new Set(["name@email.com"]);

group("3. no email address ships except this store's own");
{
  const found = new Map();
  const allowed = new Set();
  for (const [file, body] of bodies) {
    for (const m of body.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)) {
      const e = m[0].toLowerCase();
      /* Image and font filenames match the address shape. They are not addresses. */
      if (/\.(png|jpe?g|svg|webp|gif|woff2?|css|js)$/.test(e)) continue;
      if (ownEmails.has(e)) continue;
      /* ⚠️ PLACEHOLDERS ARE NOT PEOPLE, AND THIS FOUND ONE ON ITS FIRST RUN.
         `name@email.com` is the greyed-out hint inside two HR Console inputs
         (`placeholder="name@email.com"`), so it is a UI string, not somebody's
         address. The bundle is minified, so the attribute it sits in cannot be
         recovered reliably — the allowance has to be by value.
         ⚠️ AND IT IS PRINTED BELOW RATHER THAN SILENTLY DROPPED. An allowlist
         nobody sees is where a real address eventually hides. If this list ever
         grows, every entry has to earn its line the way this one did. */
      if (PLACEHOLDERS.has(e)) { allowed.add(`${e}  (placeholder, ${file})`); continue; }
      /* RFC 2606 reserves these for documentation. They can never be a person. */
      if (/@(example\.(com|org|net)|test|invalid|localhost)$/.test(e)) {
        allowed.add(`${e}  (reserved example domain, ${file})`); continue;
      }
      if (!found.has(e)) found.set(e, file);
    }
  }
  for (const a of allowed) console.log(`        allowed: ${a}`);
  for (const [e, f] of found) console.log(`        FOUND:   ${e}  (${f})`);
  t(`no stray address in the bundle${found.size ? ` — ${found.size} found` : ""}`, found.size === 0);
  /* ⚠️ THE ALLOWLIST MUST NOT BE SILENTLY EMPTY. If storeConfig stops naming the
     store's own From: address, `ownEmails` empties, every address becomes a
     finding, and this section turns into noise nobody reads.
     ⚠️ BUT AN UNCONFIGURED STORE HAS NO ADDRESS YET, AND THAT IS NOT A FAULT.
     A fresh clone carries `notify@SET-THIS-TO-THE-STORE-WEB-ADDRESS`, which has
     no dot in its domain and so is not an address at all — Guilford failed this
     control for the correct state of a store nobody has stood up. The question
     is not "is there an address" but "does storeConfig still name one, or is it
     openly waiting for one". */
  const awaitingSetup = /SET-THIS-TO-THE-STORE-WEB-ADDRESS/.test(cfgSrc);
  if (awaitingSetup && ownEmails.size === 0) {
    console.log("        no From: address yet — this store has not been set up, which is why");
  }
  t(`the allowlist is explainable (own: ${ownEmails.size}, awaiting setup: ${awaitingSetup})`,
    ownEmails.size > 0 || awaitingSetup);
}

console.log(`\n${fail ? `${fail} FAILED, ` : ""}${pass} passed`);
process.exit(fail ? 1 : 0);
