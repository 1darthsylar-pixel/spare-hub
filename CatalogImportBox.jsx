import React, { useState, useRef } from "react";
import { importCard, importZone, importOpenBtn } from "./cardStyle.js";
import { readImportFile, IMPORT_ACCEPT, IMPORT_HINT } from "./importFile.js";
import { detectColumns, parseCatalog, planImport } from "./catalogImport.js";

/* ══════════════════════════════════════════════════════════════════════════
   CatalogImportBox.jsx — ONE PASTE BOX, USED BY SUPPLY CENTRAL AND EQUIPMENT
   LOG. All of the matching lives in catalogImport.js; this is the screen.

   Matt, Aug 6 2026: "i dont have the spreadsheets but i need an iport spot
   for the future."

   ★ THAT SENTENCE IS THE WHOLE DESIGN. Nobody has seen the real supply or
   equipment export yet, so guessing the column headers and hard-wiring them
   would build a spot that works only if the guess was lucky. Instead:

     1. auto-detect has a go and shows what it found,
     2. every field is a dropdown over the ACTUAL header cells,
     3. a human confirms before a single row is read.

   A sheet with headers nobody predicted still imports. It just takes a few
   taps first, and it tells you exactly what it is about to read.

   ⚠️ NOTHING IS WRITTEN UNTIL THE LAST BUTTON. Check is a dry run.
   ⚠️ THE LIST ONLY, NEVER THE PROGRESS. On-hand counts, sign-outs, order
   history, resolved faults and logged temperatures are keyed by an item's
   local id, and nothing here touches any of them. A matched item keeps that
   id — see the header of catalogImport.js for why renumbering is worse than
   losing the number outright.
   ══════════════════════════════════════════════════════════════════════════ */

const FIELD_HELP = {
  name: "Item name",
  sku: "SKU or item number",
  cat: "Category or area",
  par: "Par / reference quantity",
  target: "Target temperature",
};

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const box = {
  wrap: importCard(),
  h: { fontWeight: 800, fontSize: 14.5, color: "#111827", marginBottom: 4 },
  p: { fontSize: 12.5, color: "#6B7280", lineHeight: 1.5, marginBottom: 10 },
  steps: { fontSize: 12.5, color: "#374151", lineHeight: 1.55, marginBottom: 10,
           background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: "10px 12px" },
  ta: importZone(),
  sel: { fontSize: 12.5, padding: "6px 8px", borderRadius: 8, border: "1px solid #D1D5DB", background: "#fff", maxWidth: 200 },
  prim: { background: "#223C6A", color: "#fff", border: "none", borderRadius: 8, padding: "9px 15px", fontWeight: 700, fontSize: 13, cursor: "pointer" },
  sec: { background: "#F3F4F6", color: "#374151", border: "1px solid #D1D5DB", borderRadius: 8, padding: "9px 15px", fontWeight: 600, fontSize: 13, cursor: "pointer" },
  err: { color: "#DD0031", fontSize: 12, marginTop: 8, fontWeight: 600, lineHeight: 1.45 },
  good: { background: "#ECFDF5", border: "1px solid #A7F3D0", color: "#047857", fontSize: 12.5, borderRadius: 10, padding: "10px 12px", marginBottom: 12, lineHeight: 1.45 },
  warn: { background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E", fontSize: 12, borderRadius: 8, padding: "9px 11px", marginTop: 8, lineHeight: 1.45 },
  group: { border: "1px solid #E5E7EB", borderRadius: 8, padding: "9px 11px", marginBottom: 7, background: "#fff" },
  gh: { display: "flex", alignItems: "center", gap: 9, fontSize: 13.5, fontWeight: 700, color: "#111827" },
  list: { fontSize: 11.5, color: "#6B7280", marginTop: 5, lineHeight: 1.5, maxHeight: 108, overflowY: "auto" },
};

/* ⚠️ THE FILE READER MOVED OUT, Aug 15 2026. It lived here as a private
   `readDroppedFile` and only this one screen could reach it, while five other
   paste boxes had no file button at all. It is now `readImportFile` in
   importFile.js, shared by every import box, and it reads Excel — which the
   copy that used to sit here refused, on a dependency-freeze reason that
   expired on Aug 10. See importFile.js. */

export default function CatalogImportBox({
  current, spec, want, allowedCats, canUpdate = true, updateNote = "", onApply, title, hint, steps,
}) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [map, setMap] = useState(null);      // null = use auto-detect
  const [det, setDet] = useState(null);
  const [plan, setPlan] = useState(null);
  const [pick, setPick] = useState({ add: true, update: true, discontinue: false });
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);
  const [drag, setDrag] = useState(false);   // drop-zone highlight only
  const [reading, setReading] = useState(false);  // a PDF takes a second; never leave it silent
  const [note, setNote] = useState("");           // e.g. "read the first 40 pages of 120"
  const fileRef = useRef(null);

  const reset = () => {
    setRaw(""); setMap(null); setDet(null); setPlan(null); setErr("");
    setPick({ add: true, update: true, discontinue: false }); setOpen(false);
  };

  /* Both the drop zone and the file picker come through here, so the two
     entry points cannot drift apart. */
  const takeFile = (f) => {
    if (!f) return;
    setErr(""); setNote(""); setReading(true);
    readImportFile(f).then((r) => {
      setReading(false);
      if (r.ok) { onPaste(r.text); if (r.note) setNote(r.note); }
      else setErr(r.msg);
    });
  };

  const onPaste = (v) => {
    setRaw(v); setErr(""); setPlan(null);
    const d = v.trim() ? detectColumns(v, want) : null;
    setDet(d);
    setMap(d ? { ...d.cols } : null);
  };

  const check = () => {
    setDone(null);
    const parsed = parseCatalog(raw, want, map || undefined);
    if (!parsed.ok) { setErr(parsed.error); setPlan(null); return; }
    setErr(parsed.error || "");
    setPlan(planImport(parsed.rows, current, spec, { allowedCats }));
  };

  const apply = () => {
    if (!plan) return;
    const payload = {
      add: pick.add ? plan.add : [],
      update: pick.update && canUpdate ? plan.update : [],
      discontinue: pick.discontinue ? plan.discontinue : [],
    };
    const n = onApply(payload);
    setDone(typeof n === "number" ? n : (payload.add.length + payload.update.length + payload.discontinue.length));
    reset();
  };

  if (!open) {
    return (
      <>
        {done !== null && (
          <div style={box.good}>
            ✓ Import applied. <b>{done}</b> {done === 1 ? "change" : "changes"} written to the list. No counts,
            sign-outs or logs were touched.
          </div>
        )}
        <button
          style={importOpenBtn()}
          onClick={() => { setErr(""); setDone(null); setOpen(true); }}
        >
          ⬆ {title || "Import a list from a spreadsheet"}
        </button>
      </>
    );
  }

  const headers = (det && det.headers) || [];
  const nothingToDo = plan && !plan.add.length && !plan.update.length &&
    !plan.discontinue.length && !plan.ambiguous.length && !(plan.blocked || []).length;

  return (
    <div style={box.wrap}>
      <div style={box.h}>{title || "Import a list from a spreadsheet"}</div>
      <div style={box.p}>
        {hint || "Select the sheet including its header row, copy, and paste it here."} Nothing is written
        until you press Apply, and your counts and logs are never touched.
      </div>

      {/* ── SPECIFIC INSTRUCTIONS, ON THE SCREEN ──────────────────────────
          Matt, Aug 10 2026: "the paste boxes need specific instructions so I
          don't get a message every time about how to do something." Every
          question this box used to generate is answered here, in order:
          where the file comes from, what columns it needs, and which formats
          work. `steps` is a prop so the wording for a tile lives WITH that
          tile, next to the data it is describing.
          ⚠️ THE COLUMN LIST IS DERIVED FROM `want`, NOT TYPED. A hand-written
          list is a second copy of the field set and would go stale the first
          time a tile changed what it asks for — and going stale here means
          the screen confidently tells somebody to bring the wrong columns.
          It reads the same FIELD_HELP the mapper below reads, and marks the
          same single required field the mapper marks. */}
      <div style={box.steps}>
        {Array.isArray(steps) && steps.length > 0 && (
          /* ⚠️ `listStyle` SET EXPLICITLY. The app's CSS reset strips list
             markers, so the numbered steps rendered as three unnumbered lines
             and read as one run-on instruction. The numbers are the whole
             point of an ordered list here. */
          <ol style={{ margin: "0 0 8px", paddingLeft: 20, listStyle: "decimal", listStylePosition: "outside" }}>
            {steps.map((t, i) => (
              <li key={i} style={{ marginBottom: 3 }}>{t}</li>
            ))}
          </ol>
        )}
        <div>
          <b>Columns it needs:</b>{" "}
          {want.map((f, i) => (
            <span key={f}>
              {i > 0 ? " · " : ""}{FIELD_HELP[f] || f}{f === "name" ? " (required)" : ""}
            </span>
          ))}
        </div>
        <div style={{ marginTop: 3 }}>
          <b>Formats:</b> CSV, PDF, plain text, or rows pasted straight in.
          Not Excel. In Excel choose File, then Save As, then CSV, and use that.
        </div>
        <div style={{ marginTop: 3 }}>
          Extra columns are ignored. Order does not matter, because you confirm
          which column is which below before anything is written.
        </div>
      </div>

      {/* ⚠️ THE VALUE IS CAPTURED BEFORE THE UPDATER RUNS. `ev.target` is a
          pooled synthetic event; reading it inside a state updater is the
          eventcheck rule and it has bitten this repo before. */}
      <div
        onDragOver={(ev) => { ev.preventDefault(); if (!drag) setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(ev) => {
          ev.preventDefault();
          setDrag(false);
          const f = ev.dataTransfer && ev.dataTransfer.files ? ev.dataTransfer.files[0] : null;
          takeFile(f);
        }}
        style={{ position: "relative", borderRadius: 10, outline: drag ? "2px dashed #DD0031" : "none", outlineOffset: 2 }}
      >
        <textarea
          value={raw}
          onChange={(ev) => { const v = ev.target.value; onPaste(v); }}
          rows={6}
          placeholder={"Category\tItem Name\tSKU\tPar"}
          style={box.ta}
        />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
        <button type="button" onClick={() => fileRef.current && fileRef.current.click()}
          style={{ border: "1px solid #D1D5DB", background: "#fff", borderRadius: 8, padding: "7px 12px", fontSize: 13, fontWeight: 700, color: "#374151", cursor: "pointer" }}>
          Choose a file
        </button>
        <span style={{ fontSize: 12.5, color: "#6B7280" }}>
          {IMPORT_HINT}
        </span>
        <input
          ref={fileRef}
          type="file"
          accept={IMPORT_ACCEPT}
          style={{ display: "none" }}
          onChange={(ev) => {
            const f = ev.target.files && ev.target.files[0] ? ev.target.files[0] : null;
            /* Cleared so choosing the SAME file twice still fires onChange —
               the browser skips the event when the value has not changed. */
            ev.target.value = "";
            takeFile(f);
          }}
        />
      </div>

      {headers.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 }}>
            Which column is which? {det && det.ok ? "I had a guess, change anything I got wrong." : "I could not tell, so please pick."}
          </div>
          {want.map((f) => (
            <div key={f} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 5 }}>
              <span style={{ fontSize: 12.5, color: "#374151" }}>
                {FIELD_HELP[f] || f}{f === "name" ? " (required)" : ""}
              </span>
              <select
                value={map && map[f] != null ? String(map[f]) : ""}
                onChange={(ev) => { const v = ev.target.value; setMap((m) => ({ ...(m || {}), [f]: v === "" ? null : Number(v) })); setPlan(null); }}
                style={box.sel}
              >
                <option value="">Not in this sheet</option>
                {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}

      {err && <div style={box.err}>{err}</div>}

      <div style={{ display: "flex", gap: 9, marginTop: 11, justifyContent: "flex-end" }}>
        <button style={box.sec} onClick={reset}>Cancel</button>
        <button style={box.prim} onClick={check} disabled={!raw.trim()}>Check</button>
      </div>

      {plan && (
        <div style={{ marginTop: 13, borderTop: "1px solid #E5E7EB", paddingTop: 11 }}>
          {nothingToDo ? (
            <div style={{ fontSize: 13, color: "#6B7280" }}>
              That sheet matches the list you already have. Nothing to change.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12.5, color: "#6B7280", marginBottom: 9 }}>
                {plural(plan.unchanged.length, "item", "items")} already match and are left alone.
              </div>

              <Group
                on={pick.add} set={(v) => setPick((p) => ({ ...p, add: v }))}
                n={plan.add.length} label={plural(plan.add.length, "item to add", "items to add")}
                names={plan.add.map((r) => r.name)}
              />

              {plan.update.length > 0 && (
                canUpdate ? (
                  <Group
                    on={pick.update} set={(v) => setPick((p) => ({ ...p, update: v }))}
                    n={plan.update.length} label={plural(plan.update.length, "item to update", "items to update")}
                    names={plan.update.map((u) => `${u.label} — ${Object.keys(u.changes).map((k) => `${k} ${u.changes[k].from} → ${u.changes[k].to}`).join(", ")}`)}
                  />
                ) : (
                  <div style={box.warn}>
                    <b>{plural(plan.update.length, "item differs", "items differ")} from this sheet, and the import
                    cannot change them yet.</b> {updateNote} Listed so you can see them:
                    <div style={{ ...box.list, color: "#92400E" }}>
                      {plan.update.map((u) => (
                        <div key={u.id}>
                          {u.label} — {Object.keys(u.changes).map((k) => `${k} ${u.changes[k].from} → ${u.changes[k].to}`).join(", ")}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              )}

              <Group
                on={pick.discontinue} set={(v) => setPick((p) => ({ ...p, discontinue: v }))}
                n={plan.discontinue.length}
                label={plural(plan.discontinue.length, "item not on the sheet", "items not on the sheet")}
                names={plan.discontinue.map((d) => d.label)}
                caution="Ticking this hides them. Nothing is deleted and their counts stay, so restoring brings the real number back. Leave it off if this sheet is only part of your list."
              />

              {(plan.blocked || []).length > 0 && (
                <div style={box.warn}>
                  <b>{plural(plan.blocked.length, "row has nowhere to go", "rows have nowhere to go")}.</b> This
                  tool's categories are a fixed list and the import cannot invent one, so these are left out
                  rather than dropped somewhere they do not belong.
                  <div style={{ ...box.list, color: "#92400E" }}>
                    {plan.blocked.map((b, i) => <div key={i}>{b.row.name} — {b.why}</div>)}
                  </div>
                </div>
              )}

              {plan.ambiguous.length > 0 && (
                <div style={box.warn}>
                  <b>{plural(plan.ambiguous.length, "row was skipped", "rows were skipped")}</b> because it could
                  be more than one item. These are never guessed at.
                  <div style={{ ...box.list, color: "#92400E" }}>
                    {plan.ambiguous.map((a, i) => (
                      <div key={i}>{a.row.name} — {a.why}{a.hits.length ? `: ${a.hits.join(" · ")}` : ""}</div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 9, marginTop: 12, justifyContent: "flex-end" }}>
                <button style={box.sec} onClick={reset}>Cancel</button>
                <button style={box.prim} onClick={apply}>Apply</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* One tickable group. Renders nothing at all when the group is empty — an
   empty "0 items to add" line is noise on a screen that is already asking
   somebody to read carefully. */
function Group({ on, set, n, label, names, caution }) {
  if (!n) return null;
  return (
    <div style={box.group}>
      <label style={box.gh}>
        <input
          type="checkbox"
          checked={on}
          onChange={(ev) => { const v = ev.target.checked; set(v); }}
          style={{ width: 16, height: 16, cursor: "pointer" }}
        />
        {label}
      </label>
      {caution && <div style={{ fontSize: 11.5, color: "#92400E", marginTop: 4, lineHeight: 1.45 }}>{caution}</div>}
      <div style={box.list}>{names.slice(0, 40).join(" · ")}{names.length > 40 ? ` … and ${names.length - 40} more` : ""}</div>
    </div>
  );
}
