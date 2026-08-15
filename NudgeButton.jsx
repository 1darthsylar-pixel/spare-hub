/* ============================================================================
   NudgeButton.jsx — Gate City Hub

   Sends one person a push saying what they owe, from the Input Register row
   that already names them.

   Matt, Aug 3 2026, on the weekly digest listing three people who set the Hub
   up and never opened it: "Nudge them." There was no way to. The only route
   that could reach a phone needed a key only Matt holds and stamped "Test —"
   on the title, so nothing anybody tapped could ever be a real message.

   ★ IT SAYS WHAT THEY OWE, NOT "YOU HAVE SOMETHING TO DO". The register
   already knows the sentence — "Upload last month's guest scores" — and that
   sentence is the entire value of the notification. A nudge that only says
   "check the Hub" makes the person open it, hunt, and often find nothing they
   can act on, which is how people learn to ignore notifications.

   ★ IT REPORTS WHAT ACTUALLY HAPPENED. The worker answers with how many
   devices it found and how many accepted the push, and those are different
   numbers. Nobody found means the name did not resolve and NOTHING was sent —
   that must never look like a tick. This is the same failure that let a whole
   day of "reports posted" pass while nothing had been delivered.

   ★ ONE PER PERSON PER HALF HOUR, enforced in the Worker, not here. A client
   guard would be per-device, and the case that matters is three different
   leaders on three different iPads all tapping the same row.
   ============================================================================ */
import React, { useState } from "react";

/* Module level: pure, and never read during a render that could be unsafe. */
const readToken = () => {
  try { return localStorage.getItem("gcfcr-hub-token") || ""; } catch { return ""; }
};
/* The push body. Kept to one plain sentence with their name on the front,
   because it lands on a lock screen where nothing else is visible. */
const bodyFor = (name, what) => {
  const first = String(name || "").trim().split(/\s+/)[0] || "Hi";
  return `${first} — ${String(what || "something in the Hub needs you").trim()}`;
};

export default function NudgeButton({ name, what, disabled }) {
  const [state, setState] = useState("idle");   // idle | sending | sent | miss | error | limited
  const [detail, setDetail] = useState("");

  const send = async () => {
    if (state === "sending" || disabled) return;
    setState("sending"); setDetail("");
    try {
      const r = await fetch("/api/nudge", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-hub-token": readToken() },
        body: JSON.stringify({ to: name, text: bodyFor(name, what) }),
      });
      const d = await r.json().catch(() => null);
      if (r.status === 429) { setState("limited"); return; }
      if (!r.ok || !d || d.ok !== true) {
        setState("error");
        setDetail((d && d.error) || `failed (${r.status})`);
        return;
      }
      /* ⚠️ ok:true DOES NOT MEAN DELIVERED. reached is devices found for that
         name; sent is devices the push service accepted. Both are reported
         because they fail differently and the fix differs: nobody found is a
         name problem, found-but-not-sent is a dead subscription. */
      if (!Number(d.reached)) { setState("miss"); setDetail("no device signed in under that name"); return; }
      if (!Number(d.sent)) { setState("miss"); setDetail("their device did not accept it"); return; }
      setState("sent");
      setDetail(Number(d.sent) > 1 ? `${d.sent} devices` : "");
    } catch {
      setState("error"); setDetail("no connection");
    }
  };

  const label =
    state === "sending" ? "Sending…" :
    state === "sent" ? `Nudged${detail ? ` · ${detail}` : ""}` :
    state === "limited" ? "Already nudged" :
    state === "miss" ? "Not reachable" :
    state === "error" ? "Didn't send" : "Nudge";

  const tone =
    state === "sent" ? { color: "#166B4A", border: "#B7E4CD" } :
    state === "limited" ? { color: "#6B7480", border: "#E3E7EC" } :
    (state === "miss" || state === "error") ? { color: "#8A1220", border: "#F2C7C7" } :
    { color: "#1B3A5C", border: "#D6DCE4" };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <button
        type="button"
        onClick={send}
        disabled={disabled || state === "sending" || state === "sent" || state === "limited"}
        title={state === "idle" ? `Send ${name} a notification saying what is outstanding` : detail || label}
        style={{
          background: "#fff", color: tone.color, border: `1px solid ${tone.border}`,
          borderRadius: 7, padding: "3px 9px", fontSize: 11.5, fontWeight: 700,
          cursor: (disabled || state !== "idle") ? "default" : "pointer", whiteSpace: "nowrap",
        }}>
        {label}
      </button>
      {(state === "miss" || state === "error") && detail && (
        <span style={{ fontSize: 11, color: "#8A1220" }}>{detail}</span>
      )}
    </span>
  );
}
