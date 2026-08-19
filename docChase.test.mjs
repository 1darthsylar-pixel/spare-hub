/* ============================================================================
   docChase.test.mjs — one reminder, two days later, to the right people.

       node docChase.test.mjs

   ⛔ WHY. Bri, Aug 14 2026: "Please alert from SOP when docs are sent to sign
   and send a second notification after 2 days for any sent that are not
   signed." The first alert already went at send time. This is the second.

   ⚠️ THE RULES ARE IN docChase.js AND NOT IN worker.js, because nothing in
   checks/ can boot a Worker — so a rule written inline is a rule nobody can
   prove. The Worker reads, sends and stamps; everything that can be WRONG is
   here.
   ============================================================================ */
import { chaseDue, owedByPerson, unsignedOf, hasSigned, chaseTitle, chaseBody, DOC_CHASE_AFTER_DAYS } from "./docChase.js";
import { readFileSync } from "node:fs";

let pass = 0; const fails = [];
const ok = (label, cond, extra) => {
  if (cond) { pass++; console.log("  ok    " + label); }
  else { fails.push(label); console.log(`  FAIL  ${label}${extra === undefined ? "" : "  " + JSON.stringify(extra)}`); }
};
const group = (n) => console.log(`\n── ${n}`);

const NOW = Date.parse("2026-08-19T12:00:00Z");
const ago = (d) => new Date(NOW - d * 24 * 60 * 60 * 1000).toISOString();
const send = (over) => ({
  id: "snd_1", docTitle: "Point Performance System", signRequired: true,
  createdAt: ago(3), targetIds: ["26", "41"], acks: {}, ...over,
});

group("0. controls");
{
  ok("two days is the rule Bri asked for", DOC_CHASE_AFTER_DAYS === 2, DOC_CHASE_AFTER_DAYS);
  ok("★ the plain fixture IS due, or nothing below means anything",
    chaseDue([send()], NOW).length === 1);
}

group("1. what makes a send due");
{
  ok("★★★ three days old with nobody signed is due", chaseDue([send()], NOW).length === 1);
  ok("★★★ one day old is NOT due — the whole point is the delay",
    chaseDue([send({ createdAt: ago(1) })], NOW).length === 0);
  ok("exactly two days old is due", chaseDue([send({ createdAt: ago(2) })], NOW).length === 1);
  ok("a shade under two days is not", chaseDue([send({ createdAt: ago(1.99) })], NOW).length === 0);
  ok("★★ a document shared for reference is never chased — it is not a debt",
    chaseDue([send({ signRequired: false })], NOW).length === 0);
  ok("★★★ ALREADY CHASED IS NEVER CHASED AGAIN. One reminder per send, not one a day",
    chaseDue([send({ chasedAt: ago(1) })], NOW).length === 0);
  ok("★★ everybody signed means nothing is owed",
    chaseDue([send({ acks: { 26: { at: ago(1) }, 41: { at: ago(1) } } })], NOW).length === 0);
  ok("★ one of two signed still leaves a debt",
    chaseDue([send({ acks: { 26: { at: ago(1) } } })], NOW).length === 1);
  ok("★★ a broken date is NOT due — otherwise it reads as infinitely old",
    chaseDue([send({ createdAt: "whenever" })], NOW).length === 0);
  ok("no date at all is not due", chaseDue([send({ createdAt: "" })], NOW).length === 0);
  ok("a future date is not due", chaseDue([send({ createdAt: ago(-5) })], NOW).length === 0);
  ok("nobody targeted is not due", chaseDue([send({ targetIds: [] })], NOW).length === 0);
}

group("2. nothing here may throw on a half-built record");
{
  ok("no list", chaseDue(null, NOW).length === 0 && chaseDue(undefined, NOW).length === 0);
  ok("not an array", chaseDue("nope", NOW).length === 0);
  ok("a null row", chaseDue([null, send()], NOW).length === 1);
  ok("targetIds missing", chaseDue([send({ targetIds: undefined })], NOW).length === 0);
  ok("targetIds not an array", chaseDue([send({ targetIds: "26" })], NOW).length === 0);
  ok("acks not an object", chaseDue([send({ acks: "yes" })], NOW).length === 1);
  ok("acks is an array", chaseDue([send({ acks: [] })], NOW).length === 1);
  ok("★ a bad now is nothing due, never everything due", chaseDue([send()], NaN).length === 0);
  ok("a bad now as a string is nothing due", chaseDue([send()], "today").length === 0);
}

group("3. ids compare as strings — a number must not read as unsigned");
{
  /* ⚠️ THE REAL SHAPE. A target list can hold "26" while an acks map is keyed
     26, and one of them arriving as a number would chase somebody who has
     already signed. Being chased for something you did is the complaint that
     gets a reminder switched off. */
  /* ⚠️ THE FIRST VERSION OF THIS SECTION WAS VACUOUS AND I ONLY FOUND OUT BY
     BREAKING THE CODE ON PURPOSE. It asserted `hasSigned(rec, 26)` equals
     `hasSigned(rec, "26")` — but JavaScript object keys are strings, so
     `acks[26]` and `acks["26"]` are the same lookup and removing the String()
     changed nothing. A test that passes with the guard deleted is not a test.
     ⇒ WHAT ACTUALLY DEPENDS ON IT is the id TYPE that comes back out.
     owedByPerson uses these as Map keys and the Worker looks each one up
     against the roster; a Map keyed 26 and a lookup for "26" miss each other,
     and the person is silently never chased. */
  ok("★★★ AN UNSIGNED ID COMES BACK AS A STRING, whatever went in",
    unsignedOf({ targetIds: [26, "41"], acks: {} }).every((v) => typeof v === "string"),
    unsignedOf({ targetIds: [26, "41"], acks: {} }).map((v) => typeof v));
  ok("★★★ so a numeric target lands under a string Map key",
    owedByPerson([send({ targetIds: [26], acks: {} })]).has("26"));
  ok("★★ and NOT under a numeric one", !owedByPerson([send({ targetIds: [26], acks: {} })]).has(26));
  ok("hasSigned reads either shape", hasSigned({ acks: { 26: { at: "x" } } }, 26) === true
    && hasSigned({ acks: { 26: { at: "x" } } }, "26") === true);
  ok("★★ so a numeric target list does not get chased",
    chaseDue([send({ targetIds: [26, 41], acks: { 26: { at: "x" }, 41: { at: "x" } } })], NOW).length === 0);
  ok("somebody genuinely unsigned still is", unsignedOf(send({ acks: { 26: 1 } })).join() === "41");
  ok("a falsy ack value is not a signature", hasSigned({ acks: { 26: 0 } }, "26") === false);
  ok("no acks at all", unsignedOf(send()).join() === "26,41");
}

group("4. one message per person, listing everything they owe");
{
  const due = [
    send({ id: "a", docTitle: "Handbook", targetIds: ["26", "41"] }),
    send({ id: "b", docTitle: "Allergen Policy", targetIds: ["26"], acks: {} }),
    send({ id: "c", docTitle: "Signed Already", targetIds: ["41"], acks: { 41: { at: "x" } } }),
  ];
  const owed = owedByPerson(due);
  ok("★★★ two people owe something, not three rows", owed.size === 2, [...owed.keys()]);
  ok("★★ the person on two documents gets ONE entry with both",
    (owed.get("26") || []).length === 2, owed.get("26"));
  ok("★ in the order they were sent, oldest debt first",
    (owed.get("26") || []).join(" | ") === "Handbook | Allergen Policy");
  ok("★★ somebody who signed is not listed for that document",
    (owed.get("41") || []).join() === "Handbook", owed.get("41"));
  ok("nobody owes an empty list", [...owed.values()].every((v) => v.length > 0));
  ok("an untitled document still has words", owedByPerson([send({ docTitle: "" })]).get("26")[0] === "Untitled document");
  ok("no due list is an empty map", owedByPerson(null).size === 0 && owedByPerson(undefined).size === 0);
}

group("5. one set of words for the push and the DM");
{
  ok("one document, singular", chaseTitle(1) === "A document needs your signature");
  ok("two, plural and counted", chaseTitle(2) === "2 documents need your signature");
  ok("★ the body names the single document", chaseBody(["Handbook"]).includes("\"Handbook\""));
  ok("★★ and never lists them all when there are several — that is the DM's job",
    chaseBody(["a", "b", "c"]) === "3 documents are still waiting for your signature.");
  ok("no titles does not throw", typeof chaseBody(null) === "string");
  /* ⚠️ THE COUNTS MUST AGREE. A title saying 2 beside a body saying 3 is how
     somebody opens the Hub looking for the wrong number of things. */
  [1, 2, 5].forEach((n) => {
    const titles = Array.from({ length: n }, (_, i) => `Doc ${i + 1}`);
    ok(`title and body agree at ${n}`,
      n === 1 ? chaseBody(titles).includes("Doc 1") : chaseBody(titles).startsWith(String(n)) && chaseTitle(n).startsWith(String(n)));
  });
}

group("6. the Worker really uses this, and reads strictly");
{
  const W = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
  ok("worker.js was read (control)", W.length > 500000, String(W.length));
  ok("★★ it imports the rules rather than repeating them",
    /import \{[^}]*chaseDue[^}]*\} from "\.\/docChase\.js"/.test(W));
  ok("★★ and calls them", W.includes("chaseDue(list, Date.now())") && W.includes("owedByPerson(due)"));
  ok("★★ the inline copies are gone",
    !W.includes("const cutoff = Date.now() - DOC_CHASE_AFTER_DAYS"));
  /* ⚠️⚠️ THE ONE THAT MATTERS MOST. sbGet answers null for "no key" and for
     "Supabase said no" alike. Reading this list loosely means the job reports a
     clean run on the day it is blindest, and worse, could stamp records as
     chased that were never chased. */
  ok("★★★ THE SENDS LIST IS READ STRICTLY, so a refused read is not an empty one",
    W.includes('await sbGetStrict(env, "gcfcr-hr-docsends-v1")'));
  ok("★★ it re-reads before stamping, so a signature made mid-run is not erased",
    W.includes("const fresh = await sbGetStrict(env, \"gcfcr-hr-docsends-v1\");"));
  ok("★★ nothing sent means nothing stamped",
    W.includes("if (!people) return { checked: list.length, chased: 0, people: 0, noReach };"));
  /* ⚠️⚠️ THE SLACK ARM IS A PER-STORE BINDING, NOT A typeof GUARD. `dmPerson`
     exists at some stores and not others, and worker.js travels to all of them.
     A `typeof` check reads as careful and is not — the scope check cannot see
     through it and reports an undefined name in exactly the repos where the
     name really is undefined. One visible line per store is the honest shape.
     ⚠️ THIS ASSERTS THE SHAPE, NOT WHICH WAY THIS STORE IS SET. A store with no
     Slack is a real, correct state; a store where the binding has gone missing
     is not. */
  ok("★★ the Slack arm is a named per-store binding", /^const chaseDm = (dmPerson|null);$/m.test(W),
    (W.match(/^const chaseDm = .*$/m) || ["absent"])[0]);
  ok("★★ and the job calls it through that binding, never a bare helper",
    W.includes("if (name && chaseDm) {") && W.includes("await chaseDm(env, { name },")
    /* ⚠️ THE NEGATIVE IS SCOPED TO CODE, NOT PROSE. The first version of this
       matched the explanatory COMMENT above chaseDm, which quotes the pattern
       it is warning against — so the assertion failed on a file that was
       already correct. A grep that cannot tell code from a comment about code
       reports the opposite of the truth. */
    && !/if \(name && typeof dmPerson/.test(W));
  ok("★ the job is registered so the sweep can report it late or dead",
    /"doc-chase",/.test(W) && /job === "doc-chase"/.test(W));
}

console.log(`\n${fails.length ? "FAILED" : "PASSED"}  ${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log("  · " + f)); process.exit(1); }
