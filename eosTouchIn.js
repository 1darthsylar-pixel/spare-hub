/**
 * eosTouchIn.js — Gate City Hub · Monday L10 touch-in
 * ---------------------------------------------------------------------------
 * Every Monday, DMs each director their OWN still-open readiness items before
 * the L10 — a private nudge, not a public list of who's behind. Reads
 * eos:readiness:v1 (the same KV the EOSTile checklist writes) and the meeting
 * header/agenda from l10Schedule.js.
 *
 * Wiring in worker.js /api/run-job:
 *   else if (job === "eos")
 *     await runEosTouchIn(env, (k)=>sbGet(env,k), (k,v)=>sbSet(env,k,v),
 *                         new Date(), url.searchParams.get("force") === "1");
 *
 * `force=1` is a MANUAL-TEST override only: it bypasses both the Monday gate
 * and the per-day dedup guard so you can retest the same day. NEVER put
 * &force=1 in the cron URL — the cron must respect the Monday gate + guard.
 *
 * v4 (Jul 20 2026): DELIVERY CHANGED from one channel post (#operational-
 *   success, @-mentioning everyone) to per-owner DMs. Each director gets only
 *   their own open items; if everyone's green, Matt (facilitator) gets a
 *   single "all ready" DM. A DM is just chat.postMessage with the user's
 *   Slack ID as the channel — reuses slackPost, no new Slack call.
 *   ⚠️ SCOPE: DMing a user may need `im:write` on the bot (it currently has
 *   channels:read/chat:write/groups:read/users:read). Many workspaces let a
 *   bot DM with chat:write alone (Slack auto-opens the IM from a user ID); if
 *   a DM comes back channel_not_found / not_allowed, add im:write — but that
 *   forces a Slack reinstall that kicks the bot from the private channels
 *   (re-invite each). Test first before assuming the scope is needed.
 *
 * v3 (Jul 20): KV goes through the worker's door (sbGet/sbSet injected as
 *   get/set), not store.js — store.js's import.meta.env doesn't exist in the
 *   Worker runtime. No store.js import here.
 *
 * v2: meeting header/agenda derived from l10Schedule.js, not a frozen const.
 * ---------------------------------------------------------------------------
 */

import { nextL10, AGENDA_LINE } from "./l10Schedule.js";
import { EOS_TOUCHIN_ITEMS as ITEMS, EOS_OWNER_ORDER as OWNER_ORDER } from "./workerSeed.js";

const CFG = {
  readinessKey: "eos:readiness:v1",
  guardKey: "eos:touchin:lastrun",
  // Real Slack IDs — pulled from the workspace 7/16. Keys MUST match the `who`
  // values in ITEMS below exactly, and the DM goes to these user IDs.
  // ⚠️ Same bug class as Tyler hardcoded in WasteTracker: if one of these
  // people leaves, this file does NOT know. Check here when anyone departs.
  /* ★ KYLEEKA REMOVED Aug 4 2026. Matt: "kyleekas last day is 8/29 but she
     will be out alot so lets remove her from the eos". Her ID was
     U0ALYBFGP4K and her four items are gone from ITEMS below.
     ⚠️ THIS IS THE ONE WITH A LIVE CONSEQUENCE. The warning directly above
     turned out to be exactly right: nothing in HR reaches this file, so she
     would have kept getting a Monday DM asking for scorecard rows and Rock
     status for weeks after she stopped owning either. Removing her here is
     what actually stops it. */
  /* ✅ THE FROZEN ID MAP IS GONE (Aug 7 2026 sweep, finding 8). It held Hannah,
     Bri and Matt as literal Slack ids, and the warning directly above called it
     exactly right — nothing in HR reaches this file, so Kyleeka had to be
     deleted by hand or she would have kept getting a Monday DM for weeks after
     she stopped owning anything.

     Ids now come from `resolveSlackId`, injected by the worker, which reads the
     store's own Slack directory. Two things follow: a second store DMs its own
     people rather than Gate City's, and a name that no longer resolves is
     skipped rather than DMing whoever inherited that id.

     ⚠️ THE OWNER KEYS ARE FIRST NAMES and that is fine — checked against the
     live directory, `hannah`, `bri` and `matt` each resolve through idByShort to
     the same three ids this map held. */
};

// Mirrors the manual checklist items in EOSTile.jsx (READINESS).
// Excludes the auto item (Company Rocks) and the logged baseline note.

/* 🐛 THESE WERE BARE FIRST NAMES AND THEY DID NOT FAIL CLOSED (Aug 10 2026,
   sweep finding 38). The note above says first-name keys are "fine — checked
   against the live directory", and that is true HERE and only here. slackIdFor
   falls back to idByShort, which holds bare-first-name keys, so at a SECOND
   store "Hannah" resolves to whichever single person there answers to it and
   DMs her "Still open on your plate before we meet: HR scorecard rows +
   targets." That contradicts this file's own claim that an unresolved name is
   skipped, and it is the same wrong-person family closed all week.
   ⚠️ WRITING FULL NAMES WOULD NOT HAVE FIXED IT. I checked slackIdFor: it tries
   the full key, then falls back to first+initial, then to the bare first name.
   "Hannah Jackson" still lands on their Hannah. The format was never the
   problem — the NAME being Gate City's, in code, was.
   ⇒ Resolve by CONFIG KEY instead. The worker injects notifyTarget, the same
   door twelve other call sites already use, so each store names its own people
   once and every job follows. `who` stays as the label these ITEMS are grouped
   by; only the routing changed. */

function isDone(item, state) {
  const e = state[item.id];
  if (item.type === "input") return !!(e && e.value && String(e.value).trim());
  return !!(e && e.done);
}

// `get`/`set` are the worker's KV door: get=(k)=>sbGet(env,k), set=(k,v)=>sbSet(env,k,v).
export async function runEosTouchIn(env, get, set, now = new Date(), force = false, resolveSlackId = null) {
  if (!force && now.getDay() !== 1) return { skipped: "not Monday" };

  const today = now.toISOString().slice(0, 10);
  if (!force) {
    const guard = (await get(CFG.guardKey)) || {};
    if (guard.lastRun === today) return { skipped: "already ran today" };
  }

  const state = (await get(CFG.readinessKey)) || {};
  const red = ITEMS.filter((it) => !isDone(it, state));
  const meeting = nextL10(now);
  const header = `*L10 touch-in — ${meeting.label}*`;

  const sent = [];
  for (const { who, key } of OWNER_ORDER) {
    const mine = red.filter((r) => r.who === who);
    if (!mine.length) continue;                    // green owners get no DM
    /* No resolver, or a config key this store has not named, means NO DM —
       never a fallback to a name typed in here. */
    const id = resolveSlackId ? await resolveSlackId(key) : null;
    if (!id) { sent.push({ who, skipped: "no slack id" }); continue; }
    const lines = [header, "Still open on your plate before we meet:"];
    for (const r of mine) lines.push(`  • ${r.label}`);
    lines.push(`_Agenda:_ ${AGENDA_LINE}`);
    await slackPost(env, id, lines.join("\n"));    // DM = post to the user ID
    sent.push({ who, open: mine.length });
  }

  // Everyone green → tell the facilitator so silence isn't ambiguous.
  if (!red.length) {
    const mattId = resolveSlackId ? await resolveSlackId("owner") : null;
    if (mattId) {
      await slackPost(env, mattId, `${header}\nEveryone's green — all readiness items are in. :white_check_mark:`);
      sent.push({ who: "Matt", allGreen: true });
    }
  }

  /* ⚠️ A QUIET RUN DOES NOT BURN THE DAY. This guard is what stops a second
     run, so a "safe" test at 7:00am wrote today's stamp and the real 7:30am
     scheduled run then returned skipped:"already ran today" — the test ate the
     real thing, silently, and the owners got nothing. */
  if (!(env && env.__QUIET)) await set(CFG.guardKey, { lastRun: today });
  return { dmSent: sent, owners: sent.length, allGreen: !red.length, meeting: meeting.label };
}

async function slackPost(env, channel, text) {
  if (!channel) return { ok: false, skipped: "no channel" };
  /* ⚠️ `&quiet=1` MUST ACTUALLY BE QUIET. CLAUDE.md tells everyone to add it to
     any manual /api/run-job test precisely so a test does not reach real
     people — and this job ignored it and DM'd every EOS owner for real. The
     documented safe way to test was the unsafe way. */
  if (env && env.__QUIET) return { ok: true, quiet: true, channel, text };
  const r = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` },
    body: JSON.stringify({ channel, text }),
  });
  try { return await r.json(); } catch (e) { return { ok: false }; }
}
