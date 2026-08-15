/* ============================================================================
   BusinessScorecard.jsx — Gate City Hub · Business Scorecard
   Leadership tier (3).

   FY26. Same rows, same sections — no additions.

   COLUMN SEMANTICS (added 7/16/26): the RDR only reports a discrete Q1/Q2
   split for the eight Operations rows. Every other row is reported as
   cumulative YTD ("YTD 6/2026"). The old grid pretended all 36 rows were
   quarterly, so Q1 read blank on 28 of them and YTD got stuffed into Q2.
   Each section now carries colMode: "quarter" | "ytd", and the column
   headers say which. Four editable boxes either way — nothing was removed.

     · Goals + benchmarks stay editable inline (yearly planning sessions)
     · All four quarter columns (Q1–Q4) stay editable, always visible
     · Status chips stay tap-to-cycle (On goal → Near → Behind → Pending)
     · Delta auto-computes vs goal when both values parse numerically

   Q2 FY26 refresh (7/16/26): actuals + benchmarks pulled from the CFA
   AnalyticsHub Restaurant Data Report, June 2026, Gate City FSU (04010).
   Rows with no RDR source (Food Safety, R&M, headcounts, contest ranks)
   are carried forward untouched.

   Persistence: kvGet/kvSet ("gcfcr-scorecard-fy26-v1") with the Hub's
   standard debounced autosave + Saving/Saved badge. On load, the Q2 FY26
   refresh below is MERGED into live KV (Q2 + bench + status only) so the
   Q1 / Q3 / Q4 columns you've already typed are never touched.

   ONE-TIME MERGE: once this has loaded and the numbers look right, the
   merge block in the load useEffect can be cut back to a plain kvGet —
   otherwise it re-applies the Q2 seed on every load and will overwrite
   any later hand-edits to Q2 or the status chips.
   ============================================================================ */

import { useState, useEffect, useRef, useCallback } from "react";
/* The shared raised look and accent edge — see cardStyle.js. */
import { CARD_3D, accentEdge, ACCENT_NEUTRAL } from "./cardStyle.js";
import { hubToken, kvSet, kvGetResult } from "./store.js";
import PasteMonth from "./PasteMonth.jsx";
import { parseScorecardPaste } from "./pasteImports.js";

const KV_KEY = "gcfcr-scorecard-fy26-v1";

const RED = "#DD0031";
const INK = "#13293F";
const GRAY = "#6B7480";
const LINE = "#E3E7EC";
const BG = "#F6F8FA";
const MONO = "'SF Mono', Menlo, Consolas, monospace";

const STATUS_ORDER = ["hit", "close", "miss", "pending"];
/* E1, editor-vs-renderer census (Jul 31): five renders indexed STATUS[...]
   bare. Any status outside the four (a legacy record, a hand-edited value —
   the merge only re-normalises rows whose label matches a SEED row) was a
   render-time TypeError: a blank page with no message, this repo's signature
   crash. One lookup, one fallback: unknown reads as "pending". */
const statusOf = (st) => STATUS[st] || STATUS.pending;
const STATUS = {
  hit: { color: "#1B7F4B", bg: "#E7F4EC", label: "On goal" },
  close: { color: "#B7791F", bg: "#FBF3E4", label: "Near goal" },
  miss: { color: "#C0392B", bg: "#FBEAE7", label: "Behind" },
  pending: { color: "#9CA3AF", bg: "#F3F4F6", label: "Pending" },
};

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];

// Column header labels per section colMode.
//   "quarter" — discrete quarter actuals. Only the Operations rows get these;
//               the RDR reports a real Q1/Q2 CEM split for them.
//   "ytd"     — cumulative year-to-date THROUGH that quarter. Everything else.
//               The RDR only ever reports these as "YTD 6/2026" etc., so a
//               discrete-quarter box would have to be invented. YTD Q2 = H1.
const Q_LABELS = {
  quarter: ["Q1", "Q2", "Q3", "Q4"],
  ytd: ["YTD Q1", "YTD Q2", "YTD Q3", "YTD Q4"],
};
const colLabels = (mode) => Q_LABELS[mode] || Q_LABELS.quarter;

// ── Seed data (used only on first load; KV takes over after) ────────
/* ⚠️ THE FY26 SEED IS NOT IN THIS FILE ANYMORE. Aug 8 2026.
   `SEED` and its `seedRow` helper held this restaurant's whole operator
   scorecard next to the CFA benchmarks it is measured against — net profit,
   labor and food cost gaps, average wage, retention, turnover, catering
   dollars, contest rank — and this tile's chunk answers HTTP 200 to anyone.
   The tier 3 gate decides what RENDERS. It never stopped the download.
   It now lives in scorecardSeed.js, which only worker.js imports, and arrives
   from GET /api/scorecard-seed behind the same gate as the food gaps, the
   inventory gaps and the supplier roster.
   ⚠️ DO NOT IMPORT THAT FILE HERE. One import puts the scorecard straight back
   in the browser and closes nothing. */

/* Ask the Worker for the FY26 seed. Returns {} on ANY failure — a refusal, a
   network blip, an expired token. The loader below treats a seedless load as
   "render what is stored, merge nothing, WRITE nothing", which is the only
   safe reading: merging against a missing seed would strip `updated`, reset
   `activeQ` and then persist that over a real record. */
async function fetchScorecardSeed() {
  try {
    const r = await fetch("/api/scorecard-seed", { headers: { "x-hub-token": hubToken() } });
    const d = await r.json().catch(() => null);
    return (d && d.ok && d.seed) || {};
  } catch { return {}; }
}

// ── Helpers ─────────────────────────────────────────────────────────
function parseNum(s) {
  if (s == null || s === "") return null;
  const cleaned = String(s).replace(/[$,%#<>\s]/g, "").replace(/−/g, "-");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/* `latestQ` (last FILLED quarter) was removed with the delta fix — it is what
   made the number under a quarter belong to a different quarter. Use `qAt`. */

/* ⚠️ COMPARES THE QUARTER ON SCREEN, NOT WHICHEVER ONE HAS A NUMBER IN IT.
   `latestQ` returns the last FILLED quarter, so once Q3 had a value the delta
   printed beside Q2 was really Q3's — the row you were reading and the number
   under it were about different quarters, with nothing saying so. A leader
   comparing quarters is exactly who reads this column.
   An empty active quarter now shows no delta at all, which is the honest
   answer: there is nothing yet to compare. */
/* The value in ONE specific quarter, or null when that quarter is blank. */
function qAt(row, qi) {
  const q = Array.isArray(row.q) ? row.q : [];
  const v = q[qi];
  return v && String(v).trim() !== "" ? { val: v, idx: qi } : null;
}

function deltaFor(row, activeQ) {
  const latest = qAt(row, activeQ);
  if (!latest) return null;
  const g = parseNum(row.goal);
  const a = parseNum(latest.val);
  if (g == null || a == null) return null;
  const diff = a - g;
  const sign = diff >= 0 ? "+" : "−";
  const abs = Math.abs(diff);
  if (String(row.goal).includes("$")) {
    return `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (String(row.goal).includes("%")) {
    const p = abs.toLocaleString("en-US", { maximumFractionDigits: 2 });
    return `${sign}${p} pts`;
  }
  return `${sign}${abs.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function hitCount(rows) {
  // A section stored without its `rows` array counts as 0/0, never a throw.
  const list = Array.isArray(rows) ? rows : [];
  const scored = list.filter((r) => r.status !== "pending");
  return { hits: scored.filter((r) => r.status === "hit").length, total: scored.length };
}

// ── Small pieces ────────────────────────────────────────────────────
function PunchStrip({ rows, size = 7 }) {
  // Same guard as hitCount: no `rows` renders an empty strip, never a throw.
  const list = Array.isArray(rows) ? rows : [];
  return (
    <div style={{ display: "flex", gap: 2.5, flexWrap: "wrap" }}>
      {list.map((r, i) => (
        <span
          key={i}
          title={`${r.label} — ${statusOf(r.status).label}`}
          style={{
            width: size,
            height: size,
            borderRadius: 2,
            background: statusOf(r.status).color,
            opacity: r.status === "pending" ? 0.4 : 1,
          }}
        />
      ))}
    </div>
  );
}

function StatusChip({ status, onCycle }) {
  const s = statusOf(status);
  return (
    <button
      onClick={onCycle}
      title={`${s.label} — tap to change`}
      style={{
        border: "none",
        cursor: "pointer",
        fontFamily: MONO,
        fontSize: 10.5,
        fontWeight: 700,
        color: s.color,
        background: s.bg,
        borderRadius: 6,
        padding: "5px 0",
        width: 58,
        textAlign: "center",
        flexShrink: 0,
        whiteSpace: "nowrap",
      }}
    >
      {s.label}
    </button>
  );
}

const cellInput = (active) => ({
  fontFamily: MONO,
  fontSize: 16,
  fontWeight: 600,
  fontVariantNumeric: "tabular-nums",
  textAlign: "center",
  width: "100%",
  boxSizing: "border-box",
  padding: "6px 2px",
  border: `1px solid ${active ? "#F3C2CC" : LINE}`,
  borderRadius: 7,
  background: active ? "#FFF6F8" : "#FAFBFC",
  color: "#1F2937",
  outline: "none",
  minWidth: 0,
});

const colHead = {
  fontSize: 9.5,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#AAB4C0",
  textAlign: "center",
};

// Column widths
const GOAL_W = 104;
const Q_W = 96;
const STATUS_W = 58;
// Minimum width of the data grid (label + goal + 4 quarters + status + gaps).
// Below this — i.e. on a phone — the grid scrolls horizontally instead of
// overflowing off-screen. On iPad it fits, so nothing scrolls.
const LABEL_MIN = 150;
/* Matt, Jul 31: "just have the current and past quarter visible but the goals
   still visible. It should clean up the view." Two quarter columns render —
   the active one and the one before it — and the Goal column always shows.
   ALL FOUR quarters stay stored and editable: tap an earlier quarter chip in
   the masthead and the view slides back to it. Display only, no data change. */
const qVisible = (qi, activeQ) => qi === activeQ || qi === activeQ - 1;
const GRID_MIN = LABEL_MIN + GOAL_W + Q_W * 2 + STATUS_W + 8 * 4 + 28;

// ── Rows ────────────────────────────────────────────────────────────
function Row({ row, activeQ, onField, onQ, onStatus }) {
  // A row stored without `q` still renders its boxes empty instead of taking
  // the whole section card down.
  const q = Array.isArray(row.q) ? row.q : [];
  const delta = deltaFor(row, activeQ);
  const latest = qAt(row, activeQ);
  const g = parseNum(row.goal);
  const a = latest ? parseNum(latest.val) : null;
  const showBar = row.bar && g != null;
  const barPct = showBar && a != null ? Math.min(100, Math.round((a / g) * 100)) : 0;

  return (
    <div style={{ padding: "10px 14px", borderTop: `1px solid ${LINE}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Label + note + delta */}
        <div style={{ flex: 1, minWidth: LABEL_MIN }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: "#1F2937" }}>{row.label}</div>
          {row.note && (
            <div
              style={{
                fontSize: 11,
                color: row.note === "Q3 priority" ? RED : GRAY,
                fontWeight: row.note === "Q3 priority" ? 700 : 400,
                marginTop: 1,
              }}
            >
              {row.note}
            </div>
          )}
          {delta && (
            <div
              style={{
                fontFamily: MONO,
                fontSize: 10.5,
                fontWeight: 700,
                color: statusOf(row.status).color,
                marginTop: 2,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {delta} vs goal
            </div>
          )}
        </div>

        {/* Goal + bench (editable) */}
        <div style={{ width: GOAL_W, flexShrink: 0 }}>
          <input
            value={row.goal}
            onChange={(e) => onField("goal", e.target.value)}
            placeholder="—"
            style={{ ...cellInput(false), fontWeight: 700, background: "#fff" }}
          />
          <input
            value={row.bench}
            onChange={(e) => onField("bench", e.target.value)}
            placeholder="bench"
            style={{
              fontFamily: MONO,
              fontSize: 16,
              textAlign: "center",
              width: "100%",
              boxSizing: "border-box",
              padding: "3px 2px",
              border: "none",
              background: "transparent",
              color: "#AAB4C0",
              outline: "none",
              marginTop: 1,
              minWidth: 0,
            }}
          />
        </div>

        {/* Quarter actuals — current + previous render; all four stay stored,
            and picking an earlier quarter chip brings its column back */}
        {QUARTERS.map((qLabel, qi) => qVisible(qi, activeQ) && (
          <div key={qLabel} style={{ width: Q_W, flexShrink: 0 }}>
            <input
              value={q[qi] || ""}
              onChange={(e) => onQ(qi, e.target.value)}
              placeholder="—"
              style={cellInput(qi === activeQ)}
            />
          </div>
        ))}

        <StatusChip status={row.status} onCycle={onStatus} />
      </div>

      {/* Staffing bar */}
      {showBar && (
        <div style={{ height: 6, background: "#EDF1F5", borderRadius: 999, marginTop: 8, overflow: "hidden" }}>
          <div
            style={{
              width: `${barPct}%`,
              height: "100%",
              background: statusOf(row.status).color,
              borderRadius: 999,
            }}
          />
        </div>
      )}
    </div>
  );
}

function SectionCard({ section, activeQ, onField, onQ, onStatus }) {
  // A section stored without `rows` renders its header and an empty grid.
  const rows = Array.isArray(section.rows) ? section.rows : [];
  const { hits, total } = hitCount(rows);
  return (
    <div
      id={`sc-${section.id}`}
      style={{
        background: "#fff",
        border: `1px solid ${LINE}`,
        ...accentEdge(ACCENT_NEUTRAL, 3), borderRadius: 12, boxShadow: CARD_3D,
        overflow: "hidden",
        scrollMarginTop: 108,
      }}
    >
      <div style={{ padding: "13px 14px 10px", borderBottom: `1px solid ${LINE}` }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: INK, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            {section.title}
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 12.5,
              fontWeight: 700,
              color: hits === total && total > 0 ? STATUS.hit.color : GRAY,
              whiteSpace: "nowrap",
            }}
          >
            {hits}/{total}
          </div>
        </div>
        {section.benchLabel && <div style={{ fontSize: 10.5, color: "#AAB4C0", marginTop: 2 }}>{section.benchLabel}</div>}
      </div>

      {/* Horizontally scrollable grid — on a phone the columns are wider
          than the viewport, so this lets you swipe across to the later
          quarters + status. On iPad the grid fits, so nothing scrolls. */}
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <div style={{ minWidth: GRID_MIN }}>
          {/* Column headers */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px 5px" }}>
            <span style={{ flex: 1, minWidth: LABEL_MIN }} />
            <span style={{ ...colHead, width: GOAL_W, flexShrink: 0 }}>Goal / Bench</span>
            {colLabels(section.colMode).map((qLabel, qi) => qVisible(qi, activeQ) && (
              <span
                key={qLabel}
                style={{
                  ...colHead,
                  width: Q_W,
                  flexShrink: 0,
                  color: qi === activeQ ? RED : "#AAB4C0",
                  fontWeight: qi === activeQ ? 800 : 700,
                }}
              >
                {qLabel}
              </span>
            ))}
            <span style={{ width: STATUS_W, flexShrink: 0 }} />
          </div>

          {rows.map((row, ri) => (
            <Row
              key={ri}
              row={row}
              activeQ={activeQ}
              onField={(field, val) => onField(ri, field, val)}
              onQ={(qi, val) => onQ(ri, qi, val)}
              onStatus={() => onStatus(ri)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────────
export default function BusinessScorecard() {
  const [data, setData] = useState(null);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const [activeSection, setActiveSection] = useState(0); // redesign: category rail selection
  const saveTimer = useRef(null);
  // true = the scorecard read FAILED (not "first run"). Mirrored in a ref so
  // scheduleSave (a []-keyed useCallback) always sees the current value.
  const [loadFailed, setLoadFailedState] = useState(false);
  /* ⚠️⚠️ THE THIRD STATE, AND ITS ABSENCE IS WHY THE VILLAGE SAW "Loading
     scorecard…" FOREVER. This tile had two states, data and no-data, and read
     no-data as "still coming". It is not. `seedCopy()` returns NULL when the
     seed arrives empty, and `setData(null)` is a FINISHED load with nothing in
     it — indistinguishable here from a load that had not started.

     Three ordinary things produce it at a store that is not Gate City: the
     seed route answers 401 on an expired token, or 403 to anyone who is not a
     finance reader, or the store simply has no saved record yet and no seed.
     All three are permanent, so the spinner never cleared and the screen that
     would have let somebody fix it sits below this early return.

     GuestExperience hit exactly this and fixed it with exactly this flag. The
     sibling tile was missed. `loaded` says the fetch has FINISHED, whatever it
     found — nothing else can say that, because `data` legitimately starts null
     and can legitimately stay null. */
  const [loaded, setLoaded] = useState(false);
  const loadFailedRef = useRef(false);
  const setLoadFailed = (v) => { loadFailedRef.current = v; setLoadFailedState(v); };

  // Load — merge the Q2 refresh into live KV without clobbering Q1/Q3/Q4
  useEffect(() => {
    let alive = true;
    (async () => {
      /* ⚠️ THE SEED ARRIVES FIRST, AND IT MAY NOT ARRIVE AT ALL (Aug 8 2026).
         It used to be a module const in this file. It is a gated fetch now, so
         everything below has to hold for a seedless load, and the rule is:
         render what is stored, merge nothing, write nothing. */
      const seed = await fetchScorecardSeed();
      const hasSeed = !!(seed && Array.isArray(seed.sections));
      /* A fresh copy per call. setData used to receive the module const
         itself, so an edit on a failed load mutated the seed in place for the
         rest of the session. */
      const seedCopy = () => (hasSeed ? JSON.parse(JSON.stringify(seed)) : null);
      // ⚠️ kvGetResult: a FAILED read used to land in the catch below as the
      // seed, and the next cell edit then saved seed-plus-one-cell over every
      // quarter's real numbers. On failure the seed renders behind a notice
      // and every save refuses until a reopen loads the real record.
      try {
        const r = await kvGetResult(KV_KEY);
        if (!alive) return;
        if (!r.ok) { setLoadFailed(true); setData(seedCopy()); return; }
        const saved = r.value;
        /* Shape guards, not transport guards. Everything below runs inside
           .then(), so a TypeError here lands in the .catch() and gets reported
           as "could not be reached" — a bad stored shape wearing a failed
           read's clothes, with saves and import switched off on top of it.
           Nothing in this block may throw. A `sections` that is not an array
           is a record we cannot merge into, so it takes the same path as no
           record at all: seed renders, first edit writes a good shape back.
           A genuinely failed read is still !r.ok above, and a genuinely
           rejected promise is still the .catch() below. */
        if (!saved || !Array.isArray(saved.sections)) {
          setData(seedCopy());
          return;
        }
        /* ⚠️ NO SEED, BUT A GOOD RECORD: SHOW IT AND TOUCH NOTHING.
           The merge below reads seed.updated, seed.activeQ and seed.sections.
           Run against {} it would blank `updated`, set `activeQ` to undefined
           and merge no rows — and the kvSet at the end of this block then
           WRITES that over a real record. A missing seed is a transport
           problem and must never become a data problem.
           Saves stay enabled on purpose: the record itself loaded cleanly, so
           this is not the failed-read case that loadFailed exists for. */
        if (!hasSeed) { setData(saved); return; }
        const merged = JSON.parse(JSON.stringify(saved));
        /* 🐛 GUARDED AUG 12 2026, AND THE GUARD ARRIVED WITH THE THING THAT
           NEEDED IT. This was unconditional, which was safe only while every
           seed that reached here carried a real date. A clone now gets
           `BLANK` from /api/scorecard-seed instead of `{}` — that is what
           stops the tile hanging on "Loading scorecard…" — and BLANK's
           `updated` is deliberately "". Unconditional, this line would take a
           store's own date, replace it with nothing, and the kvSet at the end
           of this block would then PERSIST the blank over their record.
           ⚠️ Truthiness is right here and `Number.isInteger` is right below,
           and they are not inconsistent: `updated` is a display string where
           "" means unset, activeQ is an INDEX where 0 is a real quarter.
           ⚠️ NO-OP AT GATE CITY. Its seed's `updated` has always been set, so
           this branch is taken there exactly as before. */
        if (seed.updated) merged.updated = seed.updated;
        /* 🐛 SAME REVERT-AND-PERSIST BUG AS THE ROW FIELDS BELOW, one level up.
           This was unconditional, and tapping a quarter chip writes activeQ
           (see the handler further down: `const next = { ...data, activeQ: qi }`).
           So a director switched the tile to another quarter, it saved, and the
           next open put it back to the seed's quarter and persisted that.
           ⚠️ `Number.isInteger`, NOT a truthiness test. activeQ is an INDEX and
           0 is a real quarter (Q1). `if (!merged.activeQ)` would treat Q1 as
           missing and quietly re-seed it every single load — the same bug wearing
           a fix's clothes. */
        if (!Number.isInteger(merged.activeQ)) merged.activeQ = seed.activeQ;
        seed.sections.forEach((ss) => {
          const ts = merged.sections.find((x) => x.id === ss.id);
          if (!ts) return;
          ts.colMode = ss.colMode; // column semantics live in code, not KV
          ts.benchLabel = ss.benchLabel;
          const trows = Array.isArray(ts.rows) ? ts.rows : []; // no rows → nothing to merge
          ss.rows.forEach((sr) => {
            const tr = trows.find((x) => x.label === sr.label);
            if (!tr) return;
            /* 🐛 `bench` WAS THE ONE FIELD LEFT OUT OF THE FIX BELOW, and it
               sat ABOVE the comment so it read as deliberately excluded. It was
               not: it is an editable input (`onChange={(e) => onField("bench",
               ...)}` further up) and the tile's own footer promises "Goals &
               benchmarks editable inline". A director corrected a peer benchmark
               in a planning session, the badge said Saved, and the next open put
               the old number back and wrote it over their edit.

               The old comment said "RDR benchmarks refresh — seed owns these",
               which was a real intent and is the tradeoff here: a stored row now
               keeps its benchmark even after corp changes the seed. That is the
               right way round. A stale benchmark is visible and someone can
               retype it; a typed number that silently reverts is invisible and
               reads as the save being broken.
               ⚠️ HOW A CORP REFRESH STILL LANDS: clear the field. An empty
               string is falsy, so the row re-seeds on the next load. That is the
               affordance, not a workaround. */
            if (sr.bench && !tr.bench) tr.bench = sr.bench;
            /* ★★ THE SEED FILLS BLANKS. IT NEVER OVERWRITES A HAND EDIT.
               🐛 This ran on EVERY load and then saved the result, so it was
               not a merge, it was a revert with a write behind it. `tr.status =
               sr.status` was unconditional, and a leader can change a row's
               status by tapping it (see the cycle handler further down). So
               they marked a row hit, it saved, and the next time anyone opened
               the tile the seed put it back and persisted that. The same went
               for a typed Q2 figure and a typed note.
               Nothing said so. The number simply went back to what it had been,
               which reads like the save never worked rather than like
               something undid it.
               Now each field is only filled when the stored row has nothing
               there, so a fresh row still gets its seed values and an edited
               one is left alone. */
            if (Array.isArray(tr.q) && sr.q[1] && !tr.q[1]) tr.q[1] = sr.q[1];
            if (!tr.status) tr.status = sr.status;
            if (sr.note && !tr.note) tr.note = sr.note;
          });
        });
        setData(merged);
        kvSet(KV_KEY, merged).catch(() => {});
      } catch {
        if (alive) { setLoadFailed(true); setData(seedCopy()); }
      } finally {
        /* ⚠️ `finally`, NOT A LINE AT THE BOTTOM. This block has five early
           returns in it. A flag set after them is set on one path out of six,
           which is the same spinner with extra steps. */
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Debounced save
  const scheduleSave = useCallback((next) => {
    // A record that never loaded must never be written — that is the wipe.
    if (loadFailedRef.current) { setSaveState("error"); return; }
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      // kvSet returns false on a refused write, never throws — the old .then
      // marked "Saved" either way.
      kvSet(KV_KEY, next)
        .then((ok) => setSaveState(ok ? "saved" : "error"))
        .catch(() => setSaveState("error"));
    }, 800);
  }, []);

  const commit = useCallback(
    (next) => {
      setData(next);
      scheduleSave(next);
    },
    [scheduleSave]
  );

  const updateRowField = (si, ri, field, value) => {
    const next = JSON.parse(JSON.stringify(data));
    next.sections[si].rows[ri][field] = value;
    commit(next);
  };

  const updateQ = (si, ri, qi, value) => {
    const next = JSON.parse(JSON.stringify(data));
    const target = next.sections[si].rows[ri];
    // The reads above now render a row with no `q` instead of crashing, so the
    // write has to be able to fill one in — otherwise the box is visible and
    // typing in it throws. Repair on write, never on read.
    target.q = Array.isArray(target.q) ? target.q : ["", "", "", ""];
    target.q[qi] = value;
    commit(next);
  };

  /* Paste import — the same button as every monthly, quarterly here. Rows
     are matched against this scorecard's own labels (case-insensitive);
     unknown labels are named and ignored, never invented. Values land in
     the pasted quarter's column, an optional third field updates the
     benchmark, and it all goes through ONE commit — the same guarded
     scheduleSave every hand edit uses. */
  const importScorecard = (text) => {
    if (loadFailedRef.current) return { ok: false, message: "The saved scorecard could not be reached — importing is off. Close and reopen the tile to retry." };
    const p = parseScorecardPaste(text);
    if (p.error) return { ok: false, message: p.error };
    const qi = Number(p.quarter.slice(1)) - 1;
    const next = JSON.parse(JSON.stringify(data));
    const unknown = [];
    let hit = 0;
    p.rows.forEach((row) => {
      let found = null;
      next.sections.forEach((s) => (Array.isArray(s.rows) ? s.rows : []).forEach((r) => {
        if (r.label.toLowerCase() === row.label.toLowerCase()) found = r;
      }));
      if (!found) { unknown.push(row.label); return; }
      found.q = Array.isArray(found.q) ? found.q : ["", "", "", ""]; // same repair as updateQ
      found.q[qi] = row.value;
      if (row.bench != null) found.bench = row.bench;
      hit++;
    });
    if (!hit) return { ok: false, message: `No row labels matched this scorecard.${unknown.length ? ` Unmatched: ${unknown.join(", ")}.` : ""}` };
    commit(next);
    return { ok: true, message: `Filled ${p.quarter} on ${hit} row${hit === 1 ? "" : "s"}.${unknown.length ? ` Ignored unknown rows: ${unknown.join(", ")}.` : ""}` };
  };

  const cycleStatus = (si, ri) => {
    const next = JSON.parse(JSON.stringify(data));
    const cur = next.sections[si].rows[ri].status;
    const idx = STATUS_ORDER.indexOf(cur);
    next.sections[si].rows[ri].status = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
    commit(next);
  };

  const setActiveQ = (qi) => {
    const next = { ...data, activeQ: qi };
    commit(next);
  };

  const setPeriod = (val) => {
    const next = { ...data, period: val };
    commit(next);
  };

  const jump = (id) => {
    const el = document.getElementById(`sc-${id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /* ⚠️ TWO SITUATIONS, TWO ANSWERS. `!loaded` is genuinely still coming.
     `loaded && !data` is finished with nothing, which is permanent, and saying
     "Loading" to it is the bug this whole flag exists for. */
  if (!data) {
    return (
      <div
        style={{
          fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,sans-serif",
          minHeight: "100vh",
          background: BG,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px 20px",
          color: GRAY,
          fontSize: 13.5,
          fontWeight: 600,
        }}
      >
        {!loaded ? (
          "Loading scorecard…"
        ) : (
          <div style={{ maxWidth: 460, textAlign: "center", lineHeight: 1.6 }}>
            <div style={{ fontWeight: 800, color: INK, marginBottom: 6 }}>
              The scorecard could not be set up
            </div>
            <div style={{ fontWeight: 600 }}>
              Nothing is saved for this store yet, and the starting rows did not
              load. That usually means the sign-in has expired, or this account
              is not allowed to read the financial screens.
              <br />
              Sign out and back in, and if it still says this, ask whoever set
              the Hub up.
            </div>
          </div>
        )}
      </div>
    );
  }

  // A section with no `rows` used to flatten to [undefined] and the filter
  // below then threw on r.status — the masthead score took the tile down.
  const allRows = (data.sections || []).flatMap((s) => (Array.isArray(s.rows) ? s.rows : []));
  const scored = allRows.filter((r) => r.status !== "pending");
  const hits = scored.filter((r) => r.status === "hit").length;

  return (
    <div
      style={{
        fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,sans-serif",
        minHeight: "100vh",
        background: BG,
        paddingBottom: 50,
      }}
    >
      {/* Scoreboard masthead — redesign */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600;700&display=swap');
        .sc-grid{max-width:1120px;margin:0 auto;padding:16px 20px 0;display:grid;grid-template-columns:minmax(220px,300px) 1fr;gap:18px;align-items:start;}
        .sc-grid > *{min-width:0;}
        .sc-cats{display:flex;flex-direction:column;gap:8px;}
        .sc-cats{min-width:0;}
        @media (max-width:820px){
          .sc-grid{grid-template-columns:1fr;gap:12px;}
          .sc-cats{flex-direction:row;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:4px;}
          .sc-cats > button{flex:0 0 auto;width:210px;}
          .sc-foot{display:none;}
        }`}</style>
      {loadFailed && (
        <div style={{ background: "#F5EAD3", borderBottom: "1px solid #E4CE9E", color: "#7A5410", padding: "10px 16px", fontSize: 13, fontWeight: 700 }}>
          The saved scorecard could not be reached — these are the starting numbers, not the live ones. Edits will not save. Close and reopen the tile to retry.
        </div>
      )}
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "12px 16px 0" }}>
        <PasteMonth buttonLabel="Paste the RDR quarter" accent="#1D4266"
          disabled={loadFailed} disabledNote="Import is off — the saved scorecard could not be reached."
          /* 🐛 THIS PLACEHOLDER WAS REAL BENCHMARK FIGURES (Aug 8 2026). OSAT
             78%, Taste 77%, Speed of Service 76% / 70% are the seed's actual
             Top-20% benchmarks and goals, so moving the seed to the worker
             left them sitting in this chunk. Smaller than the store's own
             results, and the same mistake — the inventory paste box did it
             within the hour.
             ⚠️ A FORMAT EXAMPLE NEEDS THE SHAPE, NEVER A REAL NUMBER. Labels
             stay so the format is recognisable; every figure is round and
             obviously invented. */
          placeholder={"SCORECARD Q3\nOSAT | 80%\nTaste | 80%\nSpeed of Service | 80% | 75%"}
          onImport={importScorecard} />
      </div>
      <div style={{ background: "linear-gradient(120deg,#1D4266 0%,#0B1826 55%)", color: "#fff", borderBottom: "3px solid #C0392B" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "18px 20px 18px" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.16em", color: "#F2A7A0", fontWeight: 600 }}>BUSINESS SCORECARD</span>
                <input
                  value={data.period}
                  onChange={(e) => setPeriod(e.target.value)}
                  style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: "#F2A7A0", border: "none", background: "transparent", outline: "none", width: 52, padding: 0 }}
                />
              </div>
              <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 }}>Performance Scoreboard</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", color: "#9FB0C4", fontWeight: 600 }}>ON GOAL</span>
                <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: saveState === "saving" ? "#E8C07D" : saveState === "saved" ? "#7FD1A0" : saveState === "error" ? "#F08A8A" : "transparent" }}>
                  {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "Save failed" : "·"}
                </span>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 28, fontWeight: 700, lineHeight: 1.1 }}>{hits}<span style={{ color: "#5C7089" }}>/{scored.length}</span></div>
            </div>
          </div>

          {/* Active quarter selector */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14, flexWrap: "wrap" }}>
            <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", color: "#9FB0C4", fontWeight: 600, marginRight: 2 }}>ACTIVE QUARTER</span>
            {QUARTERS.map((qLabel, qi) => {
              const on = qi === data.activeQ;
              return (
                <button
                  key={qLabel}
                  onClick={() => setActiveQ(qi)}
                  style={{
                    border: `1px solid ${on ? "#C0392B" : "rgba(255,255,255,.2)"}`,
                    background: on ? "#C0392B" : "rgba(255,255,255,.05)",
                    color: "#fff", fontFamily: MONO, fontSize: 12.5, fontWeight: 700,
                    borderRadius: 8, padding: "6px 14px", cursor: "pointer",
                  }}
                >
                  {qLabel}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Categories rail + active section — redesign */}
      <div className="sc-grid">
        {/* Category nav */}
        <div>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.12em", color: GRAY, fontWeight: 600, marginBottom: 8 }}>CATEGORIES</div>
          <div className="sc-cats">
            {data.sections.map((s, si) => {
              const { hits: h, total: t } = hitCount(s.rows);
              const on = si === activeSection;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(si)}
                  style={{
                    textAlign: "left",
                    background: on ? "#fff" : "transparent",
                    border: `1px solid ${on ? "#C9A0A0" : LINE}`,
                    ...accentEdge(ACCENT_NEUTRAL, 3), borderRadius: 11, boxShadow: CARD_3D,
                    padding: "11px 13px",
                    cursor: "pointer",
                    boxShadow: on ? "0 2px 8px rgba(19,41,63,.06)" : "none",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7, gap: 8 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>{s.title || s.short}</span>
                    <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: h === t && t > 0 ? STATUS.hit.color : GRAY }}>{h}/{t}</span>
                  </div>
                  <PunchStrip rows={s.rows} />
                </button>
              );
            })}
          </div>
          <div className="sc-foot" style={{ fontSize: 11, color: "#AAB4C0", padding: "10px 2px 0", lineHeight: 1.5 }}>
            Goals &amp; benchmarks editable inline · update the {QUARTERS[data.activeQ]} column monthly · YTD columns are cumulative · tap status to change
          </div>
        </div>

        {/* Active section */}
        <div>
          {data.sections[activeSection] && (
            <SectionCard
              section={data.sections[activeSection]}
              activeQ={data.activeQ}
              onField={(ri, field, val) => updateRowField(activeSection, ri, field, val)}
              onQ={(ri, qi, val) => updateQ(activeSection, ri, qi, val)}
              onStatus={(ri) => cycleStatus(activeSection, ri)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
