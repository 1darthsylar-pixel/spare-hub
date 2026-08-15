import React from "react";
/* The shared raised look and accent edge — see cardStyle.js. */
import { CARD_3D, accentEdge } from "./cardStyle.js";

/* ★★ ONE TOOL CRASHING MUST NOT TAKE THE WHOLE HUB DOWN.
   Only HR Console and Leadership 101 had crash guards. Every other tool ran
   bare, so an error anywhere in Waste, Daily Setup, Cash Audit, Planner or any
   of the other twenty tools unmounted the entire React tree and left a grey
   screen with no header and nothing to tap.

   public/sw.js already says why that is the worst possible outcome: a blank
   screen "is indistinguishable from the app being broken, and it strands
   whoever is mid-shift". This keeps the crash inside the tool that caused it,
   so the Hub chrome survives and the person can get back to the dashboard.

   ⚠️ LEAF FILE ON PURPOSE. It imports nothing but React so it can be wrapped
   around anything without risking an import cycle, which in this repo surfaces
   as "Cannot access 'X' before initialization" and a blank page — the very
   thing this exists to prevent.
   ⚠️ RESETS ON `resetKey`. React keeps an error boundary latched after it
   catches, so without this, opening a different tool would still show the last
   tool's crash. App.jsx passes the active tool id. */
/* ★ A STALE TAB IS NOT A CRASH — RELOAD IT INSTEAD OF ACCUSING THE TOOL.
   🐛 Hannah, Aug 2 2026: "Peak Reachers is down." It was not. Her tab had been
   open since before a promote, so tapping the tile went looking for a chunk
   from the OLD build. That filename no longer exists, the Worker's SPA
   catch-all answered with index.html at HTTP 200, and the browser threw
   "Failed to fetch dynamically imported module" when it tried to run HTML as
   JavaScript. Every tool is lazy-loaded, so this can hit ANY tile, for ANYONE
   who had the Hub open when Matt promoted — and it reads as "the app is
   broken" to the person it happens to.

   A reload fixes it completely, because index.html is served no-cache with an
   ETag, so the fresh page names the new chunks. Doing that automatically turns
   a scary red error into a half-second flicker.

   ⚠️ RELOAD ONCE, NEVER IN A LOOP. sessionStorage carries the marker, so a
   genuine broken deploy shows the error the second time instead of spinning
   the tab forever. The marker clears on a clean render below. */
const CHUNK_RELOAD_KEY = "gcfcr-chunk-reload";
const isStaleChunkError = (e) => {
  const m = String((e && e.message) || e || "");
  return /dynamically imported module|Importing a module script failed|Failed to fetch dynamically|ChunkLoadError|error loading dynamically imported module/i.test(m);
};

export default class ToolBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { err: null, info: null, reloading: false };
  }

  static getDerivedStateFromError(err) { return { err }; }

  componentDidCatch(err, info) {
    this.setState({ info });
    try { console.error("Tool crash:", this.props.name || "(tool)", err, info); } catch {}
    if (isStaleChunkError(err)) {
      let already = false;
      try { already = sessionStorage.getItem(CHUNK_RELOAD_KEY) === "1"; } catch {}
      if (!already) {
        try { sessionStorage.setItem(CHUNK_RELOAD_KEY, "1"); } catch {}
        this.setState({ reloading: true });
        // A tick of delay so the message paints before the tab goes.
        setTimeout(() => { try { window.location.reload(); } catch {} }, 400);
      }
    }
  }

  componentDidMount() {
    // Got here without crashing → whatever was stale is resolved. Clear the
    // guard so a future promote can auto-recover too.
    try { sessionStorage.removeItem(CHUNK_RELOAD_KEY); } catch {}
  }

  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.err) {
      this.setState({ err: null, info: null });
    }
  }

  render() {
    if (!this.state.err) return this.props.children;
    if (this.state.reloading) {
      return (
        <div style={{ padding: 24, fontFamily: "'Inter', system-ui, sans-serif", color: "#14243D", fontSize: 14.5 }}>
          A newer version of the Hub is available — refreshing…
        </div>
      );
    }
    const e = this.state.err;
    const stack = (this.state.info && this.state.info.componentStack) || "";
    const name = this.props.name || "This tool";
    return (
      <div style={{ padding: 20, fontFamily: "'Inter', system-ui, sans-serif", color: "#14243D" }}>
        <div style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", ...accentEdge("#DC2626", 3), borderRadius: 12, boxShadow: CARD_3D, padding: 16, maxWidth: 720 }}>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>{name} hit an error</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 10 }}>
            {isStaleChunkError(e)
              ? "The Hub was updated while you had it open, and refreshing did not clear it. Close the Hub completely and open it again."
              : "Nothing you did, and nothing has been lost. The rest of the Hub still works — use the back button above to get to your tools. Screenshot this and send it to Matt; it says exactly what went wrong."}
          </div>
          {this.props.onBack && (
            <button
              onClick={this.props.onBack}
              style={{
                appearance: "none", border: 0, borderRadius: 10, padding: "10px 16px",
                minHeight: 44, background: "#14243D", color: "#fff", fontSize: 14,
                fontWeight: 700, cursor: "pointer", marginBottom: 12,
              }}
            >
              Back to tools
            </button>
          )}
          <div style={{ fontFamily: "monospace", fontSize: 12, background: "#fff", border: "1px solid #FCA5A5",
            borderRadius: 8, padding: 10, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {String((e && e.message) || e)}
            {stack ? "\n" + stack.split("\n").slice(0, 6).join("\n") : ""}
          </div>
        </div>
      </div>
    );
  }
}
