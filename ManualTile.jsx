import React, { useMemo } from "react";
/* The one raised look, shared with every tool — see cardStyle.js. */
import { CARD_3D, accentEdge, ACCENT_NEUTRAL, MONO } from "./cardStyle.js";
import { STORE } from "./storeConfig.js";
/* The register of everything a person still has to type in, and the rule for
   who owns each row. ⚠️ A LEAF (it reaches only boardOwner/ahaMonthly/
   storeConfig, all leaves), so reading it here drags nothing into this tile. */
import { INPUTS } from "./inputRegistry.js";

/**
 * ManualTile.jsx — the Hub explaining itself.
 *
 * Matt, Aug 11 2026: "i cant even keep uup with the hubs capabilties", then
 * "this needs to be for every store operator that signs up i think. i just
 * dont want anything stolen".
 *
 * ★★ IT IS GENERATED, NEVER WRITTEN DOWN. The tool list, the descriptions and
 * the manual-input rows all come from the SAME arrays the Hub itself runs on.
 * A hand-written manual is out of date the first time somebody adds a tile, and
 * nothing would ever tell you — which is the exact failure mode of every ops
 * manual in every restaurant. This one cannot drift because there is nothing to
 * keep in step (design rule 8).
 *
 * ★ IT DESCRIBES **YOUR** HUB, NOT THE HUB.
 *   · The store's own name and number, from storeConfig, so a second store's
 *     manual never says "Gate City".
 *   · `sections` arrives ALREADY FILTERED by App.jsx, using the same
 *     `canUseTool` the dashboard filters with. So the manual lists exactly the
 *     tools you can actually open — a team member reads about four, a Director
 *     reads about all of them. A manual that describes doors you cannot open is
 *     how a new person concludes the thing is broken.
 *   · Same for the input rows: only the ones whose tile you can reach.
 *
 * ⚠️ THE FILTERING IS NOT DONE HERE, AND MUST NOT BE. App.jsx owns
 * `canUseTool`; a second opinion in this file could show somebody a tool the
 * dashboard hides, and this file would be the last place anyone looked. It
 * takes the answer, it does not compute it.
 *
 * ⚠️ NOTHING HERE WRITES. It is a reading surface, and the only thing it can DO
 * is open a tool — through `onOpenTool`, the callback App hands every tile,
 * which re-checks access and logs the open. A tool must never be reachable past
 * a gate just because a manual linked to it.
 */
const C = { red: "#E51636", navy: "#1A2238", ink: "#141821", sub: "#5B6474",
  faint: "#8A93A3", line: "#E7E9EF", paper: "#F6F4EF", card: "#FFFFFF", chip: "#EFECE4" };
const FONT = "'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, sans-serif";

/* Who a row is for, in the words the Hub uses on screen. Module level, pure
   (design rule 7). Tier is the Hub's own 1/2/3 and nothing new. */
const WHO = { 1: "Everyone", 2: "Leaders", 3: "Directors", 4: "By name" };
const whoFor = (t) => WHO[Number(t && t.tier) || 1] || "Everyone";

/* An input row worth showing: it has a home tile, and it is something a person
   actually does. The register marks the derived ones "Nothing to enter" in
   their own words, so they are read out of the data rather than listed here. */
const isTyped = (i) => !!(i && i.tile && !/^Nothing to enter/i.test(String(i.how || "")));

export default function ManualTile({ sections = [], tier = 1, user, onOpenTool, onBack }) {
  /* Only the rows whose tile is one this person can open. The filtered
     `sections` IS the access answer, so this reuses it rather than asking a
     second time. */
  const openable = useMemo(() => {
    const ids = new Set();
    (sections || []).forEach((s) => (s.tools || []).forEach((t) => t && t.id && ids.add(t.id)));
    return ids;
  }, [sections]);

  const myInputs = useMemo(
    () => INPUTS.filter((i) => isTyped(i) && openable.has(i.tile)),
    [openable]);

  const toolCount = useMemo(
    () => (sections || []).reduce((n, s) => n + ((s.tools || []).length), 0), [sections]);

  const firstName = String((user && user.name) || "").trim().split(" ")[0];

  return (
    <div style={{ fontFamily: FONT, background: C.paper, minHeight: "100vh", color: C.ink }}>
      <div style={{ position: "sticky", top: 0, zIndex: 5, background: "rgba(246,244,239,.92)",
        backdropFilter: "blur(8px)", borderBottom: `1px solid ${C.line}`, padding: "12px 20px",
        display: "flex", alignItems: "center", gap: 14 }}>
        {onBack && <button onClick={onBack} style={{ border: "none", background: "none", color: C.sub,
          fontFamily: FONT, fontSize: 14, cursor: "pointer", fontWeight: 600 }}>← Back</button>}
        <div style={{ fontWeight: 800, fontSize: 16 }}>Manual</div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 20px 72px" }}>

        <div style={{ background: `linear-gradient(120deg, ${C.navy} 0%, #26304A 100%)`,
          borderRadius: 18, padding: "24px 24px", color: "#fff", marginBottom: 22 }}>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".14em",
            textTransform: "uppercase", opacity: .7 }}>
            {STORE.name} · FSR #{STORE.fsr}
          </div>
          <div style={{ fontWeight: 800, fontSize: 24, letterSpacing: "-.02em", marginTop: 8 }}>
            {firstName ? `${firstName}, this is your Hub` : "What this Hub does"}
          </div>
          {/* ⚠️ SAYS "YOU CAN OPEN", NOT "THE HUB HAS". The number is this
              person's number, and claiming the store's total to somebody who
              can see four tools would read as a lie the moment they went back
              to the home screen. */}
          <div style={{ fontSize: 14.5, color: "rgba(255,255,255,.85)", marginTop: 6, lineHeight: 1.5 }}>
            {toolCount} {toolCount === 1 ? "tool" : "tools"} you can open, and what each one is for.
            Everything here is generated from the Hub itself, so it is never out of date.
          </div>
        </div>

        {sections.length === 0 ? (
          <Note>Sign in to see what your Hub does.</Note>
        ) : sections.map((s) => (
          <div key={s.label} style={{ marginBottom: 26 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 9, marginBottom: 10,
              borderBottom: `1px solid ${C.line}`, paddingBottom: 8 }}>
              <span style={{ fontWeight: 800, fontSize: 16.5, letterSpacing: "-.01em" }}>{s.label}</span>
              <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.faint }}>
                {(s.tools || []).length}
              </span>
            </div>
            {(s.tools || []).map((t) => (
              <div key={t.id} style={{ background: C.card, border: `1px solid ${C.line}`,
                borderRadius: 12, ...accentEdge(t.color || s.color || ACCENT_NEUTRAL, 3),
                boxShadow: CARD_3D, padding: "13px 15px", marginBottom: 9 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ flex: 1, minWidth: 150, fontWeight: 800, fontSize: 15 }}>{t.name}</span>
                  <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: ".06em",
                    textTransform: "uppercase", color: C.sub, background: C.chip,
                    borderRadius: 4, padding: "4px 8px" }}>{whoFor(t)}</span>
                  {/* ⚠️ GOES THROUGH App's callback, which re-checks access and
                      logs the open. The manual never opens anything itself. */}
                  {onOpenTool && (
                    <button onClick={() => onOpenTool(t.id)} style={{ fontFamily: FONT, fontSize: 12.5,
                      fontWeight: 700, borderRadius: 8, padding: "6px 12px", cursor: "pointer",
                      border: `1px solid ${C.line}`, background: "#fff", color: C.ink }}>Open</button>
                  )}
                </div>
                <div style={{ fontSize: 13.5, color: C.sub, marginTop: 4, lineHeight: 1.5 }}>{t.desc}</div>
              </div>
            ))}
          </div>
        ))}

        {myInputs.length > 0 && (
          <div style={{ marginTop: 34 }}>
            <div style={{ borderBottom: `1px solid ${C.line}`, paddingBottom: 8, marginBottom: 10 }}>
              <span style={{ fontWeight: 800, fontSize: 16.5, letterSpacing: "-.01em" }}>What still needs a person</span>
            </div>
            <div style={{ fontSize: 13.5, color: C.sub, lineHeight: 1.55, marginBottom: 12 }}>
              The Hub works out everything it can on its own. These are the {myInputs.length} things
              in your tools that somebody still has to enter, and where each one comes from.
            </div>
            {myInputs.map((i) => (
              <div key={i.id} style={{ borderTop: `1px solid ${C.line}`, padding: "11px 0" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ flex: 1, minWidth: 160, fontWeight: 700, fontSize: 14.5 }}>{i.label}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>{i.cadence}</span>
                </div>
                {/* The register's own instructions, verbatim. It is the same
                    sentence the paste box shows, so a store reads one answer. */}
                <div style={{ fontSize: 13, color: C.sub, marginTop: 3, lineHeight: 1.5 }}>{i.how}</div>
              </div>
            ))}
          </div>
        )}

        {/* ⚠️ SAID OUT LOUD RATHER THAN IMPLIED. Somebody reading a four-tool
            manual should know the Hub is bigger than what they hold, or the
            first time they see a colleague open something else the manual looks
            wrong. Tier 3 already sees everything, so it is pointless for them. */}
        {tier < 3 && (
          <div style={{ marginTop: 30, background: C.card, border: `1px solid ${C.line}`,
            borderLeft: `3px solid ${C.red}`, borderRadius: "0 10px 10px 0", padding: "14px 16px" }}>
            <div style={{ fontSize: 13.5, color: C.sub, lineHeight: 1.55 }}>
              <b style={{ color: C.ink }}>There is more to the Hub than this.</b> It also runs the
              money, hiring, evaluations and the leadership meeting. Those open up as your role
              does, so this page grows with you.
            </div>
          </div>
        )}

        <div style={{ marginTop: 26, fontSize: 12.5, color: C.faint, lineHeight: 1.55 }}>
          {/* ⚠️ ONLY WHAT storeConfig ACTUALLY EXPORTS. `STORE` is a frozen
              accessor with five getters and `domain` is not one of them — it
              sits in the config object but was never surfaced. Reaching past
              the export would have rendered "undefined" under every store's
              name. Adding a getter is storeConfig's owner's call, not this
              file's, and another session is live in there today. */}
          {STORE.legalName} · {STORE.appName}
        </div>
      </div>
    </div>
  );
}

const Note = ({ children }) => (
  <div style={{ color: C.sub, fontSize: 13.5, padding: "10px 0" }}>{children}</div>
);
