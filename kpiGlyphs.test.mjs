/* ============================================================================
   kpiGlyphs.test.mjs — every key metric has a glyph, and it is not a tool icon.

       node kpiGlyphs.test.mjs

   Matt, Aug 20 2026: "for the key metrics I'd like some glyphs in each box.
   It's a lot of white so I think that can definitely improve."

   ⚠️⚠️ THE FAILURE THIS GUARDS IS ONE App.jsx ALREADY RECORDS IN ITS OWN WORDS.
   The tool `Icon` map's comment: "AN UNMAPPED id RENDERS AN EMPTY SQUARE,
   SILENTLY... the tile keeps its coloured tile-shaped hole and looks like a
   loading state that never finishes." A seventh KPI row added without a glyph
   is that same mistake on the strip directors read first.

   ⚠️ AND IT KEEPS THE TWO MAPS APART. A KPI is not a tool. Borrowing the tool
   icon map would have put six non-tool keys into the thing that guards tools,
   and the next person auditing "does every tool have an icon" would have found
   six answers that are not tools.
   ============================================================================ */
import fs from "node:fs";

const SRC = fs.readFileSync(new URL("./App.jsx", import.meta.url), "utf8");

let pass = 0, fail = 0;
const t = (label, cond, extra) => {
  console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}${cond || extra === undefined ? "" : `\n        ${extra}`}`);
  if (cond) pass++; else fail++;
};
const group = (n) => console.log(`\n── ${n}`);

group("0. controls");
t("App.jsx was read (control)", SRC.length > 200000);
t("KPI_ROWS is still there (control)", /const KPI_ROWS = \[/.test(SRC));
t("KPI_GLYPH is declared (control)", /const KPI_GLYPH = \{/.test(SRC));

group("1. ★★ every metric has one");
{
  const rowsBlock = (SRC.match(/const KPI_ROWS = \[([\s\S]*?)\n\];/) || ["", ""])[1];
  const ids = [...rowsBlock.matchAll(/\{ id: "([a-z0-9]+)", label:/g)].map((m) => m[1]);
  const labels = [...rowsBlock.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
  console.log(`        ${ids.length} metrics: ${labels.join(" · ")}`);
  t(`the rows were parsed (control) — ${ids.length}`, ids.length >= 6);
  t("a known metric is in there (control)", labels.includes("Food"));

  const glyphBlock = (SRC.match(/const KPI_GLYPH = \{([\s\S]*?)\n\};/) || ["", ""])[1];
  const glyphIds = [...glyphBlock.matchAll(/^\s{2}([a-z0-9]+):/gm)].map((m) => m[1]);
  t(`the glyphs were parsed (control) — ${glyphIds.length}`, glyphIds.length >= 6);

  const missing = ids.filter((i) => !glyphIds.includes(i));
  if (missing.length) console.log(`        no glyph: ${missing.join(", ")}`);
  t("★★ every KPI row has a glyph", missing.length === 0);

  const orphan = glyphIds.filter((i) => !ids.includes(i));
  if (orphan.length) console.log(`        glyph for no metric: ${orphan.join(", ")}`);
  t("★ and no glyph belongs to a metric that is gone", orphan.length === 0);
}

group("2. ★ it fills the white without competing with the number");
{
  t("★ it is drawn faint", /opacity: hasVal \? 0\.16 : 0\.10/.test(SRC));
  t("★ in the cell's own tone, so a red cell gets a red mark", /stroke=\{tone\}[\s\S]{0,120}position: "absolute"/.test(SRC));
  t("★ top right, which is the empty half", /position: "absolute", top: 6, right: 6/.test(SRC));
  /* ⚠️ A CLICKABLE CARD WITH A DECORATION OVER IT MUST NOT EAT THE TAP. */
  t("⛔ it never swallows a tap", /pointerEvents: "none"/.test(SRC));
  t("★ and it is hidden from a screen reader", /aria-hidden="true" width="34"/.test(SRC));
  t("★ the card clips it rather than letting it square off a rounded corner",
    /position: "relative", overflow: "hidden"/.test(SRC));
}

group("3. ⛔ the two icon maps stay apart");
{
  const glyphBlock = (SRC.match(/const KPI_GLYPH = \{([\s\S]*?)\n\};/) || ["", ""])[1];
  t("★★ the KPI glyphs are their own map, not entries in Icon",
    glyphBlock.length > 200 && !/const KPI_GLYPH[\s\S]{0,400}function Icon\(/.test(SRC));
  const iconBlock = (SRC.match(/function Icon\(\{ id, color, size = 22 \}\) \{[\s\S]*?\n  \};/) || ["", ""])[0];
  t("the tool icon map was found (control)", iconBlock.length > 500);
  const kpiIds = ["s1", "s2", "s3", "s5", "s6", "s8"];
  const leaked = kpiIds.filter((i) => new RegExp(`^\\s{4}${i}:`, "m").test(iconBlock));
  if (leaked.length) console.log(`        KPI ids inside the TOOL map: ${leaked.join(", ")}`);
  t("⛔ no KPI id leaked into the tool icon map", leaked.length === 0);
}

console.log(`\n${fail} FAILED, ${pass} passed`);
process.exit(fail ? 1 : 0);
