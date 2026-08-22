/* ============================================================================
   signInState.test.mjs — HR Console can say who has actually been in.

       node signInState.test.mjs

   ★ WHY. Matt, Aug 17 2026, wanting to know whether the Village had started
   using its Hub before nudging anybody: answering it took a database query,
   because nothing on any screen said. `readPinSet` flattened every PIN record
   to `true`, throwing away the one field that tells the difference.

   The field is `mustChange`, and worker.js only ever writes it when somebody
   ELSE sets your PIN (`byOther`). Setting your own writes `{h,s}` with no flag.
   So its presence is a reliable "has not finished a first sign-in".

   ⚠️⚠️ THE CONSTRAINT THAT MATTERS MOST IS THAT NOTHING ELSE MAY MOVE.
   `hasPin` is `!!pinSet[id]` and half a dozen call sites lean on it, including
   the box that refuses to open when a PIN is missing. Section 2 is that.

   ⚠️ AND IT IS EVIDENCE ABOUT THE PIN, NOT THE PERSON. Somebody could open the
   page, see the PIN box and back out; this still reads temp. It cannot say
   "never looked", only "never finished", and the screen has to use those words.
   ============================================================================ */
import assert from "node:assert";

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log(`  ok    ${name}`); pass++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${e.message}`); fail++; }
};

/* The reader's rule, as shipped in HRConsole.jsx. Kept here rather than
   imported because that file is a .jsx the node runner cannot load. */
const readPins = (raw) => {
  const out = {};
  const src = raw && typeof raw === "object" ? raw : {};
  Object.keys(src).forEach((id) => {
    const rec = src[id];
    out[id] = rec && typeof rec === "object" && rec.mustChange ? "temp" : "own";
  });
  return out;
};
const signInSplit = (team, pinSet) => {
  const pins = pinSet && typeof pinSet === "object" ? pinSet : {};
  const rows = Array.isArray(team) ? team : [];
  let own = 0, temp = 0;
  rows.forEach((p) => {
    const s = p && p.id != null ? pins[String(p.id)] : null;
    if (s === "own") own += 1; else if (s === "temp") temp += 1;
  });
  return { own, temp, none: Math.max(0, rows.length - own - temp), total: rows.length };
};

/* The Village's real shape, with fake names. */
const RAW = {
  "1": { h: "x", s: "y" },                    // set their own
  "2": { h: "x", s: "y", mustChange: true },  // temp, never used
  "3": { h: "x", s: "y", mustChange: true },
};
const TEAM = [{ id: "1" }, { id: "2" }, { id: "3" }, { id: "4" }, { id: "5" }];

/* ── 1. the three states ─────────────────────────────────────────────────── */
console.log("\n1. who has been in");

t("a self-set PIN reads as own", () => assert.equal(readPins(RAW)["1"], "own"));
t("a PIN set by somebody else reads as temp", () => assert.equal(readPins(RAW)["2"], "temp"));
t("no record at all is absent, not a state", () => assert.equal(readPins(RAW)["4"], undefined));

t("a legacy bare-string record counts as own, not a fourth state", () => {
  /* worker.js reads a bare string as "no flag, fine". Inventing a fourth state
     here would disagree with the thing that actually checks the PIN. */
  assert.equal(readPins({ "9": "1234" })["9"], "own");
});

t("the split matches the Village's real numbers", () => {
  const s = signInSplit(TEAM, readPins(RAW));
  assert.deepEqual(s, { own: 1, temp: 2, none: 2, total: 5 });
});

/* ── 2. ⚠️ NOTHING ELSE MAY MOVE ─────────────────────────────────────────── */
console.log("\n2. hasPin answers exactly as before");

t("⚠️⚠️ BOTH STATES ARE TRUTHY, so hasPin is unchanged", () => {
  /* The box that refuses to open when a PIN is missing reads !!pinSet[id]. A
     falsy value here would lock somebody out of their own PIN change. */
  const p = readPins(RAW);
  assert.equal(!!p["1"], true);
  assert.equal(!!p["2"], true);
  assert.equal(!!p["4"], false);
});

t("a broken or missing map is an empty object, never a throw", () => {
  assert.deepEqual(readPins(null), {});
  assert.deepEqual(readPins("nope"), {});
  assert.deepEqual(signInSplit(null, null), { own: 0, temp: 0, none: 0, total: 0 });
});

t("a roster row with no id is not counted as signed in", () => {
  const s = signInSplit([{ id: "1" }, {}, null], readPins(RAW));
  assert.equal(s.own, 1);
  assert.equal(s.none, 2);
});

t("⚠️ none can never go negative", () => {
  /* More PIN records than roster rows is a real shape — somebody removed from
     the roster whose PIN was left behind. The summary must not read "-1". */
  const s = signInSplit([{ id: "1" }], readPins(RAW));
  assert.ok(s.none >= 0, `none was ${s.none}`);
});

console.log(`\n${fail ? "FAILED" : "PASSED"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
