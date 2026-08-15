/* ============================================================================
   ShiftThread.jsx — THE CONVERSATION ATTACHED TO ONE REQUEST

   Matt, Aug 13 2026, part 2: "This is the one that stops 'who said I could have
   Friday off' from ever being a conversation again."

   ⚠️⚠️ IT RENDERS INSIDE A REQUEST AND NOWHERE ELSE. There is no feed, no
   inbox, no list of threads — you reach one through a request you can already
   see, and the Worker has no route that would list them. That shape is the
   whole reason this is defensible rather than a chat app.

   ⚠️ EVERY PERMISSION COMES FROM THE SERVER. This component does not decide
   who may read or post; it asks /api/shift-thread and draws what comes back,
   including the SENTENCE explaining a refusal. A screen that worked out the
   rule for itself would be a second opinion about who is involved in a
   request, and the two would drift the first time one got a fix.

   ⚠️ COLLAPSED UNTIL ASKED FOR. A request list with ten open threads should
   not fire ten fetches on render, and most requests never need a word said
   about them.
   ============================================================================ */

import React, { useState } from "react";
import { hubToken } from "./store.js";
import { isRetracted } from "./shiftThreads.js";

const GRAY = "#6B7480", LINE = "#E3E7EC", INK = "#232A31", RED = "#DD0031";

/* Module level (design rule 7): called from render, never a closure over state. */
function whenText(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function ShiftThread({ requestId, meId }) {
  const [open, setOpen] = useState(false);
  const [posts, setPosts] = useState([]);
  const [canPost, setCanPost] = useState(false);
  const [refusal, setRefusal] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    try {
      const r = await fetch(`/api/shift-thread?requestId=${encodeURIComponent(requestId)}`,
        { headers: { "x-hub-token": hubToken() }, cache: "no-store" });
      const d = await r.json().catch(() => null);
      if (!d || !d.ok) {
        /* ⚠️ A REFUSAL IS SHOWN AS THE SERVER WORDED IT. Inventing a friendlier
           sentence here is how a screen ends up saying "closed" about a thread
           the person was never on, which tells them it exists. */
        setErr(d && d.error ? String(d.error) : "Could not open that just now.");
        setLoaded(true);
        return;
      }
      setPosts(Array.isArray(d.posts) ? d.posts : []);
      setCanPost(!!d.canPost);
      setRefusal(String(d.refusal || ""));
      setErr("");
      setLoaded(true);
    } catch {
      setErr("Could not open that just now.");
      setLoaded(true);
    }
  };

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !loaded) await load();
  };

  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/shift-thread", {
        method: "POST",
        headers: { "x-hub-token": hubToken(), "content-type": "application/json" },
        body: JSON.stringify({ requestId, text }),
      });
      const d = await r.json().catch(() => null);
      if (!d || !d.ok) { setErr(d && d.error ? String(d.error) : "That did not send."); setBusy(false); return; }
      setText(""); setErr("");
      await load();
    } catch { setErr("That did not send."); }
    setBusy(false);
  };

  const retract = async (postId) => {
    if (!window.confirm("Withdraw this message? It stays on the record, marked withdrawn.")) return;
    setBusy(true);
    try {
      await fetch("/api/shift-thread", {
        method: "POST",
        headers: { "x-hub-token": hubToken(), "content-type": "application/json" },
        body: JSON.stringify({ requestId, action: "retract", postId }),
      });
      await load();
    } catch { setErr("That did not save."); }
    setBusy(false);
  };

  return (
    <div className="w-full" style={{ borderTop: `1px solid ${LINE}`, marginTop: 8, paddingTop: 8 }}>
      <button onClick={toggle}
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12.5, fontWeight: 700, color: INK }}>
        {open ? "Hide messages" : "Messages"}{loaded && posts.length ? ` (${posts.length})` : ""}
      </button>

      {open && (
        <div style={{ marginTop: 8 }}>
          {err && <div style={{ fontSize: 12, color: RED, marginBottom: 6 }}>{err}</div>}

          {loaded && !err && posts.length === 0 && (
            <div style={{ fontSize: 12, color: GRAY }}>Nothing said yet.</div>
          )}

          {posts.map((p) => {
            const gone = isRetracted(p);
            const mine = String(p.byId) === String(meId);
            return (
              <div key={p.id} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11.5, color: GRAY }}>
                  {p.byName} · {whenText(p.at)}
                  {gone && <span style={{ color: RED, fontWeight: 700 }}> · withdrawn</span>}
                </div>
                <div style={{ fontSize: 13, color: gone ? GRAY : INK, textDecoration: gone ? "line-through" : "none", whiteSpace: "pre-wrap" }}>
                  {p.text}
                </div>
                {/* Only your own, and the server enforces it too — a leader
                    editing a team member's words out of a record is the thing
                    this feature exists to make impossible. */}
                {mine && !gone && canPost && (
                  <button onClick={() => retract(p.id)} disabled={busy}
                    style={{ background: "none", border: "none", padding: 0, marginTop: 2, cursor: "pointer", fontSize: 11, color: GRAY, textDecoration: "underline" }}>
                    Withdraw
                  </button>
                )}
              </div>
            );
          })}

          {loaded && !err && (canPost ? (
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <input value={text} onChange={(e) => setText(e.target.value)}
                placeholder="Add to this request"
                style={{ flex: "1 1 180px", padding: "8px 10px", fontSize: 13, borderRadius: 8, border: `1px solid ${LINE}`, boxSizing: "border-box" }} />
              <button onClick={send} disabled={busy || !text.trim()}
                style={{ background: "#1B3A5C", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: busy || !text.trim() ? 0.5 : 1 }}>
                {busy ? "…" : "Send"}
              </button>
            </div>
          ) : (
            /* ★ WHY, NOT JUST NO. "That request has been decided, so the thread
               is closed" is a different fact from "not yours", and the server
               is the one that decides which sentence a person is shown. */
            refusal && <div style={{ fontSize: 12, color: GRAY, marginTop: 8, fontStyle: "italic" }}>{refusal}</div>
          ))}
        </div>
      )}
    </div>
  );
}
