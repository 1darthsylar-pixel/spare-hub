/* ============================================================================
   SetupByPosition.jsx — Gate City Hub

   The Daily Setup read the other way round: pick a daypart, then read down the
   positions with each person shown full size.

   Matt, Aug 3 2026, with a screenshot of the HR Console roster: "I'd really
   like the names, pics and titles to be this size on the setup with the
   positions on top."

   ★ WHY THIS IS A SECOND VIEW AND NOT A REPLACEMENT. Those sizes cannot fit
   the board. A station card is ~320px and splits four ways for the dayparts,
   so a column has ~70px; an HR-style row needs a 44px picture plus a full name
   plus a title, which is nearer 260px. Something had to give, and the thing
   that must NOT give is the board leaders open at 6am. It still works exactly
   as it did. This sits beside it, and if it turns out to scroll too far on an
   iPad nothing has been lost.

   ★ EVERY PIECE HERE IS THE BOARD'S OWN. BoardFace, roleTagOf and cellPeople
   are imported from DailySetup rather than rewritten, so a person's face,
   title and name are resolved by exactly one definition. The cell parser in
   particular has been wrong twice — once on handoffs, once on the ❌ glyph —
   and a second copy is how it goes wrong a third time.

   ★ THE FULL TITLE, NOT THE BADGE. The grid abbreviates to "ST" / "JT" because
   it has no room. Here there is room, so it reads "Senior Trainer" like the HR
   Console pill in the screenshot. Team Members deliberately show no pill at
   all, the same rule the board uses: most of the store is team members, so the
   useful signal is who is not one.
   ============================================================================ */
import React, { useState } from "react";
/* Same raised look as every tool tile — see cardStyle.js. */
import { CARD_3D, cardSurface, accentEdge } from "./cardStyle.js";
import { nightWindowFrom } from "./dayparts.js";
/* ⚠️ EVERY BOARD HELPER ARRIVES AS A PROP, AND THAT IS DELIBERATE.
   Importing BoardFace / roleTagOf / cellPeople straight from DailySetup made
   the two files import each other, and cyclecheck refused it — correctly. An
   import cycle here surfaces as "Cannot access X before initialization" and a
   blank page, on the screen leaders open at 6am.
   Passing them in keeps the ONE definition (they are still DailySetup's own,
   the board's own parser and the board's own face) without the cycle. Rows
   arrive already flattened by historyRows, the board's normaliser for the two
   different shapes FOH and BOH store. */

/* The period colours the grid already uses, so the two views agree on what
   "Mid" looks like. Kept literal rather than imported: they are four hex codes
   and importing the whole palette for them would be the heavier coupling. */
/* Matt's own words for the four windows, Aug 4 2026: "open-11 breakfast, 11-2
   lunch, 2-5 mid and 5-close for dinner as examples". Display text only. */
const DAYPART_WINDOW = { breakfast: "open\u201311", lunch: "11\u20132", mid: "2\u20135", night: "5\u2013close" };
const PERIOD_TINT = {
  breakfast: "#B45309",
  lunch: "#166B4A",
  mid: "#1B3A5C",
  night: "#6B4FA0",
};

export default function SetupByPosition({ stations, avatars, roles, Face, titleOf, peopleOf, hoursOf, shiftKeys, shiftLabels, moveOn = false, moveSel = null, onMoveTap = null, sectionColorOf = null }) {
  const SHIFT_KEYS = Array.isArray(shiftKeys) ? shiftKeys : [];
  const SHIFT_LABELS = shiftLabels || {};
  const [k, setK] = useState("lunch");
  const rows = Array.isArray(stations) ? stations : [];

  /* A position with nobody on it this daypart is skipped, not shown empty.
     Reading a screen of blanks to find the four that matter is the opposite of
     what this view is for — the grid already shows the whole day at once. */
  const filled = rows
    .map((st) => {
      const cells = st && st.cells ? st.cells : st;
      return {
        role: (st && st.role) || "",
        duty: (cells && typeof cells.duty === "string" ? cells.duty : "").trim(),
        loc: st && st.loc ? st.loc : null,
        raw: String((cells && cells[k]) || "").trim(),
        people: peopleOf(cells && cells[k]),
        /* Each person's OWN shift, aligned to `people` by index. The station
           window in the position name says when the position is open; this says
           when the person on it is actually there. Different facts. */
        hours: typeof hoursOf === "function" ? hoursOf(cells && cells[k]) : [],
      };
    })
    /* ⚠️ EMPTY POSITIONS ARE KEPT WHILE MOVING. Normally a position with
       nobody on it is skipped, because reading a screen of blanks defeats the
       point of this view. But an empty cell is the single most useful place to
       move somebody TO, so hiding it would make half the moves impossible. */
    .filter((r) => r.role && (r.people.length || moveOn));

  /* ★ COLOUR BY SECTION, LIKE THE BOARD (Matt, Aug 4 2026: "I also like the
     variety in color by position", then "i want the variety for the positions
     setup too").
     This view used ONE colour for the whole screen — the daypart tint — so every
     card was the same shade and Front Counter looked exactly like Drive Thru.
     The board colours each station by the section it belongs to, and that
     variety is the thing being asked for.
     ⚠️ THE DAYPART TINT STAYS AS THE FALLBACK, not as dead code. If the caller
     passes no resolver, or a role matches no section, the screen goes back to
     exactly what it did before rather than to a colourless default.
     ⚠️ RESOLVED PER ROW, not once for the view. That is the whole point: two
     cards side by side have to be able to disagree. */
  const dayTint = PERIOD_TINT[k] || "#1B3A5C";
  const tintFor = (row) => {
    if (typeof sectionColorOf !== "function") return dayTint;
    const c = sectionColorOf(row);
    return typeof c === "string" && c ? c : dayTint;
  };

  return (
    <div>
      {/* Daypart picker. One at a time is the trade for the bigger type. */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {SHIFT_KEYS.map((key) => {
          const on = key === k;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setK(key)}
              style={{
                border: `1.5px solid ${on ? PERIOD_TINT[key] : "#E3E7EC"}`,
                background: on ? PERIOD_TINT[key] : "#fff",
                color: on ? "#fff" : "#5B6474",
                borderRadius: 999, padding: "7px 16px",
                fontSize: 13.5, fontWeight: 800, cursor: "pointer",
              }}>
              {SHIFT_LABELS[key]}
            </button>
          );
        })}
      </div>

      {filled.length === 0 ? (
        <div style={{ fontSize: 13.5, color: "#6B7480", padding: "18px 2px" }}>
          Nobody is on the board for {SHIFT_LABELS[k]} yet.
        </div>
      ) : (
        /* 🐛 ONE TALL COLUMN ON IPAD (Matt, Aug 4 2026: "the position view looks
           off on iPad"). A plain `grid` is a single column at any width, so a
           12.9" screen showed four cards and a mile of scrolling while the board
           view fits the whole day. auto-fill with a 300px floor gives three or
           four columns on an iPad and stays one column on a phone, with no
           breakpoint to maintain.
           ⚠️ A PLAIN BLOCK COMMENT. This sits in the expression half of a
           ternary, where the braced JSX-children comment form is a parse error
           — and writing that form inside a note like this one closes the
           comment early, which is its own parse error. Both cost a run. */
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill, minmax(215px, 1fr))", alignItems: "stretch" }}>
          {filled.map((r, i) => {
            /* ⚠️ A BLOCK BODY, so each card can resolve its OWN colour. This was
               a concise arrow returning JSX directly, which left nowhere to put
               a per-row value — the single view-wide `tint` was a consequence of
               the shape of this callback as much as anything. */
            const tint = tintFor(r);
            return (
            /* ★ RAISED, NOT DRAWN FLAT (Matt, Aug 3 2026: "still need the 3d
               look"). Two shadows rather than one: a tight dark edge that reads
               as the card's own thickness, and a wide soft one underneath that
               reads as the distance to the page. One shadow alone looks like a
               border with a smudge. The 4px accent cap is the board's own
               language, borrowed rather than invented so the two views feel
               like one tool — here it carries the DAYPART colour, so the whole
               screen changes tone when you switch. */
            /* ★ DEPTH COMES FROM LIGHT DIRECTION, NOT A BIGGER BLUR (Matt:
               "improved but need more"). Four layers doing four jobs: a hairline
               that reads as the card's cut edge, a tight contact shadow, a wide
               ambient one for height off the page, and — the one that actually
               sells it — an INSET highlight along the top edge, as if a light
               above the board is catching it. Without that last line a card is
               just a rectangle with a blur under it. */
            <div key={`${r.role}-${i}`} style={{
              /* ⚠️ `stretch` on the grid plus height 100% here. Matt, Aug 4 2026:
                 "some of the setup cards arent the same size". They were sized to
                 their own content, so a station with one person sat short beside
                 one with three and the row looked broken. The grid now gives every
                 card in a row the same height and the card fills it. */
              height: "100%", display: "flex", flexDirection: "column",
              borderRadius: 16,
              /* Same face as the Board's station cards, at the same 45% — the two
                 toggles show the same stations and should not look like two
                 different products. Here the tint is the DAYPART colour, so the
                 whole screen changes tone when you switch daypart. */
              /* 0.45 — see the note on the Board's station card. One tint
                 strength across all three views of this board. */
              background: cardSurface(tint, 0.45), overflow: "hidden",
              ...accentEdge(tint, 3), boxShadow: CARD_3D,
            }}>
              <div style={{ height: 3, background: `linear-gradient(90deg, ${tint}A6, ${tint})` }} />
              {/* THE POSITION ON TOP, which is the layout Matt asked for. */}
              <div style={{
                padding: "6px 10px",
                background: `linear-gradient(180deg, ${tint}12, ${tint}06)`,
                borderBottom: `1px solid ${tint}22`,
                fontSize: 11.5, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: tint, lineHeight: 1.25,
              }}>
                {r.role}
                {/* ★ THE DAYPART WINDOW, ON TOP. Matt gave the four as
                    open-11 breakfast, 11-2 lunch, 2-5 mid, 5-close dinner.
                    ⚠️ LABEL ONLY — it does NOT decide who is assigned. The
                    windows the engine uses live in the templates, and changing
                    those only takes effect on re-import, which rebuilds the day
                    and wipes every manual edit a leader made. Never from here. */}
                {/* ⚠️ NIGHT SHOWS THE STATION'S OWN END (Matt, Aug 6 2026: "The
                    out times should be specific"). The posted window is already
                    in the title above, so "5–close" under "EXPO 1 (11AM-9PM)"
                    was hiding an answer the card had. The other three windows
                    stay Matt's own words. */}
                <span style={{ display: "block", marginTop: 1, fontSize: 10.5, fontWeight: 700,
                  letterSpacing: "0.02em", textTransform: "none", color: `${tint}B0` }}>
                  {SHIFT_LABELS[k]} · {k === "night" ? nightWindowFrom(r.role) : (DAYPART_WINDOW[k] || "")}
                </span>
              </div>
              {/* ★ THE DETAIL THE GRID CARRIES (Matt, Aug 3 2026: "add the
                  detailed look into the position cards like the other view").
                  The board shows a station duty under its four columns; without
                  it this view was names and nothing else, so what the station is
                  actually FOR went missing. Only rendered when there is one. */}
              <div style={{
                padding: "1px 10px 5px",
                /* ★ THE NAMES SIT ON A LIGHT PANEL (Matt, Aug 4 2026: "on the
                   position cards on the setup lets make the name section in the
                   middle lighter"). This block had no background of its own, so
                   it showed the full daypart tint and the names competed with
                   the colour behind them.
                   ⚠️ THE BOARD ALREADY DOES THIS and this view had missed it —
                   over there each name cell is white while the card face carries
                   the tint, so the colour reads as the station's identity and the
                   name stays the loudest thing in the card. The two toggles show
                   the same stations, so this is bringing the position cards back
                   in line, not a new look.
                   ⚠️ Translucent rather than solid #fff. The card's own gradient
                   still whispers through, which keeps the daypart tone across the
                   whole card instead of splitting it into a tinted top, a white
                   middle and a warm bottom glued together. */
                background: "transparent",
              }}>
                {/* ★ THE WHOLE POSITION IS ONE TAP TARGET WHILE MOVING, not each
                    person. A swap trades the CELL's contents, so tapping any
                    name in a handoff and tapping a different position moves the
                    pair together — which is what "switch positions" means and
                    keeps it identical to the grid's behaviour. */}
                {moveOn && r.loc ? (() => {
                  const picked = !!moveSel && moveSel.side === r.loc.side
                    && moveSel.si === r.loc.si && moveSel.idx === r.loc.idx && moveSel.k === k;
                  return (
                    <button
                      type="button"
                      onClick={() => onMoveTap && onMoveTap({ ...r.loc, k })}
                      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%",
                        textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                        padding: "5px 8px", margin: "2px 0 1px", borderRadius: 10,
                        border: picked ? "2px solid #14243D" : "1.5px dashed #C9D2DC",
                        background: picked ? "#EEF2F7" : "#fff" }}>
                      {r.people.length ? (
                        <>
                          <span style={{ display: "inline-flex", borderRadius: 11, flexShrink: 0,
                            boxShadow: "0 1px 2px rgba(17,24,39,.14), 0 3px 8px -2px rgba(17,24,39,.18)" }}>
                            <Face entry={r.people[0]} avatars={avatars} size={30} flush />
                          </span>
                          <span style={{ fontSize: 14, fontWeight: 800, color: "#14243D" }}>
                            {r.people.join(" → ")}
                          </span>
                        </>
                      ) : (
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: "#9AA3AE" }}>Empty — tap to move someone here</span>
                      )}
                      {picked && <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 800, color: "#14243D" }}>picked</span>}
                    </button>
                  );
                })() : r.people.map((nm, pi) => {
                  const title = titleOf(nm, roles);
                  return (
                    <div key={`${nm}-${pi}`} style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "5px 0",
                      /* A hairline plus a white line under it reads as a fold in
                         the card rather than a rule drawn on top of it. */
                      borderTop: pi ? "1px solid #EDEFF2" : "none",
                      boxShadow: pi ? "inset 0 1px 0 rgba(255,255,255,.9)" : "none",
                    }}>
                      <span style={{ display: "inline-flex", borderRadius: 11, flexShrink: 0,
                        boxShadow: "0 1px 2px rgba(17,24,39,.14), 0 3px 8px -2px rgba(17,24,39,.18)" }}>
                        <Face entry={nm} avatars={avatars} size={34} flush />
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 14.5, fontWeight: 800, color: "#14243D", lineHeight: 1.2 }}>{nm}</span>
                          {/* ★ THIS PERSON'S ACTUAL SHIFT, not the station's
                              opening window. Rendered only when the cell carries
                              one; a stray dash on a cell with no time reads as
                              missing data. Name, title and photo sizes are
                              deliberately untouched — Matt asked for the times,
                              not a resize. */}
                          {r.hours[pi] ? (
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: "#5B6474",
                              background: "#EEF0F4", borderRadius: 999, padding: "1px 7px" }}>
                              {r.hours[pi]}
                            </span>
                          ) : null}
                        </div>
                        {/* No pill for a Team Member, matching the board. */}
                        {title && title !== "Team Member" && (
                          <span style={{
                            display: "inline-block", marginTop: 3, padding: "2px 8px", borderRadius: 999,
                            background: "#EEF0F4", color: "#5B6474", fontSize: 11, fontWeight: 700,
                          }}>{title}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* ★ RESPONSIBILITIES ON THE BOTTOM (Matt, Aug 4 2026: "I want the
                  times on top and the responsibilities on bottom just like the
                  other view"). It used to sit above the names, which put the
                  chore before the person. The board reads person-then-duty and
                  now so does this. */}
              {/* ★ ALWAYS RENDERED, ALWAYS ON THE BOTTOM EDGE — the same fix as
                  the Board's station card, because this view has the same two
                  faults for the same reason (Matt, Aug 4 2026: "There shouldn't
                  be any gaps on the bottom and the director block lacks color").
                  DIRECTOR carries no duty, so this used to render nothing and the
                  card ended in bare white beside cards that all had the band.
                  `marginTop: auto` puts it on the bottom edge however tall the
                  grid row stretches the card; the card is already a full-height
                  flex column, which is what makes that work. */}
              {/* ⚠️ THE BAND TAKES THE SECTION COLOUR TOO. It was a hardcoded
                  amber, which was fine while the whole view was one tint and
                  wrong the moment cards started disagreeing — a green Front
                  Counter card with an amber foot reads as two cards stuck
                  together. Alpha suffixes rather than separate hexes so any
                  section colour works without adding a second palette. */}
              <div style={{ marginTop: "auto", padding: "5px 10px 6px", background: `${tint}0F`, borderTop: `1px solid ${tint}26`,
                fontSize: 11, fontWeight: 800, letterSpacing: "0.03em", textTransform: "uppercase", color: tint, minHeight: 24 }}>
                {r.duty ? `◆ ${r.duty}` : ""}
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
