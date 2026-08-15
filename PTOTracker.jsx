/* ============================================================================
   PTOTracker.jsx — Gate City Hub · Financials → PTO (last tab)

   REPLACES the "Vacation Spreadsheet" Google Sheet (owner: Cindy). That sheet
   is being retired, so this is a migration target, not a mirror.

   WHAT THIS HOLDS
     · PTO by YEAR (2025 and 2026 seeded from the sheet; new years add on).
     · The DATES each person used, not just a count — the sheet's "Dates used"
       column is the part people actually go back and check.
     · YEAR-END BONUS per person per year, including an open 2026 column for
       this Christmas.

   WHY THE PLAN IS STORED PER PERSON, NOT DERIVED FROM ROLE
   The sheet's groups (Executive Directors, Asst Director F/T, Asst Director
   P/T, A/D Plus, A/D Plus Plus) are NOT Hub roles. "A/D Plus" exists only on
   that sheet, and full-time vs part-time is an hours fact the roster does not
   carry. So each person's plan is stored explicitly; the Hub role only gives a
   first guess. Deriving it would mis-allot the moment someone's hours changed.

   NO AUTOMATIC ACCRUAL. The sheet's rule ("5 days then +1/yr up to 10 per Nick
   9/3/25") has no stated anniversary date per group, and the 2026 tab overrides
   it anyway with "no accrual per Nick 2026". Allotment is a typed number with
   the rule shown as a label. A wrong auto-accrual is worse than a typed one.

   SEEDING IS A BUTTON, NOT A SILENT WRITE. Import matches sheet names to the
   HR roster and REPORTS every name it could not match, so nobody vanishes
   quietly the way they would in a bulk paste.
   ============================================================================ */

import { useEffect, useMemo, useState } from "react";
/* The shared raised look and accent edge — see cardStyle.js. */
import { CARD_3D, accentEdge, ACCENT_NEUTRAL } from "./cardStyle.js";
import { kvGet, kvSet, kvGetResult, hubToken } from "./store.js";
import { loadHRTeam, HR_RANK } from "./HRConsole.jsx";
import { hrInConsole } from "./hrRoster.js";

const KEY = "gcfcr-pto-v1";
const STATUS_KEY = "gcfcr-hr-status";

/* Ask the Worker for the seed. Returns null on ANY failure — a refusal, a
   network blip, a non-HR reader — and every caller treats null as "do not
   change anything", never as "there is no data". */
async function fetchPtoSeed() {
  try {
    const r = await fetch("/api/pto-seed", { headers: { "x-hub-token": hubToken() } });
    const d = await r.json().catch(() => null);
    if (!d || !d.ok) return null;
    return { seed: d.seed || {}, bonus: Array.isArray(d.bonus) ? d.bonus : [] };
  } catch { return null; }
}


const INK = "#0E3A26", GREEN = "#1F6F4A", LINE = "#E3E7EC";
const GRAY = "#6B7480", TEXT = "#14243D", BG = "#F6F8FA", RED = "#B91C1C";

const YEARS = ["2026", "2025"];
const BONUS_YEARS = ["2024", "2025", "2026"];
const CURRENT_BONUS_YEAR = "2026"; // "this Christmas"

/* The sheet's groups, verbatim, with the 5/6/26 NEW ACCRUAL PLAN allotments. */
const PLANS = [
  { id: "exec",       label: "Executive Director",        days: 15, hrs: 120 },
  /* HR, Jul 30 2026: "I need an additional tier in the PTO tab. Please add a
     Director tier for Brandon, Daisy, and Bri. Brandon and Daisy are full time
     and Bri is part time." Matt set the allotment the same day: "pto days for
     directors are 10."
     ⚠️ PART TIME IS HALF, DERIVED NOT INVENTED. Matt gave one number, for the
     full-time tier. Asst Director is 6 full / 3 part, exactly half, so Director
     part time follows the same rule at 5. Say the word if Bri's is different —
     her days are typed on her own row anyway, so the tier is only the default. */
  { id: "dirFull",    label: "Director — Full Time",      days: 10, hrs: 80  },
  { id: "dirPart",    label: "Director — Part Time",      days: 5,  hrs: 40  },
  { id: "adFull",     label: "Asst Director — Full Time", days: 6,  hrs: 48  },
  { id: "adPart",     label: "Asst Director — Part Time", days: 3,  hrs: 24  },
  { id: "adPlus",     label: "A/D Plus",                  days: 5,  hrs: 40  },
  { id: "adPlusPlus", label: "A/D Plus Plus",             days: 10, hrs: 80  },
  { id: "none",       label: "No PTO (w/ exceptions)",    days: 0,  hrs: 0   },
];
const planById = (id) => PLANS.find((p) => p.id === id) || PLANS[PLANS.length - 1];

function guessPlan(role) {
  const r = HR_RANK[role] || 0;
  if (r >= 7) return "exec";
  /* Director (5) and Leadership Development Director (6) now land on the
     Director tier instead of Asst Director. Full time is the guess because the
     roster carries no hours; part time is a one-click change on the row.
     ⚠️ STILL ONLY A FIRST GUESS. Every plan is stored per person — see the note
     at the top of this file — so this never overwrites a choice already made. */
  if (r >= 5) return "dirFull";
  if (r >= 4) return "adFull";
  return "none";
}

/* ═══ THE SEED TABLES ARE GONE FROM THIS FILE, ON PURPOSE ══════════════════
   🐛🐛 THEY WERE PUBLIC. Aug 8 2026. This is a React file, so `const SEED` and
   `const BONUS_SEED` compiled into a client chunk that answered HTTP 200 to
   anyone on the internet — no token, no cookie, no sign-in. Every named team
   member's 2024 and 2025 year-end bonus, and named people's dated PTO
   absences. About forty people, one of whom had already left.

   The tile was gated. The data under it never was. Gating a screen does
   nothing about the file the browser downloads in order to draw that screen.

   They now live in worker.js, which never ships to the browser, and come back
   from GET /api/pto-seed — signed in AND a full HR reader, the same gate the
   HR records themselves use.

   ⚠️ NEVER PUT A PERSON'S PAY, HOURS, LEAVE OR CONTACT DETAILS IN A .jsx FILE.
   Not in a const, not in a default, not in a comment. If the browser has to
   render it, fetch it through a gated route.
   ⚠️ THE FETCH IS LAZY. importYear() asks when the button is pressed, and the
   loader asks ONLY when the one-time 2025 count repair has not run yet. A
   normal load does not call it at all. */


/* ── name matching ─────────────────────────────────────────────────────────
   Sheet names carry hire dates, "(P/T)", "Mrs.", nicknames. Normalise hard,
   then fall back to first-token + last-token, then give up LOUDLY. */
const norm = (s) => String(s || "").toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z\s]/g, " ").replace(/\b(mrs|mr|ms)\b/g, " ").replace(/\s+/g, " ").trim();
function matchId(sheetName, roster) {
  const a = norm(sheetName);
  let hit = roster.find((m) => norm(m.name) === a);
  if (hit) return hit.id;
  const at = a.split(" ").filter(Boolean);
  if (at.length < 2) return null;
  const first = at[0], last = at[at.length - 1];
  hit = roster.find((m) => { const bt = norm(m.name).split(" ").filter(Boolean); return bt.length > 1 && bt[0] === first && bt[bt.length - 1] === last; });
  if (hit) return hit.id;
  hit = roster.find((m) => { const bt = norm(m.name).split(" ").filter(Boolean); return bt[0] === first && bt.includes(last); });
  return hit ? hit.id : null;
}

// UTC → the device's own date. After 8pm Eastern the old form named tomorrow,
// so a PTO request logged in the evening carried the wrong day.
const todayISO = () => new Date().toLocaleDateString("en-CA");
const fmtDay = (iso) => {
  try {
    const d = new Date(iso + "T12:00:00");
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
  } catch { return iso; }
};
/* Inclusive range, Sundays dropped — the restaurant is closed, so a Sunday is
   never a PTO day and auto-adding one would silently overcharge someone. */
function expandRange(startISO, endISO) {
  const out = [];
  try {
    const s = new Date(startISO + "T12:00:00"), e = new Date(endISO + "T12:00:00");
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return out;
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      if (d.getDay() !== 0) out.push(d.toISOString().slice(0, 10));
      if (out.length > 60) break;
    }
  } catch { /* fall through */ }
  return out;
}

/* ── ONE-TIME 2025 CORRECTION ────────────────────────────────────────────
   The 2025 year was seeded from the sheet's DATE LISTS (81 days). Hannah then
   ruled (Jul 22) that the sheet's own per-person COUNT governs — total 78 —
   and that the dates are unverified detail underneath it. The seed is already
   live and Cindy is working in it, so re-importing would wipe her corrections.

   This repairs ONLY rows that still look untouched: `usedN` still exactly
   equal to the number of seeded dates. Anyone who has typed a number since is
   left completely alone. Runs once, guarded by `countFix2025`, and returns
   what it changed so the screen can SAY so rather than silently moving a
   balance under someone. */
function repairCounts2025(store, roster, seed) {
  const changed = [];
  /* No seed means the fetch failed or was refused. Return the store UNCHANGED
     and do not stamp countFix2025 — the repair simply waits for a load that
     can read the seed, rather than marking itself done having done nothing. */
  if (!seed) return { store, changed };
  if (!store || store.countFix2025) return { store, changed };
  const people = (store.years && store.years["2025"] && store.years["2025"].people) || null;
  if (!people) return { store: { ...store, countFix2025: true }, changed };

  const next = { ...people };
  (seed["2025"] || []).forEach((row) => {
    if (row.cnt == null) return;                       // sheet agrees with itself
    const id = matchId(row.n, roster);
    if (!id || !next[id]) return;
    const rec = next[id];
    const seededN = row.d.length;
    const cur = rec.usedN == null ? (rec.used || []).length : Number(rec.usedN);
    if (cur !== seededN) return;                       // hand-corrected — leave it
    next[id] = { ...rec, usedN: row.cnt };
    changed.push({ name: row.n, from: seededN, to: row.cnt });
  });

  return {
    store: { ...store, countFix2025: true, years: { ...store.years, "2025": { people: next } } },
    changed,
  };
}

export default function PTOTracker({ user }) {
  const [team, setTeam] = useState([]);        // ACTIVE roster (HR minus terminated, minus Owner)
  const [gone, setGone] = useState([]);        // terminated, kept so their year isn't erased
  const [showLeft, setShowLeft] = useState(false);
  const [store, setStore] = useState({ years: {}, bonus: {} });
  const [countFixNote, setCountFixNote] = useState(null); // what the one-time 2025 correction changed
  const [year, setYear] = useState(YEARS[0]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);
  const [mode, setMode] = useState("one");      // "one" | "range"
  const [d1, setD1] = useState(todayISO());
  const [d2, setD2] = useState(todayISO());
  const [note, setNote] = useState("");
  const [toast, setToast] = useState("");
  const [report, setReport] = useState(null);
  // true = the ledger read FAILED (not "empty") — every write path refuses
  // until the tile is reopened and the read succeeds.
  const [loadFailed, setLoadFailed] = useState(false);

  /* 🐛 A CONTROL THAT COULD NEVER WORK (Aug 10 2026, sweep finding 36). This
     keyed on RANK, but /api/pto-seed gates on hrIsFullReader, which refuses
     anyone outside HR_CONSOLE_PEOPLE BEFORE it looks at a rank. Exactly one
     person is rank >= 6 and not in that list, so she got a full PTO editor and
     an "Import 2025 from spreadsheet" button that 403'd every single time.
     ⚠️ THE ROUTE IS STRICTER ON PURPOSE — the PTO seed was moved off the client
     because ~40 people's bonus dollars and dated absences were a public
     download, and it was gated to the same five as the HR keys deliberately.
     The 403 is the protection working; the defect was the button.
     ⇒ Same predicate as the route, so the screen and the server agree. Written
     as hrInConsole + the route's own rank rule rather than a second copy of
     hrIsFullReader, because that one needs the roles map this tile does not
     load — same answer, no drift, no extra read. */
  const canEdit = !!user && hrInConsole(String(user.id ?? "")) &&
    (user.role === "Payroll" || (HR_RANK[user.role] || 0) >= 6);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // ⚠️ kvGetResult for the ledger, not kvGet: a FAILED read used to arrive
        // here as null, identical to "no PTO stored yet", so the tile rendered
        // an empty ledger and the first edit wrote one person over every year's
        // balances plus the bonus map. Payroll data, and the Hub holds the only
        // copy. STATUS_KEY stays on kvGet on purpose — it only splits the
        // leavers list for display and never feeds a write from here.
        const [roster, status, savedR] = await Promise.all([loadHRTeam(), kvGet(STATUS_KEY), kvGetResult(KEY)]);
        if (!alive) return;
        const st = status || {};
        // Leavers are SPLIT OFF, not dropped. Terminating someone used to remove
        // them from `team`, which also removed their days from the year's totals
        // — so 2026 "used" fell every time somebody left, and a mid-year leaver's
        // final balance became unreachable at exactly the moment payroll needs it.
        // Their record was never deleted, only orphaned.
        const notOwner = (roster || []).filter((m) => m.role !== "Owner");
        setTeam(notOwner.filter((m) => st[m.id] !== "terminated"));
        setGone(notOwner.filter((m) => st[m.id] === "terminated").map((m) => ({ ...m, _left: true })));
        if (!savedR.ok) {
          // Empty ledger on screen, behind a blocking notice — never as
          // editable truth. The repair write below must not run either.
          setStore({ years: {}, bonus: {} });
          setLoadFailed(true);
        } else {
          const saved = savedR.value;
          // Migration: the first build stored {people:{...}} with no year. Treat
          // whatever is there as 2026 rather than losing it.
          const base = (saved && saved.people && !saved.years)
            ? { years: { "2026": { people: saved.people } }, bonus: {} }
            : { years: (saved && saved.years) || {}, bonus: (saved && saved.bonus) || {}, countFix2025: saved && saved.countFix2025 };
          /* ⚠️ ONLY when the one-time repair has not run. A normal load must
             not call a gated HR route it does not need — most people opening
             this tile would get a 403 and it would mean nothing. */
          const seedForRepair = base.countFix2025 ? null : await fetchPtoSeed();
          if (!alive) return;
          const fixed = repairCounts2025(base, roster || [], seedForRepair);
          setStore(fixed.store);
          if (fixed.changed.length) { setCountFixNote(fixed.changed); kvSet(KEY, { ...fixed.store, updatedAt: new Date().toISOString() }).catch(() => {}); }
        }
      } catch {
        if (alive) { setTeam([]); setStore({ years: {}, bonus: {} }); setLoadFailed(true); }
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2200); };

  async function persist(next) {
    /* ⚠️ Both halves of this used to be silent. A failed load left `store`
       empty, so the first edit wrote one person over the whole multi-year
       ledger; and kvSet reports a refused write by RETURNING FALSE, never by
       throwing, so the catch that used to sit here was unreachable and "Save
       failed" had never once shown. On failure the optimistic update rolls
       back so the screen never shows a day that was not recorded. */
    if (loadFailed) { flash("Not saved — the ledger never loaded. Close and reopen the tile."); return false; }
    const prev = store;
    setStore(next);
    const ok = await kvSet(KEY, { ...next, updatedAt: new Date().toISOString() });
    if (!ok) { setStore(prev); flash("Save failed — nothing recorded. Try again."); return false; }
    return true;
  }

  const peopleOf = (y) => (store.years[y] && store.years[y].people) || {};

  const writePerson = (id, patch) => {
    const cur = peopleOf(year);
    persist({ ...store, years: { ...store.years, [year]: { people: { ...cur, [id]: { ...(cur[id] || {}), ...patch } } } } });
  };

  const recOf = (m) => {
    const r = peopleOf(year)[m.id] || {};
    const planId = r.plan || guessPlan(m.role);
    const p = planById(planId);
    const used = Array.isArray(r.used) ? r.used : [];
    return {
      planId, plan: p,
      days: r.days == null ? p.days : Number(r.days),
      used,
      usedN: r.usedN == null ? used.length : Number(r.usedN),
    };
  };
  const bonusOf = (id, y) => {
    const b = store.bonus[id] || {};
    return b[y] == null ? "" : b[y];
  };
  const setBonus = (id, y, v) => {
    const clean = v === "" ? null : (Number(String(v).replace(/[^\d.]/g, "")) || 0);
    const b = store.bonus[id] || {};
    persist({ ...store, bonus: { ...store.bonus, [id]: { ...b, [y]: clean } } });
  };

  const setPlan = (m, planId) => {
    const p = planById(planId), cur = peopleOf(year)[m.id] || {};
    const prevDefault = planById(cur.plan || guessPlan(m.role)).days;
    const keepCustom = cur.days != null && Number(cur.days) !== prevDefault;
    writePerson(m.id, { plan: planId, days: keepCustom ? cur.days : p.days });
  };
  const setUsedN = (m, v) => {
    const cur = peopleOf(year)[m.id] || {};
    const n = v === "" ? "" : Math.max(0, Number(String(v).replace(/[^\d.]/g, "")) || 0);
    writePerson(m.id, { plan: cur.plan || guessPlan(m.role), usedN: n });
  };
  const setDays = (m, v) => {
    const cur = peopleOf(year)[m.id] || {};
    const n = v === "" ? "" : Math.max(0, Number(String(v).replace(/[^\d.]/g, "")) || 0);
    writePerson(m.id, { plan: cur.plan || guessPlan(m.role), days: n });
  };

  const addDays = (m) => {
    const dates = mode === "one" ? (d1 ? [d1] : []) : expandRange(d1, d2);
    if (!dates.length) { flash("Pick a date"); return; }
    const cur = peopleOf(year)[m.id] || {};
    const used = Array.isArray(cur.used) ? cur.used : [];
    const have = new Set(used.map((x) => x.date));
    const add = dates.filter((dt) => !have.has(dt)).map((dt, i) => ({ id: "d_" + Date.now() + "_" + i, date: dt, note: note.trim() }));
    if (!add.length) { flash("Already recorded"); return; }
    const priorN = cur.usedN == null ? used.length : Number(cur.usedN) || 0;
    writePerson(m.id, { plan: cur.plan || guessPlan(m.role), usedN: priorN + add.length, used: [...used, ...add].sort((a, b) => a.date.localeCompare(b.date)) });
    setNote("");
    flash(add.length === 1 ? "Day added" : add.length + " days added");
  };
  const removeDay = (m, dayId) => {
    const cur = peopleOf(year)[m.id] || {};
    const list = (cur.used || []).filter((x) => x.id !== dayId);
    const priorN = cur.usedN == null ? (cur.used || []).length : Number(cur.usedN) || 0;
    writePerson(m.id, { usedN: Math.max(0, priorN - 1), used: list });
    flash("Day removed");
  };

  /* One-tap import of the retiring spreadsheet for the selected year. Only
     touches people it can match, never deletes anyone, and hands back misses. */
  async function importYear() {
    const s = await fetchPtoSeed();
    if (!s) { flash("Could not read the spreadsheet data — you may not have HR access"); return; }
    const rows = s.seed[year] || [];
    if (!rows.length) { flash("No sheet data for " + year); return; }
    const already = Object.keys(peopleOf(year)).length > 0;
    if (already && !window.confirm("Re-import " + year + " from the spreadsheet?\n\nThis overwrites plan, allotment and days used for everyone the sheet lists — any corrections made here since the last import will be lost. Bonuses are overwritten too.")) return;
    const cur = { ...peopleOf(year) };
    const matched = [], missed = [];
    rows.forEach((row) => {
      const id = matchId(row.n, [...team, ...gone]);
      if (!id) { missed.push(row.n); return; }
      matched.push(row.n);
      cur[id] = {
        ...(cur[id] || {}),
        plan: row.plan,
        days: row.days,
        used: row.d.map((dt, i) => ({ id: "s" + year + "_" + id + "_" + i, date: dt, note: row.note || "from spreadsheet" })),
        // ⚠️ HANNAH RULED THE COUNT GOVERNS (Jul 22): where the sheet's own
        // "days used" number disagrees with the dates it lists, the COUNT is
        // authoritative and the dates are unverified detail underneath it.
        // Rows with no `cnt` agree with themselves, so the length is correct.
        usedN: row.cnt == null ? row.d.length : row.cnt,
      };
    });
    const bonus = { ...store.bonus };
    s.bonus.forEach(([n, b24, b25]) => {
      const id = matchId(n, [...team, ...gone]);
      if (!id) { if (!missed.includes(n)) missed.push(n); return; }
      bonus[id] = { ...(bonus[id] || {}), "2024": b24, "2025": b25 };
    });
    persist({ ...store, years: { ...store.years, [year]: { people: cur } }, bonus });
    setReport({ year, matched: matched.length, missed });
  }

  // A leaver only appears if they actually have something recorded for the year
  // being viewed — otherwise every past termination would pile up forever on a
  // year they never worked.
  const goneWithData = useMemo(() => {
    const ppl = peopleOf(year);
    return gone.filter((m) => !!ppl[m.id] || bonusOf(m.id, CURRENT_BONUS_YEAR) !== "");
  }, [gone, store, year]);

  // ONE list drives both the rows and the totals, so the stat strip can never
  // disagree with what's on screen. When leavers are hidden the strip says so
  // out loud rather than quietly reporting a smaller number.
  const listed = useMemo(() => (showLeft ? [...team, ...goneWithData] : team), [team, goneWithData, showLeft]);

  const excluded = useMemo(() => {
    if (showLeft || !goneWithData.length) return null;
    let d = 0;
    goneWithData.forEach((m) => { d += Number(recOf(m).usedN) || 0; });
    return { n: goneWithData.length, days: d };
  }, [showLeft, goneWithData, store, year]);

  const groups = useMemo(() => {
    const byPlan = {};
    PLANS.forEach((p) => { byPlan[p.id] = []; });
    listed.forEach((m) => { const { planId } = recOf(m); (byPlan[planId] || byPlan.none).push(m); });
    Object.values(byPlan).forEach((l) => l.sort((a, b) => a.name.localeCompare(b.name)));
    return PLANS.map((p) => ({ ...p, people: byPlan[p.id] })).filter((g) => g.people.length);
  }, [listed, store, year]);

  const totals = useMemo(() => {
    let allot = 0, used = 0, bonus = 0;
    listed.forEach((m) => { const r = recOf(m); allot += Number(r.days) || 0; used += Number(r.usedN) || 0; });
    listed.forEach((m) => { bonus += Number(bonusOf(m.id, CURRENT_BONUS_YEAR)) || 0; });
    return { allot, used, remaining: allot - used, bonus };
  }, [listed, store, year]);

  if (loading) return <div style={{ padding: 28, color: GRAY, fontSize: 13, background: BG }}>Loading PTO&hellip;</div>;

  return (
    <div style={{ background: BG, padding: "14px 14px 40px", fontFamily: "Inter, -apple-system, sans-serif", color: TEXT }}>
      {loadFailed && (
        <div style={{ background: "#F5EAD3", border: "1px solid #E4CE9E", borderLeft: "3px solid #A9741C", borderTop: "3px solid #A9741C", borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontSize: 13, fontWeight: 700, color: "#7A5410" }}>
          The PTO ledger could not be reached — balances below are blank, not real. Nothing can be added or changed until it loads. Close and reopen the tile to retry.
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: GRAY }}>Year</span>
        {YEARS.map((y) => (
          <button key={y} onClick={() => setYear(y)}
            style={{
              fontSize: 13, fontWeight: 800, cursor: "pointer", borderRadius: 8, padding: "5px 14px",
              border: `1px solid ${y === year ? GREEN : LINE}`, background: y === year ? GREEN : "#fff",
              color: y === year ? "#fff" : TEXT,
            }}>{y}</button>
        ))}
        {canEdit && (
          <button onClick={importYear}
            style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, cursor: "pointer", borderRadius: 8, padding: "6px 12px", border: `1px solid ${LINE}`, background: "#fff", color: INK }}>
            Import {year} from spreadsheet
          </button>
        )}
      </div>

      {report && (
        <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderLeft: `3px solid ${GREEN}`, borderTop: `3px solid ${GREEN}`, borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontSize: 12.5, lineHeight: 1.5 }}>
          <b>Imported {report.year}</b> — {report.matched} matched.{" "}
          {report.missed.length > 0
            ? <>{report.missed.length} name{report.missed.length === 1 ? "" : "s"} had no match on the roster and {report.missed.length === 1 ? "was" : "were"} skipped: <span style={{ color: RED }}>{report.missed.join(", ")}</span>. Add them by hand if they still work here.</>
            : <>Every name matched.</>}
          <button onClick={() => setReport(null)} style={{ marginLeft: 8, background: "none", border: "none", color: GRAY, cursor: "pointer", fontSize: 12 }}>dismiss</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <Stat label={year + " allotted"} value={totals.allot} />
        <Stat label={year + " used"} value={totals.used} />
        <Stat label="Remaining" value={totals.remaining} tone={totals.remaining < 0 ? RED : GREEN} />
        <Stat label={CURRENT_BONUS_YEAR + " bonus"} value={"$" + totals.bonus.toLocaleString()} />
        <Stat label="On roster" value={team.length} />
      </div>

      {/* The totals above cover exactly the rows below — never a wider set. If
          leavers are being left out, say so with the number, so nobody reads a
          shrunken year total as the real one. */}
      {(excluded || goneWithData.length > 0) && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14,
          background: "#fff", border: `1px solid ${LINE}`, borderRadius: 10, padding: "9px 12px" , ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }}>
          <div style={{ fontSize: 12.5, color: GRAY, flex: "1 1 220px", minWidth: 0 }}>
            {excluded
              ? <>Not counted above: <b style={{ color: INK }}>{excluded.n}</b> who left, with <b style={{ color: INK }}>{excluded.days}</b> day{excluded.days === 1 ? "" : "s"} used in {year}.</>
              : <>Including <b style={{ color: INK }}>{goneWithData.length}</b> who left. Their {year} record still counts.</>}
          </div>
          <button onClick={() => setShowLeft((v) => !v)}
            style={{ fontSize: 12.5, fontWeight: 700, cursor: "pointer", borderRadius: 8, padding: "5px 12px",
              border: `1px solid ${LINE}`, background: showLeft ? INK : "#fff", color: showLeft ? "#fff" : INK }}>
            {showLeft ? "Hide people who left" : "Show people who left"}
          </button>
        </div>
      )}

      {!canEdit && <div style={{ fontSize: 12, color: GRAY, marginBottom: 12 }}>Read-only. PTO is maintained by Payroll.</div>}

      {groups.map((g) => (
        <div key={g.id} style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: INK }}>{g.label}</div>
            <div style={{ fontSize: 11, color: GRAY }}>{g.days} days · {g.hrs} hrs</div>
          </div>

          <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 10, overflow: "hidden" , ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }}>
            {g.people.map((m, i) => {
              const r = recOf(m);
              const usedN = Number(r.usedN) || 0;
              const remaining = (Number(r.days) || 0) - usedN;
              const drift = r.used.length !== usedN;
              const isOpen = open === m.id;
              return (
                <div key={m.id} style={{ borderTop: i ? `1px solid ${LINE}` : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", flexWrap: "wrap" }}>
                    <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {m.name}
                        {m._left && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, letterSpacing: ".06em",
                          textTransform: "uppercase", color: GRAY, border: `1px solid ${LINE}`, borderRadius: 5, padding: "1px 5px" }}>Left</span>}
                      </div>
                      <div style={{ fontSize: 11, color: GRAY }}>{m.role}</div>
                    </div>

                    {canEdit && (
                      <select value={r.planId} onChange={(e) => setPlan(m, e.target.value)}
                        style={{ fontSize: 12, padding: "4px 6px", border: `1px solid ${LINE}`, borderRadius: 6, background: "#fff" }}>
                        {PLANS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                      </select>
                    )}

                    <Num label="Allot">
                      {canEdit
                        ? <input value={r.days} onChange={(e) => setDays(m, e.target.value)} inputMode="decimal"
                            style={{ width: 44, fontSize: 13, textAlign: "right", border: `1px solid ${LINE}`, borderRadius: 6, padding: "3px 5px" }} />
                        : <b>{r.days}</b>}
                    </Num>
                    <Num label="Used">
                      {canEdit
                        ? <input value={r.usedN} onChange={(e) => setUsedN(m, e.target.value)} inputMode="decimal"
                            style={{ width: 44, fontSize: 13, fontWeight: 700, textAlign: "right", border: `1px solid ${LINE}`, borderRadius: 6, padding: "3px 5px" }} />
                        : <b>{usedN}</b>}
                    </Num>
                    <Num label="Left">
                      <b style={{ color: remaining < 0 ? RED : remaining === 0 ? GRAY : GREEN }}>{remaining}</b>
                    </Num>
                    <Num label={"Bonus " + CURRENT_BONUS_YEAR}>
                      {canEdit
                        ? <input value={bonusOf(m.id, CURRENT_BONUS_YEAR)} onChange={(e) => setBonus(m.id, CURRENT_BONUS_YEAR, e.target.value)}
                            placeholder="&mdash;" inputMode="decimal"
                            style={{ width: 56, fontSize: 13, textAlign: "right", border: `1px solid ${LINE}`, borderRadius: 6, padding: "3px 5px" }} />
                        : <b>{bonusOf(m.id, CURRENT_BONUS_YEAR) === "" ? "—" : "$" + bonusOf(m.id, CURRENT_BONUS_YEAR)}</b>}
                    </Num>

                    <button onClick={() => setOpen(isOpen ? null : m.id)}
                      style={{ fontSize: 12, fontWeight: 700, color: GREEN, background: "none", border: "none", cursor: "pointer", padding: "4px 2px" }}>
                      {isOpen ? "Hide" : "Detail"}
                    </button>
                  </div>

                  {isOpen && (
                    <div style={{ padding: "0 12px 12px", background: "#FBFCFD" }}>
                      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: GRAY, padding: "6px 0 3px" }}>
                        Dates used &mdash; {year}
                      </div>
                      {drift && (
                        <div style={{ fontSize: 11.5, color: "#8A6D1F", background: "#FFF8E6", border: "1px solid #F0E0B0", borderRadius: 6, padding: "5px 8px", marginBottom: 6 }}>
                          Counted <b>{usedN}</b> day{usedN === 1 ? "" : "s"} but <b>{r.used.length}</b> date{r.used.length === 1 ? "" : "s"} listed. The count is what the balance uses &mdash; fix whichever is wrong.
                        </div>
                      )}
                      {r.used.length === 0 && <div style={{ fontSize: 12, color: GRAY, paddingBottom: 6 }}>No dates listed.</div>}
                      {r.used.map((d) => (
                        <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, padding: "3px 0" }}>
                          <span style={{ fontWeight: 700, minWidth: 74 }}>{fmtDay(d.date)}</span>
                          <span style={{ flex: 1, color: GRAY }}>{d.note}</span>
                          {canEdit && <button onClick={() => removeDay(m, d.id)} style={{ fontSize: 11, color: RED, background: "none", border: "none", cursor: "pointer" }}>remove</button>}
                        </div>
                      ))}

                      {canEdit && (
                        <div style={{ marginTop: 8, borderTop: `1px solid ${LINE}`, paddingTop: 8 }}>
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                            {["one", "range"].map((k) => (
                              <button key={k} onClick={() => setMode(k)}
                                style={{
                                  fontSize: 11.5, fontWeight: 700, cursor: "pointer", borderRadius: 6, padding: "3px 10px",
                                  border: `1px solid ${mode === k ? GREEN : LINE}`, background: mode === k ? GREEN : "#fff", color: mode === k ? "#fff" : TEXT,
                                }}>
                                {k === "one" ? "Single day" : "Date range"}
                              </button>
                            ))}
                            {mode === "range" && <span style={{ fontSize: 11, color: GRAY }}>Sundays skipped</span>}
                          </div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <input type="date" value={d1} onChange={(e) => setD1(e.target.value)}
                              style={{ fontSize: 12, border: `1px solid ${LINE}`, borderRadius: 6, padding: "4px 6px" }} />
                            {mode === "range" && (
                              <input type="date" value={d2} onChange={(e) => setD2(e.target.value)}
                                style={{ fontSize: 12, border: `1px solid ${LINE}`, borderRadius: 6, padding: "4px 6px" }} />
                            )}
                            <input placeholder="note (optional)" value={note} onChange={(e) => setNote(e.target.value)}
                              style={{ flex: "1 1 110px", fontSize: 12, border: `1px solid ${LINE}`, borderRadius: 6, padding: "4px 6px" }} />
                            <button onClick={() => addDays(m)}
                              style={{ fontSize: 12, fontWeight: 700, color: "#fff", background: GREEN, border: "none", borderRadius: 6, padding: "5px 12px", cursor: "pointer" }}>
                              Add
                            </button>
                          </div>
                        </div>
                      )}

                      <div style={{ marginTop: 10, borderTop: `1px solid ${LINE}`, paddingTop: 8 }}>
                        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: GRAY, marginBottom: 4 }}>
                          Year-end bonus
                        </div>
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                          {BONUS_YEARS.map((by) => (
                            <div key={by} style={{ textAlign: "center" }}>
                              <div style={{ fontSize: 10, color: by === CURRENT_BONUS_YEAR ? INK : GRAY, fontWeight: 700 }}>
                                {by}{by === CURRENT_BONUS_YEAR ? " · this Christmas" : ""}
                              </div>
                              {canEdit
                                ? <input value={bonusOf(m.id, by)} onChange={(e) => setBonus(m.id, by, e.target.value)} placeholder="&mdash;" inputMode="decimal"
                                    style={{ width: 64, fontSize: 13, textAlign: "right", border: `1px solid ${LINE}`, borderRadius: 6, padding: "3px 5px" }} />
                                : <div style={{ fontSize: 13, fontWeight: 700 }}>{bonusOf(m.id, by) === "" ? "—" : "$" + bonusOf(m.id, by)}</div>}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div style={{ fontSize: 11, color: GRAY, lineHeight: 1.5, marginTop: 4 }}>
        Allotments follow the 5/6/26 accrual plan. Accrual is not calculated automatically &mdash; set the
        allotment when someone&rsquo;s plan changes. The roster follows HR Console on its own &mdash; new hires appear here as
        soon as they are added, and anyone terminated moves out of the working list without their year being erased.
        2022 and 2023 bonuses exist on the old spreadsheet and were not imported.
      </div>

      {/* Never move someone's balance silently — say who changed and by how much. */}
      {countFixNote && countFixNote.length > 0 && (
        <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "11px 13px", marginBottom: 12, fontSize: 13, lineHeight: 1.5, color: "#92400E" }}>
          <b>2025 days used corrected to the spreadsheet's own counts.</b> The sheet's per-person count disagreed with the dates it listed;
          HR confirmed the count governs. Updated:{" "}
          {countFixNote.map((c, i) => (
            <span key={c.name}>{i ? ", " : ""}{c.name} {c.from} → {c.to}</span>
          ))}. The dates are still listed underneath as unverified detail — the drift note on those rows is expected.
        </div>
      )}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: INK, color: "#fff", fontSize: 13, padding: "8px 16px", borderRadius: 999 }}>
          {toast}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 10, padding: "8px 14px", minWidth: 92 , ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: GRAY }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: tone || TEXT }}>{value}</div>
    </div>
  );
}

function Num({ label, children }) {
  return (
    <div style={{ textAlign: "center", minWidth: 44 }}>
      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: GRAY }}>{label}</div>
      <div style={{ fontSize: 13 }}>{children}</div>
    </div>
  );
}
