/* ============================================================================
   assignedInstructor.test.mjs — an assignment is what switches a week on, and
   the badge clears when you answer.

       node assignedInstructor.test.mjs

   ⛔ TWO THINGS BRI AND MATT REPORTED ON Aug 19 2026, both of which looked done
   and were not.

   1. Bri: "still need to solve Brandon and Daisy (and any other assigned
      instructors) being able to gain automatic access to the instructor view
      until removed. They need to be able to view any answer keys as well."
      In the live class `weekHasInstructors` answered from a set of FOUR FIXED
      IDS. Assigning somebody to Week 1, Week 4, or any week Bri has made since
      saved fine, showed them as an instructor, and gave them nothing.

   2. Matt: "I accepted the meeting but the alert won't clear." The badge count
      was fetched in an effect keyed on `[user]` — once, at load, never again.

   ⚠️ ONE OF THESE IS A PURE FUNCTION AND ONE IS WIRING. The first is tested by
   running it. The second is a grep and says so, because a React effect cannot
   be driven from Node — but both halves carry a control that must be FOUND.
   ============================================================================ */
import { weekHasInstructors, weekHasAssignees, isTemplateNs, INSTRUCTOR_WEEKS } from "./instructorWeeks.js";
import { readFileSync } from "node:fs";

let pass = 0; const fails = [];
const ok = (label, cond, extra) => {
  if (cond) { pass++; console.log("  ok    " + label); }
  else { fails.push(label); console.log(`  FAIL  ${label}${extra === undefined ? "" : "  " + JSON.stringify(extra)}`); }
};
const group = (n) => console.log(`\n── ${n}`);

const LIVE = "gcfcr:l101";
const TPL = "gcfcr:l101tpl";
const MAP = { "wkmsku2vax772": [{ id: "51", name: "A Director" }], w4: [{ id: "52" }] };

group("0. controls — nothing about the old behaviour was thrown away");
{
  ok("★ the baseline set is still W2 and W3", INSTRUCTOR_WEEKS.has("w2") && INSTRUCTOR_WEEKS.has("w3"));
  ok("★★ W2 still qualifies with NOBODY assigned — that is the original spec",
    weekHasInstructors("w2", LIVE, {}) === true);
  ok("★★ and with no map at all, exactly as before this argument existed",
    weekHasInstructors("w2", LIVE) === true && weekHasInstructors("w3", LIVE) === true);
  ok("★ the template is still every week", weekHasInstructors("anything", TPL) === true);
  ok("isTemplateNs still reads the last segment", isTemplateNs(TPL) && !isTemplateNs(LIVE));
}

group("1. the bug — a week nobody could switch on");
{
  ok("★★★ WEEK 4 WITH NOBODY ASSIGNED IS STILL OFF", weekHasInstructors("w4", LIVE, {}) === false);
  ok("★★★ WEEK 4 WITH SOMEBODY ASSIGNED IS ON", weekHasInstructors("w4", LIVE, MAP) === true);
  /* ⚠️ THE ONE THE SET COULD NEVER REACH. A week Bri created gets a generated
     key, so it can never be in a list written yesterday. */
  ok("★★★ A WEEK CREATED AFTER THE LIST WAS WRITTEN IS ON",
    weekHasInstructors("wkmsku2vax772", LIVE, MAP) === true);
  ok("★★ and a generated week with nobody on it is off",
    weekHasInstructors("wkmsku2vax772", LIVE, {}) === false);
  ok("★ week 1 is still off", weekHasInstructors("w1", LIVE, MAP) === false);
  ok("★ welcome is still off", weekHasInstructors("welcome", LIVE, MAP) === false);
}

group("2. what counts as assigned");
{
  ok("a list with somebody in it", weekHasAssignees({ w4: [{ id: "1" }] }, "w4") === true);
  ok("★★ AN EMPTY LIST IS NOT ASSIGNED — removing the last person turns it back off",
    weekHasAssignees({ w4: [] }, "w4") === false);
  ok("a week that is not in the map", weekHasAssignees({ w4: [{ id: "1" }] }, "w1") === false);
  ok("no map", weekHasAssignees(null, "w4") === false && weekHasAssignees(undefined, "w4") === false);
  ok("map is not an object", weekHasAssignees("w4", "w4") === false);
  ok("the value is not an array", weekHasAssignees({ w4: { id: "1" } }, "w4") === false);
  ok("no week id", weekHasAssignees(MAP, "") === false && weekHasAssignees(MAP, null) === false);
  /* ⚠️ INHERITED KEYS ARE NOT WEEKS. */
  ok("★ 'constructor' is not a week", weekHasAssignees(MAP, "constructor") === false);
  ok("★ 'toString' is not a week", weekHasAssignees(MAP, "toString") === false);
  ok("a number id still reads", weekHasAssignees({ 4: [{ id: "1" }] }, 4) === true);
}

group("3. a failed read must not switch W2 and W3 off");
{
  /* ⚠️ THE SAFE DIRECTION, AND IT IS WHY THE SET STAYED. Losing the instructor
     notes on the two weeks that have always had them, because one read
     dropped, is a much worse day than not yet seeing a newly assigned week. */
  ok("★★★ null map: W2 and W3 SURVIVE",
    weekHasInstructors("w2", LIVE, null) === true && weekHasInstructors("w3", LIVE, null) === true);
  ok("★★ null map: a newly assigned week is simply not on yet",
    weekHasInstructors("w4", LIVE, null) === false);
  ok("★ the template is unaffected by a failed read", weekHasInstructors("w9", TPL, null) === true);
}

group("4. the class hands the map to the rule");
{
  const L = readFileSync(new URL("./Leadership101.jsx", import.meta.url), "utf8");
  ok("Leadership101.jsx was read (control)", L.length > 100000, String(L.length));
  ok("★★ it loads the assignments for the class, not only for a panel",
    /const \[assignsAll, setAssignsAll\] = useState\(null\);/.test(L));
  ok("★★★ and BOTH callers pass it — one missed caller is the whole bug again",
    /* ⚠️ NESTED PARENS. The first call site is
       \`weekHasInstructors(keyOf(w), PG.ns, assignsAll)\` and a \`[^)]*\` stops
       dead at the \`)\` inside keyOf(w) — so this reported ONE caller on a file
       with two correct ones. The assertion was wrong, not the code. */
    (L.match(/weekHasInstructors\((?:[^()]|\([^()]*\))*assignsAll\)/g) || []).length === 2,
    (L.match(/weekHasInstructors\(/g) || []).length);
  ok("★★ a failed read passes null, never an empty map",
    /setAssignsAll\(a\.ok \? a\.map : null\)/.test(L));
  /* ⚠️ THE ANSWER KEY RIDES ON THIS. iView is what QuizItem and MatchItem are
     handed as `instructor`, and an assigned instructor is one of its arms. */
  const W = readFileSync(new URL("./L101Week.jsx", import.meta.url), "utf8");
  ok("★★★ an assigned instructor is still an arm of iView",
    /const iView = mayEdit \|\| \(isInstructor && instructorView && !preview\) \|\| \(assigned && !preview\);/.test(W));
  ok("★★★ and iView is what the items are handed as `instructor`",
    /instructor=\{iView\}/.test(W));
  ok("★★ so the quiz answer key reaches an assigned instructor",
    /case "quiz": return <QuizItem item=\{item\} P=\{P\} instructor=\{instructor\} \/>;/.test(W));
  ok("★★ and the matching key too",
    /case "match": return <MatchItem item=\{item\} P=\{P\} instructor=\{instructor\} \/>;/.test(W));
}

group("5. the calendar badge clears when you answer");
{
  const A = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  const C = readFileSync(new URL("./CalendarInvites.jsx", import.meta.url), "utf8");
  ok("both files were read (control)", A.length > 100000 && C.length > 20000);
  ok("★★★ ANSWERING FIRES THE EVENT", C.includes(`new CustomEvent("hub:calendar-answered")`));
  ok("★★★ AND THE HEADER LISTENS FOR IT",
    A.includes(`window.addEventListener("hub:calendar-answered", onAnswered)`));
  ok("★★ it removes the listener again", A.includes(`window.removeEventListener("hub:calendar-answered", onAnswered)`));
  ok("★★★ the count is ONE function, called by both the load and the event",
    /const refreshCalPending = useCallback\(/.test(A)
    && (A.match(/refreshCalPending\(\)/g) || []).length >= 2);
  /* ⚠️ THE EVENT CARRIES NO NUMBER. A count sent from the tile would be a second
     answer to "how many are waiting", and this file already records what two
     answers to one question cost. */
  ok("★★ the event carries no count", !/hub:calendar-answered", \{ detail/.test(C));
  ok("★ the count still comes from awaitingReply, the one rule", A.includes("awaitingReply(evs, d.uid, d.myReplies)"));
}

group("6. a red digit is not an alert");
{
  const A = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  /* Bri: "I see a red digit, but I don't see any wording that tells me where to
     go" and "I still don't know where these are able to be viewed and signed." */
  ok("★★★ THE TILE SAYS WHAT IS WAITING AND WHERE TO GO",
    A.includes("waiting for you to sign — open your own file"));
  ok("★★ singular and plural are both written", /1 document waiting for you to sign/.test(A)
    && /\$\{docsToSign\} documents waiting for you to sign/.test(A));
  ok("★★★ AND IT DOES NOT OVERWRITE A REAL INPUT WARNING — two claims on one row and the store reads neither",
    /docsToSign > 0 && !toolInputStatusRaw\.hr/.test(A));
  ok("★ it reuses the row that already exists rather than adding a banner",
    A.includes("const toolInputStatus = docsToSign > 0"));
}

console.log(`\n${fails.length ? "FAILED" : "PASSED"}  ${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log("  · " + f)); process.exit(1); }
