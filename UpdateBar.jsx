/* ============================================================================
   UpdateBar.jsx — Gate City Hub

   Tells someone their Hub is running an old build, and lets them fix it with
   one tap.

   🐛 WHY THIS EXISTS. Matt, Aug 3 2026: "I closed my app out, signed out and
   in but it didn't update until I got home." Bri the same day: "some of the
   team is having trouble seeing new updates, even with updating the app using
   the sign out and reload method." Neither was doing anything wrong. Cloudflare
   caches index.html per data centre, so the store's edge served an old copy and
   every device on that wifi was pinned to an old build. Nothing a person can do
   from inside the app changes that, which is exactly why signing out and
   reinstalling appeared to do nothing. It did do nothing.

   Three attempts to fix it at the edge failed (a CDN-only cache directive, a
   full purge, a Cache Rule). So this stops depending on any cache behaving and
   asks the deployment directly: /api/build reads index.html out of ASSETS and
   returns the hashed entry bundle it names. That filename is the build's
   identity — a new build is always a new filename.

   ★ IT NEVER RELOADS BY ITSELF, AND THAT IS THE WHOLE DESIGN. These are shared
   store iPads. A silent reload lands mid-sentence in someone's evaluation note
   or half-way through a cash count and throws the typing away. A bar they tap
   cannot lose anyone's work, and someone mid-task can simply ignore it until
   they are done.

   ★ IT FAILS SILENT. Every path that cannot get a clear answer — request
   failed, ok:false, no bundle in the page, running bundle unreadable — renders
   NOTHING. A false "you are out of date" on a shift is worse than saying
   nothing at all, because the one thing worse than an app that won't update is
   an app that keeps claiming it needs to.
   ============================================================================ */
import React, { useEffect, useState } from "react";

/* Which bundle THIS page actually loaded. Read from the script tag that Vite
   emitted, because that is the same string /api/build reports and it is the
   only copy that cannot disagree with what is running. Module level: pure, and
   nothing can call it during a render it would be unsafe in. */
function runningBuild() {
  try {
    const els = document.querySelectorAll('script[src*="/assets/index-"]');
    for (const el of els) {
      const m = (el.getAttribute("src") || "").match(/(index-[A-Za-z0-9_-]+\.js)/);
      if (m) return m[1];
    }
  } catch { /* no DOM access — fall through to null */ }
  return null;
}

/* Slow on purpose. A new build lands a handful of times a day at most, so
   checking every ten minutes and whenever the app is brought back to the front
   is plenty. The focus check is the one that matters: someone picking the iPad
   back up is exactly when a deploy has usually happened. */
const CHECK_MS = 10 * 60 * 1000;

export default function UpdateBar() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const mine = runningBuild();
    // Cannot tell what we are running, so we can never honestly say it is old.
    if (!mine) return undefined;

    let alive = true;
    const check = async () => {
      if (!alive || document.hidden) return;
      try {
        const r = await fetch("/api/build", { cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json();
        if (!alive || !d || d.ok !== true || typeof d.build !== "string" || !d.build) return;
        /* Only ever turns the bar ON. Once someone has been told their copy is
           old, a flaky answer on the next check must not quietly retract it —
           the build really has moved on and a tap is still the right thing. */
        if (d.build !== mine) setStale(true);
      } catch { /* offline or mid-deploy: say nothing */ }
    };

    check();
    const iv = setInterval(check, CHECK_MS);
    const onShow = () => { if (!document.hidden) check(); };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
    return () => {
      alive = false;
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", onShow);
    };
  }, []);

  if (!stale) return null;

  return (
    <div style={{
      position: "fixed", left: 12, right: 12, bottom: 12, zIndex: 9999,
      background: "#14243D", color: "#fff", borderRadius: 12,
      boxShadow: "0 6px 24px rgba(0,0,0,.28)", padding: "11px 14px",
      display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      <div style={{ flex: "1 1 190px", minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>A newer Hub is ready</div>
        <div style={{ fontSize: 12.5, opacity: 0.8, marginTop: 1 }}>
          You are on an older version. Finish what you are doing first, this can wait.
        </div>
      </div>
      {/* location.reload() rather than a cache-busted navigation: the entry
          bundle is content-hashed, so a plain reload fetches the new filename
          the moment the page itself is fresh. */}
      <button
        onClick={() => { try { window.location.reload(); } catch { /* ignore */ } }}
        style={{ background: "#fff", color: "#14243D", border: "none", borderRadius: 9,
          padding: "9px 15px", fontSize: 13.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>
        Update now
      </button>
      <button
        onClick={() => setStale(false)}
        aria-label="Dismiss"
        style={{ background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,.35)",
          borderRadius: 9, padding: "9px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
        Later
      </button>
    </div>
  );
}
