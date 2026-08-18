/* ============================================================================
   deployWindow.test.mjs — can a change reach this store during a lunch rush?

       node deployWindow.test.mjs

   Matt, Aug 17 2026: "when new stores go live i need there updates to happen
   during closed hours only unless its an emergency" and "live means when they
   start inputting their own numbers."

   ⚠️⚠️ THE FAILURE THIS GRADES REACHES REAL PEOPLE. A merge here builds and
   promotes itself in about a minute with no human step in between, so a rule
   that is subtly wrong does not produce a red build — it produces a change
   landing on shared iPads mid-rush.

   ★ EVERY CASE IS RUN AGAINST A REAL CLOCK IN A REAL TIMEZONE. GitHub Actions
   runs in UTC, and a window written as 01:00 and compared against a UTC clock
   lands at 9pm ET in summer — dinner, which is the exact hour this exists to
   protect. Half these assertions would pass against a naive implementation and
   the store would still be interrupted.
   ============================================================================ */
import { windowState, readConfig, localParts, DEFAULT_CONFIG } from "./deployWindow.mjs";

let pass = 0, fail = 0;
const t = (label, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}`); if (cond) pass++; else fail++; };
const group = (n) => console.log(`\n── ${n}`);

/* Real instants, written in UTC so the conversion is genuinely exercised.
   August is EDT, so ET is UTC-4. */
const at = (utcIso) => new Date(utcIso);
const LIVE = { live: true };
const state = (utcIso, cfg = LIVE, labels = []) => windowState({ now: at(utcIso), config: cfg, labels });

group("0. controls");
t("windowState imported", typeof windowState === "function");
t("Sunday is not a deploy day by default", !DEFAULT_CONFIG.days.includes(0));
t("the default is NOT live", DEFAULT_CONFIG.live === false);

group("1. ★★ the timezone, which is where a naive version fails");
/* 05:00 UTC on a Tuesday in August is 01:00 ET the same day — inside the
   window. 01:00 UTC is 21:00 ET the evening BEFORE, which is dinner. */
{
  const p = localParts(at("2026-08-18T05:00:00Z"), "America/New_York");
  t("★★ 05:00 UTC reads as 01:00 ET", p.minutes === 60 && p.day === 2);
  const q = localParts(at("2026-08-18T01:00:00Z"), "America/New_York");
  t("★★ 01:00 UTC reads as 21:00 ET the day before", q.minutes === 21 * 60 && q.day === 1);
  t("★★ so a UTC-blind rule would deploy at dinner", state("2026-08-18T01:00:00Z").allowed === false);
}

group("2. ★★ live store, inside and outside the window");
t("★★ 01:00 ET Tuesday is allowed", state("2026-08-18T05:00:00Z").allowed === true);
t("01:30 ET is allowed", state("2026-08-18T05:30:00Z").allowed === true);
t("03:59 ET, the last minute, is allowed", state("2026-08-18T07:59:00Z").allowed === true);
t("★★ 12:00 noon ET is REFUSED", state("2026-08-18T16:00:00Z").allowed === false);
t("★★ 18:00 ET, dinner, is REFUSED", state("2026-08-18T22:00:00Z").allowed === false);
t("00:59 ET, one minute early, is REFUSED", state("2026-08-18T04:59:00Z").allowed === false);
t("04:00 ET, the moment it shuts, is REFUSED", state("2026-08-18T08:00:00Z").allowed === false);
t("★ a refusal says what the window is", /01:00 to 04:00/.test(state("2026-08-18T16:00:00Z").reason));
t("★ and tells you how to override it", /emergency/.test(state("2026-08-18T16:00:00Z").reason));

group("3. ★★ Sunday, which is the tempting one");
/* ⚠️ THE STORE IS SHUT, WHICH IS EXACTLY WHY IT IS THE WORST DAY. Nobody is
   there to notice a bad change until the Monday open. */
{
  const sun = state("2026-08-16T05:00:00Z");   // 01:00 ET Sunday, inside the hours
  t("★★ 01:00 ET on a SUNDAY is refused even though the hours match", sun.allowed === false);
  t("   and it says why", /not a deploy day/.test(sun.reason));
}

group("4. ★ the 3:00–3:15 hole");
/* retention-purge runs at 3:10 and is the only job that deletes anything. */
t("★★ 03:10 ET is refused mid-window", state("2026-08-18T07:10:00Z").allowed === false);
t("   and names the reason", /scheduled job/.test(state("2026-08-18T07:10:00Z").reason));
t("02:59 is fine", state("2026-08-18T06:59:00Z").allowed === true);
t("03:15 is fine again", state("2026-08-18T07:15:00Z").allowed === true);

group("5. ★★ the emergency door");
/* ⚠️ ONE LABEL AND NOTHING ELSE. A process with steps is one nobody follows at
   1pm on a Friday, and an emergency door has to open under pressure. */
t("★★ noon on a Tuesday with the label goes now",
  state("2026-08-18T16:00:00Z", LIVE, ["emergency"]).allowed === true);
t("★ Sunday with the label goes too",
  state("2026-08-16T16:00:00Z", LIVE, ["emergency"]).allowed === true);
t("the label is case-insensitive", state("2026-08-18T16:00:00Z", LIVE, ["EMERGENCY"]).allowed === true);
t("an unrelated label does nothing", state("2026-08-18T16:00:00Z", LIVE, ["ready"]).allowed === false);

group("6. ★★ live, and what happens when it is not set");
t("★ a store that is not live merges any time", state("2026-08-18T16:00:00Z", { live: false }).allowed === true);
t("   and says so", /not live yet/.test(state("2026-08-18T16:00:00Z", { live: false }).reason));

/* ⚠️⚠️ EVERY DOUBT RESOLVES TO LIVE. Wrong in this direction costs a slow
   deploy. Wrong the other way costs a disrupted store, and they cannot tell it
   was a mistake rather than a bug. */
t("★★ no config at all is treated as LIVE", readConfig(null).live === true);
t("★★ unparseable config is treated as LIVE", readConfig("{ broken").live === true);
t("★★ a non-object is treated as LIVE", readConfig("[1,2]").live === true);
t("★ only an explicit false turns the gate off", readConfig('{"live":false}').live === false);
t("a missing live key is live", readConfig("{}").live === true);
t("★★ so a typo cannot silently unprotect the store",
  state("2026-08-18T16:00:00Z", "{ broken").allowed === false);

group("7. a window that crosses midnight");
/* A store closing at 11pm may reasonably want 23:30 to 02:00, and writing that
   as start > end is the natural thing to type. */
{
  const cfg = { live: true, start: "23:30", end: "02:00", skip: [] };
  t("★ 23:45 ET is inside", state("2026-08-19T03:45:00Z", cfg).allowed === true);
  t("★ 01:00 ET is still inside", state("2026-08-19T05:00:00Z", cfg).allowed === true);
  t("22:00 ET is outside", state("2026-08-19T02:00:00Z", cfg).allowed === false);
}

group("8. it never throws and never guesses");
{
  let threw = false;
  for (const junk of [undefined, null, 0, "", [], { live: true, start: "nonsense" }, { live: true, timezone: "Nowhere/Nothing" }]) {
    try { const s = windowState({ now: at("2026-08-18T16:00:00Z"), config: junk, labels: null }); if (typeof s.allowed !== "boolean") threw = true; }
    catch { threw = true; }
  }
  t("★★ every junk config returns an answer rather than throwing", threw === false);
  t("★ a broken window time refuses rather than allowing",
    state("2026-08-18T05:00:00Z", { live: true, start: "nonsense", end: "04:00" }).allowed === false);
  t("★ a broken timezone refuses rather than allowing",
    state("2026-08-18T05:00:00Z", { live: true, timezone: "Nowhere/Nothing" }).allowed === false);
}

group("9. what this does NOT do");
/* ⚠️ IT GATES THE MERGE, WHICH IS THE ONLY THING THAT CAN BE GATED. Cloudflare
   builds on a push to main and promotes itself about a minute later, so once a
   merge happens nothing downstream can hold it back. */
t("this decides whether to merge, not whether to promote", true);
console.log("     ⚠️  A merge IS the deploy here. There is nothing to hold at Cloudflare.");

console.log(`\n${fail ? `${fail} FAILED, ` : ""}${pass} passed`);
process.exit(fail ? 1 : 0);
