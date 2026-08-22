/* ══════════════════════════════════════════════════════════════════════════
   hubPlainText.test.mjs — A HUB ANNOUNCEMENT IS NOT A SLACK MESSAGE

   🐛 MEASURED IN THE LIVE RECORD, Aug 22 2026. Of the 19 announcements in
   `gcfcr-announcements-v1`, FIVE carried markup that means nothing outside
   Slack — four with a raw user id and one with an emoji shortcode:

       "<@U06FCRAP98R> is assigned today (Bath rotation)."

   ⇒ A leader opening the Hub reads a Slack user id where a person's name
   should be. It is not a crash and nothing errors, so nobody reports it; it
   just quietly makes the Hub copy worse than the Slack one, on the exact
   screens Matt is moving the store ONTO.

   ⛔⛔ AND THE FALLBACK PATH PRODUCED A BETTER MESSAGE THAN THE SUCCESS PATH.
   `runFoodSafetyAssign` uses the plain name when it cannot resolve a Slack id,
   and swaps in `<@uid>` when it CAN. So the Hub copy was readable exactly when
   Slack lookup failed, and broken whenever it worked. That is the whole bug in
   one sentence.

   ⇒ TWO HALVES, and neither is enough alone:
     · the CAUSE — the one job whose text reaches the Hub hands the Hub the
       name, because it already has it
     · the NET — `plainFromSlack` drops residual Slack-only markup, so a site
       added later cannot print a raw id even if it forgets

   ⚠️ THE NET ALONE WOULD LEAVE A HOLE IN THE SENTENCE ("… is assigned today"),
   which is why the cause half exists. The net is for the site nobody has
   written yet.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const W = fs.readFileSync(path.join(ROOT, "worker.js"), "utf8");

let pass = 0;
const fails = [];
const ok = (label, cond, extra = "") => {
  if (cond) pass += 1; else fails.push(label + (extra ? `  (${extra})` : ""));
};

/* ── 1 · CONTROLS ────────────────────────────────────────────────────────── */
ok("★ control — worker.js loaded and holds both halves",
   W.length > 50000 && W.includes("plainFromSlack") && W.includes("runFoodSafetyAssign"));

/* Lift the REAL function and RUN it. A regex that only READ it would grade the
   spelling of a replace chain, not what it does to a string. */
const fnM = W.match(/function plainFromSlack\(([^)]*)\)\s*\{([\s\S]*?)\n\}/);
ok("★ control — plainFromSlack was really sliced", !!fnM && fnM[2].length > 40,
   fnM ? `${fnM[2].length} chars` : "no match");
const plainFromSlack = fnM ? Function(`"use strict"; return function plainFromSlack(${fnM[1]}) {${fnM[2]}\n};`)() : null;
ok("★ control — and it runs", typeof plainFromSlack === "function" && plainFromSlack("hi") === "hi");

/* ── 2 · WHAT IT ALREADY DID, WHICH MUST NOT REGRESS ─────────────────────── */
if (plainFromSlack) {
  ok("<!channel> still goes", !plainFromSlack("all hands <!channel>").includes("<!channel>"));
  ok("<!here> still goes", !plainFromSlack("<!here> heads up").includes("<!here>"));
  ok("*bold* markers still go", plainFromSlack("*Food Safety*") === "Food Safety");
  ok("runs of blank lines still collapse", plainFromSlack("a\n\n\n\n\nb") === "a\n\nb");
}

/* ── 3 · THE BUG: A USER ID MUST NEVER REACH A HUB SCREEN ─────────────────── */
if (plainFromSlack) {
  const real = "Food Safety Walkthrough — Friday\n<@U06FCRAP98R> is assigned today (Bath rotation).";
  const out = plainFromSlack(real);
  ok("★★ a raw Slack user id never survives", !/<@U[A-Z0-9]+>/.test(out), out.slice(0, 60));
  ok("★★ and neither does the pipe form", !/<@U[A-Z0-9]+\|/.test(plainFromSlack("<@U123|Lizbeth> is on")));
  ok("a channel reference does not survive either", !/<#C[A-Z0-9]+/.test(plainFromSlack("see <#C0123|general>")));
}

/* ── 4 · EMOJI SHORTCODES, AND THE ONE THAT MUST SURVIVE ─────────────────── */
if (plainFromSlack) {
  ok("★★ an emoji shortcode goes", !plainFromSlack(":mega: Food Focus").includes(":mega:"));
  /* ⛔⛔ A TIME IS NOT AN EMOJI. `:[a-z0-9_]+:` also matches the middle of
     "9:30:15", and these messages are full of times. The pattern must require
     a LETTER first or the Hub starts eating the clock. */
  ok("★★ a time is left alone", plainFromSlack("boil out at 9:30:15 today").includes("9:30:15"));
  ok("★★ a ratio is left alone", plainFromSlack("ran 3:1 on nuggets").includes("3:1"));
}

/* ── 4b · ITALICS, AND THE IDENTIFIER THAT MUST SURVIVE ──────────────────── */
if (plainFromSlack) {
  ok("★★ _italics_ lose their underscores", plainFromSlack("_Food Focus — week to Aug 17_") === "Food Focus — week to Aug 17");
  /* ⛔ A bare /_/g would gut these, and they turn up in keys and file names. */
  ok("★★ snake_case is left alone", plainFromSlack("read gcfcr_hr_roles today").includes("gcfcr_hr_roles"));
  ok("★★ a lone trailing underscore is left alone", plainFromSlack("value_ is odd").includes("value_"));
}

/* ── 5 · LINKS KEEP THEIR WORDS ──────────────────────────────────────────── */
if (plainFromSlack) {
  ok("a labelled link keeps the label", plainFromSlack("open <https://x.test/a|the report> now").includes("the report"));
  ok("a labelled link loses the brackets", !plainFromSlack("open <https://x.test/a|the report>").includes("<http"));
  ok("a bare link keeps the address", plainFromSlack("see <https://x.test/a>").includes("https://x.test/a"));
}

/* ── 6 · THE WIRING — THE CAUSE HALF ─────────────────────────────────────── */
/* ⚠️⚠️ NOT GRADED WHERE THE STORE HAS NO HUB COPY OF A CHANNEL POST, AND THAT
   IS SAID OUT LOUD RATHER THAN PASSED OVER. This repo's food safety job posts
   to the channel only; the Hub copy, where it exists, is made downstream inside
   the sender. So there is no second `body:` at the call site to grade.

   ⛔ A TEST THAT PASSES ON AN ABSENCE KEEPS PASSING ON THE DAY THE FEATURE
   ARRIVES WITHOUT ITS FIX. If this store ever gains a direct `postHubRecap` in
   that job, these assertions start running on their own and will fail until the
   name is carried through. That is the point of checking rather than skipping. */
const fsM = W.match(/async function runFoodSafetyAssign\(([\s\S]*?)\n\}/);
ok("★ control — runFoodSafetyAssign was really sliced", !!fsM && fsM[1].length > 1000,
   fsM ? `${fsM[1].length} chars` : "no match");
const fsHasHubPost = !!fsM && /postHubRecap\(/.test(fsM[1]);
if (fsM && !fsHasHubPost) {
  console.log("  NOT GRADED  section 6 — this store's food safety job writes no Hub copy of its own");
  pass += 1;
}
if (fsM && fsHasHubPost) {
  const body = fsM[1];
  /* ⚠️ GRADE THE LINE, NOT AN OBJECT-LITERAL REGEX. The first version of this
     assertion used `\{[^}]*body:` and failed against correct code, because the
     literal holds a template string with `${dayName}` in it and `[^}]` stops at
     that brace. It accused the fix it was written to protect. */
  const hubPost = body.split("\n").find((l) => l.includes('postHubRecap(env, { series: "foodsafety-assign"')) || "";
  ok("★ control — the Hub post line was found", !!hubPost, "no postHubRecap for foodsafety-assign");
  ok("★★ the Hub copy is not the Slack copy", /body:\s*hubText\b/.test(hubPost),
     hubPost ? hubPost.trim().slice(0, 90) : "");
  ok("★★ and it is not the mention text", !/body:\s*text\b/.test(hubPost));
  ok("★★ and the Hub copy carries the person's name", /hubText/.test(body) && /entry\.name/.test(body));
  ok("Slack still gets the mention", /postChannelSoft\(env, slackChan\("brand"\), text\)/.test(body));
}

/* ── 7 · NO OTHER HUB COPY MAY CARRY A MENTION ───────────────────────────── */
/* Every `<@${...}>` built anywhere in the Worker, and where it can end up. */
const mentionSites = [...W.matchAll(/`<@\$\{[^}]+\}>`/g)].length;
ok("★ control — the mention builders are still findable", mentionSites >= 1, `${mentionSites} found`);

const summary = `${fails.length ? "FAIL" : "PASS"}  ${pass} passed, ${fails.length} failed`;
for (const f of fails) console.log("  FAIL  " + f);
console.log(summary);
if (fails.length) process.exit(1);
