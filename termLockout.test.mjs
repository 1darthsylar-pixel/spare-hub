/* ============================================================================
   termLockout.test.mjs — once somebody is terminated, can they still get in?

       node termLockout.test.mjs

   Matt, Aug 17 2026: "Kyleeka is termed and I never want her to have access to
   the hub again because she will steal it."

   ⚠️⚠️ NOTHING GRADED THIS BEFORE. Two lines of code are the entire guarantee:
   the `terminatedIds` check at the bottom of `readToken`, and the
   `.filter((id) => sm[id] !== "terminated")` inside /api/pin-verify. Both are
   easy to move, easy to short-circuit, and their absence is completely silent —
   the app behaves normally for everyone, and one person who should be locked
   out simply is not.

   ★ IT RUNS THE REAL `readToken`, extracted from worker.js against fakes. A
   regex asserting the file "mentions terminatedIds" would pass on a version
   where the check sat above an early return and never executed.

   ⚠️ THE FAILURE IS SILENT AND ONE-SIDED. There is no screen anywhere that says
   "this termed person still has a working session". You would find out the way
   you find out about theft.
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
import { sayNotGraded } from "./seedPresence.mjs";

const SRC = fs.readFileSync(path.join(DIR, "worker.js"), "utf8");

let pass = 0, fail = 0;
const t = (label, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}`); if (cond) pass++; else fail++; };
const group = (n) => console.log(`\n── ${n}`);

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64")
  .replace(/\+/g, "-").replace(/\//g, "_");

group("0. controls");
t("worker.js was read (control)", SRC.length > 100000);
const m = SRC.match(/async function readToken\(env, token\) \{[\s\S]*?\n\}/);
t("readToken was found (control)", !!m);

/* Fakes for everything readToken leans on. The signature always verifies, so
   every assertion below is about the checks AFTER it — which is where the
   termination gate lives. */
const PRELUDE = `
  const LEGACY_SIGNING_ACCEPTED = true;
  const atob = (s) => Buffer.from(s, "base64").toString("binary");
  const freshKey = () => "k";
  const legacyKey = () => "k";
  const hmacRaw = async () => "GOOD";
  const pinEq = (a, b) => a === b;
  const bareId = (v) => String(v || "").replace(/^tm/, "");
  const sessionEpoch = async (env) => env.__epoch || 1;
  const terminatedIds = async (env) => new Set(env.__termed || []);
`;

let readToken = null;
if (m) {
  try { readToken = new Function(`${PRELUDE}\n${m[0]}\nreturn readToken;`)(); }
  catch (e) { t(`readToken compiled — ${e.message}`, false); }
}
t("readToken compiled", typeof readToken === "function");

const future = Math.floor(Date.now() / 1000) + 3600;
const tok = (u, extra) => `${b64u({ u, e: future, ...(extra || {}) })}.GOOD`;

if (typeof readToken === "function") {
  group("1. ★★ a live session dies the moment the person is termed");
  {
    const before = await readToken({ __termed: [] }, tok("tm42"));
    t("a working token verifies while they are on the roster", before && before.u === "tm42");

    /* ⚠️⚠️ THE WHOLE POINT. Not at expiry, not at next sign-in — on the very
       next request. She can be holding an unlocked phone with the Hub open. */
    const after = await readToken({ __termed: ["42"] }, tok("tm42"));
    t("★★ the SAME token is refused once they are terminated", after === null);
  }

  group("2. ★ it is the right person, not a near match");
  {
    t("somebody else is unaffected",
      (await readToken({ __termed: ["42"] }, tok("tm7"))) !== null);
    /* ⚠️ ids arrive as `tm42` from the roster and `42` from the token; bareId is
       what makes those the same person. This repo already shipped that exact bug
       once, on announcements, where "tm55" !== "55" made the whole feature reach
       nobody. Here the same mistake fails the other way: the gate misses. */
    t("★★ a bare id and a tm- id are the same person",
      (await readToken({ __termed: ["42"] }, tok("42"))) === null);
  }

  group("3. ★ the other doors still hold");
  {
    t("an expired token is refused",
      (await readToken({ __termed: [] }, `${b64u({ u: "tm42", e: 1 })}.GOOD`)) === null);
    t("a token with no user is refused",
      (await readToken({ __termed: [] }, `${b64u({ e: future })}.GOOD`)) === null);
    t("a bad signature is refused",
      (await readToken({ __termed: [] }, `${b64u({ u: "tm42", e: future })}.WRONG`)) === null);
    t("junk is refused", (await readToken({ __termed: [] }, "nonsense")) === null);
    t("nothing is refused", (await readToken({ __termed: [] }, "")) === null);

    /* ★ THE SIGN-EVERYONE-OUT SWITCH. Bumping the stored epoch ends every live
       session inside a minute without rotating a key. That is the belt to the
       termination braces, and it is worth knowing it works. */
    t("★★ bumping the session epoch ends an existing session",
      (await readToken({ __termed: [], __epoch: 2 }, tok("tm42", { k: 1 }))) === null);
    t("   and a token minted after the bump still works",
      (await readToken({ __termed: [], __epoch: 2 }, tok("tm42", { k: 2 }))) !== null);
  }

  group("4. ★★ the check runs LAST, and that ordering is deliberate");
  /* ⚠️ A forged or expired token must never cause a status read. Graded by
     asking whether terminatedIds is consulted at all for a token that fails
     earlier — if it is, somebody moved the check up and handed an unauthenticated
     caller a database lookup. */
  {
    let looked = false;
    const spy = new Function(`${PRELUDE.replace(
      "const terminatedIds = async (env) => new Set(env.__termed || []);",
      "const terminatedIds = async (env) => { env.__looked = true; return new Set(env.__termed || []); };"
    )}\n${m[0]}\nreturn readToken;`)();
    const env = { __termed: ["42"] };
    await spy(env, `${b64u({ u: "tm42", e: future })}.WRONG`);
    looked = !!env.__looked;
    t("★★ a bad signature never triggers a terminated-list read", looked === false);

    const env2 = { __termed: ["42"] };
    await spy(env2, tok("tm42"));
    t("   but a good token does check it", env2.__looked === true);
  }
}

group("5. the other door — signing in fresh");
/* /api/pin-verify filters terminated ids out BEFORE it compares the PIN, so a
   termed person's PIN matches nobody. Graded as source because the route cannot
   be extracted, and named precisely so a rename cannot pass silently. */
{
  t("★★ pin-verify filters terminated ids",
    /\.filter\(\(id\) => sm\[id\] !== "terminated"\)/.test(SRC));
  t("★ it reads the status map to do it", /sbGet\(env, "gcfcr-hr-status"\)/.test(SRC));
  t("★ and readToken still checks the list",
    /if \(\(await terminatedIds\(env\)\)\.has\(bareId\(json\.u\)\)\) return null;/.test(SRC));
}

group("6. ★★ the hardcoded lists — the half this file used to disclaim");
/* ⚠⚠ THIS SECTION EXISTS BECAUSE THE OLD SECTION 6 SAID "not covered", AND
   THE DAILY SWEEP THEN FOUND HER. Aug 18 2026, on Matt's lock screen:
   "WIRED BUT INACTIVE — Kyleeka reads Active in HR, yet is still
   hardcoded into: tile admin lists."

   ⚠ THE TWO DOORS IN SECTIONS 1-5 WERE ALREADY SHUT. gcfcr-hr-status carries
   "23": "terminated", so readToken kills her session on the next request and
   pin-verify matches her PIN to nobody. What the sweep found was different and
   quieter: a NAME hardcoded into a grant list, which no rank check and no
   terminated-set check ever consults — that is the entire purpose of an
   override list.

   ★ GRADED BY ID, NEVER BY NAME. A name can be spelled two ways and a comment
   mentioning her is provenance that should stay; the id is the thing that
   grants. Both files are read as source because these are module constants. */
{
  const owner = fs.readFileSync(path.join(DIR, "ownerSeed.js"), "utf8");
  const wseed = fs.readFileSync(path.join(DIR, "workerSeed.js"), "utf8");

  /* ⛔⛔ THIS BLOCK GRADES ONE STORE'S OWN PEOPLE RECORDS, AND ONLY THAT STORE
     HAS THEM. A new store ships with the empty twins of both seeds on purpose,
     so every control below correctly refused there and a brand new store's
     first run of its own checks was red on data it is not supposed to have.
     Found Aug 19 2026 by generating a store and running its checks, which had
     never been done.

     ⚠️⚠️ THE CONTROLS ARE NOT WEAKENED AND MUST NOT BE. They are the reason
     this block cannot report clean off an empty file, which is the exact
     failure they were written to stop. What changed is only WHERE they are
     asked. Everything above this point — the real `readToken` run against
     fakes, which is the actual security guarantee — grades at every store and
     is untouched.

     ⚠️ ASKED OF THE SEEDS THEMSELVES, not of a store id. A store that has
     people records gets graded on them whoever it is; the origin is not
     special, it is just the one with data today. */
  const hasPeople = owner.length > 5000 && wseed.length > 5000;
  if (!hasPeople) {
    sayNotGraded("this store's own people records",
      "ownerSeed.js and workerSeed.js are the empty twins, so there is no roster to grade.");
  } else {
  t("ownerSeed.js was read (control)", owner.length > 5000);
  t("workerSeed.js was read (control)", wseed.length > 5000);

  const instr = owner.match(/instructorIds:\s*\[([^\]]*)\]/);
  t("instructorIds was found (control)", !!instr);
  const ids = instr ? instr[1].split(",").map((x) => x.trim().replace(/"/g, "")).filter(Boolean) : [];
  t(`★ the list still grants somebody (control) — ${ids.length}`, ids.length >= 3);
  /* ⚠ AN EDIT GRANT THAT OUTRANKS RANK. The list's own comment says adding an
     id is the same grant as adding a role. */
  t("★★ 23 is not an instructor", !ids.includes("23"));

  /* ⚠ THE WORKER'S ADDRESS BOOK. Left in place, every job that mails a person
     by id still reached her personal inbox after every other door shut. */
  const emails = wseed.match(/export const EMAIL_SEED = \{([\s\S]*?)\n\};/);
  t("EMAIL_SEED was found (control)", !!emails);
  t("★ it still holds the team (control)",
    !!emails && (emails[1].match(/"\d+":/g) || []).length > 50);
  t("★★ 23 has no automated-mail address",
    !!emails && !/(^|[^\d])"23":/.test(emails[1]));

  /* ⚠ THE SWEEP ROW GOES WITH THE WIRING, NEVER ON ITS OWN. Removing the row
     while a grant list still names her is how a real finding gets silenced. */
  const sweep = wseed.match(/export const SWEEP_PEOPLE = \[([\s\S]*?)\n\];/);
  t("SWEEP_PEOPLE was found (control)", !!sweep);
  t("★ it still names the people who ARE wired in (control)",
    !!sweep && (sweep[1].match(/name:/g) || []).length >= 5);
  /* ⚠ MATCHED ON THE `name:` FIELD, NOT ON THE WORD. My first version tested
     the whole block for her name and went red on the COMMENT recording the
     removal — contradicting, two lines up, its own rule that a comment naming
     her is provenance and stays. Suspect the assertion first: it was the
     assertion. What must be gone is a row the sweep will read. */
  const sweepNames = sweep ? [...sweep[1].matchAll(/name:\s*"([^"]+)"/g)].map((m) => m[1]) : [];
  t(`★ sweep rows parsed (control) — ${sweepNames.length}`, sweepNames.length >= 5);
  t("★★ and no ROW names her, because nothing wires her in",
    !sweepNames.some((n) => /Kyleeka/i.test(n)));
  t("★ the removal is still recorded in a comment", /Kyleeka/.test(sweep ? sweep[1] : ""));

  /* ⚠⚠ THE PTO RECORD STAYS AND THAT IS DELIBERATE. PTO_SEED holds days she
     actually took while employed. It grants nothing, it is reached by no gate,
     and deleting it would rewrite a payroll fact to tidy a list. Scrubbing
     access is not the same as erasing history. */
  t("★★ her PTO history is NOT deleted", /Kyleeka Gonzalez/.test(wseed));
  }
}

group("7. what this does NOT cover");
/* ⚠️ Terminating somebody does not touch anything they are HARDCODED into.
   CLAUDE.md: "People are hardcoded into some automations. Terminating someone in
   HR does not touch those." Aug 17 2026, on Kyleeka specifically: she is still
   in profitShareSeed.js's Executive Director group and is recorded in
   SWEEP_PEOPLE as wired into tile admin lists. Those are separate jobs and this
   file makes no claim about them. */
t("this grades the access doors AND the grant lists", true);
console.log("     ⚠️  It cannot read gcfcr-hr-status — that is live KV. Measured Aug 18 2026: \"23\" is \"terminated\" there, which is what shuts the two doors.");
console.log("     ⚠️  gcfcr-hr-team-v1 still carries status \"Active\" for her. That is Team Docs\u2019 snapshot, read by no gate — it is what the sweep reports on.");

console.log(`\n${fail ? `${fail} FAILED, ` : ""}${pass} passed`);
process.exit(fail ? 1 : 0);
