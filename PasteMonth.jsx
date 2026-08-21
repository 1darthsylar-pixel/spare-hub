/* ============================================================================
   PasteMonth.jsx — Gate City Hub

   THE one paste-import button every monthly transcription gets (Matt,
   Aug 1 2026: "I want them all to have the same button"). Same look, same
   flow everywhere: a toggle button, a monospace textarea whose placeholder
   IS the format, and an Import that hands the text to the tile's own
   parser + gated writer and reports back in plain words.

   The tile owns parsing, validation, and the write (with its own failed-
   read guards). This component owns only the identical UX.
   onImport(text) must return { ok, message } — the message is shown either
   way when present; ok clears and closes the box.
   ============================================================================ */
import { useState } from "react";
/* ★ THE PASTE BOX LOOK, SHARED (Matt, Aug 8 2026: "the pase boxes dont stand
   out with color. please make that update to all").
   This component is behind NINE surfaces — Shift Leader Scorecard, Business
   Scorecard, Labor Planner twice, Food Safety Walkthrough, Food Cost Tracker
   twice, FCR and Guest Experience — so one import here is nine screens fixed. */
import { importZone } from "./cardStyle.js";
import ImportFileZone from "./ImportFileZone.jsx";

export default function PasteMonth({
  buttonLabel = "Paste a month",
  placeholder = "",
  /* ★★ WHERE THE NUMBERS COME FROM (Matt, Aug 11 2026: "remember other stores
     wont have claude").

     The placeholder is a FORMAT example: it shows the shape of the lines and
     says nothing about where to find the figures. At Gate City that gap is
     invisible, because if somebody is stuck they ask. A store that clones this
     Hub has the same box, the same placeholder and nobody to ask, so the format
     example is the whole of the instructions they get — and the report it wants
     is behind an SSO wall with a layout they have to be told how to read.

     `where` is a list of plain lines rendered ABOVE the box. Optional, so the
     other eight surfaces this component is behind are byte-for-byte unchanged
     until somebody writes theirs. */
  where = null,
  disabled = false,
  disabledNote = "",
  onImport,
  accent = "#0F766E",
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (busy || disabled) return;
    setBusy(true);
    try {
      const res = (await onImport(text)) || {};
      if (res.ok) { setText(""); setOpen(false); }
      if (res.message) window.alert(res.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {/* ⚠️ FILLED WHEN CLOSED, NOT A WHITE OUTLINE. It used to be
            `background: open ? accent : "#fff"`, so the button you have to find
            in order to paste anything was a white ghost sitting under a wall of
            real content — the exact thing cardStyle.js already records as
            "reads as disabled". The tool's own accent still colours it, so each
            tile keeps its identity; only the fill changed. */}
        <button type="button" onClick={() => !disabled && setOpen((o) => !o)} disabled={disabled}
          style={{ fontSize: 12, fontWeight: 800, padding: "8px 12px", borderRadius: 8, border: `1px solid ${accent}`,
                   background: accent, color: "#fff",
                   cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1, whiteSpace: "nowrap" }}>
          {open ? "Close" : buttonLabel}
        </button>
        {disabled && disabledNote ? <span style={{ fontSize: 12, color: "#7A5410", fontWeight: 700 }}>{disabledNote}</span> : null}
      </div>
      {open && !disabled && (
        <div style={{ marginTop: 8 }}>
          {/* ⚠️ THE IMPORT BLUE, NOT THE TOOL'S ACCENT, AND THAT IS DELIBERATE.
              This box was a 1.5px #E5E7EB hairline on white — invisible, which
              is the whole complaint. Giving it the caller's accent would make it
              blend into whichever tile it is sitting in, which is the same
              problem wearing a different colour. Every paste box in the Hub is
              now the same blue, so a paste box is recognisable as one wherever
              you meet it. The tool keeps its identity on the button above. */}
          {/* ⚠️ ABOVE the box, not under it. Instructions below the thing they
              describe are read after the mistake. */}
          {Array.isArray(where) && where.length > 0 && (
            <div style={{ border: "1px solid #DBEAFE", background: "#F8FAFF", borderRadius: 8,
              padding: "10px 12px", marginBottom: 8, fontSize: 12.5, lineHeight: 1.55, color: "#1E3A5F" }}>
              <div style={{ fontWeight: 800, marginBottom: 4 }}>Where these numbers come from</div>
              {where.map((line, i) => (
                <div key={i} style={{ marginTop: i ? 3 : 0 }}>{line}</div>
              ))}
            </div>
          )}
          <ImportFileZone onText={(t) => setText(t)}>
            <textarea rows={6} value={text}
              onChange={(e) => { const v = e.target.value; setText(v); }}
              placeholder={placeholder}
              style={importZone()} />
          </ImportFileZone>
          <button type="button" onClick={run} disabled={busy}
            style={{ marginTop: 6, fontSize: 13, fontWeight: 800, padding: "9px 14px", borderRadius: 8, border: "none",
                     background: busy ? "#9CA3AF" : "#047857", color: "#fff", cursor: busy ? "default" : "pointer" }}>
            {busy ? "Working…" : "Import"}
          </button>
        </div>
      )}
    </div>
  );
}
