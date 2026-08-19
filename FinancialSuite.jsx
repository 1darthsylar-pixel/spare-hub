/* ============================================================================
   FinancialSuite.jsx — Gate City Hub
   Combines Sales Allocation, Labor Planner, Food Cost Tracker,
   FCR Projections, Expense Tracker, and Profit Share under one
   Director-tier tile, navigated by an internal tab bar. Each tab renders
   its existing component unmodified — this file only adds the tab chrome.

   Tab order is priority order: FCR, Labor, Sales, Food Cost, Expenses,
   Profit Share. First-time open (no saved tab) lands on the first tab.

   Remembers the last tab opened (localStorage) so returning to
   Financials lands where you left off. The dashboard's "due today"
   chips (Sales / Hours / Giveaways) can also force a specific tab by
   writing to LAST_TAB_KEY right before opening this tile — see App.jsx.

   PROFIT SHARE ACCESS (rewritten Jul 22 2026 — the previous note here was
   FALSE and had been relied on twice). It used to claim the tab was protected
   by "a name+PIN gate scoped to exactly four people" inside ProfitShare.jsx.
   No such gate existed: ProfitShare took no props and performed no identity
   check of any kind, so the tab was open — and fully EDITABLE — to anyone who
   could open this tile. The real controls now live here and are these two:
     1. VISIBILITY — the tab is hidden unless the person is Executive tier and
        up (Executive Director / Executive / Human Resources / Owner) or
        Payroll. See PROFIT_ROLES in finShared.js.
     2. EDITING — Matt (33) and Nick (37) ONLY, by roster id. ProfitShare
        takes `canEdit` and defaults it to false; this file passes true for
        exactly those two people. Everyone else above — including Kyleeka,
        Hannah and Cindy — sees the numbers and can change nothing.
   If either of those is changed, change this comment with it.
   ============================================================================ */

import { useMemo, useState } from "react";
import SalesAllocation from "./SalesAllocation.jsx";
import LaborPlanner from "./LaborPlanner.jsx";
import FoodCostTracker from "./FoodCostTracker.jsx";
import FCRPage from "./FCRPage.jsx";
import ExpenseTracker from "./ExpenseTracker.jsx";
import ProfitShare from "./ProfitShare.jsx";
import PTOTracker from "./PTOTracker.jsx";

const RED = "#DD0031", GRAY = "#6B7480", LINE = "#E3E7EC", BG = "#F6F8FA";
const MASTHEAD = "linear-gradient(120deg,#1F6F4A 0%,#0E3A26 55%)"; // dual-shade masthead

// LAST_TAB_KEY lives in finShared.js (leaf) so the dashboard can deep-open
// a tab without importing this whole suite. Re-exported for compatibility.
export { LAST_TAB_KEY } from "./finShared.js";
import { LAST_TAB_KEY, canSeeProfitShare as sharedCanSeeProfitShare, finTabHiddenFor } from "./finShared.js";
import { STORE, STORE_CONFIG, storeCfg, profitEditIds } from "./storeConfig.js"; // masthead, live feature flags, and who may edit profit share

/* Who may SEE the Profit Share tab (Matt, Jul 22 2026: "view only to executive
   tier and up plus payroll"). Matched on role name rather than tier, because
   App.jsx's roleTier collapses everything at rank 6+ into tier 3 — that would
   also admit Leadership Development Director, which is below the line Matt
   drew. These five names are exactly rank 7+ in HRConsole's RANK ladder
   (Executive Director / Executive / Human Resources / Owner) plus Payroll. */
/* ⚠️ THE LIST MOVED TO finShared.js AND MUST NOT COME BACK HERE. It was written
   here and again inside worker.js as a rank test, and the two disagreed — the
   API handed the pay groups and multipliers to two people this tab hides. One
   definition, in a leaf both halves import. See finShared.js for the detail. */
const canSeeProfitShare = (u) => sharedCanSeeProfitShare(u && u.role);

/* Who may EDIT it (Matt, Jul 22 2026: "I need edit access. Nick and I only").
   BY ROSTER ID, not by role — deliberately. Matt is Executive Director and so
   is Kyleeka (23), so any role-based test that admits him admits her too. Ids
   are the only thing that expresses "these two people". Same reason
   OnboardingLauncher singles Nick out by id.
   33 = Matt (Executive Director) · 37 = Nick (Owner).
   Consequence: this does NOT follow the role. If either person leaves or the
   Executive Director seat changes hands, edit access has to be changed here. */
/* ★★ THE IDS MOVED TO storeConfig.js AS owners.profitEdit (Aug 11 2026), with
   all of the reasoning above kept beside them there. They were a hardcoded Set
   here, which meant a second store handed profit-share editing to whoever
   happened to hold ids 33 and 37 on their own roster. This is money, so it was
   the first of the "people are code" spots to move.

   ⚠️ READ AT CALL TIME, NOT CAPTURED. `profitEditIds()` is a function for the
   same reason the HR Console list is: a const here would freeze the default
   the moment this module imported, before a store's saved settings arrived,
   and the screen would save fine and change nothing.
   ⚠️ AN EMPTY LIST MEANS NOBODY EDITS, which is the safe direction. A store
   that has not decided who owns this gets a read-only screen. */
const canEditProfitShare = (u) => {
  const id = String((u && u.id) ?? "");
  return id !== "" && profitEditIds().includes(id);
};

/* PRINTING (added for Payroll, who has to print out of this tile).
   One button on the suite chrome prints WHATEVER TAB IS OPEN, rather than six
   per-tab print sheets. Rationale: every tab already lays its numbers out on
   screen, so hiding the chrome and letting the active tab flow onto paper gets
   a usable sheet from all six tabs for one edit. The trade-off, stated plainly:
   this is "print what is on screen", not a designed report — compare CashAudit,
   which builds a dedicated .print-sheet for its mileage log. If a specific tab
   needs a real report layout, that is a per-tab job on top of this. */
const PRINT_CSS = `
.fin-printhead { display: none; }
@media print {
  .fin-chrome { display: none !important; }
  .fin-shell { background: #fff !important; min-height: 0 !important; }
  .fin-printhead {
    display: block !important;
    font-family: Arial, Helvetica, sans-serif;
    color: #000; padding: 0 0 10px; margin-bottom: 10px;
    border-bottom: 1px solid #000;
  }
  .fin-printhead .t { font-size: 17px; font-weight: 700; }
  .fin-printhead .m { font-size: 11px; }
  @page { margin: 12mm; }
}
`;

/* ★ TWO TABS ARE FEATURE-FLAGGED (step 2, Aug 11 2026). A store that says no to
   profit share or PTO should not see the tab at all.

   ⚠️ FILTERED OUT OF THE LIST, NOT DISABLED — the same mechanism the role rules
   below already use. `current` resolves against the filtered list, so a stale
   localStorage value cannot land somebody on a tab their store switched off.

   ⚠️ HIDING THE PTO TAB TOUCHES NO MONEY, and that is worth knowing because it
   looks like it should. Labor % runs on the PTO DOLLARS typed into the FCR
   record, not on this tracker, which keeps a days-left ledger in its own key.
   Two things called PTO with no wire between them (Matt, Aug 11 2026: "the pto
   tracker is just a tool to track days left YTD rn"). If the tracker ever
   learns pay rates and starts feeding the FCR, this stops being cosmetic. */
const ALL_TABS = [
  { id: "fcr", label: "FCR", Component: FCRPage },
  { id: "labor", label: "Labor", Component: LaborPlanner },
  { id: "sales", label: "Sales", Component: SalesAllocation },
  { id: "foodcost", label: "Food Cost", Component: FoodCostTracker },
  { id: "expenses", label: "Expenses", Component: ExpenseTracker },
  { id: "profitshare", label: "Profit Share", Component: ProfitShare, feature: "profitShare" },
  // LAST tab, after Profit Share (Matt, Jul 22). Replaces the retiring
  // Vacation Spreadsheet; Payroll maintains it, everyone else reads.
  { id: "pto", label: "PTO", Component: PTOTracker, feature: "pto" },
];

export default function FinancialSuite({ user }) {
  /* Profit Share is filtered OUT of the tab list for anyone outside
     PROFIT_ROLES (finShared.js), so it is never rendered and never reachable by a stale
     localStorage value — the checks below all run against `tabs`, the filtered
     list, never against ALL_TABS.
     ★ AND PTO IS FILTERED OUT FOR A DIRECTOR (Matt, Aug 10 2026: "just not the
     profit share or PTO. The other things in financial though"). Directors are
     new to this tile as of the same commit; everyone who could open it before
     keeps every tab they had, because the rule names Directors rather than
     naming who is allowed.
     ⚠️ FILTERED, NOT DISABLED, for the same reason Profit Share is: `current`
     below resolves against `tabs`, so a Director who had PTO open on another
     device cannot land on it from the saved localStorage value. */
  /* ⚠️⚠️ THE FEATURE TEST MOVED IN HERE ON Aug 13 2026 AND THE MOVE IS THE FIX.
     It used to build a module-level `TABS` from `STORE_CONFIG.features[...]`,
     which is wrong twice over: STORE_CONFIG is the frozen CODE DEFAULTS, never
     a store's saved settings, and a module-level const is evaluated at import
     — before any saved setting has been fetched.

     So the Profit share and PTO switches on the Store Settings screen did
     NOTHING. A store could switch profit share off, the setting would save
     correctly, and the tab would stay exactly where it was. This file's own
     header calls that out as the worst kind of flag: "it reads as a working
     switch on the settings screen and does nothing." It was describing
     teamGroups, and two live flags were in that state one screen away.

     ⇒ `storeCfg()` reads the merged LIVE config, and reading it inside the
     useMemo means it is read at RENDER, after the saved settings have landed.
     Same trap and same shape as the isGateCity fix in ThawAllocation.jsx today.
     ⚠️ INLINE RATHER THAN A NAMED HELPER, deliberately: App.jsx already owns a
     `featureOn` and a second definition of the same rule is exactly what design
     rule 8 forbids. One call site, one expression. */
  const tabs = useMemo(
    () => ALL_TABS.filter((t) =>
      (!t.feature || storeCfg(`features.${t.feature}`) !== false)
      && (t.id !== "profitshare" || canSeeProfitShare(user))
      && !finTabHiddenFor(user && user.role, t.id)),
    [user]
  );

  const [tab, setTab] = useState(() => {
    try {
      const saved = localStorage.getItem(LAST_TAB_KEY);
      return tabs.some((t) => t.id === saved) ? saved : tabs[0].id;
    } catch {
      return tabs[0].id;
    }
  });

  const setActiveTab = (id) => {
    setTab(id);
    try { localStorage.setItem(LAST_TAB_KEY, id); } catch {}
  };

  // Falls back to the first visible tab if `tab` names one this person can't
  // see (e.g. they had Profit Share open before their role changed).
  const current = tabs.find((t) => t.id === tab) || tabs[0];
  const Active = current.Component;
  const activeLabel = current.label;

  return (
    <div className="fin-shell" style={{ fontFamily: "Inter, -apple-system, sans-serif", background: BG, minHeight: "100vh" }}>
      <style>{PRINT_CSS}</style>
      {/* Paper-only header. The masthead is hidden when printing, so without
          this a printed page would carry no store, no tab and no date. */}
      <div className="fin-printhead">
        <div className="t">{STORE.name} FSR #{STORE.fsr} — Financials · {activeLabel}</div>
        <div className="m">Printed {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>
      </div>
      <div className="fin-chrome" style={{ background: MASTHEAD, color: "#fff", padding: "16px 18px 15px" }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", color: "rgba(255,255,255,0.75)" }}>
          {STORE.name.toUpperCase()} FSR · #{STORE.fsr}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 3 }}>
          <div style={{ fontSize: 23, fontWeight: 800, letterSpacing: "-0.02em" }}>Financials</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.75)" }}>{activeLabel}</div>
            <button
              onClick={() => window.print()}
              title={`Print the ${activeLabel} tab`}
              style={{
                background: "rgba(255,255,255,0.14)", color: "#fff", cursor: "pointer",
                border: "1px solid rgba(255,255,255,0.35)", borderRadius: 8,
                padding: "5px 11px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
              }}
            >
              Print
            </button>
          </div>
        </div>
      </div>
      <div
        className="fin-chrome"
        style={{
          position: "sticky", top: 0, zIndex: 40, background: "#fff",
          borderBottom: `1px solid ${LINE}`, display: "flex", overflowX: "auto",
          padding: "0 6px", WebkitOverflowScrolling: "touch",
        }}
      >
        {tabs.map((t) => {
          const on = current.id === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                flexShrink: 0, background: "none", border: "none", cursor: "pointer",
                padding: "12px 14px", fontSize: 13.5, fontWeight: 800,
                color: on ? RED : GRAY,
                borderBottom: on ? `3px solid ${RED}` : "3px solid transparent",
                whiteSpace: "nowrap",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {/* canEdit is passed ONLY to Profit Share — spreading it into every tab
          would hand an unrelated component a prop name it may already use.
          Everyone outside PROFIT_EDIT_IDS gets the default, false. */}
      <Active
        user={user}
        {...(current.id === "profitshare" ? { canEdit: canEditProfitShare(user) } : {})}
      />
    </div>
  );
}
