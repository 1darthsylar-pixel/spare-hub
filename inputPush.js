/* inputPush.js — DELIVER THE REGISTER TO PHONES
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Matt, Jul 26 2026: "I want the app to be smart and send push alerts to
 * anyone who is responsible phones."
 *
 * The register already knows WHO owns WHAT and WHICH rows are late. Web push
 * already knows HOW to reach a phone. This is the wire between them — a
 * delivery channel, NOT a second scheduler and NOT a second registry.
 *
 * ⚠️ IMPORTS: inputRegistry.js + boardOwner.js + nameMatch.js. All leaves, no
 * React, no store.js, no `import.meta.env`. worker.js can import this safely.
 * NEVER let store.js in — its top-level import.meta.env throws in the Worker
 * runtime and takes every scheduled job down with it.
 *
 * ── THE THREE RULES THAT KEEP PEOPLE FROM TURNING NOTIFICATIONS OFF ──
 *   1. ONLY THE OWNER. Never a digest of other people's rows. 106 people ×
 *      push is the fastest way to make the whole store disable alerts.
 *   2. ONLY WHEN LATE. `ok`, `info`, `open` and `untracked` never notify. A
 *      standing list that has been open for a quarter is not news.
 *   3. ONLY ONCE. A per-person-per-row-per-day guard, so re-running the job or
 *      hand-triggering it cannot nag the same person twice. Same protection as
 *      the eval and PG reminders, which is why those are the two jobs nobody
 *      complains about.
 */

import { buildRows, readExtras, forPerson } from "./inputRegistry.js";

export const SENT_KEY = "gcfcr-push-sent-v1";
const pad = (n) => String(n).padStart(2, "0");
export const dayKeyOf = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/* ── Who can actually be reached ─────────────────────────────────────────
 * The subscription store IS the audience list, and each record carries the
 * person's own name and tier — so routing needs no HR read and no client
 * change. Records are keyed by endpoint, so one person with a phone and an
 * iPad appears twice and must be collapsed to one push per PERSON.
 *
 * ⚠️ TWO RECORD SHAPES EXIST IN PRODUCTION. The live one nests `subscription`;
 * an older one put `endpoint` and `keys` at the top level. `pushToUid` reads
 * `rec.subscription`, so every old-shape record is skipped — SILENTLY, while
 * the person's own bell still reads "Alerts on" because that is derived from
 * the browser, not the server. Three real people sat in that state undetected.
 * They are counted and RETURNED here so the job reports them instead of
 * quietly reaching fewer people every run.
 */
export function readAudience(subsRecord) {
  const byUid = new Map();
  const unreachable = [];
  const src = subsRecord && typeof subsRecord === "object" ? subsRecord : {};
  Object.values(src).forEach((rec) => {
    if (!rec || typeof rec !== "object") return;
    const uid = rec.uid == null ? "" : String(rec.uid);
    const name = String(rec.name || "").trim();
    if (!uid || !name) return;
    if (!rec.subscription) {                       // legacy shape — cannot be pushed to
      if (!unreachable.some((u) => u.uid === uid)) unreachable.push({ uid, name });
      return;
    }
    const prev = byUid.get(uid);
    if (!prev) byUid.set(uid, { id: uid, name, role: String(rec.role || ""), tier: Number(rec.tier) || 1, devices: 1 });
    else {
      prev.devices += 1;
      if (!prev.role && rec.role) prev.role = String(rec.role);
      if (Number(rec.tier) > prev.tier) prev.tier = Number(rec.tier);
    }
  });
  // Someone with a live device is reachable, even if they also carry a stale
  // record — don't report them as unreachable and send them a fix-it message.
  return { people: [...byUid.values()], unreachable: unreachable.filter((u) => !byUid.has(u.uid)) };
}

/* ── The message ─────────────────────────────────────────────────────────
 * Names the rows rather than counting them. "2 inputs need you" makes someone
 * open the app to find out what; "Cash counts · Cleaning sign-offs" lets them
 * decide on the lock screen whether it can wait. Capped at three so the body
 * stays readable in a notification shade.
 */
export function composeMessage(person, rows) {
  const labels = rows.map((r) => r.label).filter(Boolean);
  const shown = labels.slice(0, 3).join(" · ");
  const more = labels.length > 3 ? ` +${labels.length - 3} more` : "";
  return {
    title: rows.length === 1 ? rows[0].label : `${rows.length} things need you`,
    body: rows.length === 1 ? (rows[0].text || rows[0].label) : `${shown}${more}`,
    url: "/",
  };
}

/* ── The plan ────────────────────────────────────────────────────────────
 * PURE. Given the built rows, the audience and what has already been sent
 * today, decide exactly who gets what. Nothing here touches the network, so
 * every routing decision is testable without a push server.
 */
export function planPush({ rows, people, sent, now = new Date() }) {
  const day = dayKeyOf(now);
  const already = sent && typeof sent === "object" ? sent : {};
  const sends = [];
  const quiet = [];

  (people || []).forEach((person) => {
    const mine = forPerson(rows, person, person.tier).needs;   // `needs` is LATE only, by construction
    const fresh = mine.filter((r) => !already[`${person.id}:${r.id}:${day}`]);
    if (!fresh.length) { quiet.push({ uid: person.id, name: person.name, late: mine.length }); return; }
    sends.push({
      uid: person.id,
      name: person.name,
      rowIds: fresh.map((r) => r.id),
      ...composeMessage(person, fresh),
    });
  });

  return { day, sends, quiet };
}

/* ── The job ─────────────────────────────────────────────────────────────
 * `deps` is injected so this module never imports store.js, never touches
 * `window`, and stays unit-testable with no network at all:
 *   kvGet(key)                 → the worker's sbGet
 *   kvSet(key, value)          → the worker's sbSet
 *   pushToUid(uid, payload)    → the worker's own sender
 *
 * ⚠️ THE OVERSEER IS DELIBERATELY EXCLUDED FROM PUSH. `ownsRow` returns true
 * for the Executive Director on EVERY row so the dashboard panel can show the
 * whole store — correct on a screen he chose to open, wrong as a phone alert.
 * Left in, Matt would be pushed every late row in the building every day and
 * would be the first person to turn notifications off.
 */
export async function runInputPush(env, deps = {}) {
  const { kvGet, kvSet, pushToUid, now = new Date() } = deps;
  if (typeof kvGet !== "function" || typeof pushToUid !== "function") {
    return { ok: false, error: "runInputPush needs kvGet and pushToUid" };
  }

  /* ⚠️ A FAILED sent-guard read must not be mistaken for "nothing sent today":
     the sends would repeat, and the stamp write below would then replace the
     day's real stamps with only this run's — compounding the duplicates. The
     sends still go out (a missed notice is worse than a repeat), but the
     guard is only WRITTEN when it was truly read. Detection needs a reader
     that THROWS on failure: the worker injects sbGetStrict for exactly that
     (a refused read throws; only a genuinely absent key is null), so this
     sentinel now sees every failure instead of only network throws. */
  let sentReadOk = true;
  const [subsRecord, sentRecord, extras] = await Promise.all([
    kvGet("gcfcr-push-subs-v1").catch(() => null),
    kvGet(SENT_KEY).catch(() => { sentReadOk = false; return null; }),
    readExtras({ kvGet, sharedGet: kvGet, now }).catch(() => null),
  ]);

  const { people, unreachable } = readAudience(subsRecord);
  const rows = buildRows({ daily: null, pulse: null, extras, now });

  // Overseer excluded — see the note above. Identified by the role the
  // subscription carries; if role was never stored this is a no-op, which is
  // the safe direction (he gets one push, rather than someone getting none).
  const audience = people.filter((p) => String(p.role || "") !== "Executive Director");

  const { day, sends, quiet } = planPush({ rows, people: audience, sent: sentRecord, now });

  const sentNow = { ...(sentRecord && typeof sentRecord === "object" ? sentRecord : {}) };
  let delivered = 0, failed = 0;
  for (const s of sends) {
    try {
      const res = await pushToUid(env, s.uid, { title: s.title, body: s.body, url: s.url });
      /* Only stamp the guard on a delivery that actually went out. Stamping
         first would let one bad night swallow the notice permanently — the
         person would never be told, and nothing would say so.
         🐛 THAT IS EXACTLY WHAT THE OLD TEST DID. It was `res !== false`, and
         `pushToUid` NEVER returns false — it returns
         {sent, devices, pruned, results}, or {sent:0, skipped:"no devices"}.
         So the condition was always true: every send counted as delivered, the
         once-a-day guard stamped, and `failed` could never leave zero. Somebody
         with no registered device, or whose phone refused every push, was
         recorded as told and never retried, and the job reported a clean run.
         `sent` is the only honest signal — it is the count of devices that
         actually took it. */
      if (res && Number(res.sent) > 0) {
        delivered += 1;
        s.rowIds.forEach((id) => { sentNow[`${s.uid}:${id}:${day}`] = true; });
      } else failed += 1;
    } catch { failed += 1; }
  }

  // Keep only today's stamps — the guard is a per-day gate, not a history, and
  // an unpruned map grows by a row per person per day forever.
  const pruned = {};
  Object.keys(sentNow).forEach((k) => { if (k.endsWith(`:${day}`)) pruned[k] = true; });
  if (sentReadOk && typeof kvSet === "function" && (delivered || Object.keys(pruned).length !== Object.keys(sentNow).length)) {
    await kvSet(SENT_KEY, pruned).catch(() => {});
  }

  return {
    ok: true,
    day,
    reachable: audience.length,
    targeted: sends.length,
    delivered,
    failed,
    quiet: quiet.length,
    rows: rows.length,
    // ★ SURFACED, NOT SWALLOWED. These people believe alerts are on. Reporting
    // the count in the job result is what turns a silent shortfall into
    // something someone can act on.
    unreachable: unreachable.length,
    unreachableNames: unreachable.map((u) => u.name),
  };
}
