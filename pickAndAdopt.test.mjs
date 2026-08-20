/* ============================================================================
   pickAndAdopt.test.mjs — finding one person in a list of a hundred, and
   giving a week somewhere to land.

       node pickAndAdopt.test.mjs

   ⛔ WHY. Matt, Aug 19 2026: "I would like the same view as Lineup for the list
   of people to invite to a meeting." The picker was every person on the roster
   at once, as a wall of chips — at ~106 people that is a very long scroll to
   find one name, with no search and no way to see who you had already picked.

   ⚠️⚠️ THE ONE THAT MATTERS IS SECTION 2. Somebody already picked stays on
   screen even when they do not match what you are typing. Filter them out and
   typing a second name makes the first one vanish: the selection is still in
   state so nothing is lost, but the person sending the invitation cannot SEE
   who is on it and has no way to take one off. A picker you cannot review
   before you press send is worse than a long list.
   ============================================================================ */
import { invitePickList } from "./calendarStore.js";
import { readFileSync } from "node:fs";

let pass = 0; const fails = [];
const ok = (label, cond, extra) => {
  if (cond) { pass++; console.log("  ok    " + label); }
  else { fails.push(label); console.log(`  FAIL  ${label}${extra === undefined ? "" : "  " + JSON.stringify(extra)}`); }
};
const group = (n) => console.log(`\n── ${n}`);

/* Names off the real screen, including the two orderings that gave it away. */
const TEAM = [
  { id: "1", name: "Denise Watlington" },
  { id: "2", name: "Brooke Southern" },
  { id: "3", name: "Daisy Hernandez Espitia" },
  { id: "4", name: "Hannah Jackson" },
  { id: "5", name: "Ana Turcios" },
  { id: "6", name: "Anais Sanchez" },
  { id: "7", name: "Matt Jackson" },
];
const ME = "7";
const names = (r) => r.map((p) => p.name);

group("0. controls");
{
  ok("★ the fixture is not already sorted (control)",
    TEAM[0].name > TEAM[1].name, [TEAM[0].name, TEAM[1].name]);
  ok("★ everybody shows with no query", invitePickList(TEAM, "", [], ME).length === 6);
}

group("1. the search, which is the whole ask");
{
  ok("★★★ typing narrows the list", names(invitePickList(TEAM, "ana", [], ME)).join() === "Ana Turcios,Anais Sanchez",
    names(invitePickList(TEAM, "ana", [], ME)));
  ok("★ it matches a surname too", names(invitePickList(TEAM, "jackson", [], ME)).join() === "Hannah Jackson");
  ok("★ case does not matter", invitePickList(TEAM, "DENISE", [], ME).length === 1);
  ok("★ whitespace is trimmed", invitePickList(TEAM, "  brooke  ", [], ME).length === 1);
  ok("a middle name matches", invitePickList(TEAM, "hernandez", [], ME).length === 1);
  ok("no match is an empty list, not everybody", invitePickList(TEAM, "zzz", [], ME).length === 0);
}

group("2. ★★★ SOMEBODY ALREADY PICKED NEVER DISAPPEARS");
{
  const picked = ["1"];   // Denise
  const shown = names(invitePickList(TEAM, "brooke", picked, ME));
  ok("★★★ THE PICKED PERSON IS STILL ON SCREEN while searching for somebody else",
    shown.includes("Denise Watlington"), shown);
  ok("★★ and so is the one being searched for", shown.includes("Brooke Southern"), shown);
  ok("★★ and nobody else is", shown.length === 2, shown);
  ok("★★ several picked all stay",
    names(invitePickList(TEAM, "zzz", ["1", "2", "3"], ME)).length === 3);
  ok("★ picking nobody and matching nobody is empty",
    invitePickList(TEAM, "zzz", [], ME).length === 0);
}

group("3. sorted by name, because the roster's own order is not predictable");
{
  const shown = names(invitePickList(TEAM, "", [], ME));
  ok("★★ alphabetical", shown.join("|") === [...shown].sort().join("|"), shown);
  ok("★ Brooke now comes before Denise, which she did not on the real screen",
    shown.indexOf("Brooke Southern") < shown.indexOf("Denise Watlington"));
  ok("★ Daisy now comes before Hannah",
    shown.indexOf("Daisy Hernandez Espitia") < shown.indexOf("Hannah Jackson"));
}

group("4. never yourself");
{
  ok("★★★ the caller is not in their own invite list",
    !names(invitePickList(TEAM, "", [], ME)).includes("Matt Jackson"));
  ok("★★ not even when searched for", invitePickList(TEAM, "matt", [], ME).length === 0);
  ok("★ with no myId, nobody is removed", invitePickList(TEAM, "", [], null).length === 7);
  ok("★ a tm-prefixed id still matches the bare one",
    !names(invitePickList(TEAM, "", [], "tm7")).includes("Matt Jackson"));
}

group("5. nothing here may throw");
{
  ok("no people", invitePickList(null, "", [], ME).length === 0);
  ok("people is not an array", invitePickList("everyone", "", [], ME).length === 0);
  ok("a null person is skipped", invitePickList([null, ...TEAM], "", [], ME).length === 6);
  ok("a person with no name is skipped", invitePickList([{ id: "9" }, ...TEAM], "", [], ME).length === 6);
  ok("picked is not an array", invitePickList(TEAM, "zzz", "1", ME).length === 0);
  ok("query is null", invitePickList(TEAM, null, [], ME).length === 6);
  ok("query is undefined", invitePickList(TEAM, undefined, [], ME).length === 6);
  ok("query is a number", invitePickList(TEAM, 5, [], ME).length === 0);
}

group("6. the screen really uses it");
{
  const C = readFileSync(new URL("./CalendarInvites.jsx", import.meta.url), "utf8");
  ok("CalendarInvites.jsx was read (control)", C.length > 20000, String(C.length));
  ok("★★ the list comes from the rule, not from an inline filter",
    C.includes("invitePickList(people, pickQuery, picked, myId).map"));
  ok("★★★ AND THE OLD INLINE FILTER IS GONE",
    !C.includes("people.filter((p) => !sameId(p.id, myId)).map"));
  ok("★★ there is a search box over it", C.includes('placeholder="Search the team"'));
  ok("★ it says how many are picked", C.includes("{picked.length} picked"));
  /* ⚠️ CLEARING MATTERS. Taking twenty names off one at a time is how somebody
     sends the wrong invitation rather than starting again. */
  ok("★★ and there is one tap to clear them", C.includes("setPicked([])"));
  ok("★ the box empties when the form does", /setClash\(null\); setPickQuery\(""\);/.test(C));
  /* Lineup's own box, so the wording is the one the store already knows.
     ⚠️⚠️ GUARDED, AND IT HAD TO LEARN THAT THE HARD WAY. The Village has no
     Availability.jsx at all — it has none of the Lineup files — so an unguarded
     read here threw ENOENT and took every assertion after it down with a stack
     trace instead of printing one named result. A store without Lineup is a
     real, correct state; it is not a failure, and it must not read as one. */
  let A = null;
  try { A = readFileSync(new URL("./Availability.jsx", import.meta.url), "utf8"); } catch { A = null; }
  if (A === null) {
    console.log("  --    Lineup is not installed at this store, so there is no box to match");
  } else {
    ok("★★ the words match Lineup's box exactly (control)", A.includes('placeholder="Search the team"'));
  }
}


/* ══════════════════════════════════════════════════════════════════════════
   AND THE WEEK THAT HAD NO HOME.

   Matt, Aug 19 2026: "Build it." Copy Class fills a week that EXISTS, so a
   template with eight weeks landing on a live class with five left three of
   them on "No home here for Week 6, 7, 8 — so they stay behind." The answer
   was to duplicate a week by hand for each one and come back. This is a grep
   and says so: the button lives in a .jsx and writes through React state, so
   what is asserted is that it exists, that it is wired, and that it can only
   ADD. ══════════════════════════════════════════════════════════════════════ */
{
  const L = readFileSync(new URL("./Leadership101.jsx", import.meta.url), "utf8");
  ok("Leadership101.jsx was read (control)", L.length > 100000, String(L.length));
  ok("★★★ THERE IS A BUTTON WHERE THE PROBLEM IS REPORTED",
    /Add " \+ plan\.noHome\.length \+ " class"/.test(L));
  ok("★★ it is handed the weeks with NO match, which is what makes it safe to add",
    L.includes("onAddWeeks(plan.noHome)"));
  ok("★★ the parent supplies it", /onAddWeeks=\{adoptWeeks\}/.test(L));
  ok("★★ and CopyClass takes it", /function CopyClass\(\{ PG, weeks, prepWork, onPrep, onAddWeeks, onClose \}\)/.test(L));
  /* ⚠️ CONTENT BEFORE THE WEEK LIST, the same order duplicateWeek uses: the
     other way round shows a class on screen that opens blank if the second
     write fails. */
  ok("★★★ the content is written BEFORE the week list",
    L.indexOf("await kvWrite(contentKey(key), next)") < L.indexOf("made.forEach((w) => copy.push(w))"));
  ok("★★ a week that will not read is named, not silently dropped",
    L.includes("if (!got.ok) { failed.push(label); continue; }"));
  ok("★★ numbers continue from THIS class, never from the source",
    L.includes("let maxN = weeks.reduce((m, x) => Math.max(m, Number(x.n) || 0), 0);"));
  /* ⚠️ THE PLAN IS STALE ONCE A WEEK IS ADDED. Leaving it up offers a copy
     into a row that has moved. */
  ok("★★ the stale plan is cleared afterwards", L.includes("setPlan(null); setFromNs(\"\");"));
  ok("★ and the result line says which thing happened",
    L.includes("{done.added ? \"Added\" : \"Copied\"}"));
}

console.log(`\n${fails.length ? "FAILED" : "PASSED"}  ${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log("  · " + f)); process.exit(1); }
