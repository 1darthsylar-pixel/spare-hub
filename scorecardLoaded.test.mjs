/* ============================================================================
   scorecardLoaded.test.mjs — can the Business Scorecard hang on "Loading"?

       node scorecardLoaded.test.mjs

   ⚠️⚠️ THE BUG. This tile had two states: it had data, or it did not, and it
   read "no data" as "still coming". That is wrong, because `seedCopy()` returns
   **null** when the seed arrives empty — and `setData(null)` is a FINISHED load
   with nothing in it, which looked identical to a load that had not started.

   Three ordinary things produce it at a store that is not the origin store:

     · the seed route answers 401 on an expired token
     · it answers 403 to anyone who is not a finance reader
     · the store has no saved record yet AND no seed

   All three are permanent. So the spinner never cleared, and the screen that
   would have let somebody fix it sits below that early return.

   GuestExperience hit exactly this and fixed it with a `loaded` flag. This
   sibling tile was missed. That is the pattern worth testing for.

   ⚠️ THE TRIGGER IS TESTED, NOT JUST THE SHAPE. `seedCopy` is lifted out of the
   file as text and run against the three seed shapes that actually arrive, so
   this fails if the null case ever stops being reachable OR stops being handled.
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(DIR, "BusinessScorecard.jsx"), "utf8");

let pass = 0, fail = 0;
const t = (label, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL  ${label}`); } };
const group = (n) => console.log(`\n── ${n}`);

/* ═══ THE TRIGGER ═════════════════════════════════════════════════════════ */
group("seedCopy — the thing that produces a null data");
{
  const line = src.match(/const seedCopy = .*$/m);
  t("seedCopy was found in the file", !!line);
  if (line) {
    const make = (seed) => {
      const hasSeed = !!(seed && Array.isArray(seed.sections));
      return new Function("seed", "hasSeed", `${line[0]}; return seedCopy();`)(seed, hasSeed);
    };
    /* ⚠️ THE CONTROL FIRST. A seedCopy that returned null for everything would
       satisfy every "it is null" assertion below and prove nothing. */
    const good = make({ sections: [{ rows: [] }] });
    t("a real seed copies (control)", !!good && Array.isArray(good.sections));
    t("and it is a COPY, not the seed itself", (() => {
      const seed = { sections: [{ rows: [] }] };
      const out = new Function("seed", "hasSeed", `${line[0]}; return seedCopy();`)(seed, true);
      out.sections[0].rows.push("x");
      return seed.sections[0].rows.length === 0;
    })());

    /* the three shapes that actually arrive at a clone */
    t("an empty seed {} gives NULL — this is the trigger", make({}) === null);
    t("a 401/403 body with no seed gives NULL", make(null) === null);
    t("a seed whose sections are not an array gives NULL", make({ sections: "nope" }) === null);
  }
}

/* ═══ THE FLAG ════════════════════════════════════════════════════════════ */
group("loaded — says the fetch finished, whatever it found");
{
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  t("the flag exists and starts false", /const \[loaded, setLoaded\] = useState\(false\)/.test(code));

  /* ⚠️ IN A `finally`. The load effect has five early returns. A flag set after
     them is set on one path out of six, which is the same spinner with extra
     steps. */
  const effect = code.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[\]\);/);
  t("the load effect was found", !!effect);
  t("IT IS SET IN A finally, not after the returns",
    !!effect && /\}\s*finally\s*\{[\s\S]*?setLoaded\(true\)/.test(effect[0]));
  t("and only while the component is still mounted",
    !!effect && /if \(alive\) setLoaded\(true\)/.test(effect[0]));
  t("nothing else sets it", (code.match(/setLoaded\(/g) || []).length === 1);
}

/* ═══ THE SCREEN ══════════════════════════════════════════════════════════ */
group("what the two situations render");
{
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const gate = code.match(/if \(!data\) \{[\s\S]*?\n  \}/);
  t("the no-data early return was found", !!gate);
  /* ⚠️ `[\s(]*` BECAUSE JSX WRAPS THE BRANCH IN PARENTHESES. The first cut of
     this assertion did not allow for the "(" and failed a file that was right —
     which is the whole reason the rule is to suspect the assertion first. */
  t("still coming says Loading", !!gate && /!loaded \?[\s(]*"Loading scorecard…"/.test(gate[0]));
  /* ⚠️ THE WHOLE POINT: finished-and-empty must NOT say Loading. */
  t("FINISHED AND EMPTY DOES NOT SAY LOADING",
    !!gate && /could not be set up/.test(gate[0]));
  t("and it tells the reader what to try", !!gate && /Sign out and back in/.test(gate[0]));
  t("the word Loading appears exactly once in that block",
    !!gate && (gate[0].match(/Loading scorecard/g) || []).length === 1);
}

console.log(`\n${fail ? `${fail} FAILED, ` : ""}${pass} passed`);
process.exit(fail ? 1 : 0);
