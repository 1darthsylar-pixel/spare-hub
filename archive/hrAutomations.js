/**
 * hrAutomations.js — Gate City Hub · HR automation module
 * ---------------------------------------------------------------------------
 * ONE module, ONE scheduled entry point. cron-job.org hits /api/run-job?job=hr
 * once a day; this module decides what runs (daily / Mondays / on-demand).
 * Do NOT register multiple cron jobs — this account fights multiple triggers.
 *
 * Wire into your Worker's job router:
 *
 *   if (job === "hr") {
 *     const result = await runHrAutomations(env);
 *     return json(result);            // or new Response(JSON.stringify(result))
 *   }
 *
 * Phase 1 (Signature chaser) is LIVE below. Phases 2/3/5/6 are clean stubs
 * with the exact reads/logic from the spec — fill-in-the-blank. Phase 4
 * (onboarding) is an exported event hook, not part of the daily router.
 * Milestones (bonus) is implemented but OFF until you set milestoneChannel.
 * ---------------------------------------------------------------------------
 */

import { kvGet, kvSet, saveSubmission, listSubmissions } from "./store.js";

/* =========================================================================
 * CONFIG  — override any of these live via KV key "hr:auto:config"
 * The three you must set before this DMs anyone are flagged  ⚠ WIRE.
 * ======================================================================= */
const DEFAULTS = {
  rosterKey: "gcfcr-hr-team-v1",        // [{ id, name, role, start, lastEval, status }]
  handbookKey: "gcfcr-hr-handbook",     // { version: { n, droppedAt }, acks: { personId: { version } } }
  statusKey: "gcfcr-hr-status",         // per-person status map (fallback if roster row has no status)
  slackIdMapKey: "gcfcr-hr-slackids",   // ⚠ WIRE: { personId: "U0123ABCD" }  — how we DM a human
  chaserKey: "hr:auto:chaser",          // nudge history, written by Phase 1
  logKey: "hr:auto:log",                // run log (ring buffer)
  configKey: "hr:auto:config",          // live overrides for anything in this block

  evalCadenceKey: "hr:auto:evalcadence",// { role: daysBetween } — editable by Hannah/Matt
  leaderMapKey: "hr:auto:leaders",      // ⚠ WIRE: { personId: leaderId } — person → their leader
  evalRadarKey: "hr:auto:evalradar",    // idempotency guard for the Monday push
  defaultEvalDays: 180,

  writeupRemindedKey: "hr:auto:writeup:reminded", // dedupe ledger so a reminder sends once
  writeupLeadDays: 3,                   // remind this many days before the follow-up is due
  writeupScanLimit: 500,                // recent teamdocs submissions to scan
  defaultReviewDays: null,              // fallback window for legacy write-ups; null = skip them

  hannahSlackId: "",                    // ⚠ WIRE: Hannah's Slack user ID for the digest DM
  digestChannel: "",                    // fallback if hannahSlackId blank, e.g. "#hr-ops"
  milestoneChannel: "",                 // set to enable birthdays/anniversaries; blank = OFF

  handbookDroppedField: "droppedAt",    // field on handbook.version holding the ISO drop date
  firstNudgeHrs: 48,
  secondNudgeHrs: 96,
};

async function getConfig() {
  const override = (await safe(() => kvGet(DEFAULTS.configKey))) || {};
  return { ...DEFAULTS, ...override };
}

/* =========================================================================
 * ENTRY POINT
 * ======================================================================= */
export async function runHrAutomations(env, now = new Date()) {
  const cfg = await getConfig();
  const results = [];

  // --- daily ---
  results.push(await guard("signatureChaser", () => runSignatureChaser(env, cfg, now)));
  results.push(await guard("writeupWindows", () => runWriteupWindows(env, cfg, now)));
  results.push(await guard("milestones", () => runMilestones(env, cfg, now)));

  // --- Mondays ---
  if (now.getDay() === 1) {
    results.push(await guard("evalRadar", () => runEvalRadar(env, cfg, now)));
    results.push(await guard("complianceCheck", () => runComplianceCheck(env, cfg, now)));
  }

  await appendRunLog(cfg, now, results);
  return { ran: now.toISOString(), results };
}

/* =========================================================================
 * PHASE 1 — SIGNATURE CHASER  (LIVE)
 * Daily. Reads handbook acks + roster. Nudges the person first; Hannah only
 * hears about someone who has already missed twice. Never double-sends/day.
 * ======================================================================= */
async function runSignatureChaser(env, cfg, now) {
  const handbook = (await kvGet(cfg.handbookKey)) || {};
  const version = handbook.version || {};
  const currentN = version.n;
  if (currentN === undefined || currentN === null) {
    return { phase: "signatureChaser", skipped: "no handbook.version.n set" };
  }
  const droppedAt = version[cfg.handbookDroppedField]; // may be undefined
  const acks = handbook.acks || {};

  const roster = (await kvGet(cfg.rosterKey)) || [];
  const statusMap = (await kvGet(cfg.statusKey)) || {};
  const slackMap = (await kvGet(cfg.slackIdMapKey)) || {};
  const chaser = (await kvGet(cfg.chaserKey)) || {};

  const today = dayStr(now);
  const digest = [];       // people who hit the 2nd nudge → Hannah
  const noSlackId = [];    // unsigned people we couldn't DM → Hannah chases manually
  let dmsSent = 0;

  for (const p of roster) {
    const status = String(p.status || statusMap[p.id] || "active").toLowerCase();
    if (status.includes("term")) continue; // skip terminated

    const ack = acks[p.id];
    const signed = ack && Number(ack.version) >= Number(currentN);
    if (signed) {
      if (chaser[p.id]) delete chaser[p.id]; // signed → clear chase state
      continue;
    }

    const rec = chaser[p.id] || { nudges: 0, lastNudged: null, firstNudgedAt: null };
    if (rec.lastNudged === today) continue; // already touched today

    const hrsUnsigned = droppedAt ? hoursSince(droppedAt, now) : null;
    const past48 = hrsUnsigned === null ? true : hrsUnsigned >= cfg.firstNudgeHrs;
    const past96 = hrsUnsigned !== null && hrsUnsigned >= cfg.secondNudgeHrs;

    const slackId = slackMap[p.id];

    if (past96 && rec.nudges >= 1) {
      // second miss → escalate to person + Hannah
      if (slackId) { await slackDM(env, cfg, slackId, secondNudgeMsg(p, currentN)); dmsSent++; }
      else noSlackId.push(p);
      digest.push({ name: p.name, nudges: rec.nudges + 1, hrs: hrsUnsigned ? Math.round(hrsUnsigned) : null });
      bump(rec, today, now);
      chaser[p.id] = rec;
    } else if (past48) {
      if (slackId) { await slackDM(env, cfg, slackId, firstNudgeMsg(p, currentN)); dmsSent++; }
      else noSlackId.push(p);
      bump(rec, today, now);
      chaser[p.id] = rec;
    }
  }

  await kvSet(cfg.chaserKey, chaser);

  if (digest.length || noSlackId.length) {
    await sendDigest(env, cfg, buildDigest(currentN, digest, noSlackId));
  }

  return {
    phase: "signatureChaser",
    version: currentN,
    hasDropDate: !!droppedAt,
    dmsSent,
    escalatedToHannah: digest.length,
    noSlackIdOnFile: noSlackId.length,
  };
}

function bump(rec, today, now) {
  rec.nudges += 1;
  rec.lastNudged = today;
  rec.firstNudgedAt = rec.firstNudgedAt || now.toISOString();
}

function firstNudgeMsg(p, n) {
  return `Hi ${firstName(p.name)} — the team handbook (v${n}) is waiting on your signature in the Hub. `
       + `Quick tap: open the Hub → HR → Handbook. Takes about a minute. Thanks!`;
}
function secondNudgeMsg(p, n) {
  return `Hi ${firstName(p.name)} — following up: handbook v${n} still isn't signed. `
       + `Please knock it out today (Hub → HR → Handbook). Hannah's now been looped in so we can close it out.`;
}

function buildDigest(n, digest, noSlackId) {
  const lines = [`*Handbook v${n} — signature chaser*`];
  if (digest.length) {
    lines.push(`Escalated (2nd nudge, still unsigned):`);
    for (const d of digest) {
      lines.push(`  • ${d.name}${d.hrs != null ? ` — ${d.hrs}h out` : ""}, nudged ${d.nudges}×`);
    }
  }
  if (noSlackId.length) {
    lines.push(`No Slack ID on file — chase manually:`);
    for (const p of noSlackId) lines.push(`  • ${p.name}`);
  }
  return lines.join("\n");
}

/* =========================================================================
 * PHASE 2 — EVAL-DUE RADAR  (STUB · Mondays)
 * Reads gcfcr-hr-team-v1 + hr:auto:evalcadence = { role: daysBetween } (def 180).
 * For each active member: due = lastEval + cadence[role]. If due ≤7d or overdue,
 * GROUP BY responsible leader and Slack each leader their list.
 * Same math App.jsx runs in the director-pulse effect — moved server-side.
 * ======================================================================= */
async function runEvalRadar(env, cfg, now) {
  // idempotency: fires Mondays; guard against same-day re-runs so leaders aren't double-pinged
  const g = (await kvGet(cfg.evalRadarKey)) || {};
  const today = dayStr(now);
  if (g.lastRun === today) return { phase: "evalRadar", skipped: "already ran today" };

  const leaderMap = (await kvGet(cfg.leaderMapKey)) || {};
  const slackMap = (await kvGet(cfg.slackIdMapKey)) || {};
  const status = await loadEvalStatus(cfg, now, leaderMap);

  // flag: overdue, due within 7 days, or no eval on record
  const flagged = status.filter(s => s.daysUntil === null || s.daysUntil <= 7);
  if (!flagged.length) {
    await kvSet(cfg.evalRadarKey, { lastRun: today });
    return { phase: "evalRadar", flagged: 0 };
  }

  // group by the leader responsible for each person
  const groups = {};
  for (const item of flagged) {
    const key = item.leaderId || "__unassigned__";
    (groups[key] ||= []).push(item);
  }

  let leadersNotified = 0;
  const orphans = []; // unassigned, or leader with no Slack ID → routed to Hannah
  for (const [leaderId, items] of Object.entries(groups)) {
    if (leaderId === "__unassigned__") { orphans.push(...items); continue; }
    const sid = slackMap[leaderId];
    if (sid) { await slackDM(env, cfg, sid, buildEvalMsg(items)); leadersNotified++; }
    else orphans.push(...items);
  }

  if (orphans.length) {
    await sendDigest(env, cfg, `*Evals due — no leader routing on file:*\n${buildEvalMsg(orphans)}`);
  }

  await kvSet(cfg.evalRadarKey, { lastRun: today });
  return {
    phase: "evalRadar",
    flagged: flagged.length,
    overdue: flagged.filter(s => s.daysUntil !== null && s.daysUntil < 0).length,
    leadersNotified,
    routedToHannah: orphans.length,
  };
}

// Shared eval computation — mirrors the App.jsx director-pulse math, server-side.
// Used by the Monday push and by getEvalStatus() below (on-demand scorecard read).
async function loadEvalStatus(cfg, now, leaderMap = null) {
  const roster = (await kvGet(cfg.rosterKey)) || [];
  const cadence = (await kvGet(cfg.evalCadenceKey)) || {};
  if (!leaderMap) leaderMap = (await kvGet(cfg.leaderMapKey)) || {};
  const out = [];
  for (const p of roster) {
    const st = String(p.status || "active").toLowerCase();
    if (st.includes("term")) continue;
    const days = Number(cadence[p.role]) || cfg.defaultEvalDays;
    let dueMs = null, basis = "none";
    if (p.lastEval) { basis = "lastEval"; dueMs = new Date(p.lastEval).getTime() + days * 864e5; }
    else if (p.start) { basis = "start"; dueMs = new Date(p.start).getTime() + days * 864e5; }
    const daysUntil = dueMs === null ? null : Math.floor((dueMs - now.getTime()) / 864e5);
    out.push({
      id: p.id, name: p.name, role: p.role, lastEval: p.lastEval || null,
      dueStr: dueMs === null ? null : new Date(dueMs).toISOString().slice(0, 10),
      daysUntil, basis,
      leaderId: p.leader || p.leaderId || p.manager || leaderMap[p.id] || null,
    });
  }
  return out;
}

// On-demand snapshot for the EOS scorecard row.
// NOTE: this reports who is CURRENTLY current/overdue. If App.jsx's
// "evals completed on time" uses a completion-history rate instead, mirror
// that exact formula here so the scorecard number matches.
export async function getEvalStatus(env, now = new Date()) {
  const cfg = await getConfig();
  const rows = await loadEvalStatus(cfg, now);
  const active = rows.length;
  const overdue = rows.filter(r => r.daysUntil !== null && r.daysUntil < 0).length;
  const dueSoon = rows.filter(r => r.daysUntil !== null && r.daysUntil >= 0 && r.daysUntil <= 7).length;
  const noRecord = rows.filter(r => r.basis === "none").length;
  const current = active - overdue - noRecord;
  return {
    active, current, overdue, dueSoon, noRecord,
    pctCurrent: active ? Math.round((current / active) * 100) : null,
    rows,
  };
}

function buildEvalMsg(items) {
  const sorted = [...items].sort((a, b) => {
    const av = a.daysUntil === null ? -9999 : a.daysUntil;
    const bv = b.daysUntil === null ? -9999 : b.daysUntil;
    return av - bv; // overdue first, then soonest
  });
  const lines = ["*Evals due / overdue for your team:*"];
  for (const s of sorted) {
    let tail;
    if (s.basis === "none") tail = "no eval on record";
    else if (s.daysUntil < 0) tail = `overdue ${-s.daysUntil}d (was due ${s.dueStr})`;
    else tail = `due in ${s.daysUntil}d (${s.dueStr})`;
    lines.push(`  • ${s.name}${s.role ? ` (${s.role})` : ""} — ${tail}`);
  }
  return lines.join("\n");
}

/* =========================================================================
 * PHASE 3 — WRITE-UP FOLLOW-UP WINDOWS  (LIVE · daily)
 * Reads listSubmissions("teamdocs") filtered to write-ups. Each carries a
 * reviewDays window (30/60/90 — add the field to the TeamDocs form). At
 * issuedAt + reviewDays − leadDays → DM issuing leader + Hannah once.
 * Timing is derived from the submission timestamp; the only new key is a
 * small dedupe ledger so the same reminder doesn't send every day.
 * ======================================================================= */
async function runWriteupWindows(env, cfg, now) {
  const subs = (await listSubmissions("teamdocs", cfg.writeupScanLimit)) || [];
  const slackMap = (await kvGet(cfg.slackIdMapKey)) || {};
  const reminded = (await kvGet(cfg.writeupRemindedKey)) || {}; // { subId: "YYYY-MM-DD" }

  const today = dayStr(now);
  let missingReviewDays = 0;
  let leadersNotified = 0;
  const hannahLines = [];
  const noLeader = [];

  for (const s of subs) {
    if (!isWriteup(s)) continue;
    const p = s.payload || {};
    const reviewDays = Number(p.reviewDays) || cfg.defaultReviewDays;
    if (!reviewDays) { missingReviewDays++; continue; }

    const issuedIso = p.issuedAt || s.created_at || s.createdAt || s.at || s.ts;
    if (!issuedIso) continue;
    const dueMs = new Date(issuedIso).getTime() + reviewDays * 864e5;
    const daysUntilDue = Math.floor((dueMs - now.getTime()) / 864e5);

    // remind inside the window [0, leadDays]; skip once the follow-up is past due
    if (daysUntilDue < 0 || daysUntilDue > cfg.writeupLeadDays) continue;

    const subject = subjectOf(p);
    const subId = s.id || `${s.by || "?"}|${subject}|${issuedIso}`;
    if (reminded[subId]) continue; // already reminded for this write-up

    const dueStr = new Date(dueMs).toISOString().slice(0, 10);
    const msg = `Follow-up conversation due for *${subject}* by ${dueStr}. `
              + `(Write-up issued ${String(issuedIso).slice(0, 10)}, ${reviewDays}-day window.)`;

    const leaderKey = p.leaderId || p.issuedBy || s.by;
    const sid = leaderKey ? slackMap[leaderKey] : null;
    if (sid) { await slackDM(env, cfg, sid, msg); leadersNotified++; }
    else noLeader.push(subject);

    hannahLines.push(`  • ${subject} — due ${dueStr}${sid ? "" : " (no leader Slack ID)"}`);
    reminded[subId] = today;
  }

  if (hannahLines.length) {
    await sendDigest(env, cfg, `*Write-up follow-ups coming due:*\n${hannahLines.join("\n")}`);
  }
  await kvSet(cfg.writeupRemindedKey, pruneReminded(reminded, now));

  return {
    phase: "writeupWindows",
    reminders: hannahLines.length,
    leadersNotified,
    noLeaderSlackId: noLeader.length,
    missingReviewDays,
  };
}

// TeamDocs holds both write-ups and evals; separate them.
function isWriteup(s) {
  const p = s.payload || {};
  const t = String(p.type || p.kind || p.docType || p.category || "").toLowerCase();
  if (t.includes("writeup") || t.includes("write-up") || t.includes("corrective") || t.includes("discipline")) return true;
  if (t.includes("eval") || t.includes("review")) return false;
  return p.reviewDays != null; // a review window present ⇒ treat as a write-up
}

function subjectOf(p) {
  return p.subjectName || p.subject || p.employee || p.name || p.person || p.teamMember || "team member";
}

// Keep the dedupe ledger from growing forever — drop entries past any possible window.
function pruneReminded(reminded, now) {
  const cutoff = now.getTime() - 120 * 864e5;
  const out = {};
  for (const [k, dateStr] of Object.entries(reminded)) {
    if (new Date(dateStr).getTime() >= cutoff) out[k] = dateStr;
  }
  return out;
}

/* =========================================================================
 * PHASE 5 — COMPLIANCE EXPIRATIONS  (STUB · Mondays)
 * THE DATA GAP: cert (food handler) + minor work-permit dates aren't in the
 * roster yet. Add fields to schema, then one-time backfill (~106 dates, Hannah).
 * Code is trivial: 30-day-out Slack warning, 7-day-out escalation.
 * ======================================================================= */
async function runComplianceCheck(env, cfg, now) {
  // const roster = (await kvGet(cfg.rosterKey)) || [];
  // for each active member, for each date field (foodHandlerExp, workPermitExp):
  //   d = daysUntil(exp); if d === 30 warn; if d === 7 escalate to Hannah
  return { phase: "complianceCheck", status: "stub — needs schema fields + backfill" };
}

/* =========================================================================
 * BONUS — MILESTONES  (LIVE but OFF until cfg.milestoneChannel is set)
 * Work anniversaries from roster.start; birthdays if a dob field exists.
 * ======================================================================= */
async function runMilestones(env, cfg, now) {
  if (!cfg.milestoneChannel) return { phase: "milestones", status: "disabled (no channel)" };
  const roster = (await kvGet(cfg.rosterKey)) || [];
  const md = monthDay(now);
  const annivs = [];
  const bdays = [];
  for (const p of roster) {
    const status = String(p.status || "active").toLowerCase();
    if (status.includes("term")) continue;
    if (p.start && monthDay(new Date(p.start)) === md) {
      annivs.push(`${p.name} — ${now.getFullYear() - new Date(p.start).getFullYear()} yr`);
    }
    if (p.dob && monthDay(new Date(p.dob)) === md) bdays.push(p.name);
  }
  if (!annivs.length && !bdays.length) return { phase: "milestones", none: true };
  const lines = [];
  if (bdays.length) lines.push(`🎂 Birthdays today: ${bdays.join(", ")}`);
  if (annivs.length) lines.push(`🎉 Work anniversaries: ${annivs.join(", ")}`);
  await slackPost(env, cfg, cfg.milestoneChannel, lines.join("\n"));
  return { phase: "milestones", birthdays: bdays.length, anniversaries: annivs.length };
}

/* =========================================================================
 * PHASE 4 — ONBOARDING TRIGGER  (EVENT HOOK — call from HRConsole new-hire save)
 * Writes hr:auto:onboarding:{personId} = checklist (Hannah defines the items).
 * Phase 1 chaser already handles unsigned items. When all complete, one Slack
 * notice to Hannah. Call markOnboardingItem() as items land; it fires the notice.
 * ======================================================================= */
export async function onNewHire(env, personId, packetItems /* string[] */) {
  const cfg = await getConfig();
  const checklist = {};
  for (const item of (packetItems || [])) checklist[item] = false;
  await kvSet(`hr:auto:onboarding:${personId}`, { createdAt: new Date().toISOString(), items: checklist });
  return { ok: true, personId, items: Object.keys(checklist).length };
}

export async function markOnboardingItem(env, personId, item) {
  const cfg = await getConfig();
  const key = `hr:auto:onboarding:${personId}`;
  const packet = (await kvGet(key)) || { items: {} };
  if (item in packet.items) packet.items[item] = true;
  await kvSet(key, packet);
  const done = Object.values(packet.items).every(Boolean);
  if (done && !packet.notified) {
    packet.notified = true;
    await kvSet(key, packet);
    const roster = (await kvGet(cfg.rosterKey)) || [];
    const name = roster.find(r => r.id === personId)?.name || personId;
    await sendDigest(env, cfg, `✅ Onboarding packet complete for ${name}.`);
  }
  return { ok: true, done };
}

/* =========================================================================
 * PHASE 6 — TURNOVER SCORECARD  (STUB · on-demand from scorecard read)
 * Rolling 90-day turnover: live roster count + TermArchive (528 records).
 * Computed on the fly; feeds the EOS scorecard row that's hand-entered today.
 * ======================================================================= */
export async function getTurnover(env, now = new Date()) {
  // const roster = (await kvGet("gcfcr-hr-team-v1")) || [];
  // const terms  = (await kvGet("gcfcr-hr-termarchive")) || []; // confirm the real key
  // const cutoff = now - 90d; recentTerms = terms.filter(t => new Date(t.date) >= cutoff)
  // return recentTerms.length / avgHeadcount over window
  return { phase: "turnover", status: "stub" };
}

/* =========================================================================
 * SLACK  — swap slackPost/slackDM for your existing Worker Slack helper if
 * you have one. Bot needs chat:write (+ im:write to DM a user ID).
 * ======================================================================= */
async function slackPost(env, cfg, channel, text) {
  if (!channel) return { ok: false, skipped: "no channel" };
  const token = env.SLACK_BOT_TOKEN;
  const r = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ channel, text }),
  });
  return safe(() => r.json());
}
// chat.postMessage accepts a user ID in the channel field → DM.
const slackDM = (env, cfg, userId, text) => slackPost(env, cfg, userId, text);

async function sendDigest(env, cfg, text) {
  const target = cfg.hannahSlackId || cfg.digestChannel;
  if (!target) return { ok: false, skipped: "no hannahSlackId/digestChannel set" };
  return slackPost(env, cfg, target, text);
}

/* =========================================================================
 * UTIL
 * ======================================================================= */
function dayStr(d) { return d.toISOString().slice(0, 10); }                 // YYYY-MM-DD
function monthDay(d) { return d.toISOString().slice(5, 10); }               // MM-DD
function hoursSince(iso, now) { return (now - new Date(iso)) / 3.6e6; }
function firstName(name) { return String(name || "").trim().split(/\s+/)[0] || "there"; }

async function appendRunLog(cfg, now, results) {
  const log = (await safe(() => kvGet(cfg.logKey))) || [];
  log.unshift({ at: now.toISOString(), results });
  await safe(() => kvSet(cfg.logKey, log.slice(0, 60))); // keep last 60 runs
}

async function guard(name, fn) {
  try { return await fn(); }
  catch (e) { return { phase: name, error: String(e && e.message || e) }; }
}
async function safe(fn) { try { return await fn(); } catch { return null; } }
