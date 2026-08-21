/* ═══════════════════════════════════════════════════════════════════
   ImportFileZone.jsx — the file half of a paste box. One control, one
   set of words, every import screen in the Hub.

   ★ WHY. Matt, Aug 15 2026: "All uploads should be able to upload file
   instead of copy and paste ... Upload boxes need updated instructions
   and for all repos."

   Both halves of that were real. Of the seven screens with a paste box,
   two took a file and five did not — including TeamImportBox, the one a
   new Executive Director is sent to first. And the instructions on the
   two that DID take files had gone stale: CatalogImportBox said "CSV and
   text files. Not PDF or Excel yet" while its own reader had handled PDF
   since Aug 10.

   ⚠️ THE WORDS LIVE IN importFile.js, NOT HERE. `IMPORT_HINT` and
   `IMPORT_ACCEPT` sit next to the code that decides which files are
   actually readable, so a format added there cannot leave a screen still
   telling people it is not supported. That is the exact drift this
   component exists to end, and putting the copy in the component would
   recreate it one level up.

   ⚠️ IT WRAPS THE TEXTAREA RATHER THAN REPLACING IT. Paste never goes
   away. Somebody with the rows already on their clipboard should not
   have to save a file first, and on a shared iPad paste is often the
   faster path.

   ⚠️ READING SAYS SO. A spreadsheet or PDF takes a beat to parse, and a
   button that looks dead for a second gets pressed again. The label
   changes while it works.
   ═══════════════════════════════════════════════════════════════════ */

import React, { useRef, useState } from "react";
import { readImportFile, IMPORT_ACCEPT, IMPORT_HINT } from "./importFile.js";

export default function ImportFileZone({ onText, hint, children }) {
  const fileRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const [reading, setReading] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  const take = (f) => {
    if (!f || reading) return;
    setErr(""); setNote(""); setReading(true);
    readImportFile(f).then((r) => {
      setReading(false);
      if (r.ok) { onText(r.text); if (r.note) setNote(r.note); }
      else if (r.msg) setErr(r.msg);
    });
  };

  return (
    <div>
      <div
        onDragOver={(ev) => { ev.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(ev) => {
          ev.preventDefault();
          setDrag(false);
          take(ev.dataTransfer && ev.dataTransfer.files ? ev.dataTransfer.files[0] : null);
        }}
        style={{ position: "relative", borderRadius: 10, outline: drag ? "2px dashed #1D4ED8" : "none", outlineOffset: 2 }}
      >
        {children}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
        <button
          type="button"
          onClick={() => fileRef.current && fileRef.current.click()}
          disabled={reading}
          style={{
            border: "1px solid #D1D5DB", background: "#fff", borderRadius: 8,
            padding: "7px 12px", fontSize: 13, fontWeight: 700,
            color: reading ? "#9CA3AF" : "#374151", cursor: reading ? "default" : "pointer",
          }}
        >
          {reading ? "Reading…" : "Choose a file"}
        </button>
        <span style={{ fontSize: 12.5, color: "#6B7280" }}>{hint || IMPORT_HINT}</span>
        <input
          ref={fileRef}
          type="file"
          accept={IMPORT_ACCEPT}
          style={{ display: "none" }}
          onChange={(ev) => {
            const f = ev.target.files && ev.target.files[0] ? ev.target.files[0] : null;
            /* ⚠️ CLEARED SO THE SAME FILE TWICE STILL FIRES. The browser skips
               onChange when the value has not changed, so re-picking a file you
               just fixed would do nothing at all. */
            ev.target.value = "";
            take(f);
          }}
        />
      </div>

      {/* ⚠️ THE REFUSAL IS THE MOST IMPORTANT THING THIS RENDERS. Every "no"
          from readImportFile names the format and gives the one next step, and
          none of that helps if the screen swallows it. */}
      {err ? (
        <div style={{ marginTop: 6, fontSize: 12.5, color: "#B91C1C", lineHeight: 1.45 }}>{err}</div>
      ) : null}
      {note ? (
        <div style={{ marginTop: 6, fontSize: 12.5, color: "#92400E", lineHeight: 1.45 }}>{note}</div>
      ) : null}
    </div>
  );
}
