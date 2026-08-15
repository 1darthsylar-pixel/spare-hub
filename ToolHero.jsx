/* ============================================================================
   ToolHero.jsx — the gradient panel at the top of a tool. ONE of them.

   Matt, Aug 14 2026, looking at four tools in a row: "Inconsistency for the
   apps. I like the token (Star) style for the other tools but we can mix up
   color. Make sure to add gradient."

   ⚠️⚠️ HE WAS LOOKING AT A REAL PROBLEM, AND IT IS BIGGER THAN IT LOOKS.
   Measured the same day: THIRTY-SIX files hand-roll this panel, using FOUR
   different gradient angles (120deg ×36, 135deg ×9, 160deg ×1, 180deg ×6) and
   FIVE different corner radii (14, 16, 18, 20, 22). Nobody chose that. Each
   tool's hero was typed separately, months apart, and drifted.

   ⇒ This is the one definition. Design rule 8: the thing that decides what a
   tool LOOKS like should not exist thirty-six times.

   ═══ WHAT IT DELIBERATELY DOES NOT DO ══════════════════════════════════════
   ⚠️ IT DOES NOT PICK THE COLOUR. Every tool already declares one in App.jsx
   (`color: "#8A6A1F"` on the Tokens tile, and so on), and that colour is what
   a person sees on the dashboard before they open anything. The hero takes it
   as a prop so the tile and the screen behind it agree. A palette in here
   would be a second source of truth for a thing already decided.

   ⚠️ AND IT IS NOT A LAYOUT. It is a band with a label, a number and a line
   under it. Tools that need something else keep their own markup; forcing
   thirty-six screens through one shape would be the rebuild rule 16 warns
   about — trading a working surface for an unfinished one.

   ⚠️ `boxShadow: CARD_3D`, NEVER `...CARD_3D`. It is a STRING; spreading it
   gives React numeric CSS keys and the whole tile goes to its crash boundary.
   That shipped live at the Village on Aug 14 2026 and killed two tiles.
   `styleSpread.test.mjs` now fails the build for it.
   ============================================================================ */
import React from "react";
import { CARD_3D, MONO } from "./cardStyle.js";
/* ⚠️ THE COLOUR MATHS LIVES IN A LEAF SO A TEST CAN RUN IT. `heroColor.test.mjs`
   imports that module and executes it; it cannot import this file, because this
   one is JSX. Keeping the sums here would have made them grep-only, and this
   repo has shipped a dead script that every text-based test called green. */
import { lift, heroInk } from "./heroColor.js";

/* ⚠️ ONE ANGLE AND ONE RADIUS, AND THE NUMBERS ARE THE MAJORITY VOTE OF WHAT
   WAS ALREADY THERE — 120deg and 16 were the most common of each, so adopting
   this changes the fewest screens. Not a fresh opinion; the existing one,
   written down once. */
const ANGLE = 120;
const RADIUS = 16;

/* `lift` and `heroInk` are imported from heroColor.js above. They were written
   here first and moved out so a test could execute them rather than read them
   (design rule 8: one definition, and it is the one under test). */

/**
 * @param {string}  color   the tool's own colour, from its tile in App.jsx
 * @param {string}  label   small uppercase line above the figure
 * @param {*}       value   the big number or short phrase
 * @param {string}  note    the quiet line underneath
 * @param {boolean} soft    a flatter version for tools where a big number
 *                          would be shouting — a checklist, a form
 */
export default function ToolHero({ color, label, value, note, soft = false, children }) {
  const { ink, quiet } = heroInk(color);       // dark text when the band is light
  return (
    <div
      style={{
        background: `linear-gradient(${ANGLE}deg, ${color} 0%, ${lift(color)} 100%)`,
        borderRadius: RADIUS,
        padding: soft ? "16px 20px" : "22px 24px",
        color: ink,
        marginBottom: 20,
        boxShadow: CARD_3D,
      }}
    >
      {label ? (
        /* ⚠️ MONOSPACE, BECAUSE THAT IS THE STYLE HE NAMED. The Tokens hero's
           micro-label is mono, and it is most of why the band reads as a
           readout rather than a heading. Dropping it here would have shipped a
           "consistent" hero that did not match the one screen he pointed at. */
        <div style={{
          fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: ".14em",
          textTransform: "uppercase", opacity: 0.75,
        }}>{label}</div>
      ) : null}
      {value != null && value !== "" ? (
        <div style={{
          fontSize: soft ? 22 : 40, fontWeight: 800, letterSpacing: "-.02em",
          marginTop: 4, fontVariantNumeric: "tabular-nums", lineHeight: 1.1,
        }}>{value}</div>
      ) : null}
      {note ? (
        <div style={{ fontSize: 14, color: quiet, marginTop: 2 }}>{note}</div>
      ) : null}
      {children}
    </div>
  );
}
