// notify.js — shared Slack notification helper for the Gate City Hub.
//
// One wrapper around the Worker's /api/slack-notify route (the same route
// WasteTracker already posts to). Every component that pings anyone calls in
// here, so the notification hooks stay one-liners and recipients live in one
// place.
//
// /api/slack-notify contract: POST { channel, text }
//   channel = a channel NAME (e.g. "inventory-management") -> posts to channel
//           = a U-prefixed Slack USER id                   -> opens a DM
//
// These Slack posts are ADDED alongside the existing /api/tool-notify emails,
// not a replacement — the emails (Brandon, Liz, Adriana) keep firing.
//
// Sends are DELIBERATE (called from a submit/confirm action), not
// fire-on-every-render, so people get one clean message, never spam.
//
// The worker requires the signed-in session token on this route (Jul 31 2026)
// — without it, anyone on the internet could post to the store's Slack as the
// Hub bot. store.js owns the token; this stays a leaf apart from that.
import { hubToken } from "./store.js";
import { CHANNELS as STORE_CHANNELS } from "./storeConfig.js";

// ── Channels ─────────────────────────────────────────────────────────
// Waste/Donations/Inventory and Equipment Check Log both land here.
// ★ THE NAMES COME FROM storeConfig.js NOW (Aug 7 2026, clone work). They were
// spelled out here AND nineteen more times in worker.js, so a clone would post
// a second store’s waste report and food safety walk into GATE CITY’S
// channels — worse than not working, because it looks like it worked.
//
// ⚠️ THIS FILE STILL EXPORTS `CHANNELS` WITH THE SAME SHAPE AND KEYS.
// FoodQuality.jsx and FoodCostTracker.jsx import it from here. The point of
// this pass was to remove duplicate LISTS, not to make three tiles chase a
// moved import. Re-exported, not redefined.
export const CHANNELS = {
  inventory: STORE_CHANNELS.inventory,
  // QIV finish summaries (Hannah, Aug 1 2026) land beside the food safety
  // walk posts.
  opsSuccess: STORE_CHANNELS.opsSuccess,
};

// ── Leaders broadcast target — set ONE of these ──────────────────────
// A shared channel is simplest (one post, everyone sees it). Otherwise list
// the leaders' Slack ids and each gets a DM. Left blank, notifyLeaders is a
// safe no-op (returns "unresolved") until you fill one in.
// ★ FROM storeConfig.js NOW. Same channel, one source.
export const LEADERS_CHANNEL = STORE_CHANNELS.brand;  // Cleaning + Food Safety broadcasts
export const LEADERS = [
  // "U........",   // add each leader's Slack id, or use LEADERS_CHANNEL above
];

const POST = async (channel, text) => {
  if (!channel) return "unresolved";
  try {
    const res = await fetch("/api/slack-notify", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hub-token": hubToken() },
      body: JSON.stringify({ channel, text }),
    });
    return res.ok ? "ok" : "fail";
  } catch {
    return "fail";
  }
};

// Turn a Slack user id into a real @-mention for message text. A plain
// "@Name" string does NOT ping anyone — Slack needs <@U...>. Falls back to
// the plain name (no ping) when no id is on file yet, so callers work either way.
export const mention = (id, name) => (id ? `<@${id}>` : (name || ""));

// Post to a channel (or DM a single user id). "ok" | "fail" | "unresolved".
export async function notifyChannel(channel, text) {
  return POST(channel, text);
}

// Post to ONE recipient — a channel name or a single "U..." id.
export async function notify(target, text) {
  return POST(target, text);
}

// DM MANY user ids (e.g. assigned members from a roster). Skips blanks,
// returns { sent, failed, unresolved }.
export async function notifyMany(ids, text) {
  const out = { sent: 0, failed: 0, unresolved: 0 };
  for (const id of ids || []) {
    if (!id) { out.unresolved++; continue; }
    const r = await POST(id, text);
    if (r === "ok") out.sent++; else out.failed++;
  }
  return out;
}

// Broadcast to leaders using the config above — one channel post if
// LEADERS_CHANNEL is set, else a DM to each id in LEADERS.
export async function notifyLeaders(text) {
  if (LEADERS_CHANNEL) return POST(LEADERS_CHANNEL, text);
  return notifyMany(LEADERS, text);
}
