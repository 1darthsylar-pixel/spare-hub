/* ============================================================================
   availabilityLocked.test.mjs — is anyone's availability readable by a stranger?

       node availabilityLocked.test.mjs

   ⚠️⚠️ WHAT WAS OPEN. `gcfcr-availability-v1` holds when 99 people can work —
   school nights, second jobs, the days somebody cannot do. `gcfcr-skills-v1`
   holds what 96 people are certified on. Both answered to the publishable key
   that ships inside the browser bundle, so anyone who opened the site could
   read both. Not a leak of one record: the whole store, in one request.

   ⇒ Closing it means putting each key on FOUR lists. Three is not enough and
   the history of this repo is mostly proof of that:

     1. store.js HR_PROTECTED      the browser reroutes through the Worker
     2. worker.js HR_PROTECTED     /api/hr-store agrees to serve it
     3. worker.js SEC_MUST_BE_DENIED   the nightly sweep watches it
     4. supabase-schema.sql        the DATABASE itself refuses the anon key

   ⚠️ ONLY (4) ACTUALLY STOPS A DIRECT READ. Wages sat on lists 1 and 2 for a
   day and read as protected to anybody who looked at the code, while the
   database still served them to the publishable key. That file has been the
   stale one SEVEN times. This test exists so it cannot be an eighth.

   ═══ THE ONE THING THAT COULD BREAK EVERY PHONE ════════════════════════════
   ⚠️⚠️ SECTION 1 RUNS FIRST AND IS A BLOCKING PROOF, NOT A FORMALITY. On
   Jul 31 2026 a key was protected that the SIGN-IN path reads, and protecting
   it 401'd during sign-in — so the app fell back to a stale built-in roster and
   anybody hired since could not get in at all. Matt's whole reason for this
   work is that every single team member uses the Hub; a fix that locks them out
   is worse than the exposure.

   So before anything else, this asserts that neither key is read by the
   pre-sign-in batch, and that the tile using them is lazy-loaded behind the
   gate. If that ever stops being true, this test fails LOUDLY rather than the
   store finding out at 5am.
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(DIR, f), "utf8");
const app = read("App.jsx");
const storeSrc = read("store.js");
const workerSrc = read("worker.js");
const schema = read("supabase-schema.sql");

const KEYS = ["gcfcr-availability-v1", "gcfcr-skills-v1"];

let pass = 0, fail = 0;
const t = (label, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}`); if (cond) pass++; else fail++; };
const group = (n) => console.log(`\n── ${n}`);

/* ═══ 1. SIGN-IN MUST NOT TOUCH THESE KEYS ═════════════════════════════════ */
group("1. protecting these cannot lock anybody out");
{
  /* The batch that runs alongside /api/pin-verify. Everything in it is read
     BEFORE a token exists, so anything protected in here 401s during sign-in. */
  const batch = app.match(/const \[verify, [^\]]*\] = await Promise\.all\(\[[\s\S]*?\n      \]\);/);
  t("the sign-in batch was found (control)", !!batch);
  t("it really is the sign-in batch (control)", !!batch && batch[0].includes("/api/pin-verify"));
  for (const k of KEYS) {
    t(`sign-in does not read ${k}`, !!batch && !batch[0].includes(k));
  }
  /* ⚠️ AND THE KEYS IT DOES READ MUST STAY OUT OF HR_PROTECTED, forever. This
     is the Jul 31 trap stated as an assertion instead of a memory. */
  const SIGN_IN_KEYS = ["gcfcr-hr-roles", "gcfcr-hr-added-v1", "hr:slack-avatars:v1"];
  const protectedSet = storeSrc.match(/const HR_PROTECTED = new Set\(\[[\s\S]*?\n\]\);/);
  t("store.js HR_PROTECTED was found (control)", !!protectedSet);
  for (const k of SIGN_IN_KEYS) {
    t(`${k} is NOT protected, so sign-in still works`,
      !!protectedSet && !protectedSet[0].includes(`"${k}"`));
  }
  /* The tile that uses availability is lazy, so it cannot run before sign-in
     even if somebody later moves a read out of the component. */
  /* ⚠️ THIS FILE TRAVELS, AND NOT EVERY STORE HAS THIS TILE. The Village ships
     a "Scheduling · soon" placeholder instead, so it has no Availability tile
     to be lazy — and asserting one exists would fail a store for not having
     built a feature yet. What must hold everywhere: IF the tile exists, it is
     lazy, because a non-lazy import runs before sign-in. */
  const hasTile = /const Availability = lazy\(/.test(app) || /["'`]\.\/Availability\.jsx["'`]/.test(app);
  if (hasTile) {
    t("the Availability tile is lazy-loaded",
      /const Availability = lazy\(\(\) => import\("\.\/Availability\.jsx"\)\)/.test(app));
  } else {
    console.log("  --    no Availability tile in this store, nothing to load early");
  }
}

/* ═══ 2. ALL FOUR LISTS AGREE ══════════════════════════════════════════════ */
group("2. each key is on all four lists, not three");
{
  const storeList = storeSrc.match(/const HR_PROTECTED = new Set\(\[[\s\S]*?\n\]\);/);
  const workerList = workerSrc.match(/const HR_PROTECTED = \[[\s\S]*?\n\];/);
  const sweepList = workerSrc.match(/const SEC_MUST_BE_DENIED = \[[\s\S]*?\n\];/);
  /* ⚠️ THE WHOLE ARRAY, ANCHORED ON BOTH ENDS. The first version was
     /'gcfcr-[\s\S]*?\)/ — non-greedy, so it stopped at the first bracket it met
     and captured about one line. It reported the deny list as missing while
     both keys were sitting in it. The policy is `key <> ALL (ARRAY[ … ])`, so
     that is what gets matched. */
  const denyList = schema.match(/key <> ALL \(ARRAY\[[\s\S]*?\]\)/);

  /* ⚠️ CONTROLS BEFORE CONCLUSIONS. Four regexes that stopped matching would
     report four empty lists, and "the key is missing from all of them" is
     indistinguishable from "the key is on all of them" if you only check one
     direction. A known-protected key must be found in each. */
  t("store.js HR_PROTECTED found (control)", !!storeList && storeList[0].includes("gcfcr-hr-evals"));
  t("worker.js HR_PROTECTED found (control)", !!workerList && workerList[0].includes("gcfcr-hr-evals"));
  t("worker.js SEC_MUST_BE_DENIED found (control)", !!sweepList && sweepList[0].includes("gcfcr-hr-evals"));
  t("the schema deny list found (control)", !!denyList && denyList[0].includes("gcfcr-hr-evals"));

  for (const k of KEYS) {
    t(`${k} · browser reroutes it`, !!storeList && storeList[0].includes(`"${k}"`));
    t(`${k} · the Worker will serve it`, !!workerList && workerList[0].includes(`"${k}"`));
    t(`${k} · the nightly sweep watches it`, !!sweepList && sweepList[0].includes(`"${k}"`));
    /* ⚠️ THE ONE THAT ACTUALLY STOPS A DIRECT READ. A key on the other three
       and missing here is exactly what wages were for a day: it reads as
       protected in the code and is served by the database anyway. */
    t(`${k} · THE DATABASE REFUSES IT`, !!denyList && denyList[0].includes(`'${k}'`));
  }
}

/* ═══ 3. THE CANARY IS A KEY THAT CAN NEVER BE DENIED ═════════════════════ */
group("3. the probe recipe still has a key that reads");
{
  /* ⚠️⚠️ WHY THIS SECTION EXISTS. A probe that reads 0 rows for everything is
     what a WORKING deny and a DEAD CONNECTION both look like. The canary is the
     one key that must still return rows, and this file already records a probe
     fooled into a false all-clear without one.
     ⚠️ AT THE ORIGIN THE CANARY HAD TO MOVE: it was `gcfcr-skills-%`, which this
     change denies. Left alone, the next person following that recipe reads 0 for
     the canary and calls it a pass.
     ⇒ The property that matters at EVERY store is not "the note explains the
     move" — the first version asserted that, and it failed the Village for never
     having had the old canary to move. It is: whatever key is named as the
     canary must not be on any deny list. That is portable, and it is the thing
     that actually keeps a probe honest. */
  const hasCanary = /THE CANARY/.test(schema);
  if (!hasCanary) {
    console.log("  --    no probe recorded at this store yet, nothing to keep honest");
  } else {
    const named = [...schema.matchAll(/(gcfcr-[a-z0-9-]+|gcfcr-[a-z-]+-%)\s*(?:→[^\n]*)?THE CANARY/g)]
      .map((m) => m[1]);
    t(`a canary is named (control: ${named.join(", ") || "NONE FOUND"})`, named.length > 0);
    const denyList = schema.match(/key <> ALL \(ARRAY\[[\s\S]*?\]\)/);
    t("the deny list was read (control)", !!denyList);
    /* A `%` canary matches a prefix, so compare on the stem. */
    const denied = named.filter((n) => !!denyList && denyList[0].includes(`'${n.replace(/-%$/, "")}`));
    t(`no canary is on the deny list${denied.length ? " — DENIED: " + denied.join(", ") : ""}`,
      denied.length === 0);
    /* And the strongest form: the canary should be a key that CANNOT be denied
       later without breaking sign-in, so it cannot quietly stop being one. */
    t("at least one canary is a key sign-in depends on",
      named.some((n) => ["gcfcr-hr-added-v1", "gcfcr-hr-roles"].includes(n)));
  }
}

/* ═══ 4. NOBODY LOSES ACCESS THEY HAD ══════════════════════════════════════ */
group("4. every signed-in person can still read them");
{
  /* ⚠️ THIS IS WHY THE FIX IS SAFE TO SHIP. /api/hr-store deliberately admits
     ANY signed-in token regardless of tier, because a team member's own
     dashboard reads through it. So this change removes anonymous access and
     nothing else: no leader loses the availability they use to build a rota. */
  const route = workerSrc.match(/"\/api\/hr-store"[\s\S]{0,1800}/);
  t("the hr-store route was found (control)", !!route);
  t("it refuses an anonymous caller", !!route && /if \(!tok\)[\s\S]{0,120}401/.test(route[0]));
  t("but it does NOT gate on tier", !!route && /regardless of tier/i.test(route[0]));
}

console.log(`\n${fail ? `${fail} FAILED, ` : ""}${pass} passed`);
process.exit(fail ? 1 : 0);
