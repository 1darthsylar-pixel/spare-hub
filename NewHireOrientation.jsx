import React, { useState, useEffect, useRef } from "react";
/* The shared raised look and accent edge — see cardStyle.js. */
import { CARD_3D, accentEdge, ACCENT_NEUTRAL } from "./cardStyle.js";
import { kvGet, kvGetResult, kvSet } from "./store.js";
import { loadHRTeam } from "./HRConsole.jsx";

/**
 * NewHireOrientation.jsx — Gate City Hub · New-Hire Orientation
 * ---------------------------------------------------------------------------
 * Hannah's spec (Jul 22 2026): "A checklist I or another facilitator runs during
 * orientation is the plan. Lets add 'fill in the blank' question at the end so
 * that we can put the team member(s) names in the blank. From there, let's place
 * a completion certificate in their file." — then clarified the certificate is
 * "A completion record", i.e. a dated entry in the file, not a printable cert.
 *
 * Three parts:
 *   1. RUN   — facilitator works down the checklist, ticking items.
 *   2. WHO   — picks the attendees from the roster. NOT a free-text blank: she
 *              wrote "team member(s)" (plural), orientation runs several hires
 *              at once, and typed names don't match roster spelling reliably.
 *   3. FILE  — writes ONE completion entry into EACH attendee's HR file.
 *
 * The checklist CONTENT is editable in-app and lives in KV. Hannah's agenda only
 * ever existed as a phone photo that was too large to transmit, so rather than
 * transcribe it (and own every future edit), she types it in herself and the
 * SEED below is only a starting scaffold.
 *
 * ⚠️ KV-OVERRIDES-SEED: loadData uses stored KV when non-empty, else SEED. Once
 * anyone saves an edit, changing SEED in code does nothing to the live tile.
 * To reset seeded content you must bump STORE_KEY or use "Restore starter list".
 * ---------------------------------------------------------------------------
 */

const STORE_KEY = "gc-orientation-v1";        // the checklist itself (editable)
const LOG_KEY = "gc-orientation-log-v1";      // past sessions, newest first
const HR_FILES_KEY = "gcfcr-hr-files";        // HR Console's file entries
const HR_STATUS_KEY = "gcfcr-hr-status";      // to drop terminated people

const C = {
  navy: "#14243D", ink: "#14243D", muted: "#5b6b82", red: "#E51636",
  line: "#E7E2D8", paper: "#F5F2EC", card: "#fff", good: "#1E9E57", gold: "#C9A24B",
};

// Hannah's orientation checklist, as she wrote it (Slack, Jul 22 2026). Kept in
// her order and her wording — she owns this content and can restructure it in
// Edit checklist. Left as one section because that's how she gave it; splitting
// the compound items (the apps in 5, the topics in 7) is hers to do if she wants
// to tick them off individually.
//
// ⚠️ KV-OVERRIDES-SEED: if anyone has already saved an edit, this SEED will not
// appear — the stored list wins. "Restore starter list" is the way back to it.
const SEED = {
  sections: [
    { id: "s1", title: "New Hire Orientation", items: [
      { id: "i1", text: "Train team member on how to clock in and give them their personal clock-in PIN" },
      { id: "i2", text: "Have team member try on their uniform. They should wear this for the duration of orientation" },
      { id: "i3", text: "Measure and cut their belt" },
      { id: "i4", text: "Name tag placement" },
      /* ⚠️ "the Hub", not this store's app name. SEED is module level and is also
         a STORED-DATA seed, so it must stay plain strings — a getter read here
         would capture the code default before saved settings load. Editable in
         Edit checklist either way. */
      { id: "i5", text: "Apps: login and train on CFA Home, Pathway (download), HS Team, Slack, and the Hub" },
      { id: "i6", text: "Show team members how to find our leadership team, order uniforms, and view setups all on the hub" },
      { id: "i7", text: "Go over breakfast policy, team member appearance (using the poster in BOH), and our point system" },
      { id: "i8", text: "Have them watch the orientation pathway plan (3 videos)" },
      { id: "i9", text: "Watch the Operator's introduction video" },
      { id: "i10", text: "Tour. Share code to the kitchen door. Introduce the team member to the team" },
      { id: "i11", text: "Time for Q and A" },
    ] },
  ],
};

const uid = (p) => p + Math.random().toString(36).slice(2, 8);
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function hydrate(raw) {
  if (!raw || !Array.isArray(raw.sections)) return SEED;
  const sections = raw.sections
    .filter((s) => s && typeof s === "object")
    .map((s) => ({
      id: s.id || uid("s"),
      title: String(s.title || "Untitled"),
      items: Array.isArray(s.items)
        ? s.items.filter(Boolean).map((i) => ({ id: i.id || uid("i"), text: String(i.text || "") })).filter((i) => i.text)
        : [],
    }));
  return sections.length ? { sections } : SEED;
}

/* Result-style: ok:false means the read FAILED — the checklist may exist and
   just could not be fetched, so editing must refuse or the seed would be
   saved over Hannah's authored list. kvGet/kvSet never throw; the old
   try/catch pair here was dead code. */
async function loadData() {
  const r = await kvGetResult(STORE_KEY);
  return { ok: r.ok, data: hydrate(r.value) };
}
async function saveData(d) { return (await kvSet(STORE_KEY, d)) !== false; }

export default function NewHireOrientation({ user = {}, tier = 1 }) {
  const [data, setData] = useState(null);
  const [checked, setChecked] = useState({});
  const [editing, setEditing] = useState(false);
  const [team, setTeam] = useState([]);
  const [picked, setPicked] = useState([]);      // roster ids
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);          // {kind:"ok"|"err", text}
  const [log, setLog] = useState([]);

  // Hannah: "a checklist that any trained leader can use to facilitate new hire
  // orientation" — so this opens to leaders (tier 2), not directors only. NOTE:
  // the Hub has no "trained facilitator" flag, so this is ALL leaders. If that's
  // too wide, change this and the App.jsx registration back to 3.
  const canRun = tier >= 2;

  // storeFailed → checklist edits refuse (a save would write the seed over
  // Hannah's list). logFailed → the session-log write is skipped when filing
  // (a write off [] would truncate the 50-session history). Filing to the
  // personnel files has its own re-read guard below and stays open.
  const storeFailedRef = useRef(false);
  const logFailedRef = useRef(false);

  useEffect(() => { (async () => {
    const d = await loadData();
    storeFailedRef.current = !d.ok;
    setData(d.data);
    const logR = await kvGetResult(LOG_KEY);
    logFailedRef.current = !logR.ok;
    setLog(Array.isArray(logR.value) ? logR.value : []);
    try {
      const roster = await loadHRTeam();
      const status = (await kvGet(HR_STATUS_KEY)) || {};
      setTeam((roster || []).filter((m) => status[m.id] !== "terminated"));
    } catch { setTeam([]); }
  })(); }, []);

  if (!canRun) {
    return (
      <div style={{ padding: "34px 20px", textAlign: "center", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.navy, marginBottom: 6 }}>Leaders only</div>
        <div style={{ fontSize: 14, color: C.muted }}>Orientation is facilitated by a trained leader.</div>
      </div>
    );
  }
  if (!data) return <div style={{ padding: 30, textAlign: "center", color: C.muted, fontFamily: "system-ui" }}>Loading…</div>;

  const allItems = data.sections.flatMap((s) => s.items);
  const doneCount = allItems.filter((i) => checked[i.id]).length;
  const pct = allItems.length ? Math.round((doneCount / allItems.length) * 100) : 0;
  const allDone = allItems.length > 0 && doneCount === allItems.length;

  const persist = async (next) => {
    if (storeFailedRef.current) {
      setMsg({ kind: "err", text: "The checklist did not load, so edits are off — saving now would erase the stored list. Refresh and try again." });
      return;
    }
    const prev = data;
    setData(next);
    if (!(await saveData(next))) {
      setData(prev);
      setMsg({ kind: "err", text: "That change did not save — check the wifi and try again." });
    }
  };

  // ── edit helpers ──
  const setSection = (sid, patch) => persist({ sections: data.sections.map((s) => (s.id === sid ? { ...s, ...patch } : s)) });
  const addSection = () => persist({ sections: [...data.sections, { id: uid("s"), title: "New section", items: [] }] });
  const delSection = (sid) => persist({ sections: data.sections.filter((s) => s.id !== sid) });
  const addItem = (sid) => setSection(sid, { items: [...(data.sections.find((s) => s.id === sid)?.items || []), { id: uid("i"), text: "" }] });
  const setItem = (sid, iid, text) => setSection(sid, { items: data.sections.find((s) => s.id === sid).items.map((i) => (i.id === iid ? { ...i, text } : i)) });
  const delItem = (sid, iid) => setSection(sid, { items: data.sections.find((s) => s.id === sid).items.filter((i) => i.id !== iid) });
  const restore = () => { if (window.confirm("Replace the checklist with the starter list? Anything you've written here is lost.")) persist(SEED); };

  const togglePick = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  // ── the actual filing ──
  const fileCompletion = async () => {
    if (!picked.length) { setMsg({ kind: "err", text: "Pick who attended first." }); return; }
    setSaving(true); setMsg(null);
    const date = todayStr();
    const by = (user.name || "A facilitator") + (user.role ? " · " + user.role : "");
    const coveredLines = data.sections
      .map((s) => {
        const done = s.items.filter((i) => checked[i.id]).map((i) => "  • " + i.text);
        return done.length ? s.title + "\n" + done.join("\n") : null;
      })
      .filter(Boolean).join("\n");
    const skipped = allItems.filter((i) => !checked[i.id]);

    try {
      // Re-read IMMEDIATELY before writing rather than trusting anything held in
      // memory: HR Console writes this same key, and a stale copy here would
      // silently drop whatever it saved in the meantime.
      /* ★★ A FAILED READ USED TO REPLACE EVERY PERSONNEL FILE IN THE STORE.
         🐛 This was `(await kvGet(HR_FILES_KEY)) || {}`, and kvGet returns null
         for BOTH "nothing stored" and "the read failed". On a dropped read
         `current` became {}, `next` became {} plus the one to three people
         just oriented, and the whole-map write below replaced
         gcfcr-hr-files — every discipline entry, counseling record, point
         total and signature for all ~105 other people, gone. The facilitator
         saw "Filed to 2 files" and had no idea.
         ⇒ Refuse to file at all if the read did not succeed. Nothing is worth
         writing when we cannot see what we would be writing over. */
      const cur = await kvGetResult(HR_FILES_KEY);
      if (!cur.ok) {
        setMsg({ kind: "err", text: "Couldn't reach the team files, so nothing was filed. Check your connection and try again — no records were changed." });
        return;   // the `finally` below clears `saving`
      }
      const current = cur.value && typeof cur.value === "object" && !Array.isArray(cur.value) ? cur.value : {};
      const next = { ...current };
      const names = [];
      const touched = [];

      picked.forEach((pid) => {
        const person = team.find((m) => String(m.id) === String(pid));
        if (!person) return;
        names.push(person.name);
        const body =
          `Orientation completed on ${date}, facilitated by ${by}.\n\n` +
          `Covered ${doneCount} of ${allItems.length} checklist items.\n\n${coveredLines}` +
          (skipped.length ? `\n\nNot covered:\n${skipped.map((i) => "  • " + i.text).join("\n")}` : "");
        const entry = {
          id: "orientation-" + Date.now() + "-" + pid,
          title: "Orientation completed",
          area: "Orientation",
          source: "orientation",       // what puts this in the Orientation file group
          counseling: false,
          step: null,
          points: 0,
          needsPricing: false,         // nothing for HR to price — it isn't discipline
          date,
          body,
          by,
          sig: null,
          leaderSig: null,
          pendingSig: false,           // no signature is being requested
          history: [{ at: new Date().toISOString(), by, action: "created" }],
        };
        next[pid] = [entry, ...(next[pid] || [])];
        touched.push(String(pid));
      });

      /* ★ ONE WRITE PER PERSON, SERVER-MERGED — not one whole-map replace.
         `gcfcr-hr-files` is on the worker's MEMBER_ROW_MERGE list, so passing
         the member id makes /api/hr-store re-read the stored map and set only
         that person's row. Two leaders filing at the same time can no longer
         erase each other, which a whole-map write allowed even when both
         reads succeeded. The re-read above still matters: it supplies the
         person's EXISTING entries so this prepends instead of replacing. */
      for (const pid of touched) {
        const ok = await kvSet(HR_FILES_KEY, { [pid]: next[pid] }, pid);
        if (!ok) throw new Error("The file for " + (team.find((m) => String(m.id) === pid) || {}).name + " did not save.");
      }

      /* The session log is secondary — the files above are already in. But a
         write off a failed read would truncate the 50-session history to this
         one entry, so it is skipped (and said so) when the log never loaded,
         and the on-screen list only updates when the write lands. */
      let logNote = "";
      if (logFailedRef.current) {
        logNote = " The session log didn't load earlier, so this session was not added to it.";
      } else {
        const session = { at: new Date().toISOString(), date, by, names, covered: doneCount, total: allItems.length };
        const nextLog = [session, ...log].slice(0, 50);
        const logOk = await kvSet(LOG_KEY, nextLog);
        if (logOk === false) logNote = " The session log entry did not save.";
        else setLog(nextLog);
      }

      setMsg({ kind: "ok", text: `Filed to ${names.length} file${names.length === 1 ? "" : "s"}: ${names.join(", ")}.` + logNote });
      setChecked({});
      setPicked([]);
      setSearch("");
    } catch (e) {
      setMsg({ kind: "err", text: "Couldn't file it: " + (e && e.message ? e.message : "unknown error") + ". Nothing was saved — try again." });
    } finally { setSaving(false); }
  };

  // ── styles ──
  const wrap = { maxWidth: 640, margin: "0 auto", padding: "18px 16px 48px", fontFamily: "system-ui, -apple-system, sans-serif", color: C.ink };
  const card = { background: C.card, border: `1px solid ${C.line}`, ...accentEdge(ACCENT_NEUTRAL, 3), borderRadius: 16, padding: 16, boxShadow: CARD_3D, marginBottom: 12 };
  const btn = { border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, padding: "11px 16px", cursor: "pointer", fontFamily: "inherit" };
  const ghost = { ...btn, background: "#fff", color: C.navy, border: `1.5px solid ${C.line}` };
  const input = { width: "100%", fontFamily: "inherit", fontSize: 14, padding: "9px 11px", border: `1.5px solid ${C.line}`, borderRadius: 9, background: "#fff", color: C.ink, boxSizing: "border-box" };

  const shown = search.trim()
    ? team.filter((m) => m.name.toLowerCase().includes(search.trim().toLowerCase()))
    : team.slice(0, 8);

  return (
    <div style={wrap}>
      {/* Gradient masthead — matches the Team Site / L101 pages */}
      <div style={{ background: `linear-gradient(120deg, ${C.red} 0%, #B21230 30%, ${C.navy} 55%)`,
        borderRadius: 20, padding: "24px 22px", color: "#fff", position: "relative",
        overflow: "hidden", marginBottom: 14 }}>
        <div style={{ position: "absolute", right: -44, top: -44, width: 180, height: 180, borderRadius: "50%", background: "rgba(255,255,255,.09)" }} />
        <div style={{ position: "absolute", right: 48, bottom: -60, width: 124, height: 124, borderRadius: "50%", background: "rgba(255,255,255,.06)" }} />
        <div style={{ position: "absolute", left: -28, bottom: -46, width: 104, height: 104, borderRadius: "50%", background: "rgba(255,255,255,.05)" }} />
        <div style={{ position: "relative" }}>
          <div style={{ fontSize: 24 }}>👋</div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", color: "rgba(255,255,255,.8)", marginTop: 8 }}>New-Hire Onboarding</div>
          <h2 style={{ fontSize: 24, fontWeight: 800, margin: "4px 0 0", letterSpacing: "-.02em" }}>Orientation</h2>
          <div style={{ fontSize: 13.5, color: "rgba(255,255,255,.85)", marginTop: 4, lineHeight: 1.45 }}>
            Run the checklist, then file a completion record for everyone who attended.
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button style={{ ...(editing ? ghost : { ...btn, background: C.navy, color: "#fff" }), flex: 1 }} onClick={() => setEditing(false)}>Run orientation</button>
        <button style={{ ...(editing ? { ...btn, background: C.navy, color: "#fff" } : ghost), flex: 1 }} onClick={() => setEditing(true)}>Edit checklist</button>
      </div>

      {!editing && (
        <>
          <div style={{ ...card, paddingBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 700, color: C.muted, marginBottom: 6 }}>
              <span>{doneCount} of {allItems.length} covered</span><span>{pct}%</span>
            </div>
            <div style={{ height: 9, background: "#e6e2d8", borderRadius: 999, overflow: "hidden" }}>
              <div style={{ height: "100%", width: pct + "%", background: `linear-gradient(90deg, ${C.navy}, ${C.gold})`, borderRadius: 999, transition: "width .3s" }} />
            </div>
          </div>

          {data.sections.map((s) => (
            <div key={s.id} style={card}>
              <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>{s.title}</div>
              {s.items.length === 0 && <div style={{ fontSize: 13, color: "#9aa3af" }}>No items yet — add some in Edit checklist.</div>}
              {s.items.map((i) => {
                const on = !!checked[i.id];
                return (
                  <div key={i.id} onClick={() => setChecked((c) => ({ ...c, [i.id]: !c[i.id] }))}
                    style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 0", cursor: "pointer", borderTop: `1px solid #f2efe7` }}>
                    <span style={{ flex: "none", width: 22, height: 22, borderRadius: 6, border: on ? `2px solid ${C.good}` : "2px solid #c4ccd6", background: on ? C.good : "#fff", color: "#fff", fontWeight: 900, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>{on ? "✓" : ""}</span>
                    <span style={{ fontSize: 14, color: on ? C.good : "#334155", textDecoration: on ? "line-through" : "none" }}>{i.text}</span>
                  </div>
                );
              })}
            </div>
          ))}

          {/* Who attended — the "fill in the blank", as a roster picker */}
          {/* 🐛 `borderColor` WAS WIPING THIS CARD'S ACCENT EDGE (Matt, Aug 6
              2026: "the second block in orientation doesnt have a border").
              `card` sets a 1px ring and then accentEdge adds a 3px navy TOP and
              LEFT. Spreading `borderColor` after it recolours all four sides,
              so the 3px edge stayed 3px wide but turned the same near-white as
              the ring — the stripe every other card on the screen has simply
              vanished, and this block read as borderless beside its neighbours.
              ⚠️ Only the two sides that are NOT the accent may be recoloured.
              Anything that reaches for the `borderColor` shorthand on top of
              accentEdge is making this same mistake again. */}
          <div style={{ ...card,
            borderRightColor: allDone ? "#cfe8da" : C.line,
            borderBottomColor: allDone ? "#cfe8da" : C.line,
            ...accentEdge(allDone ? "#1E9E57" : ACCENT_NEUTRAL, 3),
            background: allDone ? "#F6FBF8" : C.card }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>Who went through orientation?</div>
            <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 10, lineHeight: 1.5 }}>
              Pick everyone who attended. Each person gets a completion record filed to their HR file, dated today and signed off by you.
            </div>

            {picked.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                {picked.map((id) => {
                  const m = team.find((x) => String(x.id) === String(id));
                  return (
                    <span key={id} onClick={() => togglePick(id)}
                      style={{ fontSize: 12.5, fontWeight: 700, background: C.navy, color: "#fff", borderRadius: 999, padding: "5px 11px", cursor: "pointer" }}>
                      {m ? m.name : id} ✕
                    </span>
                  );
                })}
              </div>
            )}

            <input style={input} placeholder="Search the roster by name…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <div style={{ marginTop: 8, maxHeight: 210, overflowY: "auto" }}>
              {shown.map((m) => {
                const on = picked.includes(String(m.id));
                return (
                  <div key={m.id} onClick={() => togglePick(String(m.id))}
                    style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 4px", cursor: "pointer", borderTop: "1px solid #f2efe7" }}>
                    <span style={{ flex: "none", width: 19, height: 19, borderRadius: 5, border: on ? `2px solid ${C.navy}` : "2px solid #c4ccd6", background: on ? C.navy : "#fff", color: "#fff", fontWeight: 900, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>{on ? "✓" : ""}</span>
                    <span style={{ fontSize: 14 }}>{m.name}</span>
                    <span style={{ fontSize: 11.5, color: "#9aa3af", marginLeft: "auto" }}>{m.role}</span>
                  </div>
                );
              })}
              {!search.trim() && team.length > 8 && (
                <div style={{ fontSize: 11.5, color: "#9aa3af", padding: "8px 4px" }}>Showing the first 8 — search to find anyone else.</div>
              )}
              {search.trim() && shown.length === 0 && (
                <div style={{ fontSize: 13, color: "#9b2c2c", padding: "8px 4px" }}>Nobody on the roster matches that.</div>
              )}
            </div>

            {!allDone && allItems.length > 0 && (
              <div style={{ fontSize: 12.5, color: "#8a4b1f", background: "#FFF6F0", border: "1px solid #F3D6C4", borderRadius: 9, padding: "9px 11px", marginTop: 12 }}>
                {allItems.length - doneCount} item{allItems.length - doneCount === 1 ? "" : "s"} still unticked. You can still file — anything unticked is recorded as not covered.
              </div>
            )}

            <button
              onClick={fileCompletion}
              disabled={saving || !picked.length}
              style={{ ...btn, width: "100%", marginTop: 12, background: picked.length && !saving ? C.red : "#e6e2d8", color: picked.length && !saving ? "#fff" : "#9aa3af", cursor: picked.length && !saving ? "pointer" : "default" }}>
              {saving ? "Filing…" : `File completion${picked.length ? ` for ${picked.length}` : ""}`}
            </button>

            {msg && (
              <div style={{ marginTop: 10, fontSize: 13, borderRadius: 9, padding: "10px 12px",
                background: msg.kind === "ok" ? "#F1FBF6" : "#FEF2F2",
                border: `1px solid ${msg.kind === "ok" ? "#BFE6D0" : "#F3C6C6"}`,
                color: msg.kind === "ok" ? "#136b3f" : "#9b2c2c" }}>{msg.text}</div>
            )}
          </div>

          {log.length > 0 && (
            <div style={card}>
              <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>Recent orientations</div>
              {log.slice(0, 6).map((s, n) => (
                <div key={n} style={{ fontSize: 13, color: "#334155", padding: "7px 0", borderTop: n ? "1px solid #f2efe7" : "none" }}>
                  <b>{s.date}</b> — {(s.names || []).join(", ") || "—"}
                  <div style={{ fontSize: 11.5, color: "#9aa3af", marginTop: 2 }}>{s.covered}/{s.total} covered · {s.by}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {editing && (
        <>
          <div style={{ ...card, background: "#F8F5EF" }}>
            <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.55 }}>
              This is your agenda — type it however you run it. Changes save as you make them and apply the next time anyone runs orientation.
            </div>
          </div>

          {data.sections.map((s) => (
            <div key={s.id} style={card}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                <input style={{ ...input, fontWeight: 800 }} value={s.title} onChange={(e) => setSection(s.id, { title: e.target.value })} />
                <button style={{ ...ghost, padding: "8px 12px", color: C.red, borderColor: "#F3C6C6" }} onClick={() => { if (window.confirm(`Delete the "${s.title}" section and its items?`)) delSection(s.id); }}>✕</button>
              </div>
              {s.items.map((i) => (
                <div key={i.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 7 }}>
                  <input style={input} value={i.text} placeholder="Checklist item…" onChange={(e) => setItem(s.id, i.id, e.target.value)} />
                  <button style={{ ...ghost, padding: "8px 11px", color: "#9aa3af" }} onClick={() => delItem(s.id, i.id)}>✕</button>
                </div>
              ))}
              <button style={{ ...ghost, marginTop: 4 }} onClick={() => addItem(s.id)}>+ Add item</button>
            </div>
          ))}

          <div style={{ display: "grid", gap: 8 }}>
            <button style={{ ...btn, background: C.navy, color: "#fff" }} onClick={addSection}>+ Add section</button>
            <button style={{ ...ghost, color: C.muted }} onClick={restore}>Restore starter list</button>
          </div>
        </>
      )}
    </div>
  );
}
