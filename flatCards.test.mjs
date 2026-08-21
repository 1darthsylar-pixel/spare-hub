/* ============================================================================
   flatCards.test.mjs — a screen that raises some cards raises all of them.

       node flatCards.test.mjs

   ⛔⛔ WHY THIS EXISTS, IN MATT'S OWN WORDS, TWICE IN ONE HOUR.

   Aug 21 2026: "there are borders inside labor and sales that dont have the 3d
   layer. i have brought this up in other sessions many times and it keeps
   getting missed." Then: "the look of the waste looks like it regressed as
   well. im just do quick glances at everything."

   ★★ NOTHING HAD BEEN UNDONE EITHER TIME, AND THAT IS THE WHOLE FINDING. Each
   screen had raised cards at the top and flat ones further down, landed on
   different days. Six of the seven found in the sweep afterwards already
   carried their ACCENT EDGE and had simply never been given the shadow — half
   the treatment, applied and then forgotten.

   ⇒ Half a screen raised and half flat READS as a regression even though no
   diff ever removed anything. That is why a person glancing finds it and no
   amount of reading does, and why fixing instances is what has been done "many
   times".

   ══════════════════════════════════════════════════════════════════════════
   ⭐⭐ THE RULE IS SELF-CONSISTENCY, NOT A LIST OF SCREENS.

   The first version of this file named four money screens. That is a list to
   forget the next time a screen is added, and it graded nothing anywhere else —
   the sweep that followed found the same fault on five MORE screens it did not
   cover.

   ⇒ The rule now: **if a screen raises any card, every card on it is raised.**

   ⚠️ IT CANNOT SHOUT AT AN OLD SCREEN. A screen that has never used the card
   style is uniformly flat and consistent with itself, so it does not fire.
   Those are a real backlog and they are listed at the end as a NOTE, never as
   a failure — a guard that fails on work nobody has started is a guard people
   switch off.
   ⚠️ AND IT CANNOT BE WIDENED INTO NOISE. "Every border needs a shadow" fires
   on every input, select and button on these screens, dozens of them, all
   correct, because a text box is not a raised card. The same lesson
   notePanelRing.test.mjs already records.
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, readdirSync } from "node:fs";

let pass = 0; const fails = [];
const t = (label, cond, extra) => {
  if (cond) { pass++; console.log(`  ok    ${label}`); }
  else { fails.push(label); console.log(`  FAIL  ${label}${extra === undefined ? "" : "\n        " + extra}`); }
};

const WHITE = String.raw`(["']white["']|["']#[Ff]{3}["']|["']#[Ff]{6}["']|\bPAPER\b)`;

/* ⚠️ ONE READING OF THE QUESTION, used by the sweep AND by every control below,
   so a control cannot drift away from the thing it is proving. */
function scan(src) {
  const lines = src.split("\n");
  const flat = []; let raised = 0;
  lines.forEach((l, i) => {
    if (!l.includes("<div")) return;
    const win = lines.slice(Math.max(0, i - 8), i + 4).join("\n");
    const paintsWhite = new RegExp(String.raw`background\s*:\s*` + WHITE).test(l);
    const hasBorder = /border\s*:\s*[`"']/.test(l);
    /* A CARD carries padding AND a radius. A scroll wrapper, a table row and a
       flex spacer carry a border and neither, and none of them is a card. */
    const isCard = paintsWhite && hasBorder && /padding\s*:/.test(l) && /borderRadius\s*:/.test(l);

    if (/boxShadow/.test(win) || /CARD_3D/.test(win)) {
      if (new RegExp(String.raw`background\s*:\s*(cardSurface|` + WHITE + ")").test(l)) raised += 1;
      return;
    }
    if (!isCard) return;
    if (/dashed/.test(l)) return;                                  // an empty "add one here" slot is meant to read flat
    if (/borderTop\s*:\s*["']none["']/.test(l)) return;            // welded to the control above it
    if (/flat on purpose/.test(win)) return;                       // stated, with its reason, in the file
    flat.push(i + 1);
  });
  return { flat, raised };
}

console.log("\n── 0. controls — the scan reads, fires, and knows what is not a card");
{
  const card = (extra = "") => `<div style={{ background:"#fff", border:\`1px solid \${LINE}\`, borderRadius:9, padding:"14px"${extra} }}>`;
  t("★ a flat white card is flagged", scan(card()).flat.length === 1);
  t("★ 'white', '#fff' and PAPER all count as white",
    ["white", "#fff", "#FFFFFF"].every((w) => scan(`<div style={{ background:"${w}", border:\`1px solid x\`, borderRadius:9, padding:9 }}>`).flat.length === 1)
    && scan('<div style={{ background:PAPER, border:`1px solid x`, borderRadius:9, padding:9 }}>').flat.length === 1);
  t("★ a raised card is not flagged, and counts as raised", (() => {
    const r = scan('<div style={{ background:"#fff", boxShadow:CARD_3D, border:`1px solid x`, borderRadius:9, padding:9 }}>');
    return r.flat.length === 0 && r.raised === 1;
  })());
  t("★ a scroll wrapper is not a card (no padding, no radius)",
    scan('<div style={{ overflowX:"auto", border:"1px solid #E4E3DD", background:"#fff" }}>').flat.length === 0);
  t("★ a dashed slot is left alone", scan('<div style={{ background:"#fff", border:`1px dashed x`, borderRadius:7, padding:8 }}>').flat.length === 0);
  t("★ a panel welded to its toggle is left alone",
    scan('<div style={{ background:"#fff", border:`1px solid x`, borderTop:"none", borderRadius:"0 0 7px 7px", padding:4 }}>').flat.length === 0);
  t("★ a card that SAYS it is flat on purpose is left alone",
    scan('{/* flat on purpose: a row, not a card */}\n' + card()).flat.length === 0);
  t("★★ but the excuses do not swallow an ordinary flat card", scan(card(', marginBottom:12')).flat.length === 1);
}

console.log("\n── 1. ★★ no screen is inconsistent with itself");
{
  const files = readdirSync(new URL(".", import.meta.url)).filter((f) => f.endsWith(".jsx")).sort();
  /* ⚠️ A FLOOR, NEVER `> 0`. Losing most of the screens to a rename or a moved
     directory is the same silent failure as losing all of them, and this repo
     has paid for exactly that once (channelRecap: 18 call sites to 0, still
     green, with nothing in the output saying it had stopped grading). */
  t(`★ the sweep really read the screens (control) — ${files.length} found`, files.length >= 40, files.length);

  let mixed = 0; let raisedTotal = 0; const backlog = [];
  for (const f of files) {
    const { flat, raised } = scan(readFileSync(new URL(`./${f}`, import.meta.url), "utf8"));
    raisedTotal += raised;
    if (!flat.length) continue;
    if (!raised) { backlog.push(`${f} (${flat.length})`); continue; }
    mixed += 1;
    t(`★★ ${f} raises ${raised} card${raised === 1 ? "" : "s"} and leaves ${flat.length} flat`,
      false, `lines ${flat.join(", ")}`);
  }
  t(`★ and it really found raised cards to compare against (control) — ${raisedTotal}`, raisedTotal >= 20, raisedTotal);
  t("★★ every screen that raises a card raises all of them", mixed === 0, mixed ? `${mixed} screen(s)` : undefined);

  /* ⚠️ A NOTE, NEVER A FAILURE. These screens have never used the card style at
     all, so they are consistent with themselves and nobody is looking at half a
     treatment. Bringing them across is real work and it is not a regression. */
  if (backlog.length) {
    console.log(`\n        NOTE — ${backlog.length} screen(s) have never used the card style and are uniformly flat:`);
    for (const b of backlog) console.log(`          ${b}`);
    console.log("        Not a failure. Consistent with themselves, and a real backlog.");
  }
}

console.log(`\n${fails.length ? `${fails.length} FAILED, ` : ""}${pass} passed`);
process.exit(fails.length ? 1 : 0);
