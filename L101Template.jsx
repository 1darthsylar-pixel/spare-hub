import React, { useState } from "react";
import Leadership101, { registerProgram, kvFor } from "./Leadership101.jsx";
import { contentKey } from "./L101Editor.jsx";
import { kvGetResult, kvSet } from "./store.js";
import { inotesKey } from "./l101Instructors.js";
import {
  buildBundle, readBundle, bundleProblems, bundleSummary, nameFlags, weekKeysOf,
} from "./l101Export.js";
import L101Week from "./L101Week.jsx";
import { INTRO_TO_LEADERSHIP } from "./L101IntroModule.jsx";
import { WELCOME_SEED } from "./L101WelcomeModule.jsx";
import { CATERING_W4 } from "./L101CateringModule.jsx";
import { L101_W2 } from "./L101W2.js";
import { L101_W3 } from "./L101W3.js";
import { STORE_CONFIG } from "./storeConfig.js";

/* ═══ L101 — STORE TEMPLATE ════════════════════════════════════════════════
   Bri, Aug 7 2026: "Can we build a copy of the Leadership 101 class for me to
   edit for the new store copy... I'd like it copied just as I currently have
   the Leadership 101 class, but not tied to anything (no students can access
   it, there's no set code right now — just the blank admin option, and nothing
   tied to notifications with the copy). I basically want the full class visible
   and ready to edit with nothing wired."
   And Aug 8: "this is a priority with the September 1st deadline."

   ★ IT IS A PROGRAM CONFIG, NOT A SECOND COPY OF THE CLASS. Leadership101.jsx
   is a shell and Trainer Orientation already proved the pattern in 146 lines.
   Copying the file would have made a third 1,300-line twin.

   ⚠️⚠️ THREE THINGS ARE KEYED SEPARATELY, AND ALL THREE ARE REQUIRED. Her whole
   ask is "the class I'm using remains untouched", and the shell shares more than
   it namespaces. Miss any one of these and editing this template silently edits
   her LIVE class, with students on it.

     1. THE NAMESPACE. `ns` covers pins, the open switch, prep work, materials,
        the survey and the week structure. That part the shell does for us.

     2. THE WEEK IDS. Class CONTENT is `ld:l101:content:<weekId>` — keyed by
        week id ALONE, never by program (see contentKey in L101Editor.jsx, and
        the "SHARED (NOT namespaced)" note in Leadership101.jsx). Reusing w1/w2/
        w3/w4/welcome would write her live class's content records. So every
        week here is `tpl-…`.

     3. THE ITEM IDS INSIDE THE SEEDS. Progress is ONE shared record per person,
        and each program reads the other programs' `seeds` to work out which
        item ids are its own. The seeds carry ids like `w2-read-intro`, so
        handing this program the same seed objects would make it claim her
        students' completed work — which is exactly the bug the registry was
        built to fix (Orientation once displayed the whole of Leadership 101).
        tplSeed below rewrites every section and item id.

   ⚠️ NOTHING IS WIRED, AND THAT IS THE FEATURE. No PIN is set and `open` is
   unset, so the entrance is shut and no student can reach it. No autoRoles, so
   nobody is enrolled by a title change. It is an admin-only editing surface.

   ⚠️ WHY L101Week FOR ALL FIVE. The live class renders its intro, welcome and
   catering classes through components that hardcode their week id — reusing
   them here would write to w1/welcome/w4 whatever this file says. L101Week
   takes the id as a prop, so every class gets its own storage without touching
   a single file the live class depends on.

   ⚠️ ONE-WAY IMPORT. This file imports Leadership101.jsx and registers itself
   from its own module body. That file must never import this one — the same
   cycle trap Trainer Orientation documents.
   ═══════════════════════════════════════════════════════════════════════════ */

/* Deep copy with every section and item id prefixed. Pure, and the only reason
   it exists is point 3 above. `id` becomes the template's own class key so the
   seed agrees with the week it is registered under. */
const tplSeed = (seed, key) => ({
  ...seed,
  id: key,
  sections: (seed.sections || []).map((s) => ({
    ...s,
    id: `tpl-${s.id}`,
    items: (s.items || []).map((it) => ({ ...it, id: `tpl-${it.id}` })),
  })),
});

const TPL_W1 = tplSeed(INTRO_TO_LEADERSHIP, "tpl-w1");
const TPL_WELCOME = tplSeed(WELCOME_SEED, "tpl-welcome");
const TPL_W2 = tplSeed(L101_W2, "tpl-w2");
const TPL_W3 = tplSeed(L101_W3, "tpl-w3");
const TPL_W4 = tplSeed(CATERING_W4, "tpl-w4");

/* `sequential` mirrors the live class: weeks 2 and 3 are unlocked, the rest
   step through in order. A template should open the way the real thing does. */
const TplW1 = () => <L101Week weekId="tpl-w1" weekLabel="Intro to Leadership" seed={TPL_W1} />;
const TplWelcome = () => <L101Week weekId="tpl-welcome" weekLabel="Welcome to Leadership 101" seed={TPL_WELCOME} />;
const TplW2 = () => <L101Week weekId="tpl-w2" weekLabel="Conflict & Coaching" seed={TPL_W2} sequential={false} />;
const TplW3 = () => <L101Week weekId="tpl-w3" weekLabel="Food Safety" seed={TPL_W3} sequential={false} />;
const TplW4 = () => <L101Week weekId="tpl-w4" weekLabel="Catering" seed={TPL_W4} />;

export const L101_TEMPLATE = {
  ns: "ld:l101tpl",
  name: "L101 — Store Template",
  tagline: "Unwired copy for a new store · edit freely, nobody can enter",
  /* One audience — nobody — so one PIN slot rather than L101's split cohorts. */
  splitPins: false,
  /* ⚠️ NO autoRoles. Trainer Orientation opens itself the moment somebody gets
     a trainer title. This must never enrol anyone. */
  weeks: [
    { n: 1, key: "tpl-w1", label: "ONE", title: "Intro to Leadership",
      modules: [{ id: "tplm1", title: "Intro to Leadership", type: "hub", hub: "tpl-w1", note: "Runs in the Hub" }] },
    { n: 1.5, key: "tpl-welcome", label: "WELCOME", title: "Welcome to Leadership 101",
      modules: [{ id: "tplmw", title: "Welcome to Leadership 101", type: "hub", hub: "tpl-welcome", note: "Runs in the Hub" }] },
    { n: 2, key: "tpl-w2", label: "TWO", title: "Conflict & Coaching",
      modules: [{ id: "tplm3", title: "Conflict & Coaching", type: "hub", hub: "tpl-w2", note: "Runs in the Hub" }] },
    { n: 3, key: "tpl-w3", label: "THREE", title: "Food Safety",
      modules: [{ id: "tplm5", title: "Food Safety", type: "hub", hub: "tpl-w3", note: "Runs in the Hub" }] },
    { n: 4, key: "tpl-w4", label: "FOUR", title: "Catering",
      modules: [{ id: "tplm7", title: "Catering", type: "hub", hub: "tpl-w4", note: "Runs in the Hub" }] },
  ],
  /* Starts empty. Bri adds prep sections here the same way she does in L101,
     and they anchor to these weeks rather than to the live class's. */
  prepSeed: [],
  hubModules: {
    "tpl-w1": { title: "Intro to Leadership", Component: TplW1 },
    "tpl-welcome": { title: "Welcome to Leadership 101", Component: TplWelcome },
    "tpl-w2": { title: "Conflict & Coaching", Component: TplW2 },
    "tpl-w3": { title: "Food Safety", Component: TplW3 },
    "tpl-w4": { title: "Catering", Component: TplW4 },
  },
  seeds: { "tpl-w1": TPL_W1, "tpl-welcome": TPL_WELCOME, "tpl-w2": TPL_W2, "tpl-w3": TPL_W3, "tpl-w4": TPL_W4 },
};

registerProgram(L101_TEMPLATE);

/* ═══ HANDING IT TO THE NEW STORE ═══════════════════════════════════════════
   The whole point of this template is that a second store ends up running it,
   and until now there was no way for that to happen: everything Bri builds
   lives in Gate City's database and their copy is a new repo with an empty
   one. See l101Export.js for the rules and for the prefix trap.

   ⚠️ THE PANEL LIVES HERE, NOT IN Leadership101.jsx. That file is the shared
   shell behind L101, Trainer Orientation AND this template, so a button added
   there appears on Bri's live class too — and "export the class" next to a
   course with students in it is a different and more dangerous button. Here it
   can only ever act on the template.
   ⚠️ NO NEW PERMISSION GATE. The `l101tpl` tile already opens for two people
   (storeConfig owners.tileAllow), so anyone who can reach this screen is
   already trusted with the template. A second gate would be a second answer to
   the same question.

   ⚠️ READS GO THROUGH THE WEEK LIST, NEVER A PREFIX. Three of her eight weeks
   carry generated keys. `weekKeysOf` is the only way keys are chosen here. */
const PANEL = {
  box: { border: "1px solid #E5E7EB", borderRadius: 14, background: "#fff", padding: 16, margin: "0 0 14px" },
  btn: { fontSize: 12.5, fontWeight: 700, padding: "8px 13px", borderRadius: 9, cursor: "pointer",
    border: "1px solid #1D4ED8", background: "#1D4ED8", color: "#fff" },
  ghost: { fontSize: 12.5, fontWeight: 700, padding: "8px 13px", borderRadius: 9, cursor: "pointer",
    border: "1px solid #E5E7EB", background: "#fff", color: "#111827" },
  sub: { fontSize: 12.5, color: "#6B7280", lineHeight: 1.5, marginTop: 6 },
  warn: { fontSize: 12.5, color: "#92400E", background: "#F5EAD3", border: "1px solid #E4CE9E",
    borderRadius: 9, padding: "9px 11px", marginTop: 10, lineHeight: 1.5 },
  bad: { fontSize: 12.5, color: "#B91C1C", background: "#FBEAED", border: "1px solid #F0C4CC",
    borderRadius: 9, padding: "9px 11px", marginTop: 10, lineHeight: 1.5 },
  good: { fontSize: 12.5, color: "#166534", background: "#ECFDF3", border: "1px solid #BBF7D0",
    borderRadius: 9, padding: "9px 11px", marginTop: 10, lineHeight: 1.5 },
  area: { width: "100%", minHeight: 90, borderRadius: 9, border: "1px solid #E5E7EB",
    padding: "8px 10px", fontSize: 12, fontFamily: "ui-monospace, monospace", marginTop: 8 },
};

/* Names worth flagging before a file leaves the building. Reported, never
   rewritten — see nameFlags in l101Export.js.

   ⚠️⚠️ THIS WAS A HARDCODED LIST OF THIS STORE AND SIX OF OUR PEOPLE UNTIL AUG
   13 2026, and it went out in the first snapshot taken after it was written.
   Found by re-sweeping the clone AFTER adopting this file, which is the only
   reason it was found at all: the file was in the sync tool's "safe to adopt"
   bucket and adopting it ADDED two live origin-store strings to a clean repo.
   ⇒ Derived from whatever store is running, so a clone inherits none of it.
   Same code in both repos, different data. An empty result is a working state:
   `nameFlags` returns [] and the panel flags nothing, which is the honest
   answer for a store with no seeded people.
   ⚠️ SEATS AND adminNames BOTH, not just seats. `adminNames` is where "bri"
   lives beside "brianna"; seats alone would have quietly stopped warning about
   the short form somebody actually types into class text.
   ⚠️ `nameFlags` builds a case-insensitive regex, so nothing here needs
   normalising for case — `adminNames` is stored lower case on purpose. */
const flagTerms = () => {
  const out = [];
  const add = (full) => {
    const first = String(full || "").trim().split(/\s+/)[0];
    if (first && !out.some((t) => t.toLowerCase() === first.toLowerCase())) out.push(first);
  };
  /* ⚠️ THE STORE NAME GOES IN WHOLE, never through `add`. It is a phrase, and
     `add` keeps the first word only — which would put "Gate" in the list and
     flag every class that mentions a gate, a gate count or the drive-thru gate. */
  const nm = String((STORE_CONFIG.identity && STORE_CONFIG.identity.name) || "").trim();
  if (nm) out.push(nm);
  const owners = STORE_CONFIG.owners || {};
  for (const s of owners.seats || []) add(s && s.holder);
  for (const list of Object.values(owners.adminNames || {})) {
    for (const n of Array.isArray(list) ? list : []) add(n);
  }
  return out;
};

function TemplateHandoff() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [flags, setFlags] = useState(null);
  const [paste, setPaste] = useState("");
  const ns = L101_TEMPLATE.ns;
  const K = kvFor(ns);

  /* ⚠️ RESULT-STYLE ON EVERY READ. A failed read answering the same `null` as
     "never written" would put a bundle on screen that is missing a week and
     say nothing, which is the exact failure `bundleProblems` exists to catch
     at the far end. Refuse here instead, before anybody sends it. */
  const gather = async () => {
    const wk = await kvGetResult(K.weeks);
    if (!wk.ok) return { error: "Could not read the week list, so nothing was exported. Try again in a moment." };
    /* No stored week list means she has never edited the structure, so the
       code's own weeks are what this template currently is. */
    const weeks = Array.isArray(wk.value) && wk.value.length ? wk.value : L101_TEMPLATE.weeks;
    const keys = weekKeysOf(weeks);
    const contentByKey = {};
    const inotesByKey = {};
    for (const k of keys) {
      const c = await kvGetResult(contentKey(k));
      if (!c.ok) return { error: `Could not read one of the weeks, so nothing was exported. Try again in a moment.` };
      /* Never edited = the class still renders from its code seed, which the
         other store has too. Nothing to carry, and not an error. */
      if (c.value) contentByKey[k] = c.value;
      const n = await kvGetResult(inotesKey(k));
      if (n.ok && n.value) inotesByKey[k] = n.value;
    }
    const pw = await kvGetResult(K.prepwork);
    if (!pw.ok) return { error: "Could not read the prep work, so nothing was exported. Try again in a moment." };
    const sv = await kvGetResult(K.survey);
    if (!sv.ok) return { error: "Could not read the survey, so nothing was exported. Try again in a moment." };
    return {
      bundle: buildBundle({
        /* ⚠️ `fromStore` STAMPS THE SENDER, so a literal here is not a label,
           it is a claim. In a clone it made every course exported from that
           store arrive at the far end saying it came from this one. */
        madeAt: new Date().toISOString(),
        fromStore: String((STORE_CONFIG.identity && STORE_CONFIG.identity.name) || "").trim(),
        programNs: ns,
        weeks, contentByKey, inotesByKey,
        prepwork: pw.value, survey: sv.value,
      }),
    };
  };

  const doExport = async () => {
    setBusy(true); setErr(""); setNote(""); setFlags(null);
    const r = await gather();
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    const problems = bundleProblems(r.bundle);
    if (problems.length) { setErr(`Not exported. ${problems.join(" ")}`); return; }
    const s = bundleSummary(r.bundle);
    setFlags(nameFlags(r.bundle, flagTerms()));
    /* A downloaded file rather than a clipboard: this is around 80KB and a
       part-pasted course looks exactly like a whole one. */
    const blob = new Blob([JSON.stringify(r.bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leadership-101-template-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setNote(`Saved a file with ${s.weeks} weeks, ${s.items} activities, ${s.prep} prep sections, ${s.survey} survey questions and ${s.inotes} sets of instructor notes.`);
  };

  /* ⚠️⚠️ LOADING REFUSES TO PAINT OVER WORK. Design rule 1: the store at the
     other end may already have started editing, and a file that silently
     replaced their week list would destroy the thing it was sent to seed. */
  const doLoad = async () => {
    setBusy(true); setErr(""); setNote(""); setFlags(null);
    const r = readBundle(paste);
    if (!r.ok) { setBusy(false); setErr(r.error); return; }
    const problems = bundleProblems(r.bundle);
    if (problems.length) { setBusy(false); setErr(`Not loaded. ${problems.join(" ")}`); return; }

    const cur = await kvGetResult(K.weeks);
    if (!cur.ok) { setBusy(false); setErr("Could not check what is already here, so nothing was loaded."); return; }
    if (Array.isArray(cur.value) && cur.value.length) {
      const s = bundleSummary(r.bundle);
      if (!window.confirm(
        `This template already has ${cur.value.length} weeks in it. Loading replaces them with the ${s.weeks} weeks in this file. Anything edited here is lost. Continue?`
      )) { setBusy(false); return; }
    }

    const b = r.bundle;
    const keys = weekKeysOf(b.weeks);
    /* ⚠️ CONTENT FIRST, THE WEEK LIST LAST. The list is what the screen reads
       to know which weeks exist, so writing it first and then failing halfway
       leaves a course showing eight weeks with three of them empty. This way a
       failure part-way leaves the old structure standing. */
    const failed = [];
    for (const k of keys) {
      if (b.content[k] && (await kvSet(contentKey(k), b.content[k])) === false) failed.push(k);
      if (b.inotes && b.inotes[k]) await kvSet(inotesKey(k), b.inotes[k]);
    }
    if (failed.length) {
      setBusy(false);
      setErr(`${failed.length} week${failed.length === 1 ? "" : "s"} did not save, so the week list was left alone. Nothing changed. Try again.`);
      return;
    }
    if (Array.isArray(b.prepwork) && b.prepwork.length) await kvSet(K.prepwork, b.prepwork);
    if (b.survey) await kvSet(K.survey, b.survey);
    const ok = await kvSet(K.weeks, b.weeks);
    setBusy(false);
    if (ok === false) { setErr("The weeks did not save. The class content did. Press Load again."); return; }
    const s = bundleSummary(b);
    setNote(`Loaded ${s.weeks} weeks, ${s.items} activities, ${s.prep} prep sections. Refresh to see them.`);
    setPaste("");
  };

  return (
    <div style={PANEL.box}>
      <div style={{ fontWeight: 800, fontSize: 15, color: "#111827" }}>Send this template to another store</div>
      <div style={PANEL.sub}>
        Everything you build here is saved in this store only. A new store starts with an empty
        Hub, so they get the plain weeks that come with the app and no prep work. This makes one
        file with all of it, for them to load on their side.
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <button style={PANEL.btn} disabled={busy} onClick={doExport}>
          {busy ? "Working…" : "Save the file"}
        </button>
      </div>

      {err && <div style={PANEL.bad}>{err}</div>}
      {note && <div style={PANEL.good}>{note}</div>}
      {flags && flags.length > 0 && (
        <div style={PANEL.warn}>
          <b>Worth a read before you send it.</b> These parts still name this store or someone here:{" "}
          {flags.join(", ")}. The file was still saved. Nothing was changed for you, because it is
          your writing and you know which mentions matter.
        </div>
      )}
      {flags && flags.length === 0 && (
        <div style={PANEL.sub}>Nothing in it names this store or anyone here.</div>
      )}

      <div style={{ borderTop: "1px solid #E5E7EB", marginTop: 14, paddingTop: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, color: "#111827" }}>Loading a file sent to you</div>
        <div style={PANEL.sub}>Paste the contents of the file here. It will tell you if anything is missing.</div>
        <textarea style={PANEL.area} value={paste} placeholder="Paste the course file here"
          onChange={(e) => setPaste(e.target.value)} />
        <button style={PANEL.ghost} disabled={busy || !paste.trim()} onClick={doLoad}>
          {busy ? "Working…" : "Load it"}
        </button>
      </div>
    </div>
  );
}

export default function L101Template(props) {
  return (
    <>
      <TemplateHandoff />
      <Leadership101 {...props} program={L101_TEMPLATE} />
    </>
  );
}
