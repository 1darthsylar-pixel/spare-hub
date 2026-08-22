/* ============================================================================
   SectionBand.jsx — ONE title row, for every list in the Hub.

   Matt, Aug 20 2026, across five screenshots in a row: "I think these blocks
   have a lot of opportunity for looks. For example the title rows for each
   block can be enhanced." Then, on the Peak Reachers training card: **"I love
   this style."**

   ★ THAT STYLE IS THIS COMPONENT, AND IT ALREADY EXISTED. It lived inside
   `DailySetup.jsx` and only the setup board used it: a small uppercase
   letterspaced label in the section's own colour, a coloured rule filling the
   rest of the row, and a count chip on the end. Every other list in the Hub
   headed its blocks with a plain bold span.

   ⚠️⚠️ SO THE FIX IS NOT "MAKE THE TITLE ROWS PRETTIER" IN FIVE FILES. That is
   five treatments that drift apart the first time one of them is edited, which
   is exactly how the Hub ended up with two tile-grid rhythms ten pixels apart
   (see TILE_GRID in App.jsx, the same week). One component, imported.

   ⚠️ THE COUNT NOUN IS THE CALLER'S. The original hardcoded "station", which is
   why it could not leave the setup board. `9 stations`, `4 of 6`, or nothing.
   ============================================================================ */
import React from "react";

/* ⚠️⚠️ THESE NAME WHAT ACTUALLY RENDERS, AND THEY DID NOT UNTIL Aug 20 2026.
   The display stack led with 'Barlow Semi Condensed' and the mono stack with
   'IBM Plex Mono'. `index.html` fetches Inter and nothing else, so neither face
   has ever loaded and every band in the Hub has been drawing in the fallback
   since the day it shipped.

   ⇒ THAT WAS HARMLESS AND IT WAS STILL A TRAP. Matt said "I love this style"
   about what is on his screen, which is this stack's SECOND entry. The day
   somebody adds Barlow to index.html for an unrelated reason, every title row
   in the Hub silently changes to a face nobody chose, and nothing would connect
   the two events.

   ⚠️ PUTTING A FACE BACK IS TWO EDITS, NEVER ONE. Name it here AND fetch it in
   index.html. `sectionBands.test.mjs` fails on a leading family the page does
   not load, so a half-done change goes red rather than quiet. */
export const BAND_DISPLAY_FONT = "Inter, system-ui, sans-serif";
export const BAND_MONO_FONT = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';

export default function SectionBand({ label, color, count, noun = "", right = null, sub = "" }) {
  const tone = color || "#13293F";
  return (
    <div className="flex items-center gap-2.5 mb-2.5 mt-1 px-0.5">
      <span style={{ minWidth: 0 }}>
        <span style={{
          display: "block", fontFamily: BAND_DISPLAY_FONT, fontSize: 17, fontWeight: 700,
          letterSpacing: "0.09em", textTransform: "uppercase", color: tone, lineHeight: 1,
        }}>
          {label}
        </span>
        {/* ★ THE SUB-LINE IS PART OF THE HEAD, NOT A PARAGRAPH UNDER IT. On the
            scoreboard "Bench = Top 20% · true quarter actuals" was floating
            loose under a bold word; tied to the label it reads as the block's
            own caption. */}
        {sub ? (
          <span style={{ display: "block", fontSize: 11, color: "#6B7280", marginTop: 3, lineHeight: 1.35 }}>{sub}</span>
        ) : null}
      </span>
      {/* ⚠️ A RULE THAT FILLS THE ROW, NOT A BORDER ON THE CARD. It is what makes
          a short title and a long one sit on the same line, so a column of
          blocks reads as one system rather than as ragged headings. */}
      <span className="flex-1 rounded" style={{ height: 2, background: tone, opacity: 0.28 }} />
      {right}
      {right == null && typeof count === "number" && count > 0 && (
        <span style={{
          fontFamily: BAND_MONO_FONT, fontSize: 10.5, fontWeight: 600, color: "#6B7280",
          background: "#fff", border: "1px solid #E5E7EB", borderRadius: 999,
          padding: "2px 9px", whiteSpace: "nowrap",
        }}>
          {count}{noun ? ` ${noun}${count === 1 ? "" : "s"}` : ""}
        </span>
      )}
    </div>
  );
}
