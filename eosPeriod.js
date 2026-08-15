// eosPeriod.js — single source of truth for the EOS scorecard quarter.
// -----------------------------------------------------------------------------
// The scorecard feed lives at KV key `eos:scorecard:{YYYY-QN}`. Producers
// (FCRPage, HRConsole) WRITE it; readers (App.jsx KPI strip + Company Health
// ring, EOSTile, aiSummary's digest) READ it. Before this file existed, every
// one of them hardcoded "2026-Q3" — so at a quarter roll the readers and
// writers would silently disagree (readers looking at Q4, writers still filling
// Q3) and the ring/strip/digest would blank until someone bumped five constants
// in five files. This is that bump, done once, derived from the date.
//
// CFA fiscal year = calendar year, fiscal quarters = calendar quarters
// (Jan–Mar Q1 · Apr–Jun Q2 · Jul–Sep Q3 · Oct–Dec Q4) — confirmed against the
// FCR YTD math. If CFA ever shifts to a non-calendar fiscal calendar, THIS is
// the one place to change it.
//
// Shared between the browser bundle and the Cloudflare Worker (like
// trainerTaskRoster.js), so both compute the exact same key and can never drift.
// -----------------------------------------------------------------------------

// "2026-Q3" — the KV key suffix. Pass a Date to test a roll; defaults to now.
export function eosPeriod(d = new Date()) {
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
}

// "Q3 · FY26" — the human label shown on the KPI strip.
export function eosPeriodLabel(d = new Date()) {
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `Q${q} · FY${String(d.getFullYear()).slice(2)}`;
}

// First calendar day of the current quarter — the Rocks/week-clock anchor.
// EOSTile counts "Week N of 13" from the quarter's start; deriving this keeps
// that honest across rolls instead of freezing at a hardcoded 2026-06-29.
export function quarterStart(d = new Date()) {
  const q = Math.floor(d.getMonth() / 3);      // 0..3
  return new Date(d.getFullYear(), q * 3, 1);  // local midnight, 1st of the quarter
}
