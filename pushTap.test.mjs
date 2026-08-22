/* ============================================================================
   pushTap.test.mjs — TAPPING A NOTIFICATION HAS TO LAND ON THE THING.

       node pushTap.test.mjs

   🐛🐛 MATT, Aug 22 2026, off a watch photo of the scheduled-jobs alert:
   "When I open on my phone it disappeared. When opening it should take you to
   the message."

   ⛔⛔ TWO BUGS, AND THE SERVICE WORKER ONE IS THE ONE THAT MAKES IT VANISH.

     1. `dmPerson` passes NO `url`, so every DM push falls back to "/" — and
        since the Slack DM swap that is sixteen call sites, which is every
        person-to-person message the Hub sends.

     2. `notificationclick` did `client.url.includes(target)` and then
        `client.focus()` with NO navigate. **Every URL contains "/"**, so with
        the target defaulted to "/" the first open Hub window always matched:
        the notification closed, an old tab took focus, and nothing moved. The
        message is gone and you are looking at whatever you were looking at.
        ⇒ That is exactly "it disappeared".

   ⚠️ AND FOCUS ALONE COULD NOT HAVE WORKED EVEN WITH A REAL TARGET. `App.jsx`
   reads `?to=` in a `useEffect` with an EMPTY dependency list, so it fires on
   MOUNT and never again. Focusing a tab that is already mounted re-runs
   nothing. `client.navigate()` is the whole difference.

   ★ IT RUNS THE REAL HANDLER, extracted from the shipped `sw.js` and driven
   against fake clients, because a grep cannot tell you whether a tap moves.
   ⚠️ `sw.js` IS THE ONE FILE WHERE A MISTAKE TAKES THE INSTALLED APP DOWN FOR
   EVERYBODY — its own header says so — which is exactly why it gets executed
   here rather than read.
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(DIR, "public", "sw.js"), "utf8");
const workerSrc = fs.readFileSync(path.join(DIR, "worker.js"), "utf8");

let pass = 0, fail = 0;
const t = (label, cond, extra) => {
  console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}${cond || !extra ? "" : `\n          ${extra}`}`);
  if (cond) pass++; else fail++;
};
const group = (n) => console.log(`\n── ${n}`);

/* ── 0. the control ───────────────────────────────────────────────────────
   ⚠️ IF THE EXTRACT SILENTLY MISSED, every assertion below would run against
   an undefined handler and the file could still print green. */
group("0. the real handler was found and it runs (control)");
const m = src.match(/self\.addEventListener\("notificationclick",\s*\(event\)\s*=>\s*\{[\s\S]*?\n\}\);/);
t("sw.js is non-trivial", src.length > 2000);
t("the notificationclick handler was extracted", !!m);

/* Build a fake `self` and run the handler against it. */
function tap(url, clients) {
  const calls = { navigated: [], focused: 0, opened: [] };
  const fakeClients = clients.map((u) => ({
    url: u,
    focus() { calls.focused += 1; return this; },
    navigate(to) { calls.navigated.push(to); return Promise.resolve(this); },
  }));
  const self = {
    addEventListener(_, fn) { self.__handler = fn; },
    clients: {
      matchAll: () => Promise.resolve(fakeClients),
      openWindow: (u) => { calls.opened.push(u); return Promise.resolve(null); },
    },
  };
  // eslint-disable-next-line no-new-func
  new Function("self", m[0])(self);
  let waited = null;
  self.__handler({
    notification: { close() { calls.closed = true; }, data: url === undefined ? undefined : { url } },
    waitUntil(p) { waited = p; },
  });
  return Promise.resolve(waited).then(() => calls);
}

/* ⚠️ A NEUTRAL HOST, AND THE FIRST VERSION WAS NOT. It used the origin store's
   real web address, and `isolation.test.mjs` failed the clones on it the moment
   this file travelled — which is exactly what that guard is for. The host here
   is a stand-in for "some window is open"; nothing under test reads it. */
const HOME = "https://hub.example/";
const TARGET = "/?to=reportcard";

/* ── 1. the bug Matt photographed ────────────────────────────────────────── */
group("1. an already-open Hub window is MOVED, not just focused");
{
  const calls = await tap(TARGET, [HOME]);
  /* ★★★ THE ASSERTION THIS FILE EXISTS FOR. */
  t("★★★ the open window is navigated to the target",
    calls.navigated.includes(TARGET), `navigated: ${JSON.stringify(calls.navigated)}`);
  t("★★ and it is focused, so the app comes forward", calls.focused === 1);
  t("★★ and NO second window is opened", calls.opened.length === 0, JSON.stringify(calls.opened));
  t("the notification is closed", calls.closed === true);
}

group("2. the same, for a plain '/' target — the case that vanished");
{
  /* ⛔ `client.url.includes("/")` is TRUE FOR EVERY URL, which is why the old
     code always short-circuited here and never moved anything. */
  const calls = await tap("/", [HOME + "?to=hr"]);
  t("★★★ a window sitting on another screen is still navigated home",
    calls.navigated.includes("/"), `navigated: ${JSON.stringify(calls.navigated)}`);
  t("and focused", calls.focused === 1);
}

group("3. with no window open at all it opens one");
{
  const calls = await tap(TARGET, []);
  t("★★ openWindow is used when there is nothing to navigate", calls.opened.includes(TARGET));
  t("and nothing was focused", calls.focused === 0);
}

group("4. a payload with no url at all still lands somewhere");
{
  const calls = await tap(undefined, [HOME]);
  t("it falls back to the home screen rather than doing nothing",
    calls.navigated.includes("/") || calls.opened.includes("/"),
    JSON.stringify(calls));
}

/* ── 5. the sender half ──────────────────────────────────────────────────── */
group("5. dmPerson carries a url, so a tap has somewhere to go");
{
  const dm = workerSrc.match(/async function dmPerson\(env, who, text, opts\) \{[\s\S]*?\n\}/);
  /* ⚠️⚠️ A STORE WITHOUT `dmPerson` IS A REAL STATE, NOT A FAILURE. Measured
     Aug 22 2026: it exists at the origin and the Village and NOT at Guilford or
     the spare, which have never had the Slack DM swap.
     ⛔ BUT IT SAYS SO OUT LOUD RATHER THAN SKIPPING QUIETLY. A test that passes
     on an absence is a test that will keep passing on the day the feature
     arrives without its fix — which is exactly how a clone regresses silently.
     Same shape `storeTitleTier.test.mjs` already uses. */
  if (!dm) {
    console.log("  --    this repo has no dmPerson, so there is no DM push to grade (NOT GRADED)");
  } else {
    /* ⛔ IT PASSED ONLY title AND body. Sixteen call sites, every
       person-to-person message in the Hub, all landing nowhere. */
    t("★★★ it passes a url through to the push",
      /url:/.test(dm[0]), "dmPerson still sends only title and body");
  }
}

group("6. the scheduled-jobs alert points at the screen that explains it");
{
  /* ⚠️ ONLY THE ORIGIN RUNS THE JOB WATCHDOG. No clone carries the
     AUTOMATION STOPPED finding, so there is no such push to grade there — and
     that absence is named rather than passed over, for the reason in section 5. */
  /* ⚠️ NEWLINE-TOLERANT ON PURPOSE. The first version of this pinned the call
     to one line and broke the moment the call was wrapped — a control that
     fails because somebody reformatted is a control nobody trusts. */
  const line = workerSrc.match(/dmPerson\(\s*env,\s*\{ seat: "owner" \},\s*text,[\s\S]{0,200}?"Scheduled jobs"[\s\S]{0,200}?\);/);
  if (!line) {
    console.log("  --    this repo has no scheduled-jobs watchdog to grade (NOT GRADED)");
  } else {
    /* ★ The Report Card's "Does it run on its own" card is the one screen that
       says which jobs ran and why one did not. Landing anywhere else makes the
       notification homework. */
    t("★★ it deep-links to the Report Card",
      /to=reportcard/.test(line[0]), line[0]);
  }
}

console.log(`\n${fail} FAILED, ${pass} passed`);
process.exit(fail ? 1 : 0);
