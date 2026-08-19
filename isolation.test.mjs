/* ============================================================================
   isolation.test.mjs — can this store reach ANY other store's data?

       node isolation.test.mjs

   ⚠️⚠️ THIS IS THE DEMO STORE, AND IT IS THE ONE HUB ANYBODY CAN OPEN.
   Every other store is behind a PIN held by that store's own people. This one
   is handed to operators who do not work here, on a link, with no account. So
   the question "could someone in here read Gate City's write-ups" is not a
   theoretical one, and "the database is different" is an assertion, not a
   proof.

   ⇒ THIS FILE PROVES IT BY RUNNING THE REAL WORKER. It boots `worker.js`, hands
   it a fake environment, replaces global fetch with a recorder, drives real
   routes, and then reads back every single outbound address the Worker tried to
   reach. A grep over the source cannot do that: the address is built at runtime
   from `env.SUPABASE_URL`, so the only honest test is to watch where it goes.

   ═══ WHAT ISOLATION ACTUALLY RESTS ON ══════════════════════════════════════
   Not on code. On credentials. Each store is a separate Supabase project, and
   a Worker holds keys for exactly one of them. PostgREST refuses a key issued
   for a different project, so the demo cannot read Gate City for the same
   reason a stranger cannot read your email: it does not have the password.

   So the things that would actually break isolation are:

     1. A HARDCODED FALLBACK ADDRESS. If `worker.js` ever gained
        `env.SUPABASE_URL || "https://<gate city>.supabase.co"`, a demo Worker
        with a missing variable would quietly read the real store. It would look
        like it was working. Section 3 tests exactly this.
     2. ANOTHER STORE'S PROJECT REF LEFT IN THE TREE by the clone. Section 1.
     3. THE WORKER TALKING TO MORE THAN ONE HOST. Section 2.

   ⚠️ EVERY SECTION HAS A CONTROL THAT MUST BE FOUND OR MUST HAPPEN. A recorder
   that captured nothing agrees with "it never contacted another store"
   perfectly, and proves nothing at all. That failure mode has shipped in these
   repos before, so each section fails loudly when it graded nothing.
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));

let pass = 0, fail = 0;
const t = (label, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}`); if (cond) pass++; else fail++; };
const group = (n) => console.log(`\n── ${n}`);

/* ── the addresses that must never appear ─────────────────────────────────
   ⚠️ REAL VALUES, NOT PLACEHOLDERS. A test that looks for "OTHER_STORE_REF"
   passes on a tree that is leaking, because that string is not what leaks. */
const FOREIGN = [
  ["Gate City's Supabase project", "rhwskwzrttzoiyssbkqv"],
  ["Gate City's web address", "gatecityhub.com"],
  ["The Village's web address", "northelmvillage.com"],
  ["Gate City's store number", "04010"],
  ["The Village's store number", "01818"],
  /* ⚠️ ADDED Aug 19 2026 WITH THE PORT TO THE VILLAGE AND GUILFORD. The list
     had two stores in it and there are four repos. A store missing from here is
     a store this test cannot notice a leak of.
     ⚠️ Guilford has no web address yet — `identity.domain` is still the
     placeholder — so only the number goes in. Add the domain when it is set. */
  ["Guilford's store number", "00746"],
];

/* ⚠️⚠️ A STORE NUMBER IS NOT AN ADDRESS, AND SECTION 1 STOPPED FAILING ON ONE.
   The codebase compares against "04010" on purpose in two places, and both are
   the mechanism that keeps stores apart rather than a leak:

     · `isGateCity()` in storeConfig.js — the switch every "is this the origin
       store" test runs through. A clone needs it to return false, which it can
       only do by naming the number it is not.
     · `REFERENCE_FSR` in fcrReferenceData.js — a stamp saying whose last-year
       sales history that file holds. worker.js refuses to use the history
       unless the running store's own fsr matches it, so a clone ignores it.

   Deleting either would not improve isolation; it would remove the thing doing
   the isolating. ⇒ Section 1 scans for ADDRESSES, and section 1b runs the real
   switch to prove this store is not mistaken for another one. That is the
   behaviour that matters, and a string count cannot see it.

   ⚠️ MEASURED, NOT ASSUMED: `LY_MONTHLY_SALES` beside REFERENCE_FSR does hold
   the origin store's real monthly revenue. Checked against a built bundle on
   Aug 14 2026 — 0 occurrences in dist, because only worker.js imports that
   file. It ships server-side where nobody can fetch it, and the fsr stamp stops
   it being used. Not visible to anyone opening the demo. Still worth emptying
   in the generator one day; it is untidy, not exposed. */
/* ⚠️⚠️ "FOREIGN" MEANS "NOT THIS STORE", AND AT THE ORIGIN THAT IS A DIFFERENT
   LIST. This file travels into every clone, so it runs in four repos. Gate City
   legitimately contains gatecityhub.com, 04010 and its own project ref; a flat
   list would fail the origin for owning its own name, and a test that always
   fails in the repo people work in every day is a test people delete.
   ⇒ The list is built by REMOVING this store's own identity from the known
   set. Same shape as `thawCabinets.test.mjs`, which grades a clone and the
   origin differently off the same fsr. */
const { storeCfg, isGateCity } = await import(`file://${path.join(DIR, "storeConfig.js")}`);
const OWN_FSR = String(storeCfg("identity.fsr", ""));
const OWN_DOMAIN = String(storeCfg("identity.domain", ""));
const IS_ORIGIN = isGateCity();
const NOT_MINE = FOREIGN.filter(([, v]) => v !== OWN_FSR && v !== OWN_DOMAIN
  && !(IS_ORIGIN && v === "rhwskwzrttzoiyssbkqv"));
const ADDRESSES = NOT_MINE.filter(([, v]) => !/^\d+$/.test(v));
console.log(`\n   running as fsr ${OWN_FSR || "MISSING"}${IS_ORIGIN ? " (the origin store)" : " (a clone)"}, guarding against ${NOT_MINE.length} other stores\n`);

/* ═══ 1. NOTHING IN THE TREE NAMES ANOTHER STORE ═══════════════════════════ */
group("1. no other store's address is anywhere in this repo");
{
  const skip = new Set(["node_modules", ".git", "dist", ".wrangler"]);
  const files = [];
  (function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      if (skip.has(name)) continue;
      const abs = path.join(dir, name);
      const st = fs.statSync(abs);
      if (st.isDirectory()) walk(abs);
      /* This file names every foreign address on purpose, so it cannot grade
         itself. Excluding it is not a loophole: it ships no behaviour. */
      else if (/\.(js|jsx|mjs|json|toml|html|md|sql|css)$/.test(name) && name !== "isolation.test.mjs") files.push(abs);
    }
  })(DIR);

  /* ⚠️ THE CONTROL. A walk that found nothing reports a clean repo forever. */
  t(`the tree was actually read (${files.length} files)`, files.length > 50);

  /* ⚠️⚠️ COMMENTS ARE STRIPPED BEFORE THIS SCAN, AND THE FIRST VERSION OF THIS
     TEST DID NOT DO THAT. It reported four leaks that were all prose: this
     codebase documents its own scars, so "the src is /api/doc-view on
     gatecityhub.com" and "01818 uses phone, not Slack" are explanations sitting
     in comment blocks. A comment is not an address the code can reach.
     ⇒ The question this section asks is REACHABILITY, not whether a word
     appears. Grading text instead of code is how a test cries wolf until
     somebody stops reading it, which is worse than not having it.
     ⚠️ MENTIONS ARE STILL PRINTED BELOW, just not failed on. A clone carrying
     another store's number in its prose is untidy; it is not a leak. */
  const stripComments = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[ \t]*\/\/.*$/gm, " ")
    /* ⚠️ TRAILING comments too, not only whole-line ones. `const PDF_BASE =
       "/docs/";  // clean gatecityhub.com URLs` is prose sitting after code, and
       a line-start-only stripper reported it as a leak. */
    .replace(/[ \t]+\/\/.*$/gm, " ")
    .replace(/^[ \t]*#.*$/gm, " ")
    /* SQL. supabase-schema.sql explains itself in `--` comments. */
    .replace(/^[ \t]*--.*$/gm, " ");
  const bodies = new Map(files.map((f) => [f, stripComments(fs.readFileSync(f, "utf8"))]));
  /* The control is re-checked AFTER stripping. If the stripper ever ate the
     whole file, every "is absent" below would pass on an empty string. */
  const liveBytes = [...bodies.values()].reduce((n, b) => n + b.trim().length, 0);
  t(`code survived comment-stripping (${Math.round(liveBytes / 1024)}kb)`, liveBytes > 200_000);
  /* Second control: this store's OWN marker must be found, or the scan is
     looking at something that is not this snapshot. */
  /* ⚠️⚠️ THIS CONTROL ASSUMED EVERY NON-ORIGIN REPO IS AN UNCONFIGURED DEMO,
     and it stopped being true the day a clone went live. It looked only for the
     clone script's placeholder or the demo address — neither of which a real
     configured store has — so porting this file to the Village failed it on a
     repo with nothing wrong. ⇒ The marker is THIS STORE'S OWN IDENTITY,
     whatever state it is in: its real web address once set, and the
     unconfigured markers while it is not. */
  const OWN_MARKERS = [
    /^SET-THIS-TO-/.test(OWN_DOMAIN) ? "" : OWN_DOMAIN,
    "SET-THIS-TO-THE-NEW-STORE-SUPABASE-PROJECT",
    "demo.backline-ops.com",
  ].filter(Boolean);
  const ownFound = [...bodies.values()].some((b) => OWN_MARKERS.some((m) => b.includes(m)));
  t(`this store's own marker was found (control: ${OWN_MARKERS[0]})`, ownFound);

  /* ⚠️ MARKDOWN IS PROSE END TO END, so it is reported and not failed on, for
     exactly the reason comments are stripped above. A `.md` file cannot reach
     anything. Measured Aug 14 2026: README.md and REPO-MAP.md both describe the
     origin store and travel into every clone, because `isOriginDoc` in
     newstore.mjs excludes build-log/CLAUDE/NEW-STORE-SETUP but not these two.
     Untidy, worth fixing in the generator, not a leak — and NOT something to
     hide, so it prints on every run. */
  const isDoc = (f) => /\.md$/.test(f);
  for (const [label, needle] of ADDRESSES) {
    const docHits = [...bodies.entries()].filter(([f, b]) => isDoc(f) && b.includes(needle)).map(([f]) => path.relative(DIR, f));
    if (docHits.length) console.log(`        note: ${label} is named in prose only — ${docHits.join(", ")}`);
    const hits = [...bodies.entries()].filter(([f, b]) => !isDoc(f) && b.includes(needle)).map(([f]) => path.relative(DIR, f));
    t(`${label} is absent${hits.length ? " — FOUND IN: " + hits.slice(0, 4).join(", ") : ""}`, hits.length === 0);
  }
}

/* ═══ 1b. THIS STORE IS NOT MISTAKEN FOR THE ORIGIN STORE ══════════════════ */
group("1b. the running store-identity switch says this is NOT another store");
{
  const { isGateCity, storeCfg } = await import(`file://${path.join(DIR, "storeConfig.js")}`);
  const fsr = String(storeCfg("identity.fsr", ""));
  /* ⚠️ CONTROL FIRST. An fsr that failed to load is "" , and "" !== "04010"
     passes the real assertion below while proving nothing. */
  t(`this store has an fsr of its own (control: ${fsr || "MISSING"})`, /^\d+$/.test(fsr));
  /* ⚠️ THE ORIGIN IS ALLOWED TO BE THE ORIGIN. What must hold everywhere is
     that the switch AGREES with the fsr — a store whose number says clone and
     whose switch says origin would pick up the origin's hardcoded Slack
     recipients and seeds, which is the failure this switch exists to stop. */
  t(`isGateCity() agrees with the fsr (${isGateCity()})`, isGateCity() === (fsr === "04010"));
  if (!IS_ORIGIN) t("and this store is not the origin", fsr !== "04010");
}

/* ═══ 2. THE RUNNING WORKER ONLY EVER TALKS TO ITS OWN DATABASE ════════════ */
group("2. the running Worker contacts one database and no other");
let recorded = [];
{
  const OWN = "https://demo-project-ref.supabase.co";

  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : (input && input.url) || String(input);
    recorded.push(url);
    /* Answer everything the same shape PostgREST would, so the Worker keeps
       walking its own code path instead of bailing at the first await. */
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  };

  const mod = await import(`file://${path.join(DIR, "worker.js")}`);
  const env = {
    SUPABASE_URL: OWN,
    SUPABASE_SERVICE_KEY: "demo-service-key",
    SUPABASE_ANON_KEY: "demo-anon-key",
    RUN_JOB_KEY: "demo-run-key",
    SESSION_KEY: "demo-session-key",
    ASSETS: { fetch: async () => new Response("<!doctype html><title>x</title><div id=\"root\"></div>", { headers: { "content-type": "text/html" } }) },
    GATE_CITY_KV: { get: async () => null, put: async () => {} },
  };
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {} };

  /* Routes chosen because each one READS OR WRITES STORED DATA. A route that
     only renders HTML would record nothing and prove nothing. */
  const routes = [
    "https://demo.backline-ops.com/api/store-config",
    "https://demo.backline-ops.com/api/kv?key=gcfcr-hr-roles",
    "https://demo.backline-ops.com/api/gate-health",
    "https://demo.backline-ops.com/api/pin-verify",
  ];
  for (const r of routes) {
    try { await mod.default.fetch(new Request(r, { method: "GET" }), env, ctx); }
    catch { /* a route may refuse this fake request; the recorder still counted */ }
  }
  globalThis.fetch = realFetch;

  /* ⚠️⚠️ THE CONTROL THAT MATTERS MOST IN THIS FILE. Zero recorded calls means
     the Worker never reached its database, and then "it contacted no other
     store" is true of a Worker that did nothing at all. */
  t(`the Worker actually made data calls (${recorded.length} recorded)`, recorded.length > 0);

  const hosts = [...new Set(recorded.map((u) => { try { return new URL(u).host; } catch { return String(u); } }))];
  console.log(`        hosts contacted: ${hosts.join(", ") || "(none)"}`);
  t("every call went to the configured database and nowhere else",
    hosts.length > 0 && hosts.every((h) => h === new URL(OWN).host));

  for (const [label, needle] of NOT_MINE) {
    t(`no call mentioned ${label}`, !recorded.some((u) => u.includes(needle)));
  }
}

/* ═══ 3. WITH NO DATABASE CONFIGURED IT FAILS, IT DOES NOT FALL BACK ═══════ */
group("3. a missing database address fails closed, never to another store");
{
  /* ⚠️ THIS IS THE ONE THAT WOULD ACTUALLY BITE. A future edit adding
     `env.SUPABASE_URL || "<something>"` is one character of convenience and it
     silently points this public demo at a real store's records. Nothing else in
     the six checks would catch it. */
  const before = recorded.length;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : (input && input.url) || String(input);
    recorded.push(url);
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  };

  const mod = await import(`file://${path.join(DIR, "worker.js")}?blank`);
  const env = {
    SUPABASE_URL: "",
    SUPABASE_SERVICE_KEY: "",
    ASSETS: { fetch: async () => new Response("<!doctype html><title>x</title><div id=\"root\"></div>", { headers: { "content-type": "text/html" } }) },
    GATE_CITY_KV: { get: async () => null, put: async () => {} },
  };
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {} };
  for (const r of ["https://demo.backline-ops.com/api/store-config",
                   "https://demo.backline-ops.com/api/kv?key=gcfcr-hr-roles"]) {
    try { await mod.default.fetch(new Request(r), env, ctx); } catch { /* failing closed is the pass */ }
  }
  globalThis.fetch = realFetch;

  const blankCalls = recorded.slice(before);
  const leaked = blankCalls.filter((u) => NOT_MINE.some(([, n]) => u.includes(n)));
  t(`with no address set, nothing reached another store${leaked.length ? " — LEAKED: " + leaked[0] : ""}`,
    leaked.length === 0);
  /* Anything it did try must be an unusable address, not a real one. */
  const realLooking = blankCalls.filter((u) => /^https:\/\/[a-z0-9-]+\.supabase\.co/i.test(u));
  t(`and it built no real-looking database address${realLooking.length ? " — BUILT: " + realLooking[0] : ""}`,
    realLooking.length === 0);
}

/* ═══ 4. THE SOURCE HAS NO FALLBACK TO FALL BACK TO ════════════════════════ */
group("4. the address comes only from the environment");
{
  const w = fs.readFileSync(path.join(DIR, "worker.js"), "utf8");
  t("worker.js reads SUPABASE_URL (control)", /env\.SUPABASE_URL/.test(w));
  /* `env.SUPABASE_URL || "..."` or `?? "..."` is the exact shape that breaks
     this, so it is matched directly rather than reasoned about. */
  t("it has no `|| \"...\"` fallback address",
    !/env\.SUPABASE_URL\s*(\|\||\?\?)\s*["'`]/.test(w));
  /* ⚠️ THE PLACEHOLDER IS NOT A HOST, and the first version of this failed on
     it. `https://SET-THIS-TO-THE-NEW-STORE-SUPABASE-PROJECT.supabase.co` is the
     marker the clone script writes, and it is the CORRECT state for a store
     that has not had its database set yet. Matching case-insensitively swept it
     up with the real thing. Lowercase only: a real project ref is lowercase. */
  if (IS_ORIGIN) {
    /* The origin holds its own address in worker.js and always has. Nothing to
       prove here beyond the two lines above, which are the ones that matter. */
    t("origin: its own project is configured (control)",
      /https:\/\/[a-z0-9-]{15,}\.supabase\.co/.test(w));
  } else {
    /* ⚠️⚠️ THIS USED TO DEMAND THAT A CLONE HAVE NO REAL HOST AT ALL, WHICH IS
       ONLY TRUE OF A CLONE NOBODY HAS SET UP YET. The Village is a live store
       with its own Supabase project, so it failed a rule that was really
       measuring "has this repo been configured", not "is this repo isolated".
       ⇒ AND IT WAS A SECOND MECHANISM FOR SECTION 1'S JOB. Section 1 already
       walks the whole tree for every foreign project ref and passes. Two
       mechanisms for one fact, and this is the one that drifted.
       ⇒ WHAT ACTUALLY MATTERS, at every store and in every state: a hardcoded
       host must be THIS store's, and there must only be one of them. */
    const hosts = [...new Set(w.match(/https:\/\/[a-z0-9-]{15,}\.supabase\.co/g) || [])];
    const placeholder = /SET-THIS-TO-THE-NEW-STORE-SUPABASE-PROJECT\.supabase\.co/.test(w);
    t(`either it is unset or it has one project of its own (control: ${placeholder ? "placeholder" : hosts.length + " host(s)"})`,
      placeholder || hosts.length > 0);
    t("no hardcoded host belongs to a store this one is not",
      !hosts.some((h) => NOT_MINE.some(([, v]) => h.includes(v))));
    t(`it names at most one database (${hosts.length})`, hosts.length <= 1);
  }
}

console.log(`\n${fail ? `${fail} FAILED, ` : ""}${pass} passed`);
process.exit(fail ? 1 : 0);
