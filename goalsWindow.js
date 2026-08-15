/* ============================================================================
   goalsWindow.js — Gate City Hub

   When the monthly goal window is open, which month it is for, and who still
   owes one. Nothing else.

   ★ WHY THIS IS ITS OWN FILE. App.jsx needs the answer to "does this Assistant
   Director still owe a goal" to paint Bri's alert trail, and it must not import
   GoalSubmissions.jsx to get it — that would drag the whole tile, its editor and
   everything it imports into the first paint of the home screen. This repo has
   made that mistake once already; finShared.js exists for exactly the same
   reason and says so in its own header.

   ★ LEAF. Imports one thing, nameMatch.js, which itself imports nothing. Do not
   add a React, store or component import here.

   ⚠️ GoalSubmissions.jsx RE-EXPORTS EVERYTHING BELOW, so MemberVote and anything
   else that already imports these from there keeps working untouched. There is
   still exactly one definition; only its address changed.
   ============================================================================ */

import { sameId } from "./nameMatch.js";

export const SUB_KEY = "gc-goal-submissions-v1";

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

/* offset 0 = the month you're in, 1 = the month after. `new Date(y, m + n, 1)`
   rolls the year on its own — do NOT hand-roll it. */
export function monthOf(now, offset) {
  const d = new Date(now.getFullYear(), now.getMonth() + (offset || 0), 1);
  return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    label: `${MONTHS[d.getMonth()]} ${d.getFullYear()} Goal`,
    month: MONTHS[d.getMonth()], year: d.getFullYear() };
}
/* Bri: submitting in late June produces "July 2026 Goal". Always the month
   AFTER the window. */
export const targetMonth = (now) => monthOf(now, 1);

export const WINDOW_DEFAULTS = { lastDays: 5, openTime: "00:00", closeTime: "23:59", manual: null, mode: "last" };

/* ── the window ──────────────────────────────────────────────────────────
   The Vote form needs the identical rule, and a second copy of month-length
   arithmetic is exactly how two pages start disagreeing about when something is
   open. One definition, imported.
   Bri's rule: "the last 5 days of each month", recurring, changeable later.
   Computed fresh for whatever month you are in, so a 28-, 30- or 31-day month
   all end correctly and February never needs a special case. */
// mode "last"  → the last N days of the month (Submissions: goals set for next month)
// mode "first" → the first N days of the month (Vote: on the nominations just approved)
export function monthWindow(now, days, openTime, closeTime, mode) {
  const y = now.getFullYear(), m = now.getMonth();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const n = Math.max(1, Math.min(daysInMonth, Number(days) || 5));
  const [oh, om] = String(openTime || "00:00").split(":").map(Number);
  const [ch, cm] = String(closeTime || "23:59").split(":").map(Number);
  const firstDay = mode === "first" ? 1 : daysInMonth - n + 1;
  const lastDay = mode === "first" ? n : daysInMonth;
  return {
    openAt: new Date(y, m, firstDay, oh || 0, om || 0, 0),
    closeAt: new Date(y, m, lastDay, ch || 23, cm || 59, 59),
  };
}

/* manual: null = follow the rule · true = force open · false = force closed.
   The override is deliberately a THIRD state rather than a boolean, so that
   forcing it open for one month doesn't silently disable the rule forever. */
export function windowState(cfg, now) {
  const c = { ...WINDOW_DEFAULTS, ...(cfg || {}) };
  const w = monthWindow(now, c.lastDays, c.openTime, c.closeTime, c.mode);
  const onSchedule = now >= w.openAt && now <= w.closeAt;
  const open = c.manual === true ? true : c.manual === false ? false : onSchedule;
  return { ...w, onSchedule, open, forced: c.manual === true || c.manual === false };
}

/* ═══ DOES THIS PERSON STILL OWE A GOAL THIS MONTH? ═════════════════════════
   Bri, Jul 30 2026, verbatim: "is it possible to add a 'due' banner somewhere
   for ADs needing to submit their team goals on Submissions? They open the last
   5 days of the month, so the banner should be visible through this timeframe
   until they submit and it's APPROVED. If they submit and it's sent back they
   need to have the banner remain… This is just needed for the Assistant
   Directors who are submitting these goals."

   ★ IT READS THE SAME WINDOW THE FORM DOES. It does not count five days of its
   own. She can change that number in her own settings — GoalSubmissions carries
   a scar about a value that got locked in — and a banner with its own
   arithmetic would nag after the form had shut, or stay quiet while it was open.

   ★ APPROVED IS THE ONLY THING THAT CLEARS IT. Pending does not, and returned
   very deliberately does not: "if they submit and it's sent back they need to
   have the banner remain" is the whole reason she asked.

   ★ LEADING A TEAM *IS* THE ASSISTANT DIRECTOR TEST, and that is why no role
   list appears here. Checked against the live directory: exactly seven people
   sit at tier "ad" on a team, one team each, and they are precisely Bri's ADs.
   Brandon and Daisy are Directors and hold no such row, so they are correctly
   out. A role list would have been a second definition of the same set, kept in
   step by hand, and `canSubmit` over in the tile deliberately includes every
   reviewer — Bri and Hannah can file one on somebody's behalf. Reviewers do not
   OWE one, and a red banner in front of the three people who approve them would
   teach all three to ignore it.

   ⚠️ FAILS SILENT. No config, no teams, no directory, or a failed read all
   return zero. The failure mode is a banner that does not appear, never one
   that nags every leader about work that does not exist. */
export function goalsOwed(data, teams, viewer, now = new Date()) {
  const none = { owed: 0, teams: [], open: false };
  if (!data || !viewer || viewer.id == null) return none;
  if (!windowState((data && data.window) || null, now).open) return none;

  const key = targetMonth(now).key;
  const entries = Array.isArray(data.entries) ? data.entries : [];
  const list = Array.isArray(teams) ? teams : [];
  const led = list.filter((t) => t && Array.isArray(t.people)
    && t.people.some((p) => p && p.tier === "ad" && sameId(p.hrId, viewer.id)));

  const owedTeams = led.filter((t) => !entries.some((e) =>
    e && e.monthKey === key && String(e.teamId) === String(t.id) && e.status === "approved"));
  return { owed: owedTeams.length, teams: owedTeams.map((t) => t.name || "your team"), open: true };
}
