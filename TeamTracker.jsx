/* ============================================================================
   TeamTracker.jsx — Gate City Hub

   Bri's monthly team Tracker (requested Aug 1 2026, built Aug 2):
   a per-team, per-month grid — every day of the month down the side, AM/MID/PM
   columns plus a permanent Notes column, Sundays visible but greyed (store is
   closed). Reached from a "Tracker" button on that team's card in Team Goals.

   HER RULES, AS BUILT:
   • Input: Junior/Senior Trainers, Team Leaders and the AD — of THIS team only
     (their tier comes from the team's own roster in gc-team-directory-v1:
     "trainer" covers Jr/Sr, "tl", "ad"). Team members: view only.
   • Columns (rename/add/delete): Bri, HR, Ex Directors, Owner — the same
     canSetStatus class Team Goals already trusts, passed in as canManageAll —
     plus the AD of this team. Notes is permanent: always last, never renamed,
     never deleted.
   • Team-scoped: the Tracker button only renders for that team's people (and
     the canManageAll class); this component also refuses to render the grid
     for an outsider, so a stray render leaks nothing.
   • Every entry stamps who typed it, automatically.
   • Fresh template each month: a month with no record renders the default grid
     and WRITES NOTHING until someone types — the reset is the absence of a
     record, not a scheduled write. Old months stay readable (history kept —
     recommended to Bri Aug 2, her answer pending; flipping to hide-history
     would be a render choice, no data change).

   Storage: gc-team-tracker-{teamId}-{YYYY-MM}-v1
     { version:1, month, teamId, cols:[{id,name}], cells:{ "D|colId":{v,by,at} } }
   • cols = only the EDITABLE columns (default AM/MID/PM). "notes" is not in
     cols — it is a fixed column the renderer always appends.
   • cells keyed "dayOfMonth|colId". Deleting a column leaves its old cells in
     the record — invisible orphans, deliberately kept so a mis-click delete
     destroys nothing.

   ⚠️ EVERY WRITE RE-READS THE FRESHEST RECORD and merges ONE change (a cell or
   a column op) before saving — the same clobber-avoidance GoalSubmissions
   uses. Two leaders typing in different cells at once can no longer erase
   each other. A failed read refuses the write (loadOk pattern): saving over a
   record we never saw destroys it.
   ============================================================================ */
import React, { useEffect, useState } from "react";
/* The shared raised look and accent edge — see cardStyle.js. */
import { CARD_3D, accentEdge, ACCENT_NEUTRAL } from "./cardStyle.js";
import { kvSet, kvGetResult } from "./store.js";
import { sameLeader, sameId } from "./nameMatch.js";
import { courseOwnerLabel } from "./storeConfig.js";

const C = {
  red: "#E51636", navy: "#1A2238", ink: "#141821",
  sub: "#5B6474", line: "#E7E9EF", paper: "#F6F4EF", card: "#FFFFFF", gold: "#E8B23A",
};
const FONT = "'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, sans-serif";

const pad2 = (n) => String(n).padStart(2, "0");
const monthKey = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const shiftMonth = (k, delta) => { const [y, m] = k.split("-").map(Number); return monthKey(new Date(y, m - 1 + delta, 1)); };
const monthLabel = (k) => { const [y, m] = k.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }); };
const daysIn = (k) => { const [y, m] = k.split("-").map(Number); return new Date(y, m, 0).getDate(); };
const dayInfo = (k, d) => {
  const [y, m] = k.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return { sunday: dt.getDay() === 0, label: `${dt.toLocaleDateString("en-US", { weekday: "short" })} ${m}/${d}` };
};
const trackerKey = (teamId, ym) => `gc-team-tracker-${teamId}-${ym}-v1`;
const DEFAULT_COLS = [{ id: "am", name: "AM" }, { id: "mid", name: "MID" }, { id: "pm", name: "PM" }];
const MAX_COLS = 6;
const freshRec = (teamId, ym) => ({ version: 1, month: ym, teamId, cols: DEFAULT_COLS.map((c) => ({ ...c })), cells: {} });
const colUid = () => `c${Date.now().toString(36)}`;
const firstName = (s) => String(s || "").trim().split(/\s+/)[0] || "?";

export default function TeamTracker({ team, viewer, canManageAll, onBack }) {
  const [ym, setYm] = useState(monthKey());
  const [rec, setRec] = useState(null);
  // false = the month's read FAILED (not "empty") — every write refuses until
  // a reopen loads it, because saving over a record we never saw destroys it.
  const [loadOk, setLoadOk] = useState(true);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const [manage, setManage] = useState(false);
  const [drafts, setDrafts] = useState({});       // "D|colId" -> text while typing
  const [colDrafts, setColDrafts] = useState({}); // colId -> name while typing

  /* My standing on THIS team, from the team's own roster row.
     🐛 AND THE ID SHAPES NEVER MATCHED (Aug 10 2026). `p.hrId` is the
     directory's `27`; `viewer.id` is the roster's `tm27`. This comparison has
     always answered false for everybody whose row IS linked.
     ⚠️ WHICH MEANS THE Aug 3 FIX BELOW WAS ONLY HALF OF LIZY'S PROBLEM. Her row
     was linked in Team Directory as instructed, and she still could not see her
     own team's tracker, because linking it only fed a comparison that could not
     succeed. Two causes, one symptom, and fixing the visible one left her
     exactly where she started. See sameId in nameMatch.js. */
  const me = (team?.people || []).find((p) => sameId(p && p.hrId, viewer && viewer.id));
  const myTier = me ? me.tier : null;
  const canView = !!canManageAll || !!me;

  /* ★ WHY THE REFUSAL NEEDS TO KNOW MORE THAN `canView`.
     🐛 Bri, Aug 3 2026: "Lizy Gonzalez Ramos specifically is not seeing her new
     team tracker." Lizy is The Sparkle Squad's AD. Her directory row was added
     by hand, so it carries hrId: null, and the id match above can never find
     her. She got "this tracker belongs to another team" while standing on that
     team, which sent everyone hunting caches and sign-outs for half a day.

     ⚠️ THIS DOES NOT GRANT ACCESS, AND MUST NOT. Access stays on the HR id
     alone — a name is not an identity, and two people who share a first name
     and an initial would otherwise read each other's team. All this does is
     tell the truth about WHY the door is shut, so the person reads "your row
     is not linked yet" instead of "you are on the wrong team". One is a
     one-minute fix in Team Directory; the other is a wild goose chase. */
  const unlinkedRow = !me && !canManageAll
    ? (team?.people || []).find((p) => p && p.hrId == null && sameLeader(p.name, viewer?.name))
    : null;
  const canInput = !!canManageAll || myTier === "ad" || myTier === "tl" || myTier === "trainer";
  const canCols = !!canManageAll || myTier === "ad";

  useEffect(() => {
    let alive = true;
    setLoadOk(true);
    setRec(null);
    setDrafts({});
    setColDrafts({});
    (async () => {
      const r = await kvGetResult(trackerKey(team.id, ym));
      if (!alive) return;
      if (!r.ok) { setLoadOk(false); setRec(freshRec(team.id, ym)); return; }
      setRec(r.value && typeof r.value === "object" ? { ...freshRec(team.id, ym), ...r.value } : freshRec(team.id, ym));
    })();
    return () => { alive = false; };
  }, [team.id, ym]);

  /* One writer for everything: re-read the freshest record, apply ONE change,
     save, and adopt the merged result locally. `apply` gets the fresh record
     and returns the next one. */
  const persistPatch = async (apply) => {
    if (!loadOk) { setSaveState("error"); return; }
    setSaveState("saving");
    const fresh = await kvGetResult(trackerKey(team.id, ym));
    if (!fresh.ok) { setLoadOk(false); setSaveState("error"); return; }
    const base = fresh.value && typeof fresh.value === "object" ? { ...freshRec(team.id, ym), ...fresh.value } : freshRec(team.id, ym);
    const next = apply(base);
    const ok = await kvSet(trackerKey(team.id, ym), next);
    if (!ok) { setSaveState("error"); return; }
    setRec(next);
    setSaveState("saved");
    setTimeout(() => setSaveState("idle"), 1500);
  };

  const commitCell = (day, colId) => {
    const k = `${day}|${colId}`;
    if (!(k in drafts)) return;                    // nothing typed this focus
    const v = String(drafts[k] ?? "").trim();
    setDrafts((d) => { const n = { ...d }; delete n[k]; return n; });
    if (!canInput) return;
    const cur = (rec?.cells || {})[k];
    if ((cur?.v || "") === v) return;              // unchanged — no write
    persistPatch((base) => {
      const cells = { ...(base.cells || {}) };
      if (v) cells[k] = { v, by: viewer?.name || "?", at: new Date().toISOString() };
      else delete cells[k];
      return { ...base, cells };
    });
  };

  const commitColName = (colId) => {
    if (!(colId in colDrafts)) return;
    const v = String(colDrafts[colId] ?? "").trim();
    setColDrafts((d) => { const n = { ...d }; delete n[colId]; return n; });
    if (!canCols || !v) return;
    persistPatch((base) => ({ ...base, cols: (base.cols || DEFAULT_COLS).map((c) => (c.id === colId ? { ...c, name: v } : c)) }));
  };
  const addCol = () => {
    if (!canCols) return;
    persistPatch((base) => {
      const cols = [...(base.cols || DEFAULT_COLS)];
      return cols.length >= MAX_COLS ? base : { ...base, cols: [...cols, { id: colUid(), name: "New column" }] };
    });
  };
  const delCol = (colId) => {
    if (!canCols) return;
    if (!window.confirm("Remove this column? What was typed in it is kept in the record, just no longer shown.")) return;
    persistPatch((base) => {
      const cols = (base.cols || DEFAULT_COLS).filter((c) => c.id !== colId);
      return cols.length ? { ...base, cols } : base;   // never below one column
    });
  };

  if (!canView) {
    return (
      <div style={{ fontFamily: FONT, padding: 40 }}>
        <button onClick={onBack} style={{ cursor: "pointer", fontFamily: FONT, fontWeight: 600, borderRadius: 9, padding: "9px 16px", fontSize: 14, background: "transparent", color: C.sub, border: `1px solid ${C.line}` }}>← Back</button>
        {unlinkedRow ? (
          <div style={{ marginTop: 20, maxWidth: 460 }}>
            <p style={{ color: C.sub, fontSize: 14, lineHeight: 1.55, margin: 0 }}>
              You are listed on {team?.name || "this team"}, but your name has not been
              linked to your HR record yet, so the tracker cannot recognise you.
            </p>
            <p style={{ color: C.sub, fontSize: 14, lineHeight: 1.55, marginTop: 10 }}>
              Ask {courseOwnerLabel()} or HR to open Team Directory, find you on {team?.name || "this team"},
              and pick your name from the HR list. It takes a minute and this page
              will work straight away.
            </p>
          </div>
        ) : (
          <p style={{ color: C.sub, fontSize: 14, marginTop: 20 }}>This tracker belongs to {team?.name || "another team"} — it is only visible to that team.</p>
        )}
      </div>
    );
  }
  if (!rec) return <div style={{ fontFamily: FONT, padding: 40, color: C.sub }}>Loading tracker…</div>;

  const cols = rec.cols && rec.cols.length ? rec.cols : DEFAULT_COLS;
  const cells = rec.cells || {};
  const total = daysIn(ym);
  const gridCols = `112px repeat(${cols.length}, minmax(96px, 1fr)) minmax(150px, 1.5fr)`;

  const cellBox = (day, colId, disabled) => {
    const k = `${day}|${colId}`;
    const saved = cells[k];
    const value = k in drafts ? drafts[k] : (saved?.v || "");
    return (
      <div key={colId} style={{ padding: "4px 5px", borderLeft: `1px solid ${C.line}`, borderTop: `1px solid ${C.line}`, background: disabled ? "#F1F2F5" : "#fff" }}>
        {disabled ? null : canInput ? (
          <>
            <input
              value={value}
              onChange={(e) => { const v = e.target.value; setDrafts((d) => ({ ...d, [k]: v })); }}
              onBlur={() => commitCell(day, colId)}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              style={{ fontFamily: FONT, fontSize: 13, width: "100%", boxSizing: "border-box", border: "none", outline: "none", background: "transparent", color: C.ink, padding: "3px 2px" }}
            />
            {saved && !(k in drafts) && <div style={{ fontSize: 9.5, color: C.sub, padding: "0 2px" }}>{firstName(saved.by)}</div>}
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, color: C.ink, padding: "3px 2px", minHeight: 19, whiteSpace: "pre-wrap" }}>{saved?.v || ""}</div>
            {saved && <div style={{ fontSize: 9.5, color: C.sub, padding: "0 2px" }}>{firstName(saved.by)}</div>}
          </>
        )}
      </div>
    );
  };

  return (
    <div style={{ fontFamily: FONT, background: C.paper, minHeight: "100vh", padding: "18px 16px 60px" }}>
      <div style={{ maxWidth: 1060, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button onClick={onBack} style={{ cursor: "pointer", fontFamily: FONT, fontWeight: 600, borderRadius: 9, padding: "8px 14px", fontSize: 13.5, background: "transparent", color: C.sub, border: `1px solid ${C.line}` }}>← Team Goals</button>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.ink }}>{team.name} · Tracker</h1>
          <span style={{ flex: 1 }} />
          {saveState === "saving" && <span style={{ fontSize: 12, color: C.sub, fontWeight: 700 }}>Saving…</span>}
          {saveState === "saved" && <span style={{ fontSize: 12, color: "#166534", fontWeight: 700 }}>Saved ✓</span>}
          {saveState === "error" && <span style={{ fontSize: 12, color: C.red, fontWeight: 700 }}>Not saved — reopen the tracker</span>}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button onClick={() => setYm(shiftMonth(ym, -1))} style={{ cursor: "pointer", border: `1px solid ${C.line}`, background: "#fff", borderRadius: 8, padding: "5px 11px", fontSize: 13, fontFamily: FONT }}>‹</button>
          <div style={{ fontWeight: 800, color: C.ink, fontSize: 15, minWidth: 150, textAlign: "center" }}>{monthLabel(ym)}</div>
          <button onClick={() => setYm(shiftMonth(ym, 1))} style={{ cursor: "pointer", border: `1px solid ${C.line}`, background: "#fff", borderRadius: 8, padding: "5px 11px", fontSize: 13, fontFamily: FONT }}>›</button>
          {ym !== monthKey() && (
            <button onClick={() => setYm(monthKey())} style={{ cursor: "pointer", border: `1px solid ${C.line}`, background: "#fff", borderRadius: 8, padding: "5px 11px", fontSize: 12.5, fontFamily: FONT, color: C.sub }}>Jump to current month</button>
          )}
          <span style={{ flex: 1 }} />
          {canCols && (
            <button onClick={() => setManage((m) => !m)} style={{ cursor: "pointer", border: `1px solid ${manage ? C.red : C.line}`, background: manage ? "#FBEAED" : "#fff", color: manage ? C.red : C.sub, borderRadius: 8, padding: "5px 12px", fontSize: 12.5, fontWeight: 700, fontFamily: FONT }}>
              {manage ? "✓ Done with columns" : "✎ Columns"}
            </button>
          )}
        </div>

        {!loadOk && (
          <div style={{ background: "#FBEAED", border: "1px solid #F5C6CF", borderRadius: 10, padding: "10px 14px", marginTop: 12, fontSize: 13, color: "#B21230", fontWeight: 600 }}>
            This month could not be loaded — nothing here will save. Close the tracker and reopen it.
          </div>
        )}
        {!canInput && (
          <div style={{ background: "#EEF2FF", border: "1px solid #DDE3F8", borderRadius: 10, padding: "9px 14px", marginTop: 12, fontSize: 12.5, color: "#3730A3" }}>
            View only — trainers, team leaders and your AD make the entries.
          </div>
        )}
        {canInput && (
          <div style={{ fontSize: 12, color: C.sub, marginTop: 10 }}>
            Anything you type saves with your name on it. Sundays are greyed out — we're closed.
          </div>
        )}

        {manage && canCols && (
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, marginTop: 12 , ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: C.sub, marginBottom: 8 }}>Columns</div>
            <div style={{ display: "grid", gap: 8 }}>
              {cols.map((c) => (
                <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    value={c.id in colDrafts ? colDrafts[c.id] : c.name}
                    onChange={(e) => { const v = e.target.value; setColDrafts((d) => ({ ...d, [c.id]: v })); }}
                    onBlur={() => commitColName(c.id)}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                    style={{ fontFamily: FONT, fontSize: 13.5, padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.line}`, width: 200 }}
                  />
                  {cols.length > 1 && (
                    <button onClick={() => delCol(c.id)} style={{ cursor: "pointer", border: "none", background: "#FBEAED", color: "#B21230", borderRadius: 8, width: 30, height: 30, fontSize: 15 }}>×</button>
                  )}
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input value="Notes" disabled style={{ fontFamily: FONT, fontSize: 13.5, padding: "7px 10px", borderRadius: 8, border: `1px dashed ${C.line}`, width: 200, color: C.sub, background: "#F8F9FB" }} />
                <span style={{ fontSize: 11.5, color: C.sub }}>permanent — always the last column</span>
              </div>
              {cols.length < MAX_COLS && (
                <button onClick={addCol} style={{ cursor: "pointer", border: `1px solid ${C.line}`, background: "#fff", color: C.ink, borderRadius: 8, padding: "7px 12px", fontSize: 12.5, fontWeight: 700, fontFamily: FONT, width: "fit-content" }}>+ Add column</button>
              )}
            </div>
          </div>
        )}

        <div style={{ overflowX: "auto", marginTop: 12, border: `1px solid ${C.line}`, borderRadius: 12, background: C.card , ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }}>
          <div style={{ minWidth: 560 }}>
            <div style={{ display: "grid", gridTemplateColumns: gridCols, background: C.navy, color: "#fff", fontWeight: 800, fontSize: 12, letterSpacing: ".04em", textTransform: "uppercase" }}>
              <div style={{ padding: "9px 10px" }}>Day</div>
              {cols.map((c) => <div key={c.id} style={{ padding: "9px 8px", borderLeft: "1px solid rgba(255,255,255,.15)" }}>{c.name}</div>)}
              <div style={{ padding: "9px 8px", borderLeft: "1px solid rgba(255,255,255,.15)" }}>Notes</div>
            </div>
            {Array.from({ length: total }, (_, i) => i + 1).map((d) => {
              const info = dayInfo(ym, d);
              return (
                <div key={d} style={{ display: "grid", gridTemplateColumns: gridCols, borderTop: `1px solid ${C.line}`, background: info.sunday ? "#F1F2F5" : "#fff" }}>
                  <div style={{ padding: "7px 10px", fontSize: 12.5, fontWeight: 700, color: info.sunday ? "#A8AEBC" : C.ink }}>
                    {info.label}{info.sunday && <span style={{ fontWeight: 600 }}> · closed</span>}
                  </div>
                  {cols.map((c) => cellBox(d, c.id, info.sunday))}
                  {cellBox(d, "notes", info.sunday)}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
