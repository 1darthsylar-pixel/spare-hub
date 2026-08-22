/* ============================================================================
   slackLegDown.test.mjs — does a dead Slack channel take down a delivered job?

       node slackLegDown.test.mjs

   🐛 Matt, Aug 21 2026, reading `ops-recap` under Failing on the Report Card:
   "Because we are moving from slack to hub pushes can't this be fixed?"

   He was right. That job writes its Hub copy and THEN posts to Slack. Hannah
   had deleted the extra channels, so `resolveChannel` found nothing,
   `postToSlackChannel` threw, and the job failed every night WHILE ITS MESSAGE
   WAS BEING DELIVERED PERFECTLY.

   ⚠️ The sender already agreed with him two arms up: a channel that is switched
   OFF logs "the Hub announcement still went" and RETURNS. Only "not found"
   threw.

   ⛔⛔ AND THE SHARED SENDER MUST KEEP THROWING. `channelSoft.test.mjs` says so
   and its reason is real: `postMonthly` reads that behaviour to decide whether
   to burn the month's already-sent flag, so softening it globally could stamp a
   monthly report as sent to nobody. The right path is the wrapper, opting
   callers in one at a time — which is what this file grades.

   ★ A source test because nothing in checks/ can import worker.js.
   ============================================================================ */
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const t = (label, cond, extra) => {
  console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}${cond || !extra ? "" : `  ${extra}`}`);
  if (cond) pass++; else fail++;
};
const group = (n) => console.log(`\n── ${n}`);

const SRC = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const LINES = SRC.split("\n");
const enclosing = (i) => {
  for (let j = i; j >= 0; j--) {
    const m = LINES[j].match(/^(?:async )?function ([A-Za-z0-9_$]+)/);
    if (m) return m[1];
  }
  return "";
};
const fnBody = (name) => {
  const i = SRC.indexOf(`function ${name}(`);
  if (i < 0) return "";
  const j = SRC.indexOf("\n}\n", i);
  return j < 0 ? "" : SRC.slice(i, j);
};

group("0. controls — a scan that reads nothing prints ok");
t("worker.js was really read", SRC.length > 50000);
t("the hard sender exists", fnBody("postToSlackChannel").length > 0);
t("the wrapper exists", fnBody("postChannelSoft").length > 0);

group("1. the hard sender still throws, and must");
{
  const hard = fnBody("postToSlackChannel");
  t("★ it throws on an unresolved channel", /if \(!id\) throw new Error\(/.test(hard));
  t("★ and on a refused post", /throw new Error\(/.test(hard.slice(hard.indexOf("data.ok"))));
}

group("2. only postMonthly and the wrapper may call it");
{
  const sites = [];
  LINES.forEach((ln, i) => { if (/await postToSlackChannel\(/.test(ln)) sites.push({ i, fn: enclosing(i) }); });
  t("control: call sites were really found", sites.length > 0, `found ${sites.length}`);
  t("★★ exactly two callers use the throwing sender", sites.length === 2,
    sites.map((s) => s.fn).join(", "));
  /* ⚠️ THE EXEMPTION IS EARNED, NOT GRANTED. postMonthly reads the return to
     decide whether the month's report was really sent. Every other caller
     ignores it, which is why they were safe to move. */
  t("★★ one is postMonthly, by rule", sites.some((s) => /monthly/i.test(s.fn)),
    sites.map((s) => s.fn).join(", "));
  t("★ and the other is the wrapper itself", sites.some((s) => s.fn === "postChannelSoft"));
}

group("3. the wrapper degrades, and does not call itself");
{
  const soft = fnBody("postChannelSoft");
  /* ⚠️ THE RECURSION GUARD. A sweep that renamed call sites also renamed the
     one INSIDE this wrapper, and it called itself. Two tests caught it. This
     names it so the next sweep cannot repeat it quietly. */
  t("★★ the wrapper does not call itself", !/await postChannelSoft\(/.test(soft));
  t("it catches rather than rethrows", /catch \(e\)/.test(soft) && !/^\s*throw /m.test(soft));
  t("★ and reports which channel and why", /error: why, channel: channelName/.test(soft));
}

group("4. degraded must not mean silent");
{
  const soft = fnBody("postChannelSoft");
  t("★★ the wrapper records the reason on env", /__slackDown/.test(soft));
  t("★ capped, so one job cannot write an essay", /__slackDown\.length < 5/.test(soft));
  t("★ and wrapped, so recording cannot break a delivered job",
    soft.indexOf("try {", soft.indexOf("__slackDown") - 200) > -1);
  t("★★ the run record carries it", /detail\.slackDown = /.test(SRC));
}

console.log(`\n${fail ? "FAIL" : "PASS"}  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
