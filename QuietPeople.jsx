/* ============================================================================
   QuietPeople.jsx — Gate City Hub

   Lists the people who have alerts switched on but have not opened a TOOL in
   the last week, each with a nudge button.

   Matt, Aug 3 2026, looking at the weekly digest naming Andrea, Anna and
   Juana: "Nudge them." Those three existed only inside a Slack message. The
   nudge button reaches whoever the Input Register names, and the register is
   about inputs somebody owes — not about somebody who never showed up. So the
   one case that prompted the whole feature was the one case it could not
   touch. This is that screen.

   ★ IT ASKS THE SAME FUNCTION THE DIGEST ASKS. The worker answers from
   `quietPeople`, which the Sunday post also calls. Two definitions of "who
   isn't using it" would drift, and on the day they disagree the person being
   nudged for nothing is the one who pays for it.

   ★ QUIET IS NOT THE SAME AS IDLE, and the wording matters. These people set
   the Hub up and allowed notifications, so they meant to use it. A week of
   silence is usually a broken thing — an install that stopped working, an
   alert that never arrived — far more often than someone ignoring their job.
   The card says so, because a leader reading a list of names will otherwise
   supply their own harsher explanation.

   ★ IT HIDES ITSELF WHEN THERE IS NOTHING TO SAY. No names, a failed request,
   or not enough rank all render nothing at all. A permanently present empty
   panel is a standing accusation waiting for someone to land in it.
   ============================================================================ */
import React, { useEffect, useState } from "react";
/* The shared raised look, accent edge and card face — see cardStyle.js. */
import { CARD_3D, accentEdge, cardSurface } from "./cardStyle.js";
import NudgeButton from "./NudgeButton.jsx";

const readToken = () => {
  try { return localStorage.getItem("gcfcr-hub-token") || ""; } catch { return ""; }
};

export default function QuietPeople({ tier }) {
  const [people, setPeople] = useState(null);   // null = not loaded / not allowed
  const [open, setOpen] = useState(false);
  /* 🐛 THE CARD "DISAPPEARED" AND THERE WERE THREE REAL PEOPLE IN IT (Matt,
     Aug 7 2026: "the nudge view for people has dissapeared"). Checked the data
     before touching the code: 35 people have alerts on, 61 opened the Hub in
     the last 7 days, and three had not — Lupe, Nick and Savannah. So the list
     was never empty.

     Every failure path here returned quietly. `if (!r.ok) return` covers a 401
     from an expired sign-in and a 403 from a rank read, `d.ok !== true` covers
     a Worker error, and the catch swallowed the rest — and all four land on the
     same `return null` as "nobody to show". A card that vanishes when it breaks
     is indistinguishable from a card that has nothing to say, which is why this
     went unreported until someone happened to notice it missing.

     ⚠️ THE SIGNED-OUT CASE IS THE LIKELY ONE and it is NOT an error worth
     shouting about: the Hub's UI does not expire but the token does, so a
     leader can look fully signed in while every authed fetch 401s. That gets
     its own quiet sentence, not an alarm. Anything else says something is
     wrong, because it is. */
  const [failed, setFailed] = useState(null);   // null = fine · "auth" · "error"

  useEffect(() => {
    // The Worker enforces rank for real; this only avoids a request that would
    // be refused.
    if (!(Number(tier) >= 2)) return undefined;
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/quiet-people", { headers: { "x-hub-token": readToken() }, cache: "no-store" });
        if (!alive) return;
        /* 403 is not a failure — it means this person is not allowed to see the
           list, which is a correct answer and should render nothing at all. */
        if (r.status === 403) return;
        if (r.status === 401) { setFailed("auth"); return; }
        if (!r.ok) { setFailed("error"); return; }
        const d = await r.json();
        if (!alive) return;
        if (!d || d.ok !== true || !Array.isArray(d.people)) { setFailed("error"); return; }
        setPeople(d.people);
      } catch { if (alive) setFailed("error"); }
    })();
    return () => { alive = false; };
  }, [tier]);

  if (failed) {
    return (
      <div style={{ marginBottom: 18, border: "1px solid #E5E7EB", ...accentEdge("#9AA3AE", 3), borderRadius: 12, background: "#fff", boxShadow: CARD_3D, padding: "12px 14px" }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#374151", marginBottom: 3 }}>
          Who has not opened the Hub
        </div>
        <div style={{ fontSize: 12.5, color: "#6B7280", lineHeight: 1.5 }}>
          {failed === "auth"
            ? "Could not load this — your Hub sign-in has expired. Sign out and back in with your PIN and it will come back. Nothing is wrong with the list."
            : "Could not load this just now. It is not that everybody has opened the Hub, it is that the check did not run. Try a refresh, and tell Matt if it keeps saying this."}
        </div>
      </div>
    );
  }

  if (!people || people.length === 0) return null;

  return (
    <div style={{ marginBottom: 18, border: "1px solid #E5E7EB", ...accentEdge("#C77D0A", 3), borderRadius: 12, background: cardSurface("#C77D0A", 0.5), overflow: "hidden", boxShadow: CARD_3D }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ width: "100%", textAlign: "left", background: "transparent", border: "none",
          padding: "11px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: "#5B6474" }}>
          Set up but quiet
        </span>
        <span style={{ fontSize: 12, color: "#9AA3AE" }}>
          {people.length} {people.length === 1 ? "person has" : "people have"} alerts on and {people.length === 1 ? "has" : "have"} not opened a tool this week
        </span>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#5B6474" }}>{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div style={{ padding: "0 14px 12px" }}>
          {/* ⚠️ THE WORDING IS EXACT ON PURPOSE. This counts TOOL OPENS, and
              loading the app is not the same thing. Checked against the real
              data before shipping: on Aug 3 the only person here had loaded the
              Hub at 2am the same morning and simply opened nothing in it. A
              card telling leaders she "has not opened the Hub" would have been
              a false statement about a named colleague, on a screen built to
              prompt someone to message her about it. */}
          <div style={{ fontSize: 12, color: "#6B7480", lineHeight: 1.5, marginBottom: 10 }}>
            They allowed notifications, so they meant to use it. This counts
            opening a tool, not opening the app, so someone here may well have
            loaded the Hub and found nothing they needed. A quiet week is
            usually something broken rather than someone ignoring it.
          </div>
          {people.map((p) => (
            <div key={p.uid} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: "1px solid #F1F3F5", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13.5, color: "#232A31", flex: "1 1 140px" }}>{p.name}</span>
              <NudgeButton name={p.name} what="checking in — is the Hub working alright for you?" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
