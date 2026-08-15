/* ============================================================================
   starAwards.test.mjs — the Hub awarding stars on its own.

       node starAwards.test.mjs

   Matt, Aug 14 2026: "dont award someone who got wrote up but keep it auto."

   ⚠️⚠️ THE BLOCKER IS THE ASSERTION THAT MATTERS. Awarding somebody in the same
   month they were written up does not throw, does not fail a build, and does
   not look wrong in the data. It just teaches a team member — and everyone they
   tell — that the stars mean nothing. There is no undo for that.

   ⚠️ AND THE OPPOSITE MISTAKE IS ALSO REAL. `gcfcr-hr-files` holds write-ups,
   counselings AND documentation, including the Tell a Leader records that file
   themselves and Recovery Points, which are a +1 somebody EARNED. Blocking on
   "has any HR entry" would punish somebody for telling a leader they were
   running late — the exact behaviour the Hub asks for.

   ⇒ So `isWriteUp` is graded against HRConsole's OWN FILE_GROUPS tests, read
   out of that file rather than retyped here.
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isWriteUp, blockedByWriteUp, awardsFor, awardedIds, DEFAULT_RULES } from "./starAwards.js";
import { makeEntry, TYPES, balanceOf } from "./tokens.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const hrsrc = fs.readFileSync(path.join(DIR, "HRConsole.jsx"), "utf8");

let pass = 0, fail = 0;
const t = (label, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}`); if (cond) pass++; else fail++; };
const group = (n) => console.log(`\n── ${n}`);

const NOW = "2026-08-14T12:00:00.000Z";
const SINCE = "2026-07-15T00:00:00.000Z";

group("0. the module loaded and the ledger is the real one (controls)");
{
  t("awardsFor is a function", typeof awardsFor === "function");
  t("blockedByWriteUp is a function", typeof blockedByWriteUp === "function");
  t(`DEFAULT_RULES has rules (${DEFAULT_RULES.length})`, DEFAULT_RULES.length > 0);
  t("tokens.js makeEntry is the real one", typeof makeEntry === "function" && TYPES.EARN === "earn");
}

group("1. isWriteUp matches HRConsole's write-ups AND counselings");
{
  const g = hrsrc.slice(hrsrc.indexOf('{ id: "writeups"'), hrsrc.indexOf('{ id: "documentation"'));
  t("HRConsole's writeups test was read (control)", g.length > 100);

  /* ⚠️⚠️ THE COMPARISON IS "writeups OR counselings", NOT "writeups". This test
     first compared against HRConsole's `writeups` group ALONE and failed on a
     counseling — because HRConsole puts counselings in their OWN group, not in
     write-ups. Both files were right; the assertion was not.
     A counseling is the formal 1-4 ladder and is MORE serious than a write-up,
     so it must block an award. What HRConsole is doing is sorting a person's
     file into three tabs; what this file is doing is asking "is this
     discipline". Those are different questions about the same entry, and
     conflating them is what made the test wrong. */
  const hrWriteup = (x) => !!x.counseling || (
    !x.counseling && x.area !== "Adjustment" && x.area !== "General"
    && x.area !== "Recovery" && x.source !== "teamdocs" && x.source !== "orientation"
    && x.source !== "general" && x.source !== "recovery");

  const CASES = [
    { what: "a 30-minutes-late write-up", e: { area: "Attendance", title: "30+ Minutes Late" } },
    { what: "a call-out write-up", e: { area: "Attendance", title: "Call Out — Fri/Sat" } },
    { what: "a counseling", e: { counseling: true, area: "Attendance" } },
    { what: "General Documentation", e: { area: "General", source: "general" } },
    { what: "a Tell a Leader record", e: { area: "General", source: "general", title: "Told a leader: Running late" } },
    { what: "a Recovery Point (they EARNED this)", e: { area: "Recovery", source: "recovery" } },
    { what: "a point Adjustment", e: { area: "Adjustment" } },
    { what: "an orientation record", e: { area: "Onboarding", source: "orientation" } },
    { what: "a Team Documentation copy", e: { area: "Training", source: "teamdocs" } },
  ];
  for (const c of CASES) {
    const mine = isWriteUp(c.e), theirs = hrWriteup(c.e);
    t(`${c.what} → ${mine ? "BLOCKS" : "does not block"}${mine === theirs ? "" : "  ⚠️ HRConsole disagrees"}`,
      mine === theirs);
  }
  /* ⚠️ THE CATCH-ALL, ASSERTED. An entry type nobody has thought of must count
     as a write-up, because failing toward "no award" is the safe direction. */
  t("an unknown entry type counts as a write-up", isWriteUp({ area: "Something New" }) === true);
}

group("2. ⚠️ SOMEBODY WRITTEN UP GETS NOTHING");
{
  const person = { id: "33", name: "A" };
  const ev = { decksDone: [{ key: "deck-a", name: "Food Safety Basics" }] };
  const clean = awardsFor(person, ev, { fileRows: [], sinceIso: SINCE });
  t("a clean person earns for a finished deck", clean.length === 1 && clean[0].amount === 2);

  const written = awardsFor(person, ev, {
    fileRows: [{ area: "Attendance", title: "30+ Minutes Late", date: "2026-08-01" }],
    sinceIso: SINCE,
  });
  t("the same person, written up inside the window, earns NOTHING", written.length === 0);

  const counseled = awardsFor(person, ev, {
    fileRows: [{ counseling: true, area: "Attendance", date: "2026-08-02" }],
    sinceIso: SINCE,
  });
  t("a counseling blocks too", counseled.length === 0);

  /* ⚠️ AND DOCUMENTATION DOES NOT. This is the half that would quietly punish
     people for using Tell a Leader. */
  const documented = awardsFor(person, ev, {
    fileRows: [{ area: "General", source: "general", title: "Told a leader: Running late", date: "2026-08-05" }],
    sinceIso: SINCE,
  });
  t("a Tell a Leader record does NOT block", documented.length === 1);

  const recovered = awardsFor(person, ev, {
    fileRows: [{ area: "Recovery", source: "recovery", date: "2026-08-05" }],
    sinceIso: SINCE,
  });
  t("a Recovery Point does NOT block — they earned it", recovered.length === 1);
}

group("3. the window, and dates that cannot be read");
{
  const person = { id: "33" };
  const ev = { decksDone: [{ key: "d1", name: "Deck" }] };
  const old = awardsFor(person, ev, {
    fileRows: [{ area: "Attendance", date: "2026-01-04" }], sinceIso: SINCE,
  });
  t("a write-up from before the window does not block", old.length === 1);

  /* ⚠️ FAIL TOWARD NOT AWARDING. A date that cannot be parsed must not slip
     somebody past the blocker. */
  for (const bad of [{ date: "" }, { date: "sometime last week" }, {}]) {
    const r = awardsFor(person, ev, { fileRows: [{ area: "Attendance", ...bad }], sinceIso: SINCE });
    t(`an unreadable date (${JSON.stringify(bad.date)}) still blocks`, r.length === 0);
  }
}

group("4. it cannot pay twice for the same thing");
{
  const person = { id: "33" };
  const ev = { decksDone: [{ key: "deck-a", name: "Deck A" }, { key: "deck-b", name: "Deck B" }] };
  const first = awardsFor(person, ev, { fileRows: [], sinceIso: SINCE });
  t("two finished decks earn two awards", first.length === 2);
  t("their ids are distinct", new Set(first.map((x) => x.awardId)).size === 2);

  /* Now pretend the first run stored them, and run again — the shape of a cron
     that fires every morning. */
  const stored = first.map((a) => ({ awardId: a.awardId }));
  const second = awardsFor(person, ev, {
    fileRows: [], sinceIso: SINCE, alreadyAwarded: awardedIds(stored),
  });
  t("a second run awards NOTHING", second.length === 0);

  const evPlus = { decksDone: [...ev.decksDone, { key: "deck-c", name: "Deck C" }] };
  const third = awardsFor(person, evPlus, {
    fileRows: [], sinceIso: SINCE, alreadyAwarded: awardedIds(stored),
  });
  t("but a NEW deck still earns", third.length === 1 && /Deck C/.test(third[0].reason));
}

group("5. every award survives tokens.js, which is the only thing that may write");
{
  const person = { id: "33" };
  const ev = { decksDone: [{ key: "d1", name: "Food Safety Basics" }] };
  const [a] = awardsFor(person, ev, { fileRows: [], sinceIso: SINCE });
  const entry = makeEntry({
    personId: a.personId, amount: a.amount, reason: a.reason,
    byId: "hub", type: TYPES.EARN,
  });
  /* ⚠️ makeEntry RETURNS null RATHER THAN A HALF-VALID ENTRY, and refuses a
     blank reason outright — Matt: "no blank reasons ever". If an auto-award
     ever produced one, this is where it would show up rather than in a ledger
     nobody can explain. */
  t("makeEntry accepts it", entry !== null);
  t("the reason is a real sentence", /Finished Food Safety Basics/.test(a.reason));
  t("the amount is whole and positive", Number.isInteger(a.amount) && a.amount > 0);
  t("it lands as an EARN", entry && entry.type === TYPES.EARN);
  t("and the balance moves by exactly that much", balanceOf([entry]) === a.amount);
}

group("6. junk in earns nothing");
{
  t("no person id → nothing", awardsFor({}, { decksDone: [{ key: "d" }] }, { fileRows: [] }).length === 0);
  t("no evidence → nothing", awardsFor({ id: "1" }, {}, { fileRows: [] }).length === 0);
  t("a deck with no key → nothing", awardsFor({ id: "1" }, { decksDone: [{ name: "x" }] }, { fileRows: [] }).length === 0);
  t("a fractional rule amount is refused",
    awardsFor({ id: "1" }, { decksDone: [{ key: "d", name: "D" }] },
      { fileRows: [], rules: [{ id: "training-deck", amount: 1.5, reason: "x" }] }).length === 0);
  t("a zero rule amount is refused",
    awardsFor({ id: "1" }, { decksDone: [{ key: "d", name: "D" }] },
      { fileRows: [], rules: [{ id: "training-deck", amount: 0, reason: "x" }] }).length === 0);
  t("a blank reason is refused",
    awardsFor({ id: "1" }, { decksDone: [{ key: "d", name: "D" }] },
      { fileRows: [], rules: [{ id: "training-deck", amount: 2, reason: "   " }] }).length === 0);
}

console.log(`\n${fail ? `${fail} FAILED, ` : ""}${pass} passed`);
process.exit(fail ? 1 : 0);
