/* ============================================================================
   ProfitShare.jsx — Gate City Hub
   Replaces the "Profit Sharing Calculator" tab.

   Model (verified against the sheet):
     pot(group, tier) = basis × tier% × multiplier(group, tier)
     per person       = pot ÷ member count
     basis            = selected month's sales (auto from Sales Allocation;
                        manual override available) — defaults to last month,
                        tap the month label to pick any other month.
     tiers            = 12%–17% store profit for the month

   Groups, members, and every multiplier are EDITABLE in the tile (add or
   remove people; the split recalculates from the live member count).
   Config: gcfcr-profitshare-config-v1 (global — not per-month; only the
   sales basis changes when you pick a different month).

   Sensitive: names tied to compensation.

   ACCESS (Matt, Jul 22 2026: "view only to executive tier and up plus
   payroll"). Two separate controls, and NEITHER of them used to exist —
   FinancialSuite's header claimed this file held a name+PIN gate for four
   people; it never did, and the tab was open and fully editable to anyone
   who could open the Financials tile.
     WHO SEES IT — decided in FinancialSuite.jsx (PROFIT_ROLES), which drops
       the tab entirely for anyone below Executive tier who is not Payroll.
     WHO EDITS IT — nobody. `canEdit` below defaults to FALSE and nothing
       passes it, so the Edit button and the basis override are both hidden.
       Passing canEdit gives editing back; that is the only switch.
   ============================================================================ */

import React, { useEffect, useMemo, useState, useRef } from "react";
/* The shared raised look and accent edge — see cardStyle.js. */
import { CARD_3D, accentEdge, ACCENT_NEUTRAL } from "./cardStyle.js";
import { hubToken, kvGetResult, kvSet } from "./store";
import { loadSalesMonth, dayTotal } from "./SalesAllocation.jsx";
import { rebalanceMult, isProtectedGroup } from "./profitRebalance.js";
import MonthYearPicker from "./MonthYearPicker.jsx";

const NAVY = "#1B3A5C", RED = "#DD0031", INK = "#232A31", GRAY = "#6B7480",
      LINE = "#E3E7EC", BG = "#F6F8FA", GREEN = "#166B4A";

const CONFIG_KEY = "gcfcr-profitshare-config-v1";
const TIERS = [0.12, 0.13, 0.14, 0.15, 0.16, 0.17];

/* THE MULTIPLIER TABLE for the three non-executive groups. The Executive
   Director row is NOT here: it is protected and has never been adjusted
   (Matt, Aug 1 2026: "executive first, don't adjust").

   ★ WHY A VERSION NUMBER. These rows are only a SEED. The live numbers live in
   a saved config (CONFIG_KEY), so editing this table alone changes nothing on
   a store iPad. The version gate below is the delivery mechanism: bump
   PROFIT_CONFIG_VERSION and the next open rewrites the saved rows from this
   table, matched by group id, keeping members. It then never re-runs, so a
   later hand-edit in the tile sticks. Change the numbers WITHOUT bumping the
   version and the change is invisible in production.

   ★ THE TRAP THAT PRODUCED v3. Pay is pot ÷ headcount, not the multiplier.
   v2 (Aug 1: "take from the AD's for the directors") correctly raised the
   Director MULTIPLIER above both AD groups. But Director holds 2 people and
   Executive Director holds 3, so per person the directors sailed past the
   executives they sit under: $1,295.68 vs $1,233.98 at the 15% tier on July
   sales. Whenever a row here moves, check the PER-PERSON column in the tile,
   not the multiplier.

   v3 (Matt, Aug 3 2026: "the director tier should be around 500 each and give
   the rest to the full time ad's", then option B: directors stay on top).
   Targets at the 15% tier on July 2026 sales of $822,656.08:
     Director (2)     $500  · was $1,295.68
     Full-time AD (6) $450  · was   $246.80
     Part-time AD (3) $371  · was   $246.80  (the remainder has to land
                                              somewhere; the total is fixed)
   The dollar figures move with the month's sales, since pot = basis × tier ×
   multiplier. $500 is "around $500 at July's volume", not a flat payment.
   Every tier's TOTAL is unchanged to the sixth decimal, so this moves money
   between the three groups and takes nothing out of the pool. */
const PROFIT_CONFIG_VERSION = 3;
/* 🐛🐛 THE PAY GROUPS AND MULTIPLIERS USED TO BE RIGHT HERE (Aug 8 2026).
   This is a React file, so they shipped in a client chunk any stranger could
   download: eleven named leaders, their pay group, and the exact multiplier
   each group earns at every profit tier. The sales basis is on the same page,
   so the two together compute what each person is paid.
   This file's own header says "Sensitive: names tied to compensation". The tab
   was gated at tier 3; the file behind it never was.

   They now live in profitShareSeed.js, which ONLY worker.js imports, and
   arrive from GET /api/profitshare-seed behind that same tier 3 gate.
   ⚠️ DO NOT RE-ADD A NAME OR A MULTIPLIER TO THIS FILE. */

// ── helpers ───────────────────────────────────────────────────────
const f$ = (n) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (t) => `${Math.round(t * 100)}%`;
const priorYM = () => {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const ymLabel = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
};
const uid = () => `g_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

/* Stored groups are never normalised on read, so a saved group with no members
   list reaches .length / .map / .filter and takes the tile down. This is a
   THROW GUARD ONLY: [] is exactly what an already-empty members list produces
   (count 0 → "—" per person, pot shown unsplit), so no payout figure moves. */
const membersOf = (g) => (Array.isArray(g && g.members) ? g.members : []);

const inp = { fontSize: 16, padding: "8px 10px", border: `1.5px solid ${LINE}`, borderRadius: 8, outline: "none", color: INK, background: "#fff", boxSizing: "border-box", fontFamily: "inherit" };
const btn = (bg, color, extra = {}) => ({ background: bg, color, border: "none", borderRadius: 8, padding: "9px 15px", fontSize: 13, fontWeight: 800, cursor: "pointer", ...extra });

// ════════════════════════════════════════════════════════════════
// canEdit defaults FALSE on purpose: this screen writes to SHARED config
// (kvSet CONFIG_KEY) — group membership, multipliers and the sales basis — so
// an ungated Edit button let anyone who could see the tab change the formula
// that pays them. Read-only unless a caller deliberately opts in.
export default function ProfitShare({ canEdit = false }) {
  const [ready, setReady]   = useState(false);
  const [groups, setGroups] = useState([]);
  /* The seed arrives over the network now. null = not read yet; a failed read
     stays null and freezes editing, because a migration or a reset without the
     real table would write empty groups over the configured ones. */
  const [seed, setSeed] = useState(null);
  const [ym, setYm]         = useState(priorYM()); // basis month — defaults to last month, browsable
  const [autoBasis, setAutoBasis] = useState(null);   // selected month's sales pulled live
  const [override, setOverride]   = useState("");     // manual basis override (string for input)
  const [tierSel, setTierSel]     = useState("0.15"); // highlighted tier
  const [edit, setEdit]     = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [toast, setToast]   = useState(null);

  // The config read failed → edits refuse until a clean reload. The defaults
  // below are seeds; one edit after a failed read would persist the seed
  // groups over the configured ones.
  const [loadFailed, setLoadFailed] = useState(false);
  const loadFailedRef = useRef(false);

  // config (groups/multipliers) — global, loaded once
  useEffect(() => {
    (async () => {
      // kvGetResult, not kvGet — kvGet returns null for a failed read as well
      // as an empty one, and it never throws (the old catch was dead code).
      /* Seed first: the migration below reads it, and a reset needs it. A
         refused or failed seed read is treated exactly like a failed config
         read — edits freeze — because writing without it would persist the
         wrong table. */
      let sd = null;
      try {
        const sr = await fetch("/api/profitshare-seed", { headers: { "x-hub-token": hubToken() } });
        const sj = await sr.json().catch(() => null);
        if (sj && sj.ok) sd = { groupMult: sj.groupMult || {}, defaultGroups: sj.defaultGroups || [] };
      } catch { sd = null; }
      if (!sd) { loadFailedRef.current = true; setLoadFailed(true); }
      setSeed(sd);
      if (sd && !groups.length) setGroups(sd.defaultGroups);

      const r = await kvGetResult(CONFIG_KEY);
      if (!r.ok) { loadFailedRef.current = true; setLoadFailed(true); }
      const cfg = r.value;
      if (cfg?.groups?.length) {
        /* One-time migration to PROFIT_CONFIG_VERSION — the multiplier table
           above. Only a clean read (r.ok) migrates; a failed read already froze
           editing and must never write. Matches by group id, rewrites ONLY
           mult, keeps members and the Executive row, runs once (version gate)
           so a later hand-edit is never clobbered. Best-effort write: a refusal
           leaves the stored version behind and the next open retries, while the
           screen already shows the new numbers.
           ⚠️ The gate is `<`, not `!==`, so a config stranded at any older
           version lands on the CURRENT table in one step. That is correct
           because GROUP_MULT holds absolute rows, not deltas — skipping v2 on
           the way to v3 changes nothing. */
        if (sd && r.ok && (cfg.version || 1) < PROFIT_CONFIG_VERSION) {
          const migrated = cfg.groups.map((g) =>
            (sd.groupMult[g.id]) ? { ...g, mult: { ...sd.groupMult[g.id] } } : g
          );
          setGroups(migrated);
          kvSet(CONFIG_KEY, { groups: migrated, override: cfg.override ?? null, version: PROFIT_CONFIG_VERSION });
        } else {
          setGroups(cfg.groups);
        }
      }
      if (cfg?.override != null && cfg.override !== "") setOverride(String(cfg.override));
      setReady(true);
    })();
  }, []);

  // sales basis — reloads whenever the selected month (ym) changes
  useEffect(() => {
    let alive = true;
    (async () => {
      setAutoBasis(null);
      try {
        const m = await loadSalesMonth(ym);
        const days = (m && (m.days || m)) || {};
        let total = 0;
        Object.values(days).forEach((d) => { try { total += Number(dayTotal(d)) || 0; } catch {} });
        if (!alive) return;
        if (total > 0) setAutoBasis(total);
      } catch {}
    })();
    return () => { alive = false; };
  }, [ym]);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 1800); };
  /* Returns whether the write landed — kvSet reports failure by returning
     false, never by throwing, so the old .catch here could not run. Refuses
     outright after a failed load. */
  const persist = async (g = groups, ov = override) => {
    if (loadFailedRef.current) {
      flash("This page didn't load — refresh before editing");
      return false;
    }
    const ok = await kvSet(CONFIG_KEY, { groups: g, override: ov === "" ? null : Number(ov), version: PROFIT_CONFIG_VERSION });
    if (ok === false) { flash("Did not save — check the wifi and try again"); return false; }
    return true;
  };

  const basis = override !== "" && !isNaN(Number(override)) && Number(override) > 0
    ? Number(override)
    : (autoBasis || 0);

  const potOf = (g, t) => basis * Number(t) * (Number(g.mult?.[t]) || 0);
  const totals = useMemo(() => {
    const o = {};
    TIERS.forEach((t) => { const k = String(t); o[k] = groups.reduce((s, g) => s + potOf(g, k), 0); });
    return o;
  }, [groups, basis]);

  // ── group mutations (persist immediately) ──
  const setG = (next) => {
    const prev = groups;
    setGroups(next);
    // Roll the screen back on a refused or failed write so it keeps matching
    // what is really stored. persist() already explains itself via flash.
    persist(next).then((ok) => { if (!ok) setGroups(prev); });
  };
  const renameGroup = (id, name) => setG(groups.map((g) => g.id === id ? { ...g, name } : g));
  /* Fixed-total rule (Matt, Aug 1 2026): a multiplier edit never changes the
     tier's total. rebalanceMult pulls the difference from Director and below
     (never the executives) and says what moved; an edit that can't be
     absorbed is refused so the total can never drift. */
  const setMult = (id, t, raw) => {
    const res = rebalanceMult(groups, id, t, raw);
    if (res.error === "short") {
      window.alert("Can't raise it that far — the groups below the executives don't have enough multiplier to give at this tier. Lower one of them first.");
      return;
    }
    if (res.error === "nowhere") {
      window.alert("There's no unprotected group below to hand that to.");
      return;
    }
    if (res.error) return;
    setG(res.next);
    if (res.took.length) {
      flash("Total held — " + res.took.map(([n, d]) => `${d > 0 ? "+" : ""}${d} ${n}`).join(" · "));
    }
  };
  const addMember = (id, name) => {
    const nm = (name || "").trim();
    if (!nm) return;
    setG(groups.map((g) => g.id === id ? { ...g, members: [...membersOf(g), nm] } : g));
    flash("Added");
  };
  const removeMember = (id, i) =>
    setG(groups.map((g) => g.id === id ? { ...g, members: membersOf(g).filter((_, x) => x !== i) } : g));
  const addGroup = () => {
    const mult = {}; TIERS.forEach((t) => { mult[String(t)] = 0; });
    setG([...groups, { id: uid(), name: "New Group", note: "", members: [], mult }]);
  };
  const removeGroup = (id) => {
    const g = groups.find((x) => x.id === id);
    if (window.confirm(`Remove the "${g?.name}" group? Its members and multipliers will be deleted.`)) {
      setG(groups.filter((x) => x.id !== id));
    }
  };
  const resetDefaults = () => {
    if (window.confirm("Reset all groups, members, and multipliers to the sheet defaults?")) {
      if (!seed) { flash("Defaults are still loading"); return; }
      setG(JSON.parse(JSON.stringify(seed.defaultGroups)));
      flash("Reset to defaults");
    }
  };

  if (!ready) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", color: GRAY, fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,sans-serif" }}>
      Loading profit sharing…
    </div>
  );

  return (
    <div style={{ fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,sans-serif", background: BG, minHeight: "100vh", color: INK, maxWidth: 680, margin: "0 auto", padding: "14px 14px 50px" }}>

      {toast && (
        <div style={{ position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", background: INK, color: "#fff", padding: "9px 20px", borderRadius: 8, fontSize: 13, fontWeight: 700, zIndex: 9999, boxShadow: "0 4px 18px rgba(0,0,0,0.3)" }}>{toast}</div>
      )}

      {showMonthPicker && (
        <MonthYearPicker ym={ym} onPick={setYm} onClose={() => setShowMonthPicker(false)} />
      )}

      {/* Basis card */}
      <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderTop: `3px solid ${NAVY}`, borderRadius: 12, padding: "14px 16px", marginBottom: 12 , ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
          <div>
            <button
              onClick={() => setShowMonthPicker(true)}
              style={{
                fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: GRAY, textTransform: "uppercase",
                background: "none", border: "none", cursor: "pointer", padding: 0, borderBottom: `1.5px dotted ${GRAY}`,
              }}
            >
              Basis — {ymLabel(ym)} sales (tap to change month)
            </button>
            <div style={{ fontSize: 26, fontWeight: 800, color: NAVY, marginTop: 3 }}>{basis > 0 ? f$(basis) : "—"}</div>
            <div style={{ fontSize: 11.5, color: GRAY, marginTop: 3 }}>
              {override !== "" ? "Manual override in use" : autoBasis ? "Auto from Sales Allocation" : canEdit ? "No Sales Allocation data found — enter a basis below" : "No Sales Allocation data found for this month"}
            </div>
          </div>
          {canEdit && (
            <button onClick={() => { setEdit(!edit); }} style={btn(edit ? NAVY : "#fff", edit ? "#fff" : NAVY, { border: `1.5px solid ${NAVY}` })}>
              {edit ? "✓ Done editing" : "Edit"}
            </button>
          )}
        </div>
        {/* The basis override sits OUTSIDE `edit` mode, so hiding the Edit
            button alone would still have left it writable — and it persists to
            shared config, changing the number every payout is computed from. */}
        {canEdit && (
          <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
            <input type="number" inputMode="decimal" min={0} step="0.01" placeholder={autoBasis ? `Override (auto: ${f$(autoBasis)})` : "Enter this month's sales"}
              value={override} onChange={(e) => { setOverride(e.target.value); persist(groups, e.target.value); }}
              style={{ ...inp, flex: 1, minWidth: 0 }} />
            {override !== "" && (
              <button onClick={() => { setOverride(""); persist(groups, ""); flash("Using auto basis"); }} style={btn("#fff", GRAY, { border: `1px solid ${LINE}` })}>
                Use auto
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tier selector */}
      <div style={{ display: "flex", gap: 4, background: "#fff", border: `1px solid ${LINE}`, borderRadius: 10, padding: 4, marginBottom: 12 , ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }}>
        {TIERS.map((t) => {
          const k = String(t), on = tierSel === k;
          return (
            <button key={k} onClick={() => setTierSel(k)}
              style={{ flex: 1, background: on ? NAVY : "transparent", color: on ? "#fff" : GRAY, border: "none", borderRadius: 7, padding: "8px 0", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
              {pct(t)}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 11.5, color: GRAY, margin: "-6px 2px 12px" }}>
        Pick the month's profit tier. Payouts below highlight that column; the full 12–17% table stays visible per group.
      </div>

      {/* Groups */}
      {groups.map((g) => {
        const count = membersOf(g).length;
        const selPot = potOf(g, tierSel);
        return (
          <GroupCard key={g.id} {...{ g, count, edit, tierSel, basis, potOf, renameGroup, setMult, addMember, removeMember, removeGroup }} selPot={selPot} />
        );
      })}

      {edit && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button onClick={addGroup} style={{ ...btn("#fff", NAVY, { border: `1.5px dashed ${NAVY}` }), flex: 1 }}>+ Add group</button>
          <button onClick={resetDefaults} style={btn("#fff", RED, { border: `1px solid #FECACA` })}>Reset to sheet defaults</button>
        </div>
      )}

      {/* Total payout */}
      <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderTop: `3px solid ${RED}`, borderRadius: 12, padding: "14px 16px" , ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: GRAY, textTransform: "uppercase", marginBottom: 8 }}>Total payout by tier</div>
        {TIERS.map((t) => {
          const k = String(t), on = tierSel === k;
          return (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "7px 8px", borderRadius: 7, background: on ? "#FEF2F2" : "transparent", borderBottom: `1px solid ${BG}` }}>
              <span style={{ fontSize: 13.5, fontWeight: on ? 800 : 600, color: on ? RED : INK }}>{pct(t)} profit</span>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: on ? RED : INK, fontVariantNumeric: "tabular-nums" }}>{f$(totals[k])}</span>
            </div>
          );
        })}
        <div style={{ fontSize: 11, color: GRAY, marginTop: 8 }}>
          pot = basis × tier % × multiplier · per person = pot ÷ group members · the multiplier total per tier is held steady — raising one group pulls from Director and below, never from the executives
        </div>
      </div>
    </div>
  );
}

// ── Group card ────────────────────────────────────────────────────
function GroupCard({ g, count, edit, tierSel, basis, potOf, renameGroup, setMult, addMember, removeMember, removeGroup, selPot }) {
  const [newName, setNewName] = useState("");
  const [multDraft, setMultDraft] = useState({}); // tierKey -> raw text while typing
  const submit = () => { addMember(g.id, newName); setNewName(""); };
  return (
    <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: "14px 16px", marginBottom: 12 , ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }}>
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          {edit ? (
            <input value={g.name} onChange={(e) => renameGroup(g.id, e.target.value)} style={{ ...inp, fontWeight: 800, width: "100%" }} />
          ) : (
            <div style={{ fontSize: 15.5, fontWeight: 800, color: INK }}>{g.name}</div>
          )}
          <div style={{ fontSize: 11, color: GRAY, marginTop: 2 }}>
            {g.note ? `${g.note} · ` : ""}{count} member{count === 1 ? "" : "s"}
          </div>
          {isProtectedGroup(g) && (
            <div style={{ fontSize: 10, fontWeight: 800, color: NAVY, marginTop: 2, letterSpacing: "0.04em" }}>
              PROTECTED — never auto-adjusted
            </div>
          )}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: GREEN, fontVariantNumeric: "tabular-nums" }}>
            {/* ⚠️ `basis > 0` matters as much as `count > 0`, and it was the one
                missing. With no basis entered the pot is 0, so this printed
                "$0.00 per person" — which reads as "nobody is getting anything"
                rather than "we have not entered the number yet". Every sibling
                figure already guards on the basis and shows a dash: the basis
                card, the group pot, and the per-person on the summary row. This
                was the only one that did not, so one card contradicted the
                others on the same screen. */}
            {basis > 0 ? (count > 0 ? f$(selPot / count) : "—") : "—"}
          </div>
          <div style={{ fontSize: 10, color: GRAY }}>per person @ {Math.round(Number(tierSel) * 100)}%</div>
        </div>
      </div>

      {/* members */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
        {membersOf(g).map((m, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#EEF2F7", color: INK, fontSize: 12.5, fontWeight: 700, padding: "5px 10px", borderRadius: 999 }}>
            {m}
            {edit && (
              <button onClick={() => removeMember(g.id, i)} aria-label={`Remove ${m}`}
                style={{ background: "none", border: "none", color: RED, fontWeight: 800, cursor: "pointer", fontSize: 13, padding: 0, lineHeight: 1 }}>✕</button>
            )}
          </span>
        ))}
        {count === 0 && <span style={{ fontSize: 12, color: GRAY, fontStyle: "italic" }}>No members — pot shown unsplit</span>}
      </div>
      {edit && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input placeholder="Add person…" value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} style={{ ...inp, flex: 1, minWidth: 0 }} />
          <button onClick={submit} style={{ background: NAVY, color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Add</button>
        </div>
      )}

      {/* tier table */}
      <div style={{ marginTop: 12, borderTop: `1px solid ${LINE}`, paddingTop: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "52px 1fr 1fr 1fr", gap: 6, fontSize: 10, fontWeight: 800, color: GRAY, textTransform: "uppercase", letterSpacing: "0.06em", padding: "0 2px 6px" }}>
          <span>Tier</span><span>Multiplier</span><span style={{ textAlign: "right" }}>Pot</span><span style={{ textAlign: "right" }}>Per person</span>
        </div>
        {["0.12", "0.13", "0.14", "0.15", "0.16", "0.17"].map((k) => {
          const on = tierSel === k;
          const pot = potOf(g, k);
          return (
            <div key={k} style={{ display: "grid", gridTemplateColumns: "52px 1fr 1fr 1fr", gap: 6, alignItems: "center", padding: "5px 2px", borderRadius: 6, background: on ? "#F0F4F9" : "transparent" }}>
              <span style={{ fontSize: 12.5, fontWeight: on ? 800 : 600, color: on ? NAVY : INK }}>{Math.round(Number(k) * 100)}%</span>
              {edit ? (
                /* Draft while typing, rebalance ONCE on blur/Enter — per-keystroke
                   commits would rebalance on "1", then "1.", then "1.5". */
                <input type="number" inputMode="decimal" min={0} step="0.0001"
                  value={multDraft[k] !== undefined ? multDraft[k] : (g.mult?.[k] ?? 0)}
                  onChange={(e) => { const v = e.target.value; setMultDraft((d) => ({ ...d, [k]: v })); }}
                  onBlur={() => {
                    if (multDraft[k] === undefined) return;
                    const v = multDraft[k];
                    setMultDraft((d) => { const c = { ...d }; delete c[k]; return c; });
                    setMult(g.id, k, v);
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                  style={{ ...inp, padding: "5px 8px", width: "100%" }} />
              ) : (
                <span style={{ fontSize: 12.5, color: GRAY, fontVariantNumeric: "tabular-nums" }}>{Number(g.mult?.[k] || 0)}</span>
              )}
              <span style={{ fontSize: 12.5, fontWeight: 700, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{basis > 0 ? f$(pot) : "—"}</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, textAlign: "right", color: GREEN, fontVariantNumeric: "tabular-nums" }}>
                {basis > 0 ? (count > 0 ? f$(pot / count) : f$(pot)) : "—"}
              </span>
            </div>
          );
        })}
      </div>

      {edit && (
        <button onClick={() => removeGroup(g.id)} style={{ marginTop: 10, background: "none", border: "none", color: RED, fontSize: 11.5, fontWeight: 800, cursor: "pointer", padding: 0 }}>
          Remove this group
        </button>
      )}
    </div>
  );
}
