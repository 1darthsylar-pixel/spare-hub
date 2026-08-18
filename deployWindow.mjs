/* ============================================================================
   deployWindow.mjs — may a change reach this store right now?

   Matt, Aug 17 2026: "when new stores go live i need there updates to happen
   during closed hours only unless its an emergency." Then, on what live means:
   "live means when they start inputting their own numbers."

   ⚠️⚠️ A DEPLOY HERE IS A MERGE. Cloudflare builds on a push to `main` and
   promotes itself about a minute later with no human step in between. So there
   is nothing to schedule at Cloudflare and nothing to hold at the edge — the
   only thing that can be held is the merge. That is what this gates.

   ── THE THREE RULES ───────────────────────────────────────────────────────
   1. NOT LIVE  → merge any time. During setup the host is the only person in
      there and waiting until 1am would be friction for nobody's benefit.
   2. LIVE      → merge only inside the window, Monday to Saturday.
   3. EMERGENCY → merge now, whatever the hour. One label, so nobody has to
      remember a procedure at 1pm on a Friday.

   ⚠️ A MISSING OR UNREADABLE CONFIG COUNTS AS LIVE. Getting it wrong in that
   direction costs a slow deploy. The other direction costs a disrupted store
   mid-rush, and the store cannot tell it was a mistake rather than a bug.

   ⚠️ SUNDAY IS OUT EVEN THOUGH THE STORE IS SHUT. It is the obvious day to
   deploy and the worst one: nobody is around to notice a bad change until the
   Monday open, which is the busiest moment of the week to be discovering it.

   ⚠️ 3:00–3:15 IS SKIPPED. `retention-purge` runs at 3:10 and it is the only
   job that deletes anything. A deploy mid-run kills it, and a delete job that
   dies halfway is the one job you least want interrupted.

   ★ THE LOGIC LIVES HERE, NOT IN THE WORKFLOW YAML. A rule buried in a shell
   step cannot be run, so it cannot be tested — and this one decides whether a
   change reaches real people during a lunch rush. deployWindow.test.mjs runs it.
   ============================================================================ */

/* Everything a store might reasonably differ on. Read from
   .github/deploy-window.json so it is a file somebody edits, never a constant
   buried in a workflow (design rule 18). */
export const DEFAULT_CONFIG = {
  live: false,
  timezone: "America/New_York",
  start: "01:00",
  end: "04:00",
  days: [1, 2, 3, 4, 5, 6],   // Mon–Sat. 0 is Sunday and is deliberately absent.
  skip: [["03:00", "03:15"]], // retention-purge runs at 3:10
  emergencyLabel: "emergency",
  readyLabel: "ready",
};

const toMinutes = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (!(h >= 0 && h <= 23 && mi >= 0 && mi <= 59)) return null;
  return h * 60 + mi;
};

/* The store's own wall clock, whatever the runner is set to.
   ⚠️ GITHUB ACTIONS RUNS IN UTC. A window written as 01:00 and compared against
   a UTC clock lands at 9pm ET in summer — right in the middle of dinner, which
   is the exact hour this exists to protect. */
export function localParts(now, timezone) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, hour12: false,
    weekday: "short", hour: "2-digit", minute: "2-digit",
  });
  const parts = {};
  for (const p of fmt.formatToParts(now)) parts[p.type] = p.value;
  const dayIx = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    day: dayIx[parts.weekday],
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    label: `${parts.weekday} ${parts.hour}:${parts.minute}`,
  };
}

export function readConfig(raw) {
  /* ⚠️ ANY DOUBT AT ALL RESOLVES TO LIVE. A typo in this file must not quietly
     switch the protection off — that failure is invisible until somebody
     notices a deploy landed at noon. */
  if (raw == null) return { ...DEFAULT_CONFIG, live: true, why: "no config file, so the store is treated as live" };
  let cfg = raw;
  if (typeof raw === "string") {
    try { cfg = JSON.parse(raw); }
    catch { return { ...DEFAULT_CONFIG, live: true, why: "the config file could not be read, so the store is treated as live" }; }
  }
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) {
    return { ...DEFAULT_CONFIG, live: true, why: "the config file is not an object, so the store is treated as live" };
  }
  return {
    ...DEFAULT_CONFIG, ...cfg,
    live: cfg.live === false ? false : true,
  };
}

/* ⇒ { allowed, reason, live, at } — never throws, always explains itself,
   because the reason is what a person reads on a blocked pull request. */
export function windowState({ now = new Date(), config, labels = [] } = {}) {
  const cfg = readConfig(config);
  const has = (name) => (labels || []).some((l) => String(l).trim().toLowerCase() === String(name).toLowerCase());

  if (!cfg.live) {
    return { allowed: true, live: false, reason: "This store is not live yet, so changes can land any time.", at: null };
  }
  if (has(cfg.emergencyLabel)) {
    /* ⚠️ THE OVERRIDE IS DELIBERATELY ONE LABEL AND NOTHING ELSE. A process
       with steps is a process nobody follows at 1pm on a Friday, and the whole
       point of an emergency door is that it opens under pressure. */
    return { allowed: true, live: true, reason: `Labelled "${cfg.emergencyLabel}", so it goes now.`, at: null };
  }

  let at;
  try { at = localParts(now, cfg.timezone); }
  catch { return { allowed: false, live: true, reason: "The store's timezone could not be read, so nothing was merged.", at: null }; }

  const startM = toMinutes(cfg.start), endM = toMinutes(cfg.end);
  if (startM == null || endM == null) {
    return { allowed: false, live: true, reason: "The deploy window is not a readable time, so nothing was merged.", at: at.label };
  }

  const days = Array.isArray(cfg.days) ? cfg.days : DEFAULT_CONFIG.days;
  if (!days.includes(at.day)) {
    return { allowed: false, live: true, reason: `${at.label} is not a deploy day. The window is ${cfg.start} to ${cfg.end}, Monday to Saturday.`, at: at.label };
  }

  /* ⚠️ A WINDOW THAT CROSSES MIDNIGHT IS HANDLED, because a store that closes
     at 11pm may well want 23:30 to 02:00 and writing that as start > end is the
     natural thing to type. */
  const inWindow = startM <= endM
    ? (at.minutes >= startM && at.minutes < endM)
    : (at.minutes >= startM || at.minutes < endM);
  if (!inWindow) {
    return { allowed: false, live: true, reason: `The store is open. The window is ${cfg.start} to ${cfg.end} ET, Monday to Saturday. Add the "${cfg.emergencyLabel}" label if this cannot wait.`, at: at.label };
  }

  for (const pair of (Array.isArray(cfg.skip) ? cfg.skip : [])) {
    const a = toMinutes(pair && pair[0]), b = toMinutes(pair && pair[1]);
    if (a == null || b == null) continue;
    if (at.minutes >= a && at.minutes < b) {
      return { allowed: false, live: true, reason: `${pair[0]}–${pair[1]} is held back because a scheduled job runs then. Try the next run.`, at: at.label };
    }
  }

  return { allowed: true, live: true, reason: `Inside the deploy window (${cfg.start}–${cfg.end}).`, at: at.label };
}
