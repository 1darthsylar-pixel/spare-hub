/* ============================================================================
   sectionColor.test.mjs — one section, one colour, on every screen.

       node sectionColor.test.mjs

   ⚠️ IT IMPORTS AND RUNS `sectionsOf` and `shade`. The repo has shipped a script
   that was DEAD while every text-based test of it passed (`newstore.mjs`,
   Aug 13 2026), and the rule written down afterwards is "if a tool matters,
   write a test that RUNS it". Both of these are pure, so there is no excuse.

   ═══ WHAT IS ACTUALLY BEING PROTECTED ═════════════════════════════════════
   The setup board used to colour a section by its position in ONE DAY's station
   list. Saturday has no BREADING, so every section below it shifted up a slot
   and the same area was a different colour on Saturday than on Monday — on a
   board leaders scan by colour to find their area. `sectionsOf` is the side-wide
   order that fixes it, and the Training priorities list indexes into the same
   one so a section matches across screens too.

   ⇒ THE ONE ASSERTION THAT MATTERS is "a day missing a section does not move the
   sections after it". Everything else here is guarding the edges around it.
   ============================================================================ */
import { sectionsOf, storeCfg } from "./storeConfig.js";
import { SECTION_TINTS, sectionTint, shade } from "./cardStyle.js";

let pass = 0, fail = 0;
const t = (label, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}`); if (cond) pass++; else fail++; };
const group = (n) => console.log(`\n── ${n}`);

const st = (name, section) => ({ id: name, name, section });

group("0. the modules were imported and really run (controls)");
{
  /* ⚠️ CONTROLS THAT MUST BE FOUND FIRST. If an import silently produced
     undefined, every assertion below would compare undefined to undefined and
     the run would read as a clean bill of health. */
  t("sectionsOf is a function", typeof sectionsOf === "function");
  t("shade is a function", typeof shade === "function");
  t("sectionTint is a function", typeof sectionTint === "function");
  t(`SECTION_TINTS holds ten hues (${SECTION_TINTS.length})`, SECTION_TINTS.length === 10);
  t("and it is frozen", Object.isFrozen(SECTION_TINTS));
}

group("1. sectionsOf — order of first appearance, each name once");
{
  const foh = {
    Mon: [st("REGISTER 1", "FRONT COUNTER"), st("DT 1", "DRIVE THRU"), st("OT 1", "OUTSIDE")],
    Tue: [st("REGISTER 2", "FRONT COUNTER"), st("DT 2", "DRIVE THRU")],
  };
  const out = sectionsOf(foh);
  t("three sections", out.length === 3);
  t("in the store's own order, not sorted",
    JSON.stringify(out) === JSON.stringify(["FRONT COUNTER", "DRIVE THRU", "OUTSIDE"]));
  t("a repeated section is not repeated", new Set(out).size === out.length);
}

group("2. ⚠️ THE BUG: a day missing a section must not move the ones after it");
{
  /* Monday runs everything. Saturday has no BREADING. Under the old per-day
     index, FRY STATION was index 2 on Monday and index 1 on Saturday — a
     different colour for the same area on two days of one board. */
  const boh = {
    Mon: [st("BOARDS 1", "PRIMARY"), st("BREADER", "BREADING"), st("FRIES", "FRY STATION")],
    Sat: [st("BOARDS 1", "PRIMARY"), st("FRIES", "FRY STATION")],
  };
  const order = sectionsOf(boh);
  const monIdx = order.indexOf("FRY STATION");
  const satIdx = order.indexOf("FRY STATION");
  t("FRY STATION has one index for the whole side", monIdx === satIdx && monIdx === 2);
  t("and therefore one colour", sectionTint(monIdx) === sectionTint(satIdx));

  /* The per-day index this replaced, spelled out so the test states the bug it
     is preventing rather than only the behaviour it wants. */
  const perDaySat = boh.Sat.map((s) => s.section).indexOf("FRY STATION");
  t("the old per-day index really did differ (control)", perDaySat === 1 && perDaySat !== monIdx);
  t("and would have painted a different colour (control)",
    sectionTint(perDaySat) !== sectionTint(monIdx));
}

group("3. sectionsOf — empty is a working state, junk does not throw");
{
  t("no argument", JSON.stringify(sectionsOf()) === "[]");
  t("null", JSON.stringify(sectionsOf(null)) === "[]");
  t("a string", JSON.stringify(sectionsOf("nope")) === "[]");
  t("no days", JSON.stringify(sectionsOf({})) === "[]");
  t("a day holding a non-array", JSON.stringify(sectionsOf({ Mon: 7 })) === "[]");
  t("a null station in the list is skipped, not counted",
    JSON.stringify(sectionsOf({ Mon: [null, st("A", "PRIMARY")] })) === JSON.stringify(["PRIMARY"]));
}

group("4. a station with no section lands in OTHER, the same word boardDay uses");
{
  /* ⚠️ IF THESE TWO WORDS EVER DIVERGE the section exists in one list and not
     the other, indexOf returns -1, and the row silently falls back. Same string,
     asserted, because it is the join between two files. */
  t("blank section", JSON.stringify(sectionsOf({ Mon: [st("X", "")] })) === JSON.stringify(["OTHER"]));
  t("missing section", JSON.stringify(sectionsOf({ Mon: [{ id: "x", name: "X" }] })) === JSON.stringify(["OTHER"]));
  t("whitespace only", JSON.stringify(sectionsOf({ Mon: [st("X", "   ")] })) === JSON.stringify(["OTHER"]));
  t("and it is trimmed rather than kept as typed",
    JSON.stringify(sectionsOf({ Mon: [st("X", "  PRIMARY  ")] })) === JSON.stringify(["PRIMARY"]));
}

group("5. sectionTint — never undefined, whatever the index");
{
  /* A style attribute holding `undefined` renders as no colour at all, and one
     holding a junk string renders BLACK. Neither reports itself. */
  const bad = [-1, -11, 10, 25, 1.5, NaN, undefined, null, "3", "x"];
  t("every junk index still returns one of the ten",
    bad.every((i) => SECTION_TINTS.includes(sectionTint(i))));
  t("it wraps rather than running out", sectionTint(10) === sectionTint(0));
  t("and wraps the same way for eleven sections", sectionTint(11) === sectionTint(1));
}

group("6. shade — a darker version of the same hue, never a different one");
{
  /* 0D→07, 94→4a, 88→44, each channel halved and rounded. Spelled out rather
     than recomputed in the test, or the test just restates the implementation. */
  t("#RRGGBB darkens channel by channel", shade("#0D9488", 0.5) === "#074a44");
  t("half of #646464 is #323232", shade("#646464", 0.5) === "#323232");
  t("#RGB is expanded first", shade("#FFF", 0.5) === "#808080");
  t("black cannot underflow", shade("#000000", 0.5) === "#000000");
  t("mul 1 is a no-op", shade("#0D9488", 1) === "#0d9488");
  t("mul above 1 clamps at ff rather than wrapping", shade("#FFFFFF", 2) === "#ffffff");

  /* ⚠️ IT MUST STAY THE SAME HUE. A darkener that greys out is the exact bug
     heroColor.test.mjs was written for on the hero band: the colour survives as
     a value and stops meaning anything on screen. */
  const red = shade("#E11D48", 0.72);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(red.slice(i, i + 2), 16));
  t(`#E11D48 stays red at 0.72 (${red})`, r > g && r > b && r > 100);

  /* ⚠️ AND IT MUST BE READABLE AS SMALL TEXT ON WHITE, which is what the
     Training list uses it for. 4.5:1 is the WCAG AA bar for body text. */
  const lum = (hex) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (hex) => 1.05 / (lum(hex) + 0.05);
  const dark = SECTION_TINTS.map((h) => ({ h, d: shade(h), r: ratio(shade(h)) }));
  const thin = dark.filter((x) => x.r < 4.5);
  thin.forEach((x) => console.log(`        thin: ${x.h} → ${x.d} at ${x.r.toFixed(2)}:1`));
  t("every shaded tint clears 4.5:1 on white", thin.length === 0);

  /* The control: the UNSHADED tints do NOT all clear it, which is why shade
     exists at all. If this ever passes, the palette changed and the shading may
     no longer be buying anything. */
  const rawThin = SECTION_TINTS.filter((h) => ratio(h) < 4.5);
  t(`the raw tints do not all clear it (control, ${rawThin.length} thin)`, rawThin.length > 0);
}

group("7. shade — junk in does not put junk on a screen");
{
  /* A style attribute with `#NaNNaNNaN` in it renders black and says nothing. */
  t("a non-colour comes back unchanged", shade("rebeccapurple") === "rebeccapurple");
  t("undefined comes back as an empty string", shade(undefined) === "");
  t("null too", shade(null) === "");
  t("a four-digit hex is not half-parsed", shade("#ABCD") === "#ABCD");
  t("no NaN can reach a style attribute", !/NaN/.test(String(shade("#GGG"))));
  t("a bad mul falls back to the default", shade("#646464", NaN) === shade("#646464"));
}


group("8. ★★ THE SETUP BOARD'S OLD HARDCODED MAP, colour for colour");
{
  /* DailySetup carried its own map of THIS store's BOH section names to these
     exact hexes. It was replaced by an index into SECTION_TINTS, which fixes
     two things at once: one palette instead of two (rule 8), and a coloured
     board for a store whose sections are named anything else, instead of one
     flat accent on every row (rule 18).

     ⚠️ THIS TEST IS THE PROOF THAT THE SWAP CHANGED NOTHING ANYBODY LOOKS AT.
     The map below is the literal old constant and the order is read from the
     store's own live config, so the two are still independent.

     ⛔⛔ TWO SECTIONS DELIBERATELY MOVED ON Aug 20 2026 AND THE COLOURS MOVED
     WITH THEM. Matt: "The truck and dish cards can be combined into one." That
     took TRUCK / RECEIVING and DISH / SANITATION down to one TRUCK / DISH, so
     the board has NINE sections and everything after the merge shifted up one
     index:

       LEADERSHIP  #C026D4 -> #7C3AED   (took DISH's old slot)

     ⚠️ AND READING THE LIVE CONFIG IMMEDIATELY FOUND SOMETHING THE OLD VERSION
     HID. The hardcoded ORDER listed TEN sections including TRAINING. The store
     has EIGHT, and TRAINING is not in `stations.BOH` at all - it comes from the
     trainer rows. So two of the ten entries this file swore were "the store's
     own config order" had never been in it. It passed anyway for a year,
     because it was comparing a list to itself.

     ★ THAT IS A CONSEQUENCE OF THE MERGE, NOT A BUG, and it is written here
     rather than absorbed because this file exists to make a silent recolour
     loud. Everything BEFORE the merge point is untouched, which is the six
     sections most of the board actually is. */
  const OLD_MAP = {
    "PRIMARY": "#E11D48", "SECONDARY": "#EA580C", "FRY STATION": "#D97706",
    "MACHINES": "#65A30D", "BREADING": "#0D9488", "PREP": "#0891B2",
    "TRUCK / RECEIVING": "#2563EB", "DISH / SANITATION": "#7C3AED",
    "LEADERSHIP": "#C026D4", "TRAINING": "#DB2777",
  };
  /* ⚠️ READ FROM THE LIVE CONFIG, NEVER RETYPED. The old version hardcoded the
     order beside the map and claimed in a comment that it WAS the config order.
     The merge above made that claim false and this file still printed ok, which
     is the exact failure the rest of this repo keeps finding: a check that has
     stopped reading the thing it grades does not go red. */
  const ORDER = sectionsOf(storeCfg("stations.BOH"));
  console.log(`        live section order: ${ORDER.join(" · ")}`);
  t(`the store's sections were read (control) — ${ORDER.length}`, ORDER.length >= 6);
  t("★★ TRUCK / DISH is one section now, not two",
    ORDER.includes("TRUCK / DISH")
    && !ORDER.includes("TRUCK / RECEIVING") && !ORDER.includes("DISH / SANITATION"));

  /* The six before the merge point must be byte for byte what they always were. */
  const UNMOVED = ["PRIMARY", "SECONDARY", "FRY STATION", "MACHINES", "BREADING", "PREP"];
  UNMOVED.forEach((name) => {
    const i = ORDER.indexOf(name);
    t(`${name} keeps ${OLD_MAP[name]}`,
      i >= 0 && sectionTint(i).toUpperCase() === OLD_MAP[name].toUpperCase());
  });
  t("★ every section before the merge point is unchanged",
    UNMOVED.every((n) => sectionTint(ORDER.indexOf(n)).toUpperCase() === OLD_MAP[n].toUpperCase()));

  /* And the two that moved, pinned to where they moved TO, so a third
     accidental shift is caught the same way this one was recorded. */
  t("★★ the merged section took TRUCK's old colour",
    sectionTint(ORDER.indexOf("TRUCK / DISH")).toUpperCase() === OLD_MAP["TRUCK / RECEIVING"].toUpperCase());
  t("★★ LEADERSHIP moved up one and took DISH's",
    sectionTint(ORDER.indexOf("LEADERSHIP")).toUpperCase() === OLD_MAP["DISH / SANITATION"].toUpperCase());

  /* And the reason the swap was worth doing: a store with different section
     names used to get ONE colour for the whole board. */
  const THEIRS = ["HOT LINE", "COLD LINE", "WASH", "BACK DOCK"];
  const tints = THEIRS.map((n, i) => sectionTint(i));
  t("★ another store's sections get four DIFFERENT colours",
    new Set(tints).size === 4, tints.join(","));
}

console.log(`\n${fail} FAILED, ${pass} passed`);
process.exit(fail ? 1 : 0);
