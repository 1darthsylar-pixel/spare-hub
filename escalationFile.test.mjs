/* ============================================================================
   escalationFile.test.mjs — an escalation files itself as DOCUMENTATION.

       node escalationFile.test.mjs

   Matt, Aug 14 2026: "for the tell a leader tool it needs connected to the hr
   console for documentation", and when asked automatic or a tap: "automatic but
   still notifies the leader".

   ⚠️⚠️ THE THING THIS GUARDS IS A PERMANENT EMPLOYMENT RECORD. All ~106 people
   read their own file through self-view, so an entry that lands in the wrong
   group is on screen for the person it is about, saying they were disciplined
   when they were not.

   Two ways that happens, both of which have already happened once in this repo:

     1. WRONG GROUP. `FILE_GROUPS` routes on `area` and `source`, and its
        `writeups` test is a CATCH-ALL — anything that is not a counseling, an
        Adjustment, teamdocs, orientation, general or recovery matches it. An
        entry with a NEW source lands under "Write-ups — Attendance and policy
        incidents that moved points". Two templates shipped that way (Aug 7
        2026, finding 24) because the entry never copied `source`.

     2. LOST UPDATE. `gcfcr-hr-files` is ONE map holding every person's file.
        Evelyn's documentation vanished on Jul 29 2026 because filing did a
        read-modify-write of the whole map; two leaders filed minutes apart,
        both writes SUCCEEDED, and the second landed on top.

   ⇒ This runs the real worker source's filing rules against the real
   FILE_GROUPS tests from HRConsole.jsx, rather than trusting either.
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REASONS, reasonLabel, makeEscalation } from "./escalations.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const worker = fs.readFileSync(path.join(DIR, "worker.js"), "utf8");
const hrsrc = fs.readFileSync(path.join(DIR, "HRConsole.jsx"), "utf8");

let pass = 0, fail = 0;
const t = (label, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}`); if (cond) pass++; else fail++; };
const group = (n) => console.log(`\n── ${n}`);

/* The block the worker actually files. Pulled out by its own marker so this
   grades the shipped code, not a copy of it. */
const blk = (() => {
  const i = worker.indexOf('title: `Told a leader: ${what}`');
  if (i < 0) return null;
  return worker.slice(worker.lastIndexOf("files[mid] = [{", i), worker.indexOf("}, ...row];", i));
})();

group("0. the filing block is in worker.js at all (control)");
{
  t("the entry the worker files was found", blk !== null);
  t("escalations.js still exports what the title is built from",
    typeof reasonLabel === "function" && Array.isArray(REASONS) && REASONS.length > 0);
  if (!blk) { console.log(`\n1 FAILED, ${pass} passed`); process.exit(1); }
}

group("1. it files as DOCUMENTATION, never as a write-up");
{
  /* ⚠️ GRADED AGAINST HRConsole's OWN GROUP TESTS, read out of the file. Typing
     the rule here would be a second copy of the thing most likely to drift. */
  const groupsSrc = hrsrc.slice(hrsrc.indexOf("{ id: \"writeups\""), hrsrc.indexOf("];", hrsrc.indexOf("{ id: \"documentation\"")));
  t("HRConsole's FILE_GROUPS tests were read (control)", groupsSrc.length > 200);

  const field = (name) => {
    const m = blk.match(new RegExp(name + ":\\s*(\"[^\"]*\"|true|false|null|\\d+)"));
    return m ? m[1].replace(/^"|"$/g, "") : undefined;
  };

  const area = field("area"), source = field("source");
  console.log(`        area: ${area} · source: ${source} · points: ${field("points")}`);

  t('area is "General"', area === "General");
  t('source is "general"', source === "general");

  /* Now run HRConsole's real tests against the entry this produces. */
  const entry = { area, source, counseling: false };
  const isWriteup = !entry.counseling && entry.area !== "Adjustment" && entry.area !== "General"
    && entry.area !== "Recovery" && entry.source !== "teamdocs" && entry.source !== "orientation"
    && entry.source !== "general" && entry.source !== "recovery";
  const isDocumentation = entry.area === "Adjustment" || entry.area === "General"
    || entry.area === "Recovery" || entry.source === "teamdocs" || entry.source === "general"
    || entry.source === "recovery";
  t("HRConsole's writeups test does NOT match it", isWriteup === false);
  t("HRConsole's documentation test DOES match it", isDocumentation === true);

  /* ⚠️ AND THE CATCH-ALL IS PROVEN TO BE A CATCH-ALL, or the two assertions
     above pass for a reason that is not the one stated. An entry with a novel
     source MUST land in write-ups — that is the trap. */
  const novel = { area: "Attendance", source: "escalation", counseling: false };
  const novelIsWriteup = !novel.counseling && novel.area !== "Adjustment" && novel.area !== "General"
    && novel.area !== "Recovery" && novel.source !== "teamdocs" && novel.source !== "orientation"
    && novel.source !== "general" && novel.source !== "recovery";
  t("a novel source WOULD have landed in write-ups (the trap is real)", novelIsWriteup === true);
}

group("2. it is not discipline and does not pretend to be");
{
  t("points is 0", /points:\s*0\b/.test(blk));
  t("needsPricing is false — nothing for HR to price", /needsPricing:\s*false/.test(blk));
  t("counseling is false", /counseling:\s*false/.test(blk));
  t("step is null", /step:\s*null/.test(blk));
  /* ⚠️ A DOCUMENTATION ENTRY MUST NEVER ASK THE TEAM MEMBER TO SIGN. pendingSig
     true would email somebody a request to sign for having said they were
     running late. */
  t("pendingSig is false — nobody is asked to sign for this", /pendingSig:\s*false/.test(blk));
  t("the body says out loud that it carries no points",
    /carries no points and is not a write-up/.test(blk));
}

group("3. it cannot file twice, and cannot clobber anyone else's file");
{
  /* The id is derived from the escalation, so a retry finds it already there. */
  t("the entry id is derived from the escalation id", /const entryId = "esc-" \+ rec\.id;/.test(worker));
  t("and it is checked before writing", /row\.some\(\(e\) => e && e\.id === entryId\)/.test(worker));

  /* ⚠️⚠️ THE LOST-UPDATE GUARD. It must read the whole map, touch ONE row, and
     write the same object back — never build a fresh map from one person. */
  /* ⚠️ THE SLICE USED TO END AT `+ 40` AND CUT THE FINAL `);` OFF THE WRITE,
     so the assertion below could never match and reported the code broken while
     it was correct. The line it is looking for is 42 characters. Padding is
     cheap; an off-by-two that accuses working code is not. */
  const writeLine = 'await sbSet(env, "gcfcr-hr-files", files);';
  const region = worker.slice(worker.indexOf('const filesRaw = await sbGet(env, "gcfcr-hr-files")'),
    worker.indexOf(writeLine) + writeLine.length);
  t("it reads the existing map first", /const filesRaw = await sbGet\(env, "gcfcr-hr-files"\)/.test(region));
  t("it assigns ONE member row", /files\[mid\] = \[\{/.test(region));
  t("it writes back the map it read, not a new one", /await sbSet\(env, "gcfcr-hr-files", files\);/.test(region));
  t("and it keeps that person's existing entries", /\.\.\.row\]/.test(region));

  /* Simulate it: two people's rows, file for one, the other must survive. */
  const files = { "21": [{ id: "old-a" }], "33": [{ id: "old-b" }] };
  const mid = "33";
  const row = Array.isArray(files[mid]) ? files[mid] : [];
  files[mid] = [{ id: "esc-x" }, ...row];
  t("simulated: the other person's row is untouched", files["21"].length === 1 && files["21"][0].id === "old-a");
  t("simulated: their own history is kept", files["33"].length === 2 && files["33"][1].id === "old-b");
}

group("4. the title says what the person actually tapped");
{
  for (const r of REASONS) {
    const rec = makeEscalation({ id: "e1", byId: "33", reason: r.id, at: "x", dayIso: "2026-08-14" });
    t(`"${r.label}" survives into a title`, reasonLabel(rec.reason) === r.label);
  }
  t("the worker builds the title from that helper", /escReasonLabel\(rec\.reason\)/.test(worker));
  t("and imports it rather than retyping the labels", /reasonLabel as escReasonLabel/.test(worker));
}

group("5. the leader is still notified — filing did not replace the alert");
{
  /* ⚠️ MATT ASKED FOR BOTH: "automatic but still notifies the leader". A change
     that quietly traded the alert for a file entry would pass every assertion
     above and lose the only part that reaches somebody during a rush. */
  t("the escalation alert is still built", /const alert = escAlert\(rec\);/.test(worker));
  t("and still pushed to everyone on duty", /await pushToPerson\(env, name, alert\)/.test(worker));
  t("the escalation itself is still stored", /await sbSet\(env, ESCALATIONS_KEY, \[rec, \.\.\.all\]\);/.test(worker));
  /* The filing sits AFTER the escalation is stored, so a failure there cannot
     cost the message. */
  t("filing comes after the escalation is saved",
    worker.indexOf("await sbSet(env, ESCALATIONS_KEY,") < worker.indexOf('sbGet(env, "gcfcr-hr-files")'));
  t("and it is wrapped so it can never fail the send", /\} catch \{ \/\* the escalation and the alert both still stand \*\/ \}/.test(worker));
}

console.log(`\n${fail ? `${fail} FAILED, ` : ""}${pass} passed`);
process.exit(fail ? 1 : 0);
