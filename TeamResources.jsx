import React, { useState, useEffect, useRef } from "react";
/* The shared raised look and accent edge — see cardStyle.js. */
import { CARD_3D, accentEdge, ACCENT_NEUTRAL } from "./cardStyle.js";
import { kvGet, kvSet, kvGetResult, uploadDoc } from "./store.js";
import { isAdminSlackId, adminNames } from "./storeConfig.js";
import { TEAM_TOOL_ADMIN_ROLES } from "./adminRoles.js";
/* ★ THE SEED MOVED OUT Aug 13 2026, UNCHANGED, so a clone can be handed a
   different one through the `<name>.empty.js` convention. Every `file` in this
   store's copy names a PDF in THIS store's bucket, and `/docs/<file>` answers a
   real 404 elsewhere, so a clone used to show seven normal-looking cards that
   all opened onto "Document not found". Nothing on this page changed for this
   store: same array, same order, same ids. */
import { SEED } from "./teamResourcesSeed.js";

/**
 * TeamResources — Resources page for the Hub Team Site.
 * Editable + reorderable (leaders). Persists to KV `gc-team-resources-v1`.
 * Visual pass v3 (Jul 21): category-tinted icon tiles + tags, cleaner cards.
 * PDFs served from the hub-assets bucket ROOT — filenames are CLEAN SLUGS (no
 * spaces/caps/parens) so URLs can't 404 on a mismatch.
 */
const STORE_KEY = "gc-team-resources-v3";
const USER_KEY = "gcfcr-access-user";
const PDF_BASE = "/docs/";  // served by worker.js → hub-assets (clean gatecityhub.com URLs)

// Both of Bri's spellings, like every sibling allow-list (MemberVote,
// TeamGoals, GoalSubmissions, TeamDirectory) — this file alone carried only
// "brianna moore", so a "Bri" sign-in was locked out of editing here
// while every other tool let her in. Caught by the hardcoded-people census.
/* ★ THE NAME LIST NOW COMES FROM storeConfig — owners.adminNames.teamResources.
   ⚠️ THIS IS THE LONGEST OF THE FOUR AND STAYS THAT WAY. Six entries, because
   Hannah and Kyleeka were added here to fix the lockout described below. The
   three sibling tiles have shorter lists under their own keys and must not be
   levelled up to this one — that would widen three live permission gates.
   ⚠️ READ INSIDE THE GATE, NOT INTO A `const` UP HERE, or it captures the
   baked-in default before a store's saved settings are merged. */
/* ⚠️⚠️ THE SLACK ID SET IS THE RELIABLE DOOR, AND THIS FILE NEVER HAD ONE
   (Aug 7 2026 sweep). Its four siblings — TeamGoals, GoalSubmissions,
   MemberVote and TeamDirectory — all check a Slack user id FIRST, because an
   id never changes and a display name does. This file matched on names only,
   and the comment above records it being corrected once already for exactly
   this class of bug: that fix added a spelling, not the id path.
   🐛 WHO IT LOCKED OUT: Hannah. Her roster role is "Human Resources", she was
   not in the name list, and the role test below never allowed HR — so all
   three doors were shut on the Executive Director over HR, in the tile holding
   the Team Member Handbook, the Leadership Handbook and the Point Performance
   System. Every sibling tool lets her edit, so it read as a broken page rather
   than a permission decision. */
/* ★ THE FIVE ADMINS NOW COME FROM storeConfig.js, WHICH IS THE ONLY COPY.
   This exact block was duplicated in four tiles under four different names.
   Byte-identical every time, so a second store had to find all four to stop
   Gate City administering their Hub — and four copies of one permission list
   drift silently.
   ⚠️ THE MECHANISM IS UNCHANGED. Id first, name second, role last, exactly as
   before. Only the list moved. The name and role fallbacks below are NOT
   duplicates between tiles and deliberately stay here. */
const norm = (s) => (s || "").trim().toLowerCase();
function getViewer() { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } }
function canEditResources(v) {
  if (!v) return false;
  /* Id first, name second, role last — the order every sibling uses. */
  if (v.slackId && isAdminSlackId(v.slackId)) return true;
  if (adminNames("teamResources").includes(norm(v.name))) return true;
  const r = norm(v.role);
  /* ⚠️ "human resources" and "owner/operator" ADDED Aug 7 2026 to match the
     four siblings. Hannah's roster role is HR, not Executive Director, and
     without this she could not edit.
     ⚠️ "director" ADDED LATER THE SAME DAY. Matt, asked directly whether a
     plain Director should administer this tile and the three beside it: "yes".
     This comment used to end "Do NOT widen further — ADs stay out, the same
     line TeamGoals draws", and half of that still holds: ASSISTANT Directors
     are still out, here and in TeamGoals. A plain Director is a different
     title and is now in, by decision rather than by drift.
     ⚠️ FIVE TILES SHARE THIS, NOT FOUR. TeamDirectory joined the same day: it
     held a byte-identical list that morning, was left behind when the other
     four were widened, and two lists that meant the same thing at breakfast
     meant different things by dinner. Sharing one array is what stops that.
     ⚠️ ProfessionalGrowth IS STILL OUT, ON PURPOSE. Matt, asked directly: "not
     PG". It holds people's promotion applications, so a plain Director does not
     administer it. It keeps its own list and says so where it lives. */
  /* ★ ONE LIST, in adminRoles.js, shared with the four sibling team tools so
     none of them can drift apart again. `r` is already normalised on the line
     above, which is why this compares against the array directly rather than
     through a matcher. */
  return TEAM_TOOL_ADMIN_ROLES.includes(r);
}

const C = { red: "#E51636", redDeep: "#B21230", navy: "#1A2238", ink: "#141821", sub: "#5B6474", line: "#E7E9EF", paper: "#F6F4EF", card: "#FFFFFF", gold: "#E8B23A" };
const FONT = "'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, sans-serif";

// category → look. cat set per item; drives icon + tint + tag.
const CATS = {
  handbook: { label: "Handbook", icon: "📘", fg: "#B21230", bg: "#FBE7EC" },
  guide:    { label: "Guide",    icon: "🧭", fg: "#1D4ED8", bg: "#E7EEFA" },
  form:     { label: "Form",     icon: "📝", fg: "#0F766E", bg: "#E4F3EE" },
  review:   { label: "Review",   icon: "📋", fg: "#6D28D9", bg: "#EEE8FB" },
  system:   { label: "System",   icon: "📊", fg: "#B45309", bg: "#FDF2D9" },
  pending:  { label: "Soon",     icon: "⏳", fg: "#8A93A3", bg: "#EEF0F4" },
};
const catOf = (r) => (r.kind === "pending" ? CATS.pending : CATS[r.cat] || CATS.guide);


/* ⚠️ A TOOL HAS NO URL AND MUST NOT PRETEND TO. `dis` below is computed from
   an empty url, so returning "" here would grey the card out and disable it.
   Tools are handled by kind before this is ever consulted. */
const resolveUrl = (r) => r.kind === "link" ? (r.url || "") : r.kind === "pdf" ? PDF_BASE + encodeURIComponent(r.file || "") : "";
const isTool = (r) => r && r.kind === "tool" && !!r.tool;

/* ═══ TWO THINGS BRI COULD NOT DO ON THIS PAGE (Aug 10 2026) ════════════════
   "Right now I have the option to do links or PDF it says, but the PDF doesn't
   have an upload function." And separately: "can I at least have a functioning
   upload option created for the PDF section in TM Review to add a document?
   It's still 'coming soon' but I am ready to upload and can't."

   ★ THOSE ARE ONE ITEM, NOT TWO. "TM Review" is the resource "TM Review
   Breakdown" (r6) sitting on kind "pending", which renders as Coming soon. She
   could not move it to PDF because the PDF option only ever took a filename
   somebody had already put in the bucket by hand.

   ★ NOTHING WAS NEEDED ON THE SERVER. `hub-assets` is already in the worker's
   UPLOAD_BUCKETS, /api/upload writes with the service key so no bucket policy
   is involved, and /docs/<name> falls back to the raw object name when it is
   not in DOC_MAP. So an uploaded file is reachable the moment it lands, on
   gatecityhub.com, which is the rule about never showing a provider's host.

   ⚠️ ANYTHING UPLOADED HERE IS PUBLIC. hub-assets is the open bucket and /docs
   serves it with no sign-in — the same as the seven handbooks already on this
   page. Flagged to Matt before building. A leaders-only document needs a
   different bucket and a different route; do not quietly put one here. */
const bodyOf = (r) => String((r && r.body) || "");
const isText = (r) => !!r && r.kind === "text";

/* A clean, UNIQUE object name for an upload.
   ⚠️ STAMPED, AND THE STAMP IS LOAD-BEARING. /api/upload sends `x-upsert:
   "false"`, so re-uploading the same name fails — "replace this PDF" would
   have looked like a broken button. A new name every time makes replacing
   work, and the old file stays put rather than being overwritten under
   anybody who still had the page open.
   ⚠️ SLUGGED because the name travels in the /docs URL, which is the same
   reason the original seven are clean slugs. */
const docNameFor = (fileName) => {
  const raw = String(fileName || "file");
  const dot = raw.lastIndexOf(".");
  const ext = dot > 0 ? raw.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const base = (dot > 0 ? raw.slice(0, dot) : raw)
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "document";
  return `${base}-${Date.now()}${ext ? `.${ext}` : ""}`;
};

/* ONE definition of "can this card be opened", because the card and the viewer
   both need it and a card that opens onto an empty page is the worst outcome
   this page can produce. A text resource with nothing typed in it yet is not
   openable — same treatment as a PDF with no file. */
/* 🐛 AND IT FIXES A LIVE ONE. The old test was `!resolveUrl(r)`, but a PDF with
   no file resolves to the bare string "/docs/" — truthy — so the card rendered
   ENABLED and opened a 404. That is the state "TM Review Breakdown" is in right
   now in the live list: kind "pdf", no file. Bri reported it as still saying
   Coming soon; what it actually does is open onto nothing, which is worse.
   Checked against the real gc-team-resources-v3 row rather than the seed. */
const openable = (r) => {
  if (!r || r.kind === "pending") return false;
  if (isTool(r)) return true;
  if (isText(r)) return bodyOf(r).trim() !== "";
  if (r.kind === "pdf") return String(r.file || "").trim() !== "";
  if (r.kind === "link") return String(r.url || "").trim() !== "";
  return false;
};

/* ⚠️ ok:false = the read FAILED, not "never edited" — the autosave below would
   otherwise write SEED-plus-one-edit over the curated list. */
async function loadData() {
  const r = await kvGetResult(STORE_KEY);
  if (!r.ok) return { ok: false, list: SEED };
  return { ok: true, list: Array.isArray(r.value) && r.value.length ? r.value : SEED };
}
async function saveData(list) { try { return await kvSet(STORE_KEY, list); } catch { return false; } }

function Btn({ children, onClick, kind = "ghost", small }) {
  const k = { solid: { background: C.red, color: "#fff", border: "none" }, ghost: { background: "transparent", color: C.sub, border: `1px solid ${C.line}` } };
  return <button onClick={onClick} style={{ cursor: "pointer", fontFamily: FONT, fontWeight: 600, borderRadius: 9, padding: small ? "5px 10px" : "9px 16px", fontSize: small ? 12.5 : 14, ...k[kind] }}>{children}</button>;
}
const inp = { fontFamily: FONT, fontSize: 14, padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.line}`, color: C.ink, background: "#fff", outline: "none", width: "100%", boxSizing: "border-box" };

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
.rc { transition: transform .14s ease, box-shadow .14s ease, border-color .14s ease; }
.rc:not(.dis):hover { transform: translateY(-2px); box-shadow: 0 12px 26px rgba(20,24,33,.12); border-color: #d7dae2; }
.rc:not(.dis):active { transform: translateY(0); }
`;

function Card({ r, onOpen }) {
  const dis = !openable(r); const c = catOf(r);
  return (
    <button onClick={() => { if (!dis) onOpen(r); }} disabled={dis} className={`rc${dis ? " dis" : ""}`} style={{
      width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 15, background: C.card,
      /* ⚠️ THE TWO-EDGE ACCENT STAYS. IT WAS NEVER THE PROBLEM (Matt, Aug 5
         2026: "Fix this border", then "i like the 3d and not closed border").
         The bug was a FAINT 1px GREY RULE declared on all four sides underneath
         a 3px colour on two of them. At a 16px radius the browser blends each
         rounded corner between its two adjacent sides, so the corners faded
         3px-colour into 1px-grey and the card read as a border somebody gave up
         on halfway down the right.
         Dropping the grey is the fix, not closing the ring: colour on top and
         left, nothing on the other two, so each corner tapers into the card
         instead of into a competing line. Same shape as every other raised card
         in the Hub, which is the look he wants kept.
         ⚠️ A closed 2px border was tried here and rejected. Do not bring it
         back. */
      ...accentEdge(dis ? C.line : c.fg, 3), borderRadius: 16, padding: "16px 18px",
      cursor: dis ? "default" : "pointer", opacity: dis ? 0.72 : 1, boxShadow: CARD_3D, fontFamily: FONT }}>
      <span style={{ width: 52, height: 52, borderRadius: 14, background: c.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 25, flexShrink: 0 }}>{c.icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".07em", textTransform: "uppercase", color: c.fg, background: c.bg, padding: "2px 8px", borderRadius: 20 }}>{c.label}</span>
        </span>
        <span style={{ display: "block", fontWeight: 700, fontSize: 16.5, color: C.ink, letterSpacing: "-.01em", marginTop: 5 }}>{r.label}</span>
        <span style={{ display: "block", fontSize: 12.5, color: C.sub, marginTop: 1 }}>{isTool(r) ? "Opens in the Hub" : r.kind === "link" ? "Opens a form" : r.kind === "pending" ? "Coming soon" : isText(r) ? "Tap to read" : "Tap to open the PDF"}</span>
      </span>
      {!dis && <span style={{ width: 34, height: 34, borderRadius: 10, background: c.bg, color: c.fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, flexShrink: 0 }}>↗</span>}
    </button>
  );
}

// Full-screen in-app PDF viewer. /docs is SAME-ORIGIN, so opening a PDF in a new
// tab loses iOS's dismissible in-app-browser overlay and the user can get
// stranded. This Back button is a React control, so it can't disappear —
// whatever the browser chrome or home-screen/PWA context. "Open in new tab"
// stays as a fallback because iOS Safari can render framed PDFs poorly.
// Full-screen in-app viewer. Every resource opens through here so the
// "← Back to Resources" control is ALWAYS present — it's a React button, so it
// can't disappear the way browser chrome does on same-origin navigations.
//
// Two deliberate choices:
//  • There is NO embedded preview. iOS Safari rendered every PDF as a blank
//    frame (confirmed on Matt's iPad Jul 22), and a frame that silently fails
//    is worse than no frame — so this is a clean launch page instead.
//  • External links (Google Forms etc.) were never embeddable anyway; those
//    providers send framing restrictions.
function DocViewer({ doc, onClose }) {
  const url = resolveUrl(doc);
  const isLink = doc.kind === "link";
  const c = catOf(doc);
  return (
    <div style={{ fontFamily: FONT, background: C.paper, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{CSS}</style>
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: "rgba(246,244,239,.95)", backdropFilter: "blur(8px)",
        borderBottom: `1px solid ${C.line}`, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={onClose} style={{ border: `1px solid ${C.line}`, background: "#fff", color: C.ink, fontFamily: FONT,
          fontSize: 14, fontWeight: 700, cursor: "pointer", borderRadius: 10, padding: "8px 12px", flexShrink: 0 }}>← Back to Resources</button>
        <div style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 14.5, color: C.ink, overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.label}</div>
      </div>

      {/* ★ A TEXT RESOURCE IS READ HERE, not launched. There is nowhere to send
          somebody — the words are the document. Same header and same Back
          button as every other resource, so the way out never changes.
          `pre-wrap` keeps her paragraph breaks exactly as she typed them; this
          is deliberately not a formatting editor (see EditRow). */}
      {isText(doc) ? (
        <div style={{ padding: "16px 16px 40px" }}>
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16,
            padding: "20px 22px", ...accentEdge(c.fg, 3), boxShadow: CARD_3D,
            fontSize: 15.5, lineHeight: 1.65, color: C.ink, whiteSpace: "pre-wrap",
            maxWidth: 700, margin: "0 auto" }}>
            {bodyOf(doc)}
          </div>
        </div>
      ) : (
      <div style={{ padding: "16px 16px 12px" }}>
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderLeft: `3px solid ${c.fg}`, borderTop: `3px solid ${c.fg}`,
          borderRadius: 16, padding: "16px 18px", display: "flex", alignItems: "center", gap: 14 , ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }}>
          <span style={{ width: 46, height: 46, borderRadius: 13, background: c.bg, display: "flex",
            alignItems: "center", justifyContent: "center", fontSize: 23, flexShrink: 0 }}>{c.icon}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontWeight: 700, fontSize: 16, color: C.ink }}>{doc.label}</span>
            <span style={{ display: "block", fontSize: 12.5, color: C.sub, marginTop: 2 }}>
              {isLink ? "Opens in a new tab — this page stays here" : "Opens the full document"}
            </span>
          </span>
          <a href={url} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0, textDecoration: "none",
            background: C.red, color: "#fff", fontFamily: FONT, fontSize: 13.5, fontWeight: 700,
            borderRadius: 10, padding: "10px 14px" }}>Open ↗</a>
        </div>
        <div style={{ color: C.sub, fontSize: 12.5, textAlign: "center", marginTop: 12, lineHeight: 1.5 }}>
          {isLink
            ? "The form opens in a new tab. This page stays open behind it."
            : "The document opens in a new tab. This page stays open behind it — come back here any time."}
        </div>
      </div>
      )}
    </div>
  );
}

function EditRow({ r, i, total, onChange, onDelete, onMove }) {
  const c = catOf(r);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  /* Upload straight into hub-assets and point the resource at the stored name,
     so the button she gets is "pick a file", not "type the name of a file
     somebody already put in a bucket for you".
     ⚠️ THE RESOURCE IS ONLY REPOINTED ON SUCCESS. A failed upload leaves the
     old file attached and says so; repointing first would break a working
     handbook because the wifi dropped. */
  const pickFile = async (file) => {
    if (!file) return;
    setErr(""); setBusy(true);
    try {
      const name = docNameFor(file.name);
      await uploadDoc("hub-assets", name, file);
      onChange({ ...r, file: name });
    } catch (e) {
      setErr((e && e.message) || String(e));
    }
    setBusy(false);
  };

  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, marginBottom: 10 , ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <button onClick={() => onMove(i, -1)} disabled={i === 0} style={{ border: `1px solid ${C.line}`, background: "#fff", borderRadius: 6, width: 26, height: 22, cursor: i === 0 ? "default" : "pointer", opacity: i === 0 ? 0.4 : 1 }}>▲</button>
          <button onClick={() => onMove(i, 1)} disabled={i === total - 1} style={{ border: `1px solid ${C.line}`, background: "#fff", borderRadius: 6, width: 26, height: 22, cursor: i === total - 1 ? "default" : "pointer", opacity: i === total - 1 ? 0.4 : 1 }}>▼</button>
        </div>
        <span style={{ width: 36, height: 36, borderRadius: 10, background: c.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{c.icon}</span>
        <input value={r.label} placeholder="Button label" onChange={(e) => onChange({ ...r, label: e.target.value })} style={{ ...inp, flex: 1 }} />
        <button onClick={onDelete} style={{ border: "none", background: "#FBEAED", color: C.redDeep, borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 16, flexShrink: 0 }}>×</button>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
        {[["pdf", "PDF"], ["text", "Text"], ["link", "Link/Form"], ["pending", "Coming soon"]].map(([k, lbl]) => (
          <button key={k} onClick={() => onChange({ ...r, kind: k })} style={{ border: `1px solid ${r.kind === k ? C.red : C.line}`, background: r.kind === k ? "#FBEAED" : "#fff", color: r.kind === k ? C.redDeep : C.sub, borderRadius: 20, padding: "4px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>{lbl}</button>
        ))}
        <select value={r.cat || "guide"} onChange={(e) => onChange({ ...r, cat: e.target.value })} style={{ ...inp, width: 130, flex: "none" }}>
          {["handbook", "guide", "form", "review", "system"].map((k) => <option key={k} value={k}>{CATS[k].label}</option>)}
        </select>
        {/* The typed-name box STAYS. The seven original handbooks are stored by
            slug in the worker's DOC_MAP and are edited by name, not re-uploaded. */}
        {r.kind === "pdf" && <input value={r.file || ""} placeholder="doc name (e.g. team-member-handbook)" onChange={(e) => onChange({ ...r, file: e.target.value })} style={{ ...inp, flex: 1, minWidth: 220 }} />}
        {r.kind === "pdf" && (
          <label style={{ ...inp, width: "auto", flex: "none", display: "inline-flex", alignItems: "center", gap: 8,
            cursor: busy ? "default" : "pointer", fontWeight: 600, color: C.sub, opacity: busy ? 0.6 : 1 }}>
            📎 {busy ? "Uploading…" : r.file ? "Replace PDF" : "Upload PDF"}
            <input type="file" accept=".pdf,application/pdf" disabled={busy} style={{ display: "none" }}
              onChange={(e) => {
                /* The file is read off the event BEFORE the async call — the
                   input is cleared below and React pools nothing we can rely
                   on once an await has run. */
                const f = e.target.files && e.target.files[0];
                e.target.value = "";           // so picking the same file twice still fires
                pickFile(f);
              }} />
          </label>
        )}
        {r.kind === "link" && <input value={r.url || ""} placeholder="https://…" onChange={(e) => onChange({ ...r, url: e.target.value })} style={{ ...inp, flex: 1, minWidth: 220 }} />}
      </div>

      {/* ★ TYPE OR PASTE THE WHOLE THING. Bri: "directly adding text to view
          (Needs to be substantial room for the equivalent of up to 5 pages in a
          document)".
          ⚠️ NO maxLength AND NO SILENT TRUNCATION. A cap on a textarea trims a
          paste without saying so, which would eat the end of a five-page
          document and look like it saved fine. The counter tells her where she
          is instead, and nothing is ever cut. */}
      {r.kind === "text" && (
        <div style={{ marginTop: 8 }}>
          <textarea
            value={bodyOf(r)}
            placeholder="Type or paste the resource here. Blank lines between paragraphs are kept exactly as you write them."
            onChange={(e) => { const v = e.target.value; onChange({ ...r, body: v }); }}
            style={{ ...inp, width: "100%", minHeight: 220, resize: "vertical", lineHeight: 1.55 }}
          />
          <div style={{ fontSize: 11.5, color: C.sub, marginTop: 4 }}>
            {bodyOf(r).length.toLocaleString()} characters · about {Math.max(1, Math.round(bodyOf(r).length / 3000))} page{Math.round(bodyOf(r).length / 3000) === 1 ? "" : "s"}
          </div>
        </div>
      )}

      {err && (
        <div style={{ marginTop: 8, background: "#FBEAED", color: C.redDeep, borderRadius: 8,
          padding: "8px 10px", fontSize: 12.5 }}>
          That upload did not go through, so the resource still points at the old file. {err}
        </div>
      )}
    </div>
  );
}

/* `onOpenTool` comes all the way down from App.jsx, which is the ONLY place
   allowed to switch tools — it applies the access check, the usage log and the
   PIN prompt. A resource must never be able to open a tool past a gate just
   because it was listed on a shelf everyone can see. */
export default function TeamResources({ onBack, onOpenTool }) {
  const [list, setList] = useState(null);
  // true = the resources read FAILED — saving is off until a reopen loads it.
  const [loadFailed, setLoadFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [viewing, setViewing] = useState(null);   // PDF open in the in-app viewer
  const first = useRef(true);
  const canEdit = canEditResources(getViewer());

  // PDFs open IN-APP (same-origin → no browser escape hatch of their own).
  // External forms still open in a new tab: they're cross-origin, so iOS gives
  // them the dismissible overlay already.
  // EVERY resource opens through the in-app viewer, so "← Back to Resources"
  // is always available — including external forms, which the viewer hands off
  // to a new tab rather than embedding (their providers block framing).
  const openResource = (r) => {
    /* ⚠️ NO CALLBACK MEANS NO NAVIGATION, NOT A DEAD TAP. If a parent forgets
       to pass onOpenTool, falling through to the doc viewer would show an empty
       shell; doing nothing at all would be the frozen-page complaint. So the
       card stays visibly openable and says where to go instead. */
    if (isTool(r)) {
      if (typeof onOpenTool === "function") onOpenTool(r.tool);
      else window.alert(`${r.label} lives in the Hub's tool list. Open it from All tools.`);
      return;
    }
    setViewing(r);
  };

  useEffect(() => { (async () => {
    const r = await loadData();
    if (!r.ok) setLoadFailed(true);
    setList(r.list);
  })(); }, []);
  useEffect(() => {
    if (!list || loadFailed) return;
    if (first.current) { first.current = false; return; }
    let live = true;
    saveData(list).then((ok) => { if (ok && live) { setSaved(true); setTimeout(() => setSaved(false), 1400); } });
    return () => { live = false; };
  }, [list, loadFailed]);

  if (viewing) return <DocViewer doc={viewing} onClose={() => setViewing(null)} />;

  if (!list) return <div style={{ fontFamily: FONT, padding: 40, color: C.sub }}>Loading resources…</div>;
  const setItem = (id, next) => setList(list.map((r) => (r.id === id ? next : r)));
  const delItem = (id) => setList(list.filter((r) => r.id !== id));
  const addItem = () => setList([...list, { id: `r${Date.now()}`, label: "New resource", kind: "pdf", cat: "guide", file: "" }]);
  const move = (i, dir) => { const j = i + dir; if (j < 0 || j >= list.length) return; const n = list.slice(); [n[i], n[j]] = [n[j], n[i]]; setList(n); };

  return (
    <div style={{ fontFamily: FONT, background: C.paper, minHeight: "100vh", color: C.ink }}>
      <style>{CSS}</style>
      {loadFailed && (
        <div style={{ background: "#F5EAD3", borderBottom: "1px solid #E4CE9E", color: "#7A5410", padding: "10px 20px", fontSize: 13, fontWeight: 700 }}>
          The saved resource list could not be reached — this is the built-in list. Changes will not save. Close and reopen to retry.
        </div>
      )}
      <div style={{ position: "sticky", top: 0, zIndex: 5, background: "rgba(246,244,239,.9)", backdropFilter: "blur(8px)", borderBottom: `1px solid ${C.line}`, padding: "12px 20px", display: "flex", alignItems: "center", gap: 14 }}>
        {onBack && <button onClick={onBack} style={{ border: "none", background: "none", color: C.sub, fontFamily: FONT, fontSize: 14, cursor: "pointer", fontWeight: 600 }}>← Back</button>}
        <div style={{ fontWeight: 800, fontSize: 16 }}>Resources</div>
        <div style={{ flex: 1 }} />
        {saved && <span style={{ color: "#2E9E5B", fontSize: 12.5, fontWeight: 600 }}>Saved ✓</span>}
        {canEdit && <Btn kind={editing ? "solid" : "ghost"} small onClick={() => setEditing((e) => !e)}>{editing ? "Done" : "Edit"}</Btn>}
      </div>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "20px 20px 60px" }}>
        <div style={{ background: `linear-gradient(120deg, ${C.red} 0%, ${C.redDeep} 30%, ${C.navy} 55%)`, borderRadius: 22, padding: "28px 26px", color: "#fff", position: "relative", overflow: "hidden", marginBottom: 22 }}>
          <div style={{ position: "absolute", right: -40, top: -40, width: 170, height: 170, borderRadius: "50%", background: "rgba(255,255,255,.08)" }} />
          <div style={{ position: "absolute", right: 40, bottom: -54, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,.06)" }} />
          <div style={{ fontSize: 28 }}>📚</div>
          <div style={{ fontWeight: 800, fontSize: 26, letterSpacing: "-.02em", marginTop: 8 }}>Resources</div>
          <div style={{ fontSize: 14.5, color: "rgba(255,255,255,.85)", marginTop: 5, maxWidth: 430, lineHeight: 1.5 }}>Handbooks, guides, and forms — everything the team needs, in one place.</div>
        </div>
        {editing ? (
          <>
            {list.map((r, i) => <EditRow key={r.id} r={r} i={i} total={list.length} onChange={(n) => setItem(r.id, n)} onDelete={() => delItem(r.id)} onMove={move} />)}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn kind="solid" onClick={addItem}>+ Add resource</Btn>
              <Btn onClick={() => { if (window.confirm("Restore the default resource list? This replaces the current list.")) setList(SEED.map((r) => ({ ...r }))); }}>Restore defaults</Btn>
            </div>
          </>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>{list.map((r) => <Card key={r.id} r={r} onOpen={openResource} />)}</div>
        )}
      </div>
    </div>
  );
}
