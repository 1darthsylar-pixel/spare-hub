import React, { useState } from "react";

// The live standalone onboarding page (served from public/). New hires open this — no login.
/* 🐛 THE `?v=2` DID NOTHING, AND THE COMMENT THAT USED TO SIT HERE TOLD YOU TO
   KEEP BUMPING IT. Measured Jul 31 2026 and written into CLAUDE.md: two
   never-before-seen query strings both came back `cf-cache-status: HIT`, so the
   edge cache key IGNORES the query string on these paths. The bump was a ritual
   that cost an afternoon of misplaced blame when a demo page served stale. The
   real fix already shipped — the worker sends `no-cache` plus a content ETag on
   every HTML response — so nothing here has to be bumped ever again.
   ⚠️ AND `.html` COSTS A REDIRECT. Measured Aug 9 2026: this exact URL answers
   307 to the extension-less path, so every new hire who taps it takes an extra
   hop before the page loads, often on store wifi. The clean path answers 200
   directly and serves a byte-identical page.
   ⇒ Shortest URL that works, no redirect, nothing to maintain. This is also the
   URL a printed QR code should encode: fewer characters is a coarser, more
   forgiving QR to scan. */
/* ⚠️⚠️ BUILT FROM THE ORIGIN THAT SERVED THIS PAGE, NEVER HARDCODED
   (Aug 10 2026, sweep finding 29). This was `https://gatecityhub.com/...`, and
   every write path on the onboarding page is RELATIVE — /api/intake-upload,
   /api/intake-submit, /api/newhire-uniform all follow whatever origin served
   the page. So the page went wherever it was hosted and the LINK did not.
   🐛 WHAT THAT DID TO A SECOND STORE: their Payroll copies this link and texts
   it to a new hire. The hire loads GATE CITY's page. Their ID photo lands in
   Gate City's private hr-files bucket, their row lands in Gate City's
   submissions table carrying the minor flag, their uniform order files into
   Gate City's HR Console, and they are handed Gate City's Slack invite. The
   hire sees the normal "sent to HR" banner. The second store's HR receives
   nothing, and nobody is told.
   ⚠️ NO SERVER GUARD CAN CATCH THIS, and that is deliberate: the intake routes
   are documented in worker.js as "THE ONE DOOR THAT CANNOT REQUIRE A TOKEN",
   because a new hire has no account yet. The origin is the only thing that
   separates one store's uploads from another's.
   ⚠️ DO NOT PUT A DOMAIN BACK IN THIS FILE. Matt, Aug 10: the data goes into
   each store's own. A clone serves its own origin and this now follows it with
   no edit at all. */
const ONBOARDING_PATH = "/gate-city-onboarding";
const onboardingUrl = () =>
  `${typeof window !== "undefined" && window.location ? window.location.origin : ""}${ONBOARDING_PATH}`;

export default function OnboardingLauncher({ user = {}, tier = 1 }) {
  const [copied, setCopied] = useState(false);

  // Access: leadership (tier 3), PLUS Payroll — Cindy handles the hiring
  // paperwork and sends this link herself, so she needs it without being moved
  // up a tier. Mirrors the `allow: ["Payroll"]` entry on the tile in App.jsx;
  // both halves are required, since App.jsx decides whether the tile OPENS and
  // this decides what it shows once open.
  // ⚠️ THE OWNER EXCLUSION IS ENFORCED HERE AND NOWHERE ELSE. The note that
  // used to sit here said App.jsx's ONLY_TOOLS enforced it upstream, so this id
  // check was "belt-and-braces". That is FALSE and was flagged by the Aug 9
  // sweep: App.jsx:199 reads `const ONLY_TOOLS = {}` — an empty object, so it
  // narrows nobody. Delete the id test below and the exclusion is simply gone.
  const allowed = (tier >= 3 || user.role === "Payroll") && String(user.id) !== "37";
  if (!allowed) {
    return (
      <div style={{ padding: "34px 20px", textAlign: "center", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#14243D", marginBottom: 6 }}>Leadership only</div>
        <div style={{ fontSize: 14, color: "#5b6b82" }}>The new-hire onboarding link is managed by leadership.</div>
      </div>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(onboardingUrl());
    } catch (e) {
      // clipboard may be blocked; the URL below can still be long-pressed to copy
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const wrap = { maxWidth: 560, margin: "0 auto", padding: "18px 16px 40px", fontFamily: "system-ui, -apple-system, sans-serif", color: "#14243D" };
  const card = { background: "#fff", border: "1px solid #E7E2D8", borderRadius: 16, padding: 18, boxShadow: "0 2px 10px rgba(20,36,61,.05)" };
  const btn = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, border: "none", borderRadius: 11, fontWeight: 700, fontSize: 15, padding: "13px 18px", cursor: "pointer", width: "100%", fontFamily: "inherit" };

  return (
    <div style={wrap}>
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", color: "#8fa6c6" }}>New-Hire Onboarding</div>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: "4px 0 0" }}>Send the welcome link</h2>
      </div>

      <div style={card}>
        <p style={{ margin: "0 0 14px", fontSize: 14.5, color: "#334155", lineHeight: 1.5 }}>
          Send this to a new hire once their paperwork is done. They'll work through their pre-orientation checklist — ID, uniform order, Slack, HotSchedules — right from their phone. No login needed.
        </p>

        <div style={{ background: "#F8F5EF", border: "1px solid #E7E2D8", borderRadius: 10, padding: "12px 14px", fontSize: 13.5, wordBreak: "break-all", color: "#14243D", marginBottom: 14 }}>
          {onboardingUrl()}
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <button style={{ ...btn, background: "#14243D", color: "#fff" }} onClick={() => window.open(onboardingUrl(), "_blank", "noopener")}>
            Open page
          </button>
          <button style={{ ...btn, background: copied ? "#1E9E57" : "#E51636", color: "#fff" }} onClick={copy}>
            {copied ? "Copied to clipboard ✓" : "Copy link"}
          </button>
        </div>
      </div>

      <p style={{ textAlign: "center", fontSize: 12.5, color: "#9aa3af", marginTop: 14 }}>
        Tip: text or email the link, or show the page in-store for them to open.
      </p>
    </div>
  );
}
