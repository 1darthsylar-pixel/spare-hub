/* ══════════════════════════════════════════════════════════════════════════
   CoaterSheet.jsx — THE LAMINATED SHEET OFF THE WALL, ON THE THAW PAGE.

   Matthew Brady (store 01818), Aug 13 2026: "Myself or my director updates the
   # of bags allotted and the manager updates after each daypart the actual
   usage amount."

   Two writers, one row. The director sets the allowance ahead of the day; the
   manager writes down what really went, daypart by daypart, as the day runs.
   The gap between the two columns is the only number anybody is looking for,
   so the screen works it out instead of leaving it to be done in a head.

   ⚠️ THE RULES ARE IN coaterSheet.js, NOT IN HERE. This file draws boxes and
   calls them. Anything about what a blank means, who may write which column or
   how a variance is worked out belongs in the leaf, where a job or a second
   screen can read it too.

   ⚠️⚠️ EVERY SAVE RE-READS FIRST, AND THAT IS NOT BELT AND BRACES. Breakfast
   and dinner get filled in by different people, hours apart, on different
   iPads. A save that posted the copy this browser loaded at 6am would carry
   that morning's empty dinner row back over the top of whatever the closing
   manager had typed. So a write reads the stored sheet fresh, merges the one
   cell into THAT, and posts it. Not atomic — nothing here is — but the window
   shrinks from a whole day to the moment of the save.

   ⚠️ AND IT REFUSES RATHER THAN GUESSING. If the fresh read fails, nothing is
   written and it says so. A failed read is not an empty sheet, and treating it
   as one would blank a day of real numbers. Same rule the cabinet importer
   above it follows.

   ⚠️ NOTHING PERSONAL GOES IN THIS RECORD. `by` holds a name so a leader can
   see who typed a figure, and that is the whole of it. The sheet it replaces
   is a laminated card on a wall that anybody walking past can read.
   ══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useState } from "react";
import { CARD_3D, accentEdge, ACCENT_NEUTRAL } from "./cardStyle.js";
import { kvGetResult, kvSet } from "./store";
/* The store's own names for its four windows. Their paper says Afternoon and
   Dinner where the Hub says Mid and Night — a label is a fact about a store
   (design rule 18) and comes from config, never from a literal in here. */
import { DAYPART_LABEL } from "./dayparts.js";
import {
  COATER_KEY, COATER_DAYPARTS, readSheet, readDay, dayKey, shiftDay,
  varianceOf, stateOf, totalsOf, withCell, withCatering, recentDays,
  canSetAllotted, canSetUsed,
} from "./coaterSheet.js";

const INK = "#111827", GRAY = "#6B7280", LINE = "#E5E7EB";
const OVER = "#B42318", UNDER = "#166534";
const TAB = { fontVariantNumeric: "tabular-nums" };

/* ⚠️ MODULE LEVEL, NOT INSIDE THE COMPONENT (design rule 7). */
const labelOf = (key) => DAYPART_LABEL[key] || (key.charAt(0).toUpperCase() + key.slice(1));

/* "Thursday, 14 August" from a YYYY-MM-DD, built from the three numbers for
   the same timezone reason shiftDay is. */
function prettyDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return "";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

/* Distinct names that typed one column on this day, in the order they landed.
   ⚠️ IT EXISTS SO THE STORED `by` IS ACTUALLY READ BY SOMEBODY. A field written
   on every save and shown on no screen is dead weight in a live record — it
   still travels, still gets stored, and nobody can check it is right. */
function whoTyped(day, side) {
  const out = [];
  for (const k of COATER_DAYPARTS) {
    const n = day.by[`${side}:${k}`];
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

const varColor = (state) => (state === "over" ? OVER : state === "under" ? UNDER : GRAY);
/* +2 / -1 / level. The sign is the point, so a plus is drawn rather than implied. */
const varText = (v) => (v === null ? "—" : v === 0 ? "level" : v > 0 ? `+${v}` : String(v));

/* ⚠️⚠️ MODULE LEVEL, AND THAT IS NOT TIDINESS. A component declared inside
   another component is a BRAND NEW TYPE on every render, so React throws the
   old input away and mounts a fresh one — which takes the cursor with it. The
   symptom is a box that drops focus after every single digit, on the iPad, in
   the middle of a rush. Declared out here it is one type forever. */
function Cell({ side, part, stored, draft, may, busy, onType, onCommit }) {
  const shown = draft !== undefined ? draft : (stored === null ? "" : String(stored));
  if (!may) {
    return (
      <div style={{ ...TAB, fontSize: 16, fontWeight: 700, color: stored === null ? "#C4C9D0" : INK, textAlign: "right", padding: "6px 2px" }}>
        {stored === null ? "—" : stored}
      </div>
    );
  }
  return (
    <input
      inputMode="decimal"
      aria-label={`${labelOf(part)} bags ${side === "allotted" ? "allotted" : "used"}`}
      value={shown}
      disabled={busy}
      /* ⚠️ VALUE READ BEFORE THE UPDATER RUNS. `e.target` is pooled and is
         empty by the time an arrow passed to setState is called. */
      onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ""); onType(v); }}
      onBlur={onCommit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      style={{
        ...TAB, width: "100%", boxSizing: "border-box", fontSize: 16, fontWeight: 700,
        textAlign: "right", padding: "6px 8px", borderRadius: 8,
        border: `1.5px solid ${LINE}`, color: INK, background: busy ? "#F3F4F6" : "#fff",
      }}
    />
  );
}

export default function CoaterSheet({ tier = 1, user }) {
  /* null until the read lands — not the same as an empty sheet. */
  const [sheet, setSheet] = useState(null);
  const [readFailed, setReadFailed] = useState(false);
  const [iso, setIso] = useState(() => dayKey(new Date()));
  /* Raw text of the cell being typed, keyed "allotted:lunch". Held apart from
     the sheet so a half-typed "1" of "12" is never a saved number. */
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState("");
  const [msg, setMsg] = useState("");

  const mayAllot = canSetAllotted(tier);
  const mayUse = canSetUsed(tier);
  const who = (user && (user.name || user.fullName)) || "";

  useEffect(() => {
    let alive = true;
    (async () => {
      let r;
      try { r = await kvGetResult(COATER_KEY); } catch { r = null; }
      if (!alive) return;
      if (r && r.ok) setSheet(readSheet(r.value));
      else { setSheet(readSheet(null)); setReadFailed(true); }
    })();
    return () => { alive = false; };
  }, []);

  const day = readDay((sheet && sheet.days ? sheet.days : {})[iso]);
  const totals = totalsOf(day);
  const allottedBy = whoTyped(day, "allotted");
  const usedBy = whoTyped(day, "used");

  /* One write path for every cell and the note. Re-reads, merges, posts. */
  async function commit(cellKey, mutate) {
    if (readFailed) {
      setMsg("The sheet did not load, so saving is off. Check the wifi and refresh.");
      return;
    }
    setSaving(cellKey); setMsg("");
    let r;
    try { r = await kvGetResult(COATER_KEY); } catch { r = null; }
    if (!r || !r.ok) {
      setSaving("");
      setMsg("That did not save, because the sheet could not be read first. Nothing has changed.");
      return;
    }
    const next = mutate(readSheet(r.value));
    const ok = await kvSet(COATER_KEY, next);
    setSaving("");
    if (ok === false) { setMsg("That did not save. Check the wifi and try again."); return; }
    setSheet(next);
    setDraft((d) => { const n = { ...d }; delete n[cellKey]; return n; });
  }

  const cellKey = (side, part) => `${side}:${part}`;

  function commitCell(side, part) {
    const k = cellKey(side, part);
    /* Untouched cell → nothing to write. Stops tabbing across the row from
       posting four saves that all say what was already there. */
    if (!(k in draft)) return;
    const raw = draft[k];
    commit(k, (s) => withCell(s, iso, side, part, raw, who));
  }

  /* The cell props that never change shape, in one place. */
  const cellProps = (side, part, may) => {
    const k = cellKey(side, part);
    return {
      side, part, may,
      stored: day[side][part],
      draft: k in draft ? draft[k] : undefined,
      busy: saving === k,
      onType: (v) => setDraft((d) => ({ ...d, [k]: v })),
      onCommit: () => commitCell(side, part),
    };
  };

  /* Asks for 8 so dropping the day on screen still leaves a full week behind it. */
  const recent = sheet ? recentDays(sheet, 8).filter((d) => d !== iso).slice(0, 7) : [];
  const isToday = iso === dayKey(new Date());

  return (
    <div style={{ background: "#fff", border: `1px solid ${LINE}`, ...accentEdge(ACCENT_NEUTRAL, 3), borderRadius: 14, boxShadow: CARD_3D, padding: "16px 18px", marginBottom: 24 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.1em", color: GRAY }}>
          COATER ALLOCATION · BAGS
        </div>
        <div className="no-print" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button type="button" aria-label="Previous day" onClick={() => { setDraft({}); setIso((d) => shiftDay(d, -1)); }}
            style={{ border: `1px solid ${LINE}`, background: "#fff", borderRadius: 8, width: 32, height: 32, fontSize: 15, fontWeight: 800, color: GRAY, cursor: "pointer" }}>‹</button>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: INK, minWidth: 168, textAlign: "center" }}>
            {prettyDay(iso)}
          </div>
          <button type="button" aria-label="Next day" onClick={() => { setDraft({}); setIso((d) => shiftDay(d, 1)); }}
            style={{ border: `1px solid ${LINE}`, background: "#fff", borderRadius: 8, width: 32, height: 32, fontSize: 15, fontWeight: 800, color: GRAY, cursor: "pointer" }}>›</button>
          {!isToday && (
            <button type="button" onClick={() => { setDraft({}); setIso(dayKey(new Date())); }}
              style={{ border: `1px solid ${LINE}`, background: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 12.5, fontWeight: 800, color: GRAY, cursor: "pointer" }}>Today</button>
          )}
        </div>
      </div>

      {readFailed && (
        <div className="no-print" style={{ background: "#FEF3F2", border: "1px solid #FDA29B", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 13, fontWeight: 700, color: OVER }}>
          The sheet did not load, so nothing can be typed in. Check the wifi and refresh.
        </div>
      )}

      {/* ── The four rows ─────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(88px,1.4fr) minmax(70px,1fr) minmax(70px,1fr) minmax(64px,0.9fr)", gap: "0 12px", alignItems: "center" }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.1em", color: GRAY, paddingBottom: 6 }}>DAYPART</div>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.1em", color: GRAY, textAlign: "right", paddingBottom: 6 }}>ALLOTTED</div>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.1em", color: GRAY, textAlign: "right", paddingBottom: 6 }}>USED</div>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.1em", color: GRAY, textAlign: "right", paddingBottom: 6 }}>OVER / UNDER</div>

        {COATER_DAYPARTS.map((part) => {
          const state = stateOf(day, part);
          return (
            <div key={part} style={{ display: "contents" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: INK, padding: "5px 0", borderTop: `1px dotted ${LINE}` }}>
                {labelOf(part)}
              </div>
              <div style={{ padding: "5px 0", borderTop: `1px dotted ${LINE}` }}>
                <Cell {...cellProps("allotted", part, mayAllot && !readFailed)} />
              </div>
              <div style={{ padding: "5px 0", borderTop: `1px dotted ${LINE}` }}>
                <Cell {...cellProps("used", part, mayUse && !readFailed)} />
              </div>
              <div style={{ ...TAB, fontSize: 15, fontWeight: 800, textAlign: "right", padding: "5px 2px", borderTop: `1px dotted ${LINE}`, color: varColor(state) }}>
                {varText(varianceOf(day, part))}
              </div>
            </div>
          );
        })}

        {/* Day total. `parts` guards it: one daypart filled in is not a day. */}
        <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: "0.06em", color: GRAY, padding: "8px 0 0", borderTop: `1.5px solid ${INK}` }}>
          WHOLE DAY
        </div>
        <div style={{ ...TAB, fontSize: 16, fontWeight: 900, textAlign: "right", padding: "8px 8px 0 0", borderTop: `1.5px solid ${INK}`, color: INK }}>
          {totals.allotted || "—"}
        </div>
        <div style={{ ...TAB, fontSize: 16, fontWeight: 900, textAlign: "right", padding: "8px 8px 0 0", borderTop: `1.5px solid ${INK}`, color: INK }}>
          {totals.used || "—"}
        </div>
        <div style={{ ...TAB, fontSize: 16, fontWeight: 900, textAlign: "right", padding: "8px 2px 0", borderTop: `1.5px solid ${INK}`, color: varColor(totals.variance === null ? "blank" : totals.variance > 0 ? "over" : totals.variance < 0 ? "under" : "level") }}>
          {varText(totals.variance)}
        </div>
      </div>

      {totals.parts > 0 && totals.parts < COATER_DAYPARTS.length && (
        <div style={{ fontSize: 12, color: GRAY, marginTop: 8 }}>
          {totals.parts} of {COATER_DAYPARTS.length} dayparts have both numbers, so the day total is only those.
        </div>
      )}

      {/* Who wrote this day down. Only shown once somebody has. */}
      {(allottedBy.length > 0 || usedBy.length > 0) && (
        <div style={{ fontSize: 11.5, color: GRAY, marginTop: 8 }}>
          {allottedBy.length > 0 && <>Allotted by {allottedBy.join(", ")}. </>}
          {usedBy.length > 0 && <>Used filled in by {usedBy.join(", ")}.</>}
        </div>
      )}

      {/* ── Catering note ─────────────────────────────────────────── */}
      {/* ⚠️ A NOTE, AND NOTHING IS COMPUTED FROM IT. Their catering worksheet
          turns volume into extra bags and it has not been shared, so the
          allotment above is still typed by hand on a catering day, exactly as
          it is on paper. See the header of coaterSheet.js. */}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px dashed ${LINE}` }}>
        <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: "0.08em", color: GRAY, marginBottom: 6 }}>
          CATERING TODAY
        </div>
        {mayUse && !readFailed ? (
          <input
            value={"catering" in draft ? draft.catering : day.catering}
            disabled={saving === "catering"}
            placeholder="3 trays out at 11, 2 more at 4"
            onChange={(e) => { const v = e.target.value; setDraft((d) => ({ ...d, catering: v })); }}
            onBlur={() => { if ("catering" in draft) commit("catering", (s) => withCatering(s, iso, draft.catering)); }}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            style={{ width: "100%", boxSizing: "border-box", fontSize: 14, padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${LINE}`, color: INK }}
          />
        ) : (
          <div style={{ fontSize: 14, color: day.catering ? INK : "#C4C9D0" }}>{day.catering || "Nothing written down"}</div>
        )}
        <div style={{ fontSize: 11.5, color: GRAY, marginTop: 6 }}>
          Write what is going out. The bags allotted above are still typed in by hand, the same as on the paper sheet.
        </div>
      </div>

      {msg && (
        <div className="no-print" style={{ fontSize: 12.5, fontWeight: 700, marginTop: 10, color: OVER }}>{msg}</div>
      )}

      {/* ── Who writes what ───────────────────────────────────────── */}
      <div className="no-print" style={{ fontSize: 11.5, color: GRAY, marginTop: 12 }}>
        {mayAllot
          ? "You set the bags allotted. Leaders fill in what was used after each daypart."
          : mayUse
            ? "Fill in what was used after each daypart. A Director sets the bags allotted."
            : "A Director sets the bags allotted and leaders fill in what was used."}
      </div>

      {/* ── The week behind you ───────────────────────────────────── */}
      {recent.length > 0 && (
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${LINE}` }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: "0.08em", color: GRAY, marginBottom: 6 }}>
            RECENT DAYS
          </div>
          {recent.map((d) => {
            const t = totalsOf(sheet.days[d]);
            const state = t.variance === null ? "blank" : t.variance > 0 ? "over" : t.variance < 0 ? "under" : "level";
            return (
              <button
                key={d}
                type="button"
                onClick={() => { setDraft({}); setIso(d); }}
                style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "6px 2px", background: "none", border: "none", borderBottom: `1px dotted ${LINE}`, cursor: "pointer", textAlign: "left" }}
              >
                <span style={{ fontSize: 13, fontWeight: 700, color: INK }}>{prettyDay(d)}</span>
                <span style={{ ...TAB, fontSize: 13, color: GRAY }}>
                  {t.allotted} allotted · {t.used} used{" "}
                  <b style={{ color: varColor(state) }}>{varText(t.variance)}</b>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
