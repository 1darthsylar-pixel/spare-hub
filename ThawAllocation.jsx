// ── Thaw Allocation ────────────────────────────────────────────────
// Money group · LIVE: allocation = average of the LAST TWO completed
// Fri+Sat weekends from the Sales Allocation tile; case pars =
// allocation × thaw factor. Holidays flagged in Sales Allocation are
// skipped (or use their adjusted value), so they never drag the
// average down — the engine reaches back to the prior clean weekend.
// Cabinet map auto-fills from the live pars: each physical slot keeps
// its product, cells light up as allocation rises and empty as it
// falls, and the badge turns red only when a month's pars need more
// thaw slots than the cabinets physically hold.

import { useEffect, useState, useRef } from "react";
/* The shared raised look and accent edge — see cardStyle.js. */
import { CARD_3D, accentEdge, ACCENT_NEUTRAL } from "./cardStyle.js";
import { kvGetResult, kvSet } from "./store";
import { loadSalesMonth, lastTwoWeekendsAvg } from "./SalesAllocation.jsx";
/* The numbers and the slot helpers, in a leaf that imports nothing — see the
   note further down about why they are not duplicated here. */
import { DEFAULT_FACTORS, FIXED_BAGS, SLOT_TO_PAR, productOf } from "./thawBoard.js";
/* `isGateCity` decides whether the built-in cabinet map below applies here —
   see the note above `liveCabinets`. */
import { STORE, isGateCity } from "./storeConfig.js"; // store name + number on the masthead
/* Text in, cabinets out. A leaf that imports nothing — see its header for why
   the board is pasted rather than generated. */
import { parseThawLayout, unknownProducts } from "./thawLayoutImport.js";
/* The daily coater sheet. Its own component, its own key, its own tier rules —
   see the note above where it renders. */
import CoaterSheet from "./CoaterSheet.jsx";

const CONFIG_KEY = "gcfcr-thaw-config-v1";
/* A store's own walk-in, as a cabinet map. Same shape as CABINETS below, so an
   imported board is indistinguishable from the built-in one at the point of use. */
const THAW_LAYOUT_KEY = "thaw:layout:v1";
/* Importing replaces the board a leader loads chicken from, so it sits with the
   other tier-3 actions rather than with the people who read the board. */
const THAW_IMPORT_MIN_TIER = 3;
// Self-stamp for the Input Health register: written every time the pars
// resolve (tile open or a config save). Records what the pars ran on and
// when anyone last looked — the register reads this, never the tile.
const STAMP_KEY = "gcfcr-thaw-stamp-v1";

/* Slot lists read top-to-bottom exactly as the doors are laid out.
   "" = empty slot.

   ⚠️ REPLACED Aug 6 2026 with the layout Matt sent, door by door. The version
   before this had blank spacer rows part-way down doors 1, 2 and 3, and put
   Strips and Spicy together in door 5. The real doors have no gaps, and four
   products each hold one slot MORE than the code believed:

       Nuggets 21 → 22 · Filets 10 → 11 · Grilled Nuggets 3 → 4 · Spicy BRK 1 → 2

   That number is not cosmetic. `capacity` is counted straight off these lists,
   and the badge turns red when a month's pars need more slots than the doors
   physically hold — so an undercount was calling a normal month an overflow.

   ⚠️ HIS LABELS ARE NOT THE FACTOR NAMES, and the difference is deliberate
   here rather than hidden in a lookup. productOf() strips a trailing number
   and the result must match a row in DEFAULT_FACTORS exactly, or that slot
   silently fills against a par of 0:

       "CFA Filets"   → Filets            "Grilled Fil"  → Grilled Filets
       "Breakfast"    → Breakfast Filets  "Grilled Nug"  → Grilled Nuggets
       "Spicy Filets" → Spicy             "Spicy BRK"    → Spicy BRK
                                            (SLOT_TO_PAR sends it to Spicy Breakfast)

   ⚠️ Names stay "Thaw 1..5" rather than "Door 1..5". Matt's sheet says Door;
   the tile has always said Thaw and leaders read it on a shared iPad every
   day. One word each to change if he wants it, but not a thing to switch on
   an inference from a column header. */
const CABINETS = [];
/* ⚠️ EMPTY ON PURPOSE, AND EMPTY IS A WORKING STATE. The origin store's thaw
   doors describe ITS walk-in, so they came out with the snapshot. This store
   loads its own: open Thaw Allocation as a Director and use the layout
   importer, which saves under `thaw:layout:v1`. Nothing needs editing here.
   The shape of an entry is `{ name, slots: [] }` if you ever want a default. */

/* ═══ WHOSE WALK-IN IS THIS? ════════════════════════════════════════════════
   ⚠️⚠️ THE LIST ABOVE IS GATE CITY'S PHYSICAL WALK-IN, DOOR BY DOOR, and until
   Aug 13 2026 every store that ran this code got it. The Village had the tile
   switched on for leaders and trainers, so a leader there opened Thaw
   Allocation and read our five doors and our 22 nugget slots as if they were
   describing their own walk-in.

   That is worse than the tile being missing. A missing tile gets asked about.
   A confident, wrong cabinet map in a food handling tool gets followed.

   ⚠️ CALLED AT RENDER, NEVER CAPTURED IN A MODULE CONST. `isGateCity()` reads
   the live config, and the live config arrives from the network AFTER this
   module evaluates. A `const IS_GC = isGateCity()` up here would freeze the
   answer at the defaults and learn nothing — the same module-load-versus-use
   trap storeConfig.js's own header warns about, and the reason this is a
   function rather than a value.

   ⚠️ AN EMPTY BOARD IS THE CORRECT ANSWER FOR A STORE THAT HAS NOT SAID, not a
   bug to fill in with a guess. Nobody here knows how many doors another store
   has. The pars above it are still right, because those come from that store's
   own sales; only the physical map is unknown.

   ⚠️ AND EMPTY IS NOT THE END OF IT (design rule 18). "Would another operator
   have to change this, and can they change it without a developer?" An honest
   blank board that only a deploy can fill still answers yes and no, so it is
   still a bug. The importer below is the screen that makes the answer yes and
   yes: a Director pastes the sheet already on their wall.

   ⚠️ null MEANS THE READ HAS NOT LANDED, and it is not the same as "none
   saved". Collapse the two and the tile flashes the empty state on every open,
   which reads as "your board was deleted" to the person who saved it. */
export function liveCabinets(stored, builtIn) {
  if (stored === null || stored === undefined) return null;
  if (Array.isArray(stored) && stored.length) return stored;
  return isGateCity() ? builtIn : [];
}

// Product → color, matched to the sheet's coding:
// Nuggets pink · Filets blue · Spicy purple · Strips green ·
// Grilled Nuggets grey · Grilled Filets tan · Breakfast Filets yellow ·
// Spicy Breakfast orange.
const PRODUCT_COLORS = {
  Nuggets: "#DB6E7A",
  Filets: "#2563EB",
  Spicy: "#6D28D9",
  "Spicy BRK": "#EA580C",
  Strips: "#2F5E1E",
  "Grilled Nuggets": "#6B7280",
  "Grilled Filets": "#C29A6B",
  "Breakfast Filets": "#D9A800",
  "Spicy Breakfast": "#EA580C",
};

/* ⚠️ DEFAULT_FACTORS, FIXED_BAGS, SLOT_TO_PAR and productOf MOVED to
   thawBoard.js on Aug 6 2026 and are imported at the top of this file. They
   were not copied. Two sets of the numbers that decide how much chicken
   thaws overnight would drift, and the drift stays invisible until a
   Saturday runs short. thawBoard.js is a strict leaf so the Worker and a
   cloned store can both reach them without dragging this tile's sales
   reader along. */
const colorOf = (label) => PRODUCT_COLORS[productOf(label)] || "#374151";

const money = (n) =>
  (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const pad = (n) => String(n).padStart(2, "0");
const ymOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const shiftMonth = (ym, delta) => {
  const [y, m] = ym.split("-").map(Number);
  return ymOf(new Date(y, m - 1 + delta, 1));
};

/* ⚠️ `tier` IS NEW AND DEFAULTS TO 1. Every tool is handed {tier, user} by
   App.jsx, but this tile never read them, so the default keeps it working if it
   is ever rendered without props. Defaulting LOW is the safe direction: an
   unknown caller gets the read-only board, not the import button. */
export default function ThawAllocation({ tier = 1, user }) {
  const now = new Date();
  const ym = ymOf(now);
  const period = now.toLocaleString("en-US", { month: "long", year: "numeric" }).toUpperCase();
  const canImport = Number(tier) >= THAW_IMPORT_MIN_TIER;

  const [alloc, setAlloc] = useState(null);   // what the pars run on
  const [liveBasis, setLiveBasis] = useState(null); // live Fri/Sat day avg
  const [auto, setAuto] = useState(true);     // false → manual override in use
  const [cfg, setCfg] = useState({ factors: DEFAULT_FACTORS, manual: "", useManual: false });
  const [showCfg, setShowCfg] = useState(false);
  /* null until the read lands. See liveCabinets: null is not empty. */
  const [storedCabs, setStoredCabs] = useState(null);
  const [readFailed, setReadFailed] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importSaving, setImportSaving] = useState(false);
  const [importMsg, setImportMsg] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      /* ⚠️ kvGetResult, NOT kvGet. A refused read must not read as "this store
         has no layout": that would blank a working board on screen and then let
         a save write the blank over the real one. Same rule Cash Audit and the
         token ledger follow. */
      let r;
      try { r = await kvGetResult(THAW_LAYOUT_KEY); } catch { r = null; }
      if (!alive) return;
      if (r && r.ok) setStoredCabs(Array.isArray(r.value) ? r.value : []);
      else setReadFailed(true);
    })();
    return () => { alive = false; };
  }, []);

  // Resolve what the pars run on: an armed manual override ALWAYS wins;
  // otherwise the live basis; a bare manual value is a last-resort fallback.
  const applyAlloc = (c, live) => {
    setLiveBasis(live);
    let a = null, isAuto = true;
    if (c.useManual && Number(c.manual) > 0) { a = Number(c.manual); isAuto = false; }
    else if (live != null) { a = live; isAuto = true; }
    else if (Number(c.manual) > 0) { a = Number(c.manual); isAuto = false; }
    setAlloc(a); setAuto(isAuto);
    // Self-stamp for the Input Health register. Best effort — a failed
    // write can never block the tile, and the stamp is re-posted on every
    // open, so a miss self-heals. kvSet returns false rather than throw;
    // the old .catch here was dead code.
    kvSet(STAMP_KEY, { at: new Date().toISOString(), alloc: a, auto: isAuto, live: live ?? null });
  };

  // The config read failed → factor/override edits refuse until a clean
  // reload. The defaults below are seeds; one edit after a failed read would
  // persist the seed factors over the tuned ones.
  const cfgFailedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      /* kvGetResult, not kvGet — kvGet returns null for a failed read as well
         as an empty one, and never throws (the dead .catch is gone). */
      const [cur, prev, prev2, savedR] = await Promise.all([
        loadSalesMonth(ym),
        loadSalesMonth(shiftMonth(ym, -1)),
        loadSalesMonth(shiftMonth(ym, -2)),
        kvGetResult(CONFIG_KEY),
      ]);
      if (!alive) return;
      cfgFailedRef.current = !savedR.ok;
      const c = { factors: DEFAULT_FACTORS, manual: "", useManual: false, ...(savedR.value || {}) };
      setCfg(c);
      applyAlloc(c, lastTwoWeekendsAvg(prev2, prev, cur));
    })();
    return () => { alive = false; };
  }, [ym]);

  const saveCfg = async (next) => {
    if (cfgFailedRef.current) {
      window.alert("Settings did not load, so saving is off — it would erase the tuned factors. Check the wifi and refresh.");
      return;
    }
    const prevCfg = cfg;
    setCfg(next);
    applyAlloc(next, liveBasis);
    // kvSet returns false on failure, it never throws — roll back so the pars
    // on screen keep matching the factors that are really stored.
    const ok = await kvSet(CONFIG_KEY, next);
    if (ok === false) {
      setCfg(prevCfg);
      applyAlloc(prevCfg, liveBasis);
      window.alert("That change did not save — check the wifi and try again.");
    }
  };

  const pars = (cfg.factors || DEFAULT_FACTORS).map(([name, f]) => {
    const bags = FIXED_BAGS[name];
    const count = !alloc ? 0 : (bags != null ? bags : Math.round(alloc * f));
    return [name, count, f, bags != null];
  });
  // Slot math runs in CASES. A fixed-bag product occupies one physical slot
  // while it has any bags at all — 3 bags thaw in the one Spicy BRK rack slot.
  const caseCount = ([, count, , isBags]) => (isBags ? (count > 0 ? 1 : 0) : count);
  const totalCases = pars.reduce((s, p) => s + caseCount(p), 0);
  const num = { fontVariantNumeric: "tabular-nums" };

  // ── Auto-fill the cabinet map from the live pars ──────────────────
  // Each physical slot keeps its product assignment; "" stays a fixed
  // gap. We walk the cabinets in order, renumber each product's slots
  // 1..N, and light up only the first `par` of them — so raising the
  // allocation fills more cells and lowering it empties trailing cells,
  // with no hand-editing. If a par exceeds a product's physical slot
  // count, the overflow is flagged rather than silently dropped.
  const parMap = Object.fromEntries(pars.map((p) => [p[0], caseCount(p)]));
  const parForSlot = (p) => parMap[SLOT_TO_PAR[p] ?? p] ?? 0;
  /* ⚠️ RESOLVED HERE, IN THE RENDER BODY. See the note by `liveCabinets`: the
     answer depends on config that arrives after this module loads.
     ⚠️ ONE READING, TWO CONSUMERS. `capacity` decides whether the month FITS
     and `cabRender` decides which shelves light up. One reading the store's
     saved layout while the other read the built-in board would put a green
     "it fits" over shelves from a different room. */
  const cabs = liveCabinets(storedCabs, CABINETS) || [];
  const hasBoard = cabs.length > 0;
  /* Loading and "nothing saved" both make `cabs` empty and only one of them
     should put a message on screen. */
  const loaded = storedCabs !== null || readFailed;

  /* ⚠️ REFUSES RATHER THAN SAVING A HALF-READ BOARD. parseThawLayout already
     returns ok:false with a reason for a cut-off paste or doors of different
     heights. The second check is the one that actually bites: a product name
     with no thaw factor behind it renders as a loaded shelf and is never
     allocated any chicken, so it is refused by name rather than saved. */
  async function saveLayout() {
    if (readFailed) { setImportMsg("The saved layout could not be read, so nothing can be saved right now."); return; }
    const parsed = parseThawLayout(importText);
    if (!parsed.ok) { setImportMsg(parsed.error); return; }
    /* ⚠️⚠️ `.map((f) => f[0])`, NOT `Object.keys()`. DEFAULT_FACTORS is an ARRAY
       OF [name, factor] PAIRS, so Object.keys() returns "0","1","2" — the
       indices. An earlier cut of this importer did exactly that, which made
       every product on every sheet unmatched and refused every paste. It looked
       like a careful safety check and was a brick wall. */
    const known = (Array.isArray(cfg.factors) ? cfg.factors : DEFAULT_FACTORS).map((f) => f[0]);
    const unknown = unknownProducts(parsed.cabinets, known, SLOT_TO_PAR);
    if (unknown.length) {
      setImportMsg(
        `These do not match any thaw factor, so they would never be allocated: ${unknown.join(", ")}. ` +
        `Rename them on the sheet to match the factor list, or add the factor first.`);
      return;
    }
    setImportSaving(true);
    const ok = (await kvSet(THAW_LAYOUT_KEY, parsed.cabinets)) !== false;
    setImportSaving(false);
    if (!ok) { setImportMsg("That did not save. Nothing has changed."); return; }
    setStoredCabs(parsed.cabinets);
    setImportOpen(false);
    setImportText("");
    setImportMsg(`Saved ${parsed.doors} doors of ${parsed.slots}, ${parsed.gaps} empty.`);
  }
  const capacity = {};
  cabs.forEach((cab) => cab.slots.forEach((s) => {
    if (s) { const p = productOf(s); capacity[p] = (capacity[p] || 0) + 1; }
  }));
  const running = {};
  const cabRender = cabs.map((cab) => {
    let filledInCab = 0;
    const cells = cab.slots.map((slot, i) => {
      if (!slot) return { key: i, filled: false, product: null, idx: null };
      const p = productOf(slot);
      running[p] = (running[p] || 0) + 1;
      const idx = running[p];
      const filled = idx <= parForSlot(p);
      if (filled) filledInCab += 1;
      return { key: i, filled, product: p, idx };
    });
    return { cab, cells, filledInCab };
  });
  const placed = Object.keys(capacity).reduce((s, p) => s + Math.min(parForSlot(p), capacity[p]), 0);
  const overflow = Object.keys(capacity)
    .map((p) => ({ product: p, over: parForSlot(p) - capacity[p] }))
    .filter((o) => o.over > 0);
  const fits = placed === totalCases; // every allocated case has a physical slot

  return (
    <div className="thaw-root" style={{ maxWidth: 1120, margin: "0 auto", padding: "22px 16px 48px", color: "#111827" }}>
      <style>{`
        @page { size: letter landscape; margin: 0.4in; }
        @media print {
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .thaw-root { max-width: none !important; padding: 0 !important; }
          .thaw-mast { background: none !important; color: #111827 !important; padding: 0 !important; margin: 0 0 10px !important; border-radius: 0 !important; }
          .thaw-mast .thaw-mast-eyebrow { color: #6B7280 !important; }
          .thaw-pars { grid-template-columns: repeat(4, 1fr) !important; }
          .thaw-cabs { grid-template-columns: repeat(5, 1fr) !important; gap: 8px !important; }
          .thaw-cabs > div { break-inside: avoid; }
        }
      `}</style>

      {/* ── Masthead ───────────────────────────────────────────── */}
      <div className="thaw-mast" style={{ background: "linear-gradient(120deg,#2C7A9E 0%,#14465C 55%)", color: "#fff", borderRadius: 14, padding: "16px 18px", marginBottom: 18 }}>
        <div className="thaw-mast-eyebrow" style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", color: "rgba(255,255,255,0.78)" }}>{STORE.name.toUpperCase()} FSR · #{STORE.fsr}</div>
        <div style={{ fontSize: 23, fontWeight: 800, letterSpacing: "-0.02em", marginTop: 3 }}>Thaw Allocation</div>
      </div>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex", flexWrap: "wrap", alignItems: "flex-end",
          justifyContent: "space-between", gap: 18, marginBottom: 22,
        }}
      >
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: "0.14em", color: "#DD0031" }}>
            THAW ALLOCATION · #{STORE.fsr}
          </div>
          <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: "-0.01em", marginTop: 4 }}>
            {period}
          </div>
        </div>

        {/* Ledger total + print */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 14 }}>
          <div style={{ textAlign: "right", minWidth: 210 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "#6B7280" }}>
              ALLOCATION {auto ? "· AUTO FRI/SAT DAY AVG" : "· MANUAL"}
            </div>
            <div
              style={{
                ...num, fontSize: 34, fontWeight: 900, lineHeight: 1.15, marginTop: 2,
                borderTop: "1.5px solid #111827", borderBottom: "4px double #111827",
                padding: "3px 0 5px",
              }}
            >
              {alloc != null ? money(alloc) : "—"}
            </div>
          </div>
          <button
            className="no-print"
            onClick={() => window.print()}
            style={{
              background: "#111827", color: "#fff", border: "none", borderRadius: 10,
              padding: "10px 16px", fontSize: 13, fontWeight: 800, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 7, marginBottom: 4,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Print
          </button>
        </div>
      </div>

      {alloc == null && (
        <div className="no-print" style={{ background: "#FFF8E6", border: "1px solid #F1E2AE", borderRadius: 12, padding: "12px 16px", marginBottom: 18, fontSize: 13.5, color: "#7A5A00", fontWeight: 600 }}>
          Needs the last two completed Fri+Sat weekends in Sales Allocation (holiday weekends without an adjusted value are skipped). Backfill there, or set a manual allocation in Settings below.
        </div>
      )}

      {/* ── Case pars ledger ───────────────────────────────────── */}
      <div
        style={{
          background: "#fff", border: "1px solid #E5E7EB", ...accentEdge(ACCENT_NEUTRAL, 3), borderRadius: 14, boxShadow: CARD_3D,
          padding: "16px 18px", marginBottom: 24,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.1em", color: "#6B7280", marginBottom: 10 }}>
          CASE PARS · COMPUTED FROM ALLOCATION
        </div>

        <div className="thaw-pars" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", columnGap: 34 }}>
          {pars.map(([name, cases, , isBags]) => (
            <div
              key={name}
              style={{
                display: "flex", alignItems: "baseline", gap: 8,
                padding: "6px 0", borderBottom: "1px dotted #D1D5DB",
              }}
            >
              <span
                style={{
                  width: 9, height: 9, borderRadius: 3, alignSelf: "center", flexShrink: 0,
                  background: PRODUCT_COLORS[name] || "#374151",
                }}
              />
              <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{name}</span>
              <span style={{ ...num, fontSize: 15, fontWeight: 800 }}>{isBags ? `${cases} bags` : cases}</span>
            </div>
          ))}
        </div>

        <div
          style={{
            display: "flex", justifyContent: "flex-end", alignItems: "baseline",
            gap: 10, marginTop: 12,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: "#6B7280" }}>
            TOTAL CASES
          </span>
          <span
            style={{
              ...num, fontSize: 18, fontWeight: 900,
              borderTop: "1.5px solid #111827", borderBottom: "3px double #111827",
              padding: "1px 4px 3px",
            }}
          >
            {totalCases}
          </span>
        </div>
      </div>

      {/* ── Coater allocation · the daily sheet ────────────────────
          ⚠️ IT IS NOT PART OF THE CABINET MAP AND MUST NOT BE FOLDED INTO IT.
          Both this repo's setup guide and the second store's notes once called
          the two "the same shape of problem", which was written before anybody
          had seen the sheet. Cabinets are a MAP of a room, filled in once by a
          Director. This is a DAILY LOG with two different writers and a new row
          every day. Same page, different things — so it is its own component
          with its own key, and nothing here reads the pars above.
          ⚠️ ITS OWN TIER RULES, INSIDE THE COMPONENT. This tile opens at tier 2
          with an `allow` list that lets trainers in, so "on the page" is not
          "may type in it". CoaterSheet gates each column itself. */}
      <CoaterSheet tier={tier} user={user} />

      {/* ── Cabinet map ────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.1em", color: "#6B7280" }}>
          CABINET MAP
        </div>
        <div
          style={{
            ...num, fontSize: 11.5, fontWeight: 800, padding: "2px 8px", borderRadius: 999,
            background: fits ? "#04785714" : "#DD003114",
            color: fits ? "#047857" : "#DD0031",
          }}
        >
          {placed} / {totalCases} cases mapped{fits ? "" : " — exceeds cabinet slots"}
        </div>
      </div>

      {/* ⚠️ `hasBoard &&` IS LOAD-BEARING, NOT A TIDY-UP. With no cabinet map,
          capacity is {} so `placed` is 0 and `fits` is false for any month with
          allocation — this banner would fire at a store that has no overflow
          and no board, and read "needs more thaw slots than the cabinets hold:"
          followed by nothing, because `overflow` is empty too. A red warning
          with a blank list is the worst of both. */}
      {hasBoard && !fits && (
        <div className="no-print" style={{ background: "#FDECEC", border: "1px solid #F5C2C2", borderRadius: 10, padding: "9px 13px", marginBottom: 12, fontSize: 12.5, color: "#B42318", fontWeight: 600 }}>
          This month's allocation needs more thaw slots than the cabinets hold:{" "}
          {overflow.map((o) => `${o.product} +${o.over}`).join(", ")}. Load each product to capacity and stage the extra, or add slots in the layout.
        </div>
      )}

      {/* ⚠️ SAYS WHAT IS MISSING AND WHAT IS STILL GOOD, in that order. The pars
          above this are correct for any store — they come from that store's own
          weekend sales. Only the physical door map is unknown. A store told
          nothing but "no cabinets" would reasonably assume the whole screen was
          broken and stop trusting the numbers, which are the useful half. */}
      {loaded && !hasBoard && (
        <div style={{ background: "#fff", border: "1px dashed #D1D5DB", borderRadius: 14, padding: "22px 20px", textAlign: "center", color: "#4B5563" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#111827", marginBottom: 6 }}>
            This store's thaw cabinets are not set up yet
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.55, maxWidth: 560, margin: "0 auto" }}>
            The case pars above are right for {STORE.name}. They are worked out
            from this store's own weekend sales.
            <br />
            What is missing is the map of your walk-in: how many doors it has and
            which product sits in each slot. Nobody but your store knows that, so
            the Hub does not guess it.
          </div>
          {/* ⚠️ THE MESSAGE CHANGES WITH WHO IS READING IT. Telling a trainer to
              paste a sheet they cannot save is a dead end with a button on it. */}
          <div style={{ fontSize: 13.5, marginTop: 12, fontWeight: 700, color: "#111827" }}>
            {canImport
              ? "Paste your thaw sheet below and it becomes this store's board."
              : "A Director can add it from this screen."}
          </div>
        </div>
      )}

      {/* ── Import a layout · tier 3 ────────────────────────────────── */}
      {canImport && (
        <div className="no-print" style={{ marginTop: 14 }}>
          <button
            type="button"
            onClick={() => { setImportOpen((v) => !v); setImportMsg(""); }}
            style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 800, color: "#374151", cursor: "pointer" }}
          >
            {importOpen ? "Cancel" : hasBoard ? "Replace the cabinet layout" : "Add this store's cabinets"}
          </button>

          {importOpen && (
            <div style={{ background: "#fff", boxShadow: CARD_3D, border: "1px solid #E5E7EB", borderRadius: 14, padding: "16px 16px 14px", marginTop: 10, ...accentEdge(ACCENT_NEUTRAL, 3) }}>
              <div style={{ fontSize: 13.5, lineHeight: 1.55, color: "#4B5563", marginBottom: 10 }}>
                Paste the thaw sheet exactly as it is written, top to bottom. Start
                each door with <strong>THAW 1</strong>, <strong>THAW 2</strong> and so
                on, put one product on each line in shelf order, and write{" "}
                <strong>EMPTY</strong> for a shelf that stays empty. Case numbers and
                “10 cases” lines are ignored, so you can paste them without tidying.
              </div>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={12}
                spellCheck={false}
                placeholder={"THAW 1\nNuggets\nNuggets\nEMPTY\nTHAW 2\nCFA Filets\n…"}
                style={{ width: "100%", boxSizing: "border-box", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12.5, lineHeight: 1.5, padding: "10px 12px", borderRadius: 10, border: "1px solid #E5E7EB", color: "#111827", resize: "vertical" }}
              />
              {/* ⚠️ THE WARNING SITS BESIDE THE BUTTON, not behind it. This
                  replaces the board leaders load chicken from tomorrow morning. */}
              {hasBoard && (
                <div style={{ fontSize: 12.5, color: "#B42318", fontWeight: 700, marginTop: 8 }}>
                  This replaces the {cabs.length}-door layout currently on screen.
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  disabled={importSaving || !importText.trim()}
                  onClick={saveLayout}
                  style={{ background: importSaving || !importText.trim() ? "#9CA3AF" : "#111827", border: "none", borderRadius: 10, padding: "9px 16px", fontSize: 13, fontWeight: 800, color: "#fff", cursor: importSaving || !importText.trim() ? "default" : "pointer" }}
                >
                  {importSaving ? "Saving…" : "Save this layout"}
                </button>
                {importMsg && (
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: /^Saved /.test(importMsg) ? "#166534" : "#B42318" }}>
                    {importMsg}
                  </span>
                )}
              </div>
            </div>
          )}
          {!importOpen && importMsg && (
            <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 8, color: /^Saved /.test(importMsg) ? "#166534" : "#B42318" }}>
              {importMsg}
            </div>
          )}
        </div>
      )}

      <div
        className="thaw-cabs"
        style={{
          display: hasBoard ? "grid" : "none",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
        }}
      >
        {cabRender.map(({ cab, cells, filledInCab }) => (
          <div
            key={cab.name}
            style={{
              background: "#fff", border: "1px solid #E5E7EB", ...accentEdge(ACCENT_NEUTRAL, 3), borderRadius: 14, boxShadow: CARD_3D,
              overflow: "hidden", display: "flex", flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: "10px 14px", background: "#111827", color: "#fff",
                display: "flex", justifyContent: "space-between", alignItems: "baseline",
              }}
            >
              <span style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: "0.06em" }}>
                {cab.name.toUpperCase()}
              </span>
              <span style={{ ...num, fontSize: 11.5, fontWeight: 700, color: "#9CA3AF" }}>
                {filledInCab} cases
              </span>
            </div>

            <div style={{ padding: "10px 10px 12px", display: "flex", flexDirection: "column", gap: 5 }}>
              {cells.map((cell) => {
                if (!cell.filled) {
                  return (
                    <div
                      key={cell.key}
                      style={{
                        border: "1.5px dashed #E5E7EB", borderRadius: 7,
                        padding: "5px 9px", fontSize: 11.5, fontWeight: 600,
                        color: "#C4C8CF", letterSpacing: "0.05em",
                      }}
                    >
                      EMPTY
                    </div>
                  );
                }
                const cc = PRODUCT_COLORS[cell.product] || "#374151";
                return (
                  <div
                    key={cell.key}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      background: `${cc}12`,
                      borderLeft: `3px solid ${cc}`, borderTop: `3px solid ${cc}`,
                      borderRadius: 7, padding: "5px 9px",
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#1F2937", flex: 1 }}>
                      {cell.product}
                    </span>
                    <span style={{ ...num, fontSize: 12.5, fontWeight: 800, color: cc }}>
                      {cell.idx}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── Settings (factors + manual fallback) ───────────────── */}
      <div className="no-print" style={{ marginTop: 22, background: "#fff", border: "1px solid #E5E7EB", ...accentEdge(ACCENT_NEUTRAL, 3), borderRadius: 14, boxShadow: CARD_3D, padding: "14px 18px" }}>
        <button
          onClick={() => setShowCfg(!showCfg)}
          style={{ background: "#111827", color: "#fff", border: "none", borderRadius: 10, padding: "9px 14px", fontSize: 13, fontWeight: 800, cursor: "pointer" }}
        >
          {showCfg ? "Hide settings" : "Thaw factors & manual override"}
        </button>
        {showCfg && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>
              Cases per $1 of allocation. Change only when the ops formula changes.
            </div>
            {(cfg.factors || DEFAULT_FACTORS).map(([name, f], idx) => (
              <div key={name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>
                  {name}
                  {FIXED_BAGS[name] != null && (
                    <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 600 }}> · fixed at {FIXED_BAGS[name]} bags, factor unused</span>
                  )}
                </span>
                <input
                  inputMode="decimal"
                  style={{ fontSize: 16, padding: "6px 8px", border: "1.5px solid #E5E7EB", borderRadius: 8, width: 110, textAlign: "right" }}
                  value={f}
                  onChange={(e) => {
                    const next = (cfg.factors || DEFAULT_FACTORS).map((row, i2) => i2 === idx ? [row[0], Number(e.target.value) || 0] : row);
                    saveCfg({ ...cfg, factors: next });
                  }}
                />
              </div>
            ))}
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px dashed #E5E7EB" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>Manual override ($)</div>
                  <div style={{ fontSize: 11, color: "#6B7280" }}>
                    When ON, this amount drives the pars instead of the live average.
                    {liveBasis != null && <> Live basis right now: <b>${Math.round(liveBasis).toLocaleString("en-US")}</b>.</>}
                  </div>
                </div>
                <input
                  inputMode="decimal"
                  style={{ fontSize: 16, padding: "6px 8px", border: "1.5px solid #E5E7EB", borderRadius: 8, width: 110, textAlign: "right" }}
                  value={cfg.manual}
                  onChange={(e) => saveCfg({ ...cfg, manual: e.target.value.replace(/[^0-9.]/g, "") })}
                />
              </div>
              <button
                onClick={() => saveCfg({ ...cfg, useManual: !cfg.useManual })}
                style={{
                  marginTop: 8, fontSize: 13, fontWeight: 800, padding: "8px 14px", borderRadius: 999, cursor: "pointer",
                  border: cfg.useManual ? "1.5px solid #DD0031" : "1.5px solid #E5E7EB",
                  background: cfg.useManual ? "#DD003114" : "#fff",
                  color: cfg.useManual ? "#DD0031" : "#6B7280",
                }}
              >
                {cfg.useManual ? "● Override ON — tap to return to live average" : "○ Override OFF — tap to use the manual amount"}
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 18, fontSize: 12, color: "#9CA3AF" }}>
        Allocation updates automatically from the last two Fri+Sat weekends in Sales Allocation (holidays skipped). The cabinet map fills itself from the live pars — cells light up as allocation rises and empty as it falls; the badge turns red only when a month needs more thaw slots than the cabinets physically hold. Spicy Breakfast is a fixed bag count set by hand, not sales-scaled.
      </div>
    </div>
  );
}
