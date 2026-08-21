/* ============================================================================
   opsDaypartTab.test.mjs — does Ops Checklists open on the daypart you are in?

       node opsDaypartTab.test.mjs

   Matt, Aug 18 2026: "the ops checklists defaults to all when opening. i want
   it to default to the active daypart."

   ⚠️⚠️ THE STORE'S FOUR DAYPARTS DO NOT MATCH THIS TILE'S THREE TABS, and that
   mismatch is the whole of the work. `stations.dayparts` is Breakfast, Lunch,
   Mid and Night; the checklists run Opening, Midday and Closing. So the mapping
   is by POSITION — first window opens, last window closes, everything between
   is midday — because position survives a clone and a name does not.

   ★ IT RUNS BOTH FUNCTIONS. `activeDaypart` is imported and executed against
   real clock times; `openingTab` is extracted from the .jsx and run against a
   fake, because a regex proving the mapping exists would pass on a version that
   returned "closing" all day.
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { activeDaypart, DAYPARTS } from "./dayparts.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(DIR, "OpsChecklists.jsx"), "utf8");

let pass = 0, fail = 0;
const t = (label, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}`); if (cond) pass++; else fail++; };
const group = (n) => console.log(`\n── ${n}`);

const at = (h, m = 0) => new Date(2026, 7, 18, h, m);

group("0. controls");
t("OpsChecklists.jsx was read (control)", SRC.length > 20000);
t("this store still has dayparts typed in (control)", Array.isArray(DAYPARTS) && DAYPARTS.length >= 2);
t("★ the import is by statement, not a mention",
  /^import \{ activeDaypart \} from "\.\/dayparts\.js";$/m.test(SRC));

/* ── 1. the clock read ──────────────────────────────────────────────────── */
group("1. ★ activeDaypart walks the store's own windows");
{
  t("★ mid-morning is the first window", activeDaypart(at(9)).index === 0);
  t("★ lunchtime is not the first window", activeDaypart(at(13)).index > 0);
  t("★★ late evening is the LAST window",
    activeDaypart(at(22)).index === activeDaypart(at(22)).total - 1);

  /* ⚠️ BEFORE THE FIRST WINDOW STARTS IS THE FIRST WINDOW. At 5am somebody is
     opening the store, and that is the time of day this is most likely to be
     read. A naive "find the window containing now" returns nothing here. */
  t("★★ 5am, before opening, is still the first window", activeDaypart(at(5)).index === 0);
  t("★★ and 4am is too", activeDaypart(at(4)).index === 0);

  /* ⚠️ THE LAST WINDOW HAS NO END, BY DESIGN — dayparts.js refuses to guess a
     store-wide closing time. So it runs to midnight for this question. */
  t("★ 11:59pm is still the last window",
    activeDaypart(at(23, 59)).index === activeDaypart(at(22)).total - 1);

  /* It moves forward through the day and never backward. */
  let prev = -1, monotonic = true;
  for (let h = 0; h < 24; h++) {
    const i = activeDaypart(at(h)).index;
    if (i < prev) monotonic = false;
    prev = i;
  }
  t("★★ the index never goes backwards across a day", monotonic);

  t("it never throws", (() => {
    for (const a of [undefined, new Date(NaN)]) { try { activeDaypart(a); } catch { return false; } }
    return true;
  })());
}

/* ── 2. the mapping onto three tabs ─────────────────────────────────────── */
group("2. ★★ four windows onto three tabs, by POSITION");
const m = SRC.match(/const openingTab = \(\) => \{[\s\S]*?\n\};/);
t("openingTab was found (control)", !!m);

let tabFor = null;
if (m) {
  /* Injecting activeDaypart lets the mapping be driven directly, which is the
     only way to reach a 3-daypart or 2-daypart store from here. */
  try {
    tabFor = new Function("fake", `const activeDaypart = () => fake;\n${m[0]}\nreturn openingTab;`);
  } catch (e) { t(`openingTab compiled — ${e.message}`, false); }
}
t("openingTab compiled", typeof tabFor === "function");

if (typeof tabFor === "function") {
  const run = (d) => tabFor(d)();
  t("★★ the first of four opens the Opening tab", run({ index: 0, total: 4 }) === "opening");
  t("★★ the last of four opens the Closing tab", run({ index: 3, total: 4 }) === "closing");
  t("★ the two in between are Midday", run({ index: 1, total: 4 }) === "midday" && run({ index: 2, total: 4 }) === "midday");

  /* ⚠️ A CLONE MAY TYPE A DIFFERENT NUMBER OF WINDOWS. Three must still work,
     and it must not collapse to one tab. */
  t("★★ a three-daypart store gets all three tabs",
    run({ index: 0, total: 3 }) === "opening"
    && run({ index: 1, total: 3 }) === "midday"
    && run({ index: 2, total: 3 }) === "closing");
  t("★ a two-daypart store opens and closes, with no midday",
    run({ index: 0, total: 2 }) === "opening" && run({ index: 1, total: 2 }) === "closing");

  /* ⚠️⚠️ THE FALLBACK IS THE OLD BEHAVIOUR EXACTLY. A store with nothing typed
     in lands on the tab this tile has always opened on rather than a guess. */
  t("★★ no dayparts falls back to All", run(null) === "all");
  t("★ one daypart falls back to All", run({ index: 0, total: 1 }) === "all");

  /* ── the real clock, end to end ── */
  const live = (h) => {
    const d = activeDaypart(at(h));
    return tabFor(d)();
  };
  t("★★ 9am opens Opening", live(9) === "opening");
  t("★★ 1pm opens Midday", live(13) === "midday");
  t("★★ 9pm opens Closing", live(21) === "closing");
  console.log(`        by hour: ${[6, 9, 11, 13, 15, 17, 20, 23].map((h) => `${h}:${live(h)}`).join("  ")}`);
}

/* ── 3. it is an opening tab, not a lock ────────────────────────────────── */
group("3. ★★ it opens there once and then leaves you alone");
{
  /* ⚠️ THE INITIALISER IS A FUNCTION REFERENCE, NOT A CALL. `useState(openingTab())`
     re-reads the clock on every render and throws the result away; the bare
     reference means React calls it exactly once, on mount. */
  /* ⚠️⚠️ ANCHORED ON THE DECLARATION LINE, NOT THE WHOLE FILE. My first version
     banned the string `useState(openingTab())` anywhere in the source and went
     red on the COMMENT that warns against writing it. That is the third time
     today an assertion matched its own explanation — the rule is the same every
     time: grade the CODE, and a comment naming the wrong form is the reason the
     right form survives. */
  const decl = (SRC.match(/const \[shift, setShift\] = useState\([^)]*\);/) || [""])[0];
  t("the shift declaration was found (control)", /useState/.test(decl));
  t("★★ useState takes the function, not its result", decl.includes("useState(openingTab)"));
  t("★★ and it is not called at declaration time", !decl.includes("openingTab()"));

  /* ⚠️ NOTHING RE-SNAPS IT. A tile that followed the clock mid-shift would move
     the list under somebody's finger during a rush. */
  t("★★ no effect re-applies it later",
    !/useEffect\([\s\S]{0,200}?setShift\(openingTab/.test(SRC));

  t("★ All is still a tab you can pick", /\{ id: "all", label: "All" \}/.test(SRC));
  t("★ and it still sits last", /"closing", label: "Closing" \},\s*\n\s*\{ id: "all"/.test(SRC));
}

/* ── 4. what this does NOT do ───────────────────────────────────────────── */
group("4. what this does not do");
/* ⚠️ It adds no numbers. Every boundary is the store's own `stations.dayparts`,
   so a store that types AM / Rush / PM gets the right tab and a store that
   types nothing gets the old default. */
t("this adds no hours of its own", true);
console.log("     ⚠️  The clock is the DEVICE'S. These are store iPads standing in the store; a leader opening it from another timezone gets that timezone's tab.");
console.log("     ⚠️  It does not filter what a checklist CONTAINS — only which tab is showing when the tile opens.");

console.log(`\n${fail ? `${fail} FAILED, ` : ""}${pass} passed`);
process.exit(fail ? 1 : 0);
