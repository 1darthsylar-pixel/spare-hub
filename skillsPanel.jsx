import React, { useState, useEffect, useRef, useMemo } from "react";
import { Check } from "lucide-react";
import { kvGet, kvSet, kvGetResult } from "./store";
import { CARD_3D, CARD_3D_SOFT, cardSurface, accentEdge } from "./cardStyle.js";
import { CHECKLIST_CARDS } from "./skillsChecklists.js";
import { effectiveRole } from "./accessOverrides.js";
import { TRAINING_ADMIN_ROLES } from "./adminRoles.js";
import { adminNames, courseOwnerLabel } from "./storeConfig.js";

/* ══════════════════════════════════════════════════════════════════════════
   skillsPanel.jsx — THE SKILLS CHECKLIST PANEL, AND ONLY THAT.

   ★ WHY IT LEFT TrainingSite.jsx (Bri, Jul 30 2026: "Entering the W2-4 classes
   should automatically open the Skills Checklists for Leadership 101 that we
   made in the Team Training section. Only Leadership 101 Skills should be
   accessed through the entrance into the W2 class.")

   The panel was a private function inside Team Training, so a Leadership 101
   class could not render it. The two wrong ways out were both worse than
   moving it:
     · importing TrainingSite.jsx from the class pulls HRConsole.jsx in behind
       it, because Team Training imports the roster from there;
     · re-implementing the ticking inside the class duplicates the save path,
       and that path carries guards written after a blind write erased people's
       ticks. Two copies of that is how one of them silently stops guarding.

   ⚠️ THIS FILE IMPORTS NOTHING FROM A TILE. Only leaves: store, cardStyle,
   skillsChecklists, accessOverrides, adminRoles. That is what makes it safe for
   both Team Training and a class to hold, and it is the property to preserve —
   do not reach for HRConsole or TrainingSite from in here.

   ⚠️ NOTHING BELOW WAS REWRITTEN. Every block is the code that ran in
   TrainingSite.jsx, moved verbatim, so the behaviour Bri already trusts is the
   behaviour she keeps. The only additions are the two `only`/`week` props at
   the bottom, which narrow what is shown and change nothing about what is
   stored.
   ══════════════════════════════════════════════════════════════════════════ */


/* ── Shared with Team Training, and living here so there is ONE of each ──────
   ACCENT, eyebrowStyle and SideEdit are used by this panel AND by screens that
   stayed behind in TrainingSite.jsx. They moved with the panel and Team
   Training imports them back, rather than each file keeping its own copy — a
   second ACCENT is a colour that drifts, and a second SideEdit is two editors
   that stop agreeing about how a side is typed. Rule 8. */

export const ACCENT = "#7E22CE"; // purple — the tile's "certification pathway" identity

/* 🐛🐛 THIS WAS DECLARED INSIDE THE EDITOR'S RENDER BODY (fixed Jul 29 2026).
   Bri: "all text boxes for Application Points sections are only allowing one
   character change at a time. After a single character is added or removed, the
   box selection comes off and I have to re-select the box."

   CAUSE: a component defined inside another component's body is a BRAND NEW
   FUNCTION on every render. React compares element types by identity, sees a
   different type at that position, and throws the whole subtree away rather
   than updating it. The textarea the cursor was in no longer exists — a fresh
   DOM node has taken its place — so focus is gone. Every keystroke changed
   `draft`, which re-rendered the parent, which rebuilt this component.

   ⚠️ IT IS NOT A TEXTAREA BUG AND NO AMOUNT OF onChange TUNING FIXES IT. The
   only fix is for the component to keep the same identity between renders,
   which means living out here.
   ⚠️ Same trap anywhere else in this repo: a `const Thing = () => …` inside a
   component that renders `<Thing />`. Rendering it as `{Thing()}` also works,
   because then it is a function call and not a component boundary. */
export function SideEdit({ tag, sideKey, side, setSide, box }) {
  const s = side || { lead: "", points: [] };
  return (
    <div style={{ flex: "1 1 260px" }}>
      <div style={{ ...eyebrowStyle, color: ACCENT, marginBottom: 5 }}>{tag}</div>
      <textarea value={s.lead || ""} rows={2} onChange={(e) => setSide(sideKey, "lead", e.target.value)}
        placeholder="The focus line for this side" style={{ ...box, marginBottom: 6, resize: "vertical" }} />
      {/* 🐛 AND YOU COULD NEVER TYPE A SECOND POINT. This used to filter blank
          lines out on every keystroke, so pressing Enter produced an empty
          trailing line which was stripped before React re-rendered — the
          newline vanished as it was typed and the list could never grow past
          one item. Blank lines are kept while typing and dropped once, on save. */}
      <textarea value={(s.points || []).join("\n")} rows={5}
        onChange={(e) => setSide(sideKey, "points", e.target.value.split("\n"))}
        placeholder="One point per line" style={{ ...box, resize: "vertical" }} />
      <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>One point per line. Blank lines are dropped when you save.</div>
    </div>
  );
}

export const eyebrowStyle = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 1.5,
  textTransform: "uppercase",
  marginBottom: 8,
};

/* Moved from TrainingSite.jsx — the roster progress view there reads the
   same slug, so it imports this back rather than keeping a second copy. */
export const slug = (str) =>
  str
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

/* ═══ SKILLS CHECKLISTS — Leadership 101 & Senior Trainer ══════════════════
   Bri, Jul 28 2026. One renderer for both cards; they differ only in content
   and in who may open them.

   ★ PROGRESS LIVES IN ONE PLACE PER PERSON: `gcfcr-skills-<slug>-v1`.
   ⚠️ NOT inside the class progress record. These are ticked on shift over weeks
   and un-ticked freely; class progress is graded work that Bri reviews. Mixing
   them would put "un-tickable" and "permanent" in the same object and make
   Class Progress lie about completion.

   ⚠️ SELF-SERVE AND SELF-OWNED. A student ticks their own list. Nothing here
   writes to anybody else's record, so there is no way to complete a skill on
   someone's behalf — which is the point of a self-check.                    */
export const skillsKey = (name) => `gcfcr-skills-${slug(name)}-v1`;

/* ═══ EDITING THE CHECKLISTS ═══════════════════════════════════════════════
   Bri, Jul 28 2026: "I would also like editing access to add, delete, reorder,
   and edit all application point and skills."

   ★ WHY THIS MATTERS MORE THAN IT LOOKS. The five cards were transcribed from
   her printed W2-W6 sheets, and within an hour she had sent eight corrections —
   because the PDFs were stale, not because the transcription was wrong. Policy
   she had already changed still lived in print. Every one of those corrections
   travelled Bri → Claude → Matt → deploy for a sentence. This ends that.

   ⚠️ EDITS LAYER OVER THE SEED, THEY DO NOT REPLACE IT. `gcfcr-skills-content-v1`
   holds only what has been changed; `skillsChecklists.js` remains the base. So a
   card still renders if the key is empty or unreadable, and a future content
   update in code is still visible for anything she has not overridden.
   ⚠️ SKILL IDS ARE NEVER REGENERATED ON EDIT. A student's ticks are keyed by
   them — renaming the LABEL is safe, minting a new id silently un-ticks that
   skill for everyone who has done it. New skills get a fresh timestamped id;
   existing ones keep theirs forever. */
const SKILLS_CONTENT_KEY = "gcfcr-skills-content-v1";

/* Bri, HR and Executive Directors only — her words. Names first so the gate
   survives a title change; roles so it survives a name change. */
/* ⚠️ WAS A HARDCODED Set OF THIS STORE'S PEOPLE. It is the same name door as
   the four tiles already reading `adminNames`, so it reads through the same
   helper and a clone inherits nobody. Read at CALL time, never captured. */
/* ★ THE LIST NOW LIVES IN adminRoles.js — TRAINING_ADMIN_ROLES.
   the four training tools share one list. NOTE this list carries `leadership director` and NOT plain `director`.
   ⚠️ ONLY THE DECLARATION MOVED. Every use of SKILLS_EDIT_ROLES below is
   byte-for-byte what it was, including this file's own role normaliser,
   which is NOT the same function in every tile. */
const SKILLS_EDIT_ROLES = new Set(TRAINING_ADMIN_ROLES);
export function canEditSkills() {
  try {
    const u = JSON.parse(localStorage.getItem("gcfcr-access-user"));
    if (!u) return false;
    const n = String(u.name || "").trim().toLowerCase().replace(/\s+/g, " ");
    /* ⚠️ effectiveRole, not u.role — a person-level override must be able to
       close this the same way it closes the class editor. */
    const r = String(effectiveRole(u) || "").trim().toLowerCase();
    return adminNames("skillsPanel").includes(n) || SKILLS_EDIT_ROLES.has(r);
  } catch { return false; }
}

/* Deep-merge stored overrides onto the seed. Only the fields Bri can edit are
   read from storage, so a malformed key can never inject anything unexpected. */
function mergeChecklistContent(cards, stored) {
  if (!stored || typeof stored !== "object") return cards;
  return cards.map((card) => {
    const co = stored[card.id];
    if (!co) return card;
    return {
      ...card,
      weeks: (card.weeks || []).map((w) => {
        const wo = co[w.id];
        if (!wo) return w;
        const applied = wo.applied ? {
          foh: wo.applied.foh || w.applied.foh,
          boh: wo.applied.boh || w.applied.boh,
          all: wo.applied.all != null ? wo.applied.all : w.applied.all,
        } : w.applied;
        return {
          ...w,
          subtitle: wo.subtitle != null ? wo.subtitle : w.subtitle,
          applied,
          skills: Array.isArray(wo.skills) ? wo.skills : w.skills,
          note: wo.note != null ? wo.note : w.note,
          warn: wo.warn != null ? wo.warn : w.warn,
        };
      }),
    };
  });
}

function ChecklistEditor({ card, week, onSave, onClose }) {
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(week)));
  const [busy, setBusy] = useState(false);
  const skills = draft.skills || [];
  const setSkill = (i, label) => setDraft({ ...draft, skills: skills.map((s, j) => j === i ? { ...s, label } : s) });
  const move = (i, d) => {
    const j = i + d; if (j < 0 || j >= skills.length) return;
    const n = skills.slice(); [n[i], n[j]] = [n[j], n[i]];
    setDraft({ ...draft, skills: n });
  };
  const del = (i) => {
    if (!window.confirm(`Remove "${skills[i].label}"? Anyone who has ticked it will lose that tick.`)) return;
    setDraft({ ...draft, skills: skills.filter((_, j) => j !== i) });
  };
  /* ⚠️ A NEW ID, NEVER A REUSED ONE. Reusing a deleted skill's id would hand a
     new skill somebody else's completed tick. */
  const add = () => setDraft({ ...draft, skills: [...skills, { id: `sk-${draft.id}-${Date.now()}`, label: "New skill" }] });
  const setSide = (side, field, val) => setDraft({
    ...draft,
    applied: { ...draft.applied, [side]: { ...(draft.applied[side] || { lead: "", points: [] }), [field]: val } },
  });

  const box = { width: "100%", borderRadius: 9, border: "1px solid #E5E7EB", padding: "9px 11px",
    fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" };

  return (
    <div style={{ background: cardSurface(), border: `2px solid ${ACCENT}`, borderRadius: 16, ...accentEdge(ACCENT, 3), boxShadow: CARD_3D, padding: 18, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
        <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, flex: 1 }}>Editing {card.title} · {draft.title}</h3>
        <button onClick={onClose} style={{ border: "1px solid #E5E7EB", background: "#fff", borderRadius: 8,
          padding: "7px 13px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
        {/* Blank point lines are dropped HERE, once, rather than on every
            keystroke — see the note on SideEdit. Filtering while typing made it
            impossible to ever create a second point, because the empty line
            Enter produces was stripped before it could be typed into. */}
        <button disabled={busy} onClick={async () => {
          setBusy(true);
          const clean = { ...draft, applied: { ...draft.applied } };
          ["foh", "boh"].forEach((k) => {
            const side = clean.applied[k];
            if (side && Array.isArray(side.points)) {
              clean.applied[k] = { ...side, points: side.points.filter((l) => String(l).trim()) };
            }
          });
          await onSave(clean);
          setBusy(false);
        }}
          style={{ border: "none", background: ACCENT, color: "#fff", borderRadius: 8, padding: "7px 15px",
            fontSize: 13, fontWeight: 700, cursor: busy ? "default" : "pointer", fontFamily: "inherit" }}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      <p style={{ fontSize: 12.5, color: "#6B7280", margin: "0 0 14px" }}>
        Changes here replace the printed sheet for everyone. Skills you rename keep their ticks; skills you delete lose them.
      </p>

      <div style={{ ...eyebrowStyle, color: ACCENT, marginBottom: 5 }}>Subtitle</div>
      <input value={draft.subtitle || ""} onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })} style={{ ...box, marginBottom: 14 }} />

      <div style={{ ...eyebrowStyle, color: ACCENT, marginBottom: 8 }}>Application Points: Daily</div>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 10 }}>
        <SideEdit tag="Front of House" sideKey="foh" side={draft.applied.foh} setSide={setSide} box={box} />
        <SideEdit tag="Back of House" sideKey="boh" side={draft.applied.boh} setSide={setSide} box={box} />
      </div>
      <textarea value={draft.applied.all || ""} rows={3} onChange={(e) => setDraft({ ...draft, applied: { ...draft.applied, all: e.target.value } })}
        placeholder="The line that applies to everyone (leave blank for none)" style={{ ...box, marginBottom: 16, resize: "vertical" }} />

      <div style={{ ...eyebrowStyle, color: ACCENT, marginBottom: 8 }}>Skills Checklist</div>
      <div style={{ display: "grid", gap: 6, marginBottom: 8 }}>
        {skills.map((sk, i) => (
          <div key={sk.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input value={sk.label} onChange={(e) => setSkill(i, e.target.value)} style={{ ...box, flex: 1 }} />
            <button onClick={() => move(i, -1)} disabled={i === 0} style={{ border: "1px solid #E5E7EB", background: "#fff", borderRadius: 7, padding: "7px 9px", cursor: "pointer", fontFamily: "inherit" }}>▲</button>
            <button onClick={() => move(i, 1)} disabled={i === skills.length - 1} style={{ border: "1px solid #E5E7EB", background: "#fff", borderRadius: 7, padding: "7px 9px", cursor: "pointer", fontFamily: "inherit" }}>▼</button>
            <button onClick={() => del(i)} style={{ border: "1px solid #FECACA", background: "#fff", color: "#B91C1C", borderRadius: 7, padding: "7px 10px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>Delete</button>
          </div>
        ))}
      </div>
      <button onClick={add} style={{ border: `1px dashed ${ACCENT}`, background: "#FAF7FD", color: "#6B21A8",
        borderRadius: 9, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginBottom: 16 }}>
        + Add a skill
      </button>

      <div style={{ ...eyebrowStyle, color: ACCENT, marginBottom: 5 }}>Warning shown above the checklist</div>
      <textarea value={draft.warn || ""} rows={2} onChange={(e) => setDraft({ ...draft, warn: e.target.value })}
        placeholder="Leave blank for none" style={{ ...box, marginBottom: 12, resize: "vertical" }} />
      <div style={{ ...eyebrowStyle, color: ACCENT, marginBottom: 5 }}>Note shown at the bottom</div>
      <textarea value={draft.note || ""} rows={2} onChange={(e) => setDraft({ ...draft, note: e.target.value })}
        placeholder="Leave blank for none" style={{ ...box, resize: "vertical" }} />
    </div>
  );
}


function AppliedPoints({ applied }) {
  if (!applied) return null;
  const Side = ({ tag, side }) => side ? (
    <div style={{ flex: "1 1 260px" }}>
      <div style={{ ...eyebrowStyle, color: ACCENT, marginBottom: 4 }}>{tag}</div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: "#374151", marginBottom: 6, lineHeight: 1.45 }}>{side.lead}</div>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {(side.points || []).map((pt, i) => (
          <li key={i} style={{ fontSize: 13, color: "#4B5563", marginBottom: 3, lineHeight: 1.45 }}>{pt}</li>
        ))}
      </ul>
    </div>
  ) : null;
  return (
    /* ⚠️ READ-ONLY BY INSTRUCTION — "Application Points does not need to have
       checkoff options, it can be read only." No checkbox appears here, so
       nobody can mistake reading it for having done it. */
    /* Application Points sits INSIDE the card above, so it takes the SOFT
       shadow. The full one would read as a second card floating on the first
       rather than a panel within it. */
    <div style={{ backgroundColor: "#FAF7FD", backgroundImage: cardSurface(ACCENT, 0.4), border: "1px solid #E9DDF5", borderRadius: 12, padding: "13px 15px", marginBottom: 12, ...accentEdge(ACCENT, 3), boxShadow: CARD_3D_SOFT }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: "#6B21A8", marginBottom: 10 }}>APPLICATION POINTS: DAILY</div>
      <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
        <Side tag="Front of House" side={applied.foh} />
        <Side tag="Back of House" side={applied.boh} />
      </div>
      {applied.all && (
        <div style={{ fontSize: 13, color: "#4B5563", lineHeight: 1.5, marginTop: 12, paddingTop: 10, borderTop: "1px solid #E9DDF5" }}>
          {applied.all}
        </div>
      )}
    </div>
  );
}

function SkillsCard({ card, name, record, onToggle, onNote, busy, mayEdit, onEdit }) {
  const [openWeek, setOpenWeek] = useState(card.weeks[0] && card.weeks[0].id);
  const ticks = (record && record.skills) || {};
  const notes = (record && record.notes) || {};
  return (
    /* The Leadership 101 card. The Senior Trainer card 100 lines up already had
       the raised look; these two are the same thing on the same screen and only
       one of them was ever lifted. */
    <div style={{ backgroundColor: "#fff", backgroundImage: cardSurface(ACCENT, 0.5), border: "1px solid #EAE4F2", borderRadius: 16, padding: 18, marginBottom: 16, ...accentEdge(ACCENT, 3), boxShadow: CARD_3D }}>
      <h2 style={{ fontSize: 19, fontWeight: 800, margin: "0 0 3px", color: "#1F2937" }}>{card.title}</h2>
      <p style={{ fontSize: 13.5, color: "#6B7280", margin: "0 0 14px", lineHeight: 1.45 }}>{card.blurb}</p>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {card.weeks.map((w) => {
          const done = (w.skills || []).filter((sk) => ticks[sk.id]).length;
          return (
            <button key={w.id} onClick={() => setOpenWeek(openWeek === w.id ? null : w.id)}
              style={{ border: "none", borderRadius: 9, padding: "8px 13px", cursor: "pointer", fontSize: 13, fontWeight: 700,
                background: openWeek === w.id ? ACCENT : "#F3EEF9", color: openWeek === w.id ? "#fff" : "#6B21A8" }}>
              {w.title} · {done}/{(w.skills || []).length}
            </button>
          );
        })}
      </div>

      {card.weeks.filter((w) => w.id === openWeek).map((w) => (
        <div key={w.id}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13, color: "#6B7280", flex: 1 }}>{w.subtitle}</div>
            {/* Bri, HR and Executive Directors only. A student never sees this,
                so the card reads exactly as before for everyone else. */}
            {mayEdit && (
              <button onClick={() => onEdit(w.id)}
                style={{ border: `1px solid ${ACCENT}`, background: "#fff", color: "#6B21A8", borderRadius: 8,
                  padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                Edit this week
              </button>
            )}
          </div>
          <AppliedPoints applied={w.applied} />

          {/* ⚠️ Her cash-management warning renders BEFORE the checklist, not as
              a footnote. A trainer who ticks "counting registers" and concludes
              they may now do it alone is the exact misreading it prevents. */}
          {w.warn && (
            <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: 10,
              padding: "10px 13px", fontSize: 13, fontWeight: 600, lineHeight: 1.45, marginBottom: 12 }}>
              {w.warn}
            </div>
          )}

          <div style={{ ...eyebrowStyle, color: ACCENT, marginBottom: 8 }}>Skills Checklist</div>
          <div style={{ display: "grid", gap: 6, marginBottom: 14 }}>
            {(w.skills || []).map((sk) => {
              const on = !!ticks[sk.id];
              return (
                <button key={sk.id} onClick={() => onToggle(sk.id)} disabled={busy}
                  style={{ display: "flex", alignItems: "center", gap: 11, textAlign: "left", width: "100%",
                    background: on ? "#F0FDF4" : "#fff", border: `1px solid ${on ? "#86EFAC" : "#E5E7EB"}`,
                    borderRadius: 10, padding: "11px 13px", cursor: busy ? "default" : "pointer", fontFamily: "inherit" }}>
                  <span style={{ width: 21, height: 21, borderRadius: 6, flexShrink: 0, display: "flex",
                    alignItems: "center", justifyContent: "center",
                    background: on ? "#16A34A" : "#fff", border: `1.5px solid ${on ? "#16A34A" : "#D1D5DB"}` }}>
                    {on && <Check size={14} color="#fff" strokeWidth={3} />}
                  </span>
                  <span style={{ fontSize: 14, color: "#1F2937", fontWeight: on ? 600 : 500 }}>{sk.label}</span>
                </button>
              );
            })}
          </div>

          {/* Her ask: "a notes option at the bottom for them to give clarification
              anywhere needed to communicate with me." Saved per week, not per
              skill — it is a message to Bri, not an annotation. */}
          {/* ⚠️ THE COURSE OWNER, NOT A LITERAL. This is a message to whoever runs the
              course, which is Bri here and somebody else at a store that is not this
              one. The comment above keeps her name because it is provenance. */}
          <div style={{ ...eyebrowStyle, color: ACCENT, marginBottom: 6 }}>Notes for {courseOwnerLabel()}</div>
          <textarea
            defaultValue={notes[w.id] || ""}
            onBlur={(e) => onNote(w.id, e.target.value)}
            placeholder="Anything you want to explain, ask about, or flag from this week."
            rows={3}
            style={{ width: "100%", borderRadius: 10, border: "1px solid #E5E7EB", padding: "10px 12px",
              fontSize: 14, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />

          {w.note && (
            <div style={{ fontSize: 12.5, color: "#6B7280", lineHeight: 1.5, marginTop: 10 }}>{w.note}</div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function SkillsChecklists({ name, only = null, week = null }) {
  const [record, setRecord] = useState(null);
  const [busy, setBusy] = useState(false);
  /* Content overrides, loaded once. `null` while loading so the cards never
     flash the seed and then rewrite themselves in front of somebody. */
  const [content, setContent] = useState(null);
  const [editing, setEditing] = useState(null);   // { cardId, weekId }
  // The person's record read failed → ticks and notes refuse until a clean
  // reload. Their whole checklist lives in this one key; writing off the
  // empty fallback would replace every tick they have ever earned.
  const [recFailed, setRecFailed] = useState(false);
  const recFailedRef = useRef(false);
  const mayEdit = canEditSkills();
  const key = name ? skillsKey(name) : null;

  useEffect(() => {
    let live = true;
    (async () => {
      if (!key) { if (live) setRecord({ skills: {}, notes: {} }); return; }
      /* kvGetResult, not kvGet — kvGet returns null for a failed read as well
         as an empty one, and it never throws (the old catch was dead code). */
      const r = await kvGetResult(key);
      if (!live) return;
      recFailedRef.current = !r.ok;
      setRecFailed(!r.ok);
      const v = r.value;
      setRecord(v && typeof v === "object" ? { skills: v.skills || {}, notes: v.notes || {} } : { skills: {}, notes: {} });
    })();
    return () => { live = false; };
  }, [key]);

  // The content-overrides read failed → week editing refuses. The editor's
  // draft is seeded from what is on screen, and after a failed read that is
  // the RAW SEED — saveWeek's re-read protects the OTHER cards, but the card
  // being edited would still have its stored week replaced with seed text.
  const contentFailedRef = useRef(false);
  useEffect(() => {
    let live = true;
    (async () => {
      // kvGetResult, not kvGet — a failed read is not "no overrides yet".
      const r = await kvGetResult(SKILLS_CONTENT_KEY);
      if (!live) return;
      contentFailedRef.current = !r.ok;
      setContent(r.value && typeof r.value === "object" ? r.value : {});
    })();
    return () => { live = false; };
  }, []);

  /* ★ `only` AND `week` NARROW WHAT IS SHOWN, AND NOTHING ELSE (Bri, Jul 30
     2026: "Only Leadership 101 Skills should be accessed through the entrance
     into the W2 class").
     ⚠️ THE STORAGE IS UNTOUCHED BY THIS. Ticks still save to the same
     `gcfcr-skills-<slug>-v1` record whichever screen they were made on, so a
     skill ticked inside a class is the same tick Team Training shows. Filtering
     the VIEW and filtering the RECORD are different things and only the first
     is happening here.
     ⚠️ FILTERS AFTER the content merge, so Bri's saved edits still apply to the
     week a class shows. */
  const cards = useMemo(() => {
    const merged = mergeChecklistContent(CHECKLIST_CARDS, content);
    const picked = only ? merged.filter((c) => c.id === only) : merged;
    if (!week) return picked;
    return picked
      .map((c) => ({ ...c, weeks: (c.weeks || []).filter((w) => w.id === week) }))
      .filter((c) => (c.weeks || []).length);
  }, [content, only, week]);

  /* ⚠️ READ-MERGE-WRITE THE WHOLE KEY, and re-read immediately before writing.
     Bri and a director could be editing different weeks at the same time; a
     blind write of one week's draft over the stored object would drop the
     other's work with nothing on screen to say so. */
  const saveWeek = async (cardId, weekDraft) => {
    if (contentFailedRef.current) {
      window.alert("The stored checklist content never loaded, so editing is off — saving now would replace this week with the starter text. Check the wifi and refresh.");
      return;
    }
    /* ⚠️ kvGetResult: the old catch beside kvGet was dead (kvGet reports
       failure by returning null, not throwing), so a FAILED re-read became
       {} and the write below replaced every other card's stored weeks with
       just this one — the exact outcome the comment above warns about. */
    const r = await kvGetResult(SKILLS_CONTENT_KEY);
    if (!r.ok) {
      window.alert("That didn't save — the stored content couldn't be read, and saving blind would erase other weeks. Check the connection and try again; your changes are still on screen.");
      return;
    }
    const stored = (r.value && typeof r.value === "object") ? r.value : {};
    const next = {
      ...stored,
      [cardId]: {
        ...(stored[cardId] || {}),
        [weekDraft.id]: {
          subtitle: weekDraft.subtitle, applied: weekDraft.applied,
          skills: weekDraft.skills, note: weekDraft.note, warn: weekDraft.warn,
        },
      },
    };
    // kvSet returns false on refusal, never throws — the old catch was dead
    // and the editor closed claiming saved.
    if (!(await kvSet(SKILLS_CONTENT_KEY, next))) {
      window.alert("That didn't save. Check your connection and try again — your changes are still on screen.");
      return;
    }
    setContent(next); setEditing(null);
  };

  /* ⚠️ COMPUTED HERE, NOT FROM A setState UPDATER — the same fault that lost
     every prep-work attachment on Jul 27. `next` must exist before it is saved. */
  const write = async (mutate) => {
    if (!key || !record) return;
    if (recFailedRef.current) {
      window.alert("This checklist did not load, so ticking is off — one tick would save over every tick already earned. Check the wifi and refresh.");
      return;
    }
    setBusy(true);
    const next = mutate(record);
    setRecord(next);
    // kvSet returns false on refusal, it never throws — the old catch was
    // dead and a refused tick stayed on screen looking saved.
    if ((await kvSet(key, next)) === false) {
      setRecord(record);
      window.alert("That did not save — check the wifi and tap it again.");
    }
    setBusy(false);
  };

  if (!name) {
    return <div style={{ background: "#fff", borderRadius: 14, padding: 18, fontSize: 14, color: "#6B7280" }}>
      Sign in to see your checklists.
    </div>;
  }
  if (!record || content === null) return <div style={{ fontSize: 14, color: "#6B7280", padding: 18 }}>Loading…</div>;

  if (editing) {
    const card = cards.find((c) => c.id === editing.cardId);
    const week = card && card.weeks.find((w) => w.id === editing.weekId);
    if (card && week) {
      return <ChecklistEditor card={card} week={week}
        onSave={(draft) => saveWeek(card.id, draft)} onClose={() => setEditing(null)} />;
    }
  }

  return (
    <div>
      {recFailed && (
        <div style={{ background: "#FFFBEB", border: "1.5px solid #F59E0B", color: "#92400E", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
          This checklist did not load, so ticking is off — a tick now would save
          over every tick already earned. Check the wifi and refresh the page.
        </div>
      )}
      {cards.map((card) => (
        <SkillsCard key={card.id} card={card} name={name} record={record} busy={busy}
          mayEdit={mayEdit} onEdit={(weekId) => setEditing({ cardId: card.id, weekId })}
          onToggle={(skillId) => write((r) => ({ ...r, skills: { ...r.skills, [skillId]: !r.skills[skillId] } }))}
          onNote={(weekId, text) => write((r) => ({ ...r, notes: { ...r.notes, [weekId]: text } }))} />
      ))}
    </div>
  );
}
