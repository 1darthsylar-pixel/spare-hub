/* ============================================================================
   L101Print.jsx — Gate City Hub

   A printable copy of an in-person Leadership 101 week (Bri, Aug 2 2026:
   "There may be times when internet is spotty, the Hub is down, or someone
   simply doesn't have a device… a printable version that shows all activities
   expanded to follow along on a hard copy"). W2 and W3 only, the two weeks
   taught in a room.

   TWO VARIANTS, per her Aug 3 answer — "Student version could hide just the
   instructor notes":
     instructor — everything, plus the per-item instructor notes and any
                  matching-game teaching notes.
     student    — byte-for-byte the same class content with those two removed.
                  Nothing else is dropped.

   ★ IT READS THE SAME CONTENT THE CLASS DOES, THROUGH useEditableCourse.
   That is the whole correctness requirement of this file. The week seeds in
   L101W2.js / L101W3.js are only a STARTING POINT; the moment Bri saves an
   edit, the class renders from `ld:l101:content:<week>` instead. A print view
   built off the seed would look perfect and quietly hand out a version of the
   class she stopped teaching weeks ago — and nobody in the room would know,
   because the printout is the only thing they can see.

   ★ THE STUDENT COPY MUST NEVER CARRY AN ANSWER. `keyPoints` on a matching
   game are teaching notes, and the class itself withholds them until a
   student has finished matching. Printing them would hand over the answers
   before the exercise starts. Quiz choices print; which one is correct does
   not. Written answers (`qa`) never had a stored key by design — see the
   warning at the top of L101W3.js — so there is nothing to leak there.

   Printing is the BROWSER's print, deliberately, not a generated PDF. It
   works on Bri's iPad, it needs no dependency, and it can never drift from
   what the class actually contains.
   ============================================================================ */
import React, { useEffect, useState } from "react";
import { kvGetResult } from "./store.js";
import { useEditableCourse } from "./L101Editor.jsx";
import { inotesKey } from "./l101Instructors.js";

/* ── pure helpers, module level so nothing can read them mid-render ── */
const asArray = (v) => (Array.isArray(v) ? v : []);
const asText = (v) => (typeof v === "string" ? v : "");
/* Writing space on paper. A printed activity with no room to answer is a
   handout, not a workbook, and this is a workbook. */
const LINES = { qa: 5, assign: 5, walk: 2, match: 1, upload: 3 };
const linesFor = (type) => LINES[type] || 0;

const S = {
  page: { background: "#fff", color: "#111", fontFamily: "Georgia, 'Times New Roman', serif", maxWidth: 780, margin: "0 auto", padding: "24px 28px 60px" },
  h1: { fontSize: 26, fontWeight: 700, margin: "0 0 2px" },
  sub: { fontSize: 13, color: "#555", margin: "0 0 22px" },
  sec: { fontSize: 18, fontWeight: 700, margin: "26px 0 10px", paddingBottom: 5, borderBottom: "2px solid #111" },
  item: { margin: "0 0 18px", breakInside: "avoid", pageBreakInside: "avoid" },
  itemTitle: { fontSize: 15, fontWeight: 700, margin: "0 0 4px" },
  body: { fontSize: 13.5, lineHeight: 1.5, whiteSpace: "pre-wrap", margin: "0 0 6px", color: "#222" },
  meta: { fontSize: 11.5, color: "#666", fontStyle: "italic", margin: "0 0 4px" },
  rule: { borderBottom: "1px solid #999", height: 22 },
  inote: { border: "1px solid #B58A2B", background: "#FDF6E7", borderRadius: 6, padding: "8px 10px", margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.45, whiteSpace: "pre-wrap" },
  inoteHead: { fontSize: 10.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "#8A6A1F", marginBottom: 4 },
  col: { border: "1px solid #999", padding: "5px 8px", fontSize: 13, verticalAlign: "top" },
};

/* Blank ruled lines to write on. */
function WriteLines({ n }) {
  if (!n) return null;
  return (
    <div style={{ margin: "6px 0 0" }}>
      {Array.from({ length: n }, (_, i) => <div key={i} style={S.rule} />)}
    </div>
  );
}

/* One activity. Every type L101Week can render is handled here; a type this
   file does not know still prints its title and prompt rather than vanishing,
   because a silently missing activity is worse in a room than an ugly one. */
function PrintItem({ item, showNotes, note }) {
  const t = item.type;
  return (
    <div style={S.item}>
      <div style={S.itemTitle}>
        {item.title || "Activity"}
        {item.timeLabel ? <span style={{ fontWeight: 400, fontSize: 12, color: "#666" }}> · {item.timeLabel}</span> : null}
      </div>

      {asText(item.note) ? <div style={S.body}>{item.note}</div> : null}
      {asText(item.intro) ? <div style={S.body}>{item.intro}</div> : null}
      {asText(item.brief) ? <div style={S.body}>{item.brief}</div> : null}
      {asText(item.prompt) ? <div style={S.body}>{item.prompt}</div> : null}
      {asText(item.instructions) ? <div style={S.body}>{item.instructions}</div> : null}
      {asText(item.requirement) ? <div style={S.body}>{item.requirement}</div> : null}

      {t === "watch" && (
        <div style={S.meta}>Video activity. Watch this one in the Hub; it cannot be printed.</div>
      )}

      {asArray(item.images).length > 0 && (
        <div style={S.meta}>{asArray(item.images).length} image{asArray(item.images).length === 1 ? "" : "s"} in the Hub version.</div>
      )}

      {/* qa / quiz question lists */}
      {asArray(item.questions).map((q, i) => (
        <div key={i} style={{ margin: "8px 0 0" }}>
          <div style={{ ...S.body, marginBottom: 2 }}>{i + 1}. {asText(q.q) || asText(q)}</div>
          {asArray(q.choices).map((c, ci) => (
            <div key={ci} style={{ fontSize: 13, margin: "0 0 1px 18px" }}>◦ {asText(c)}</div>
          ))}
          {asArray(q.choices).length === 0 ? <WriteLines n={3} /> : null}
        </div>
      ))}

      {/* matching game: both columns, unpaired, so it is still an exercise */}
      {asArray(item.pairs).length > 0 && (
        <table style={{ borderCollapse: "collapse", width: "100%", margin: "8px 0 0" }}>
          <tbody>
            {asArray(item.pairs).map((p, i) => (
              <tr key={i}>
                {/* A pair may carry a picture. Paper cannot fetch it, so the
                    printout SAYS one is there rather than printing a row that
                    silently makes no sense without it. */}
                <td style={{ ...S.col, width: "62%" }}>
                  {i + 1}. {asText(p.def)}
                  {p && p.img ? <span style={{ color: "#666", fontStyle: "italic" }}> (see the picture in the Hub)</span> : null}
                </td>
                <td style={{ ...S.col, width: "38%" }}>{showNotes ? asText(p.answer) : " "}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* walkthrough areas */}
      {asArray(item.areas).map((area) => (
        <div key={area.id || area.label} style={{ margin: "8px 0 0" }}>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>{asText(area.label)}</div>
          {asText(area.note) ? <div style={S.meta}>{area.note}</div> : null}
          {asArray(area.rows).map((row) => (
            <div key={row.id || row.label} style={{ margin: "4px 0 0" }}>
              <div style={{ fontSize: 13 }}>{asText(row.label)}</div>
              {asText(row.detail) ? <div style={S.meta}>{row.detail}</div> : null}
              <WriteLines n={linesFor("walk")} />
            </div>
          ))}
        </div>
      ))}

      {asText(item.outro) ? <div style={{ ...S.body, marginTop: 6 }}>{item.outro}</div> : null}

      {/* space to answer, for the types that ask for one */}
      {asArray(item.questions).length === 0 && asArray(item.areas).length === 0
        ? <WriteLines n={linesFor(t)} /> : null}

      {/* instructor-only material */}
      {showNotes && asArray(item.keyPoints).length > 0 && (
        <div style={S.inote}>
          <div style={S.inoteHead}>Teaching notes</div>
          {asArray(item.keyPoints).map((k, i) => <div key={i}>· {asText(k)}</div>)}
        </div>
      )}
      {showNotes && asText(note && note.text) ? (
        <div style={S.inote}>
          <div style={S.inoteHead}>Instructor notes</div>
          {note.text}
        </div>
      ) : null}
    </div>
  );
}

export default function L101Print({ weekId, weekLabel, seed, variant = "instructor", onVariant, onBack }) {
  const showNotes = variant === "instructor";
  const { course, loadFailed } = useEditableCourse(weekId, seed);
  const [notes, setNotes] = useState({});
  const [notesFailed, setNotesFailed] = useState(false);

  /* Instructor notes live in their own record, so the student copy never even
     fetches them. Their absence is not an error on that path. */
  useEffect(() => {
    let alive = true;
    if (!showNotes) { setNotes({}); setNotesFailed(false); return () => { alive = false; }; }
    (async () => {
      const r = await kvGetResult(inotesKey(weekId));
      if (!alive) return;
      if (!r.ok) { setNotesFailed(true); return; }
      setNotes(r.value && typeof r.value === "object" ? r.value : {});
    })();
    return () => { alive = false; };
  }, [weekId, showNotes]);

  const sections = asArray(course && course.sections);

  return (
    <div style={S.page}>
      <style>{`@media print {
        .l101-print-bar { display: none !important; }
        @page { margin: 14mm; }
      }`}</style>

      <div className="l101-print-bar" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 18, fontFamily: "system-ui, -apple-system, sans-serif" }}>
        {onBack && (
          <button onClick={onBack} style={{ fontSize: 13, fontWeight: 600, padding: "8px 14px", borderRadius: 8, border: "1px solid #ccc", background: "#fff", cursor: "pointer" }}>← Back</button>
        )}
        <button onClick={() => window.print()} style={{ fontSize: 13, fontWeight: 700, padding: "8px 16px", borderRadius: 8, border: "none", background: "#1B3A5C", color: "#fff", cursor: "pointer" }}>Print</button>
        {/* The copy is switched HERE rather than by opening a different button
            on the portal, so you can hold one up against the other without
            navigating away and losing your place. */}
        {onVariant && (
          <span style={{ display: "inline-flex", border: "1px solid #ccc", borderRadius: 8, overflow: "hidden" }}>
            {["instructor", "student"].map((v) => (
              <button key={v} onClick={() => onVariant(v)}
                style={{ fontSize: 12.5, fontWeight: 700, padding: "8px 12px", border: "none", cursor: "pointer",
                  background: variant === v ? "#1B3A5C" : "#fff", color: variant === v ? "#fff" : "#5B6474" }}>
                {v === "instructor" ? "Instructor" : "Student"}
              </button>
            ))}
          </span>
        )}
        <span style={{ fontSize: 12.5, color: "#666" }}>
          {showNotes ? "Includes instructor and teaching notes" : "Notes and answers removed"}
        </span>
      </div>

      {/* ⚠️ A FAILED CONTENT READ IS SAID OUT LOUD, NOT PRINTED AROUND.
          useEditableCourse falls back to the seed when the stored week cannot
          be read. Printing that silently is the one outcome this file exists
          to prevent: a class full of people holding a version Bri retired. */}
      {loadFailed && (
        <div className="l101-print-bar" style={{ border: "2px solid #B42318", background: "#FEF3F2", color: "#912018", borderRadius: 8, padding: "10px 12px", marginBottom: 16, fontSize: 13.5, fontFamily: "system-ui, sans-serif", fontWeight: 600 }}>
          This class could not be loaded, so what follows is the built-in starting version, not your saved one. Do not print it. Check the connection and reopen.
        </div>
      )}
      {notesFailed && (
        <div className="l101-print-bar" style={{ border: "1px solid #B58A2B", background: "#FDF6E7", color: "#8A6A1F", borderRadius: 8, padding: "9px 12px", marginBottom: 16, fontSize: 13, fontFamily: "system-ui, sans-serif", fontWeight: 600 }}>
          Instructor notes could not be loaded, so this copy is missing them. Everything else is correct.
        </div>
      )}

      <h1 style={S.h1}>{asText(course && course.title) || weekLabel || weekId}</h1>
      <div style={S.sub}>
        Leadership 101{course && course.n ? ` · Week ${course.n}` : ""} · {showNotes ? "Instructor copy" : "Student copy"}
      </div>

      {sections.length === 0 ? (
        <div style={S.body}>This week has no sections to print.</div>
      ) : sections.map((sec) => (
        <section key={sec.id || sec.title}>
          <h2 style={S.sec}>{asText(sec.title)}</h2>
          {asArray(sec.items).map((item) => (
            <PrintItem key={item.id} item={item} showNotes={showNotes} note={notes[item.id]} />
          ))}
        </section>
      ))}
    </div>
  );
}
