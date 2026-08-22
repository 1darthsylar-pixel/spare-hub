/* ============================================================================
   MyPhoto.jsx — Gate City Hub

   Lets a team member put their own face on the board.

   Matt, Aug 3 2026: "slack is priority but add the upload photo option. it
   will encourage the team to use."

   Faces on the board and in HR Console have only ever come from one place:
   Slack profile photos. Measured before building this — 62 of 99 Slack
   accounts carry one, so 37 people show as initials everywhere and had no way
   to change that from inside the Hub. This is that way.

   ★ SLACK STILL WINS ON DISPLAY. That is Matt's call and it is the surprising
   half, so it is said out loud here and in both readers: a Slack photo is the
   picture someone already chose and keeps current, so it stays first. This
   fills the gap for people who have none, and is the thing a person can act on
   without leaving the Hub.

   ★ NOTHING IS WRITTEN FROM HERE. The upload goes through the Worker's own
   upload path, and the map entry is written by /api/my-photo, which resolves
   WHOSE entry it is from the session token. hr:photos:v1 is one shared object;
   a browser doing read-modify-write on it could drop somebody else's face by
   racing another save, and nobody would notice until a board looked wrong.

   ★ IT SAYS WHAT WENT WRONG. Uploads in this app have failed silently before
   — a whole class of prep-work handouts never saved because a bucket had no
   insert policy and the screen said "try a smaller file". Every failure here
   shows the real reason.
   ============================================================================ */
import React, { useEffect, useState } from "react";
/* The shared raised look and accent edge — see cardStyle.js. */
import { CARD_3D, accentEdge, ACCENT_NEUTRAL } from "./cardStyle.js";
import { uploadDoc, kvGet } from "./store.js";

const readToken = () => {
  try { return localStorage.getItem("gcfcr-hub-token") || ""; } catch { return ""; }
};
/* Same normalisation the avatar maps are keyed by, kept literal rather than
   imported so this component pulls in nothing. */
const norm = (s) => String(s || "").toLowerCase().normalize("NFD")
  .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");

const MAX_BYTES = 5 * 1024 * 1024;

export default function MyPhoto({ user }) {
  /* null = not checked yet, exactly as `slack` below. It started at `""`,
     which reads as "no photo of your own", so between the two reads settling
     the card FLASHED onto the dashboard of somebody who already had one and
     then vanished. This file's own note about `slack` says why that is not
     acceptable: it looks broken. */
  const [mine, setMine] = useState(null);      // signed handle for my own upload
  /* null = not checked yet. Until we know, nothing renders — briefly prompting
     someone who already has a Slack photo and then vanishing looks broken. */
  const [slack, setSlack] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const key = norm(user && user.name);

  const load = async () => {
    if (!key) { setMine(""); return; }
    /* ⚠️ EVERY EXIT SETTLES IT, AND IT SETTLES TOWARDS SHOWING THE CARD. An
       unknown answer left here would hide the invitation forever from exactly
       the people it exists for, and nothing on screen would say so. A dropped
       read is not a photo. */
    try {
      const r = await fetch("/api/hub-photos", { headers: { "x-hub-token": readToken() }, cache: "no-store" });
      if (!r.ok) { setMine(""); return; }
      const d = await r.json();
      setMine((d && d.ok && d.byName && d.byName[key]) || "");
    } catch { setMine(""); /* no photo shown, no error shouted */ }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [key]);

  /* Whether Slack already has a face for this person. Read directly, the same
     map the board and HR Console render, so this can never disagree with what
     they actually see. */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const av = await kvGet("hr:slack-avatars:v1");
        if (!alive) return;
        setSlack((av && av.byName && key ? av.byName[key] : "") || "");
      } catch { if (alive) setSlack(""); }
    })();
    return () => { alive = false; };
  }, [key]);

  const pick = async (file) => {
    if (!file) return;
    setMsg("");
    if (!/^image\//.test(file.type || "")) { setMsg("That is not an image."); return; }
    if (file.size > MAX_BYTES) { setMsg("That photo is over 5MB — try one taken at a smaller size."); return; }
    setBusy(true);
    try {
      const safe = String(file.name || "photo").replace(/[^\w.\-]+/g, "_");
      const path = `photos/${key}/${Date.now()}-${safe}`;
      const loc = await uploadDoc("hr-files", path, file);
      const r = await fetch("/api/my-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-hub-token": readToken() },
        body: JSON.stringify({ bucket: loc.bucket, path: loc.path }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d || d.ok !== true) { setMsg((d && d.error) || "Saved the file but could not set it as your photo."); return; }
      setMsg("Saved. It will show on the board next time it loads.");
      await load();
    } catch (e) {
      setMsg((e && e.message) || "That did not upload.");
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/my-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-hub-token": readToken() },
        body: JSON.stringify({ clear: true }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d || d.ok !== true) { setMsg((d && d.error) || "Could not remove it."); return; }
      setMine(""); setMsg("Removed.");
    } catch { setMsg("Could not remove it."); }
    finally { setBusy(false); }
  };

  /* ★ ONLY SHOWN TO PEOPLE WITH NO FACE ANYWHERE. Matt wanted this to
     encourage the team to use the Hub, and a prompt everyone sees every day is
     one nobody reads. The 62 people with a Slack photo already have one on the
     board and, since Slack wins on display, uploading here would change
     nothing for them — so they are not asked. It disappears by itself the
     moment a photo lands. */
  if (!user || !user.name) return null;
  if (slack === null || mine === null) return null;   // neither answer is in yet
  if (slack || mine) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      marginBottom: 18, border: "1px solid #E4E3DD", borderRadius: 12, background: "#fff", padding: "12px 14px" , ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }}>
      {mine ? (
        <img src={mine} alt="" style={{ width: 44, height: 44, borderRadius: 11, objectFit: "cover", flexShrink: 0 }} />
      ) : (
        <div style={{ width: 44, height: 44, borderRadius: 11, background: "#14243D", color: "#fff", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700 }}>
          {String(user.name).split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
        </div>
      )}
      <div style={{ minWidth: 0, flex: "1 1 180px" }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "#232A31" }}>Your photo</div>
        <div style={{ fontSize: 11.5, color: "#6B7480", lineHeight: 1.45 }}>
          Shows next to your name on the setup board. If you have a photo on Slack, that one is used first.
        </div>
        {msg && <div style={{ fontSize: 11.5, color: "#8A1220", marginTop: 3 }}>{msg}</div>}
      </div>
      <label style={{ fontSize: 12.5, fontWeight: 700, color: "#1B3A5C", border: "1px solid #D6DCE4",
        borderRadius: 8, padding: "7px 12px", cursor: busy ? "default" : "pointer", background: "#fff", whiteSpace: "nowrap" }}>
        {busy ? "Uploading…" : mine ? "Change" : "Add a photo"}
        <input type="file" accept="image/*" style={{ display: "none" }} disabled={busy}
          onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; pick(f); }} />
      </label>
      {mine && !busy && (
        <button type="button" onClick={clear}
          style={{ fontSize: 12.5, fontWeight: 700, color: "#6B7480", background: "transparent",
            border: "1px solid #E3E7EC", borderRadius: 8, padding: "7px 11px", cursor: "pointer" }}>
          Remove
        </button>
      )}
    </div>
  );
}
