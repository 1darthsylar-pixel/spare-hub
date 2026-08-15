import { useState, useMemo, useEffect, useRef } from "react";
/* The one raised look, shared with every tool — see cardStyle.js. */
import { CARD_3D, cardSurface, CARD_3D_SOFT, accentEdge, ACCENT_NEUTRAL } from "./cardStyle.js";
import { saveSubmission, listSubmissions, uploadPhoto, signedDocUrl, kvSet, kvGetResult, hubToken } from "./store";
import PasteMonth from "./PasteMonth.jsx";
/* Leaf, imports nothing — all the EcoSure parsing, the derive-don't-trust rule
   and the one-round-at-a-time merge live there and are tested in node. */
import {
  ECOSURE_KEY, ECOSURE_SEED, ECOSURE_SEVERITY_TONE,
  parseEcosurePaste, mergeEcosure, summarise, worstSeverity, roundsNewestFirst,
} from "./ecosureVisits.js";
import { seatForTool } from "./orgSeats.js"; // the roll-up line names whoever holds the food-safety seat
import { STORE } from "./storeConfig.js"; // store name on the walk header
const FS_SEAT_FIRST = (((seatForTool("foodsafety") || {}).holder || "the food-safety seat").split(" ")[0]);

/* ★ ONE NAME FOR THE BUCKET, module level — the upload and every minted link
   have to agree, and a typo in either fails silently as "no photo on file".
   Same constant pattern as TrainerTasks.jsx, which this mirrors deliberately
   rather than inventing a second upload path. */
const PHOTO_BUCKET = "food-safety-photos";

// ─── Section config ───────────────────────────────────────────────────────────
const SECTIONS = [
  { id: "immediate", label: "Immediate Action", short: "Immediate", accent: "#7C3AED", light: "#F5F3FF", border: "#DDD6FE" },
  { id: "high",      label: "High Risk",         short: "High",      accent: "#DC2626", light: "#FFF1F2", border: "#FECDD3" },
  { id: "medium",    label: "Medium Risk",        short: "Medium",    accent: "#D97706", light: "#FFFBEB", border: "#FDE68A" },
  { id: "low",       label: "Low Risk",           short: "Low",       accent: "#2563EB", light: "#EFF6FF", border: "#BFDBFE" },
  { id: "info",      label: "Informational",      short: "Info",      accent: "#6B7280", light: "#F9FAFB", border: "#E5E7EB" },
  { id: "summary",   label: "Summary",            short: "Summary",   accent: "#334155", light: "#F8FAFC", border: "#E5E7EB" },
];
const EDITABLE_SECTIONS = ["immediate", "high", "medium", "low", "info"];

// ─── Checklist data (base seed — team edits layered on top, saved separately) ──
const ITEMS = {
  immediate: [
    { id:"i1",  watch:false, text:"Grilled raw chicken cooked to 165°F" },
    { id:"i2",  watch:false, text:"Breaded raw chicken cooked to 165°F" },
    { id:"i3",  watch:false, text:"Non-chicken TCS foods cooked/reheated to proper temps (sausage, soup, cheese sauce, eggs, mac & cheese)" },
    { id:"i4",  watch:false, text:"TCS foods cooled properly — 140°F→70°F within 2 hrs, then 140°F→40°F within 6 hrs. Date/time stickers in use." },
    { id:"i5",  watch:false, text:"Chemical sanitizer solutions at proper concentration (FOH & BOH)" },
    { id:"i6",  watch:false, text:"Produce wash at proper concentration" },
    { id:"i7",  watch:false, text:"Food contact surfaces cleaned & sanitized at least every 4 hours during continuous TCS food use at room temp" },
    { id:"i8",  watch:false, text:"Non-chemical dishwashing machine reaches 160°F on the dish surface" },
    { id:"i9",  watch:false, text:"Proper handwashing: 20 sec, hot water + soap, dried with disposable towel, no re-contamination at faucet or dispenser" },
    { id:"i10", watch:false, text:"No bare hand contact with ready-to-eat foods" },
    { id:"i11", watch:false, text:"Ill team members excluded (vomiting, diarrhea, jaundice, fever with sore throat) or restricted (coughing, sneezing, runny nose)" },
    { id:"i12", watch:false, text:"Fruits & vegetables properly washed before processing; produce wash set up and used when required" },
    { id:"i13", watch:false, text:"Sewage disposal systems (including grease traps) operating properly" },
    { id:"i14", watch:false, text:"Hot & cold water sufficient for peak demand; adequate pressure at all sinks" },
    { id:"i15", watch:false, text:"Pest prevention effective — no live cockroaches, rodents, or birds; no droppings, nests, or gnawed packaging in food areas" },
  ],
  high: [
    /* ⚠️ MOVED UP FROM MEDIUM, Jul 27 2026, same ruling and same reason — the
       inspector found undated chicken nuggets in a lowboy that had passed.
       ⚠️ IDS STAY "m6"/"m7" for the same history reason as l9 above. */
    { id:"m6",  watch:false, text:"TCS foods properly date labeled when prepared or opened" },
    { id:"m7",  watch:false, text:"Date marking applied to raw chicken in thaw cabinets" },
    { id:"h1",  watch:true,  text:"CENTER LINE ON — Cold holding ≤40°F in all devices (reach-in, cold-top, walk-in cooler, ice wells)",
      hint:"Q2: Center line was not turned on early AM. Multiple products exceeded 40°F before cooling down during the visit." },
    { id:"h2",  watch:true,  text:"Bulk remain labels match the exact time product goes into the walk-in cooler",
      hint:"Q2: Labels not printed at cooler entry time — Romaine labeled 8:10 AM read 44°F and 49°F. Print label when product goes in." },
    { id:"h3",  watch:false, text:"Raw chicken in breading table rail held at 33–40°F" },
    { id:"h4",  watch:true,  text:"Hot holding ≥140°F — check eggs and all hot-held TCS foods",
      hint:"Q2: Eggs were below 140°F." },
    { id:"h5",  watch:true,  text:"Cross-contamination: wipes NOT stored over raw surfaces or the filleting table",
      hint:"Q2: Wipes were stored over raw surfaces and the filleting table." },
    { id:"h6",  watch:false, text:"Proper food storage hierarchy: raw products stored below ready-to-eat foods" },
    { id:"h7",  watch:false, text:"All FOH & BOH handwash sinks stocked, accessible, properly used, clean, and in good repair" },
    { id:"h8",  watch:false, text:"Grill deflector plates (front & side) properly installed" },
    { id:"h9",  watch:false, text:"Chemicals, Produce Wash, and chemical containers used correctly and only for their intended purpose" },
    { id:"h10", watch:false, text:"Raw chicken held only in thaw cabinets or on bottom shelf of walk-in cooler" },
    { id:"h11", watch:false, text:"Foods from approved suppliers; foods and packaging in sound condition" },
    { id:"h12", watch:false, text:"Bodily Fluid Clean Up Kit present and fully assembled" },
    { id:"h13", watch:false, text:"Gloves worn correctly: yellow = raw chicken | clear = rinsed produce | disposable always over cut-resistant gloves" },
    { id:"h14", watch:false, text:"Yellow apron worn properly when handling raw chicken" },
    { id:"h15", watch:false, text:"Restaurant has a written health policy covering foodborne and severe respiratory illnesses" },
    { id:"h16", watch:false, text:"Team members health screened before starting work" },
  ],
  medium: [
    /* ⚠️ MOVED UP FROM LOW, Jul 27 2026 — Hannah, after the health inspection
       failed gaskets the same morning a walkthrough had passed them: "Yes, move
       them up." It was buried in a 24-item Low Risk list that gets skimmed by
       the time anyone reaches it. ⚠️ THE ID STAYS "l9" — notes and flag history
       are keyed by it, so renaming to an "m" id would orphan every past flag. */
    /* ★ `photo: true` — Hannah, Jul 27: "Require a picture upload for examples
       of clean or dirty gaskets." Her reasoning is the good part: a photo is the
       one thing on this list that cannot be ticked without actually looking.
       The flag is a PROPERTY OF THE ITEM, so any other checkpoint can be made
       photo-required later by adding this one word. */
    { id:"l9",  watch:true,  photo:true,
      text:"Non-food contact surfaces cleaned: sink sides, door handles & gaskets, sliding door tracks, shelves, racks, etc.",
      hint:"Q2: Sink sides and sliding door/gasket areas were non-compliant.",
      photoHint:"Photograph the gaskets — whatever state they're in. Clean ones are as useful as dirty ones; over time this builds the reference set for what good looks like." },
    { id:"m1",  watch:false, text:"Chicken cooldown process followed: time guidelines, food film vented, chicken on trays, properly stacked" },
    { id:"m2",  watch:false, text:"TCS foods not held or sold past expiration date" },
    { id:"m3",  watch:false, text:"Accurate food thermometer present and readily available" },
    { id:"m4",  watch:false, text:"All cold holding equipment (with TCS foods) has accurate thermometers that are easily viewable" },
    { id:"m5",  watch:false, text:"TCS foods received at 40°F or below (including pre-sliced tomatoes)" },
    { id:"m8",  watch:false, text:"TCS foods properly thawed" },
    { id:"m9",  watch:false, text:"All produce in good condition" },
    { id:"m10", watch:true,  text:"Ice machine, ice bin & beverage nozzles cleaned & sanitized — specifically check hard-to-reach spots and door interiors (FOH & BOH)",
      hint:"Q2: Hard-to-reach spots were dirty on door interiors of both FOH and BOH ice machines." },
    { id:"m11", watch:false, text:"Air gaps / backflow prevention devices in place where required" },
    { id:"m12", watch:false, text:"Food contact surfaces smooth, easily cleanable, and in good condition" },
    { id:"m13", watch:false, text:"Approved chemicals only; proper labeling; SDS sheets available for all chemicals in restaurant" },
    { id:"m14", watch:false, text:"CFA-approved quat, chlorine, and produce test kits present, available, and not expired" },
    { id:"m15", watch:false, text:"Wiping cloths clean/dry or in properly diluted sanitizer; separate cloths for food-contact vs. non-food-contact surfaces" },
    { id:"m16", watch:false, text:"Manual ware washing and dishwashing facilities maintained, stocked, clean, and in good condition" },
    { id:"m17", watch:false, text:"Operator's ServSafe / TrainCan certification current within 5 years" },
    { id:"m18", watch:false, text:"Person in Charge demonstrates knowledge of health protocols" },
    { id:"m19", watch:false, text:"BOH nails: clean, trimmed, no polish/acrylics/gels | FOH nails: polish tasteful, no acrylics or gel tips" },
  ],
  low: [
    { id:"l1",  watch:false, text:"Foods properly covered (unless cooling); no condensation above food; sanitizer buckets not stored on the floor" },
    { id:"l2",  watch:false, text:"Frozen foods solidly frozen and hard to the touch" },
    { id:"l3",  watch:false, text:"Foods properly identified with common product name on container" },
    { id:"l4",  watch:false, text:"Foods and food contact packaging stored at least 6 inches off the floor" },
    { id:"l5",  watch:false, text:"Thaw cabinet: raw chicken identified with clips (non-compliant if 2 or more clips missing)" },
    { id:"l6",  watch:false, text:"Tamper-evident delivery stickers used on mobile orders for all 3rd-party deliveries" },
    { id:"l7",  watch:false, text:"Clean utensils, equipment, and packaging stored properly; handles pointing in the same direction" },
    { id:"l8",  watch:false, text:"In-use utensils (ice scoops, egg slicers) stored properly; handles do not touch TCS product" },
    { id:"l10", watch:false, text:"Cleaning tools properly stored between uses; equipment for food contact surfaces is appropriate for the task" },
    { id:"l25", watch:false, text:"Mop buckets emptied and mops hung to dry between uses" },
    { id:"l11", watch:false, text:"Team member & public restrooms fully stocked, clean, good repair; doors self-closing; hand sanitizer dispensers working" },
    { id:"l12", watch:false, text:"Floors, walls, and ceilings free of excessive dust, debris, and standing water" },
    { id:"l13", watch:false, text:"Floors, walls, and ceilings smooth, easily cleanable, and in good repair" },
    { id:"l14", watch:false, text:"Ventilation adequate; vents, fan guards, and filters clean" },
    { id:"l15", watch:false, text:"Lighting adequate; lights shielded or shatterproof above food and food contact surfaces" },
    { id:"l16", watch:false, text:"Eating/drinking/tobacco restricted to non-food areas; personal items in designated storage area" },
    { id:"l17", watch:false, text:"Good personal hygiene: clean outer clothing, hair restraints used, jewelry limited to plain ring (no set stones; no wrist braces)" },
    { id:"l18", watch:false, text:"Customer hand sanitizer stations accessible in dining room and all restrooms" },
    { id:"l19", watch:false, text:"Pest activity prevented through sealing of outer openings and elimination of harborage conditions" },
    { id:"l20", watch:false, text:"Exterior garbage covered, free of excess debris, and in good repair" },
    { id:"l21", watch:false, text:"Interior garbage containers cleaned and emptied as needed" },
    { id:"l22", watch:false, text:"Interior pest control devices working and properly installed (light traps, air curtains, mechanical traps)" },
    { id:"l23", watch:false, text:"Exterior rodent bait traps present and operational" },
    { id:"l24", watch:false, text:"Pest control company monthly inspection current (reports on file; visits every 30 days)" },
  ],
  info: [
    { id:"n1", watch:false, text:"Allergen information posted at all entry doors, between each point of sale, and at the drive-thru window" },
    { id:"n2", watch:false, text:"Mac & cheese finish temperature verified at 165°F in center of pan (per recent CFA procedure update)" },
  ],
};

const CFG_KEY = "gcfcr-foodsafety-config-v1"; // team edits to the checklist
const DEFAULT_CFG = { added: {}, overrides: {}, removed: [] };
const isCustom = (id) => typeof id === "string" && id.startsWith("fsc_");

// Merge base ITEMS + team edits into the checklist that actually renders
function buildItems(config) {
  const c = config || DEFAULT_CFG;
  const removed = c.removed || [];
  const overrides = c.overrides || {};
  const added = c.added || {};
  const out = {};
  for (const secId of Object.keys(ITEMS)) {
    const base = ITEMS[secId]
      .filter(it => !removed.includes(it.id))
      .map(it => (overrides[it.id] != null ? { ...it, text: overrides[it.id] } : it));
    const add = (added[secId] || []).filter(a => !removed.includes(a.id));
    out[secId] = [...base, ...add];
  }
  return out;
}

const S = SECTIONS.reduce((acc, s) => { acc[s.id] = s; return acc; }, {});

// ── Shared storage for the editable checklist (Worker → localStorage) ──
/* Result-style: ok:false means the WORKER read failed and the caller must
   refuse config writes — this record holds the whole team's checklist edits,
   and a save off a blank fallback would erase them. localStorage stays as a
   read-only fallback so the list still renders; it never makes ok true. */
const cfgGet = async () => {
  const r = await window.storage.getResult(CFG_KEY);
  let v = null;
  if (r.value) { try { v = JSON.parse(r.value); } catch {} }
  if (v == null) { try { const s = localStorage.getItem(CFG_KEY); if (s) v = JSON.parse(s); } catch {} }
  return { ok: r.ok, value: v };
};
/* Returns whether the SHARED write landed — window.storage.set reports a
   refused write by returning false, never by throwing. localStorage is a
   best-effort mirror; it can genuinely throw (quota, private mode). */
const cfgSet = async (v) => {
  const s = JSON.stringify(v);
  const ok = (await window.storage.set(CFG_KEY, s)) !== false;
  try { localStorage.setItem(CFG_KEY, s); } catch {}
  return ok;
};

// ── Completion email (Worker /api/tool-notify → Resend → Adriana) ──
async function notifyTool(payload) {
  try {
    await fetch("/api/tool-notify", { method: "POST", headers: { "Content-Type": "application/json", "x-hub-token": hubToken() }, body: JSON.stringify(payload) });
  } catch {}
}

function scoreColor(pct) {
  if (pct === null) return "#94A3B8";
  if (pct >= 95) return "#16A34A";
  if (pct >= 85) return "#65A30D";
  if (pct >= 75) return "#D97706";
  return "#DC2626";
}

function fmtWhen(iso) {
  try {
    return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch { return iso; }
}

// ── Severity breakdown (violation-report style banner) ─────────────────────────
// Counts FLAGGED items per risk tier, mirroring the Safe Eats report header
// (Immediate / High / Medium / Low). Uses each section's own accent so the tool
// stays visually consistent with its tabs — not the consultant PDF's palette.
const TIER_IDS = ["immediate", "high", "medium", "low"];
const tierTotal = (counts) => TIER_IDS.reduce((n, id) => n + (counts[id] || 0), 0);

// Works for both a live stats.bySection object and a saved payload.
function severityFromPayload(p) {
  if (p && p.severityCounts) return p.severityCounts;
  const counts = { immediate: 0, high: 0, medium: 0, low: 0, info: 0 };
  const labelToId = {
    "Immediate Action": "immediate", "High Risk": "high",
    "Medium Risk": "medium", "Low Risk": "low", "Informational": "info",
  };
  (Array.isArray(p?.flaggedItems) ? p.flaggedItems : []).forEach(f => {
    const id = labelToId[f.section]; if (id) counts[id] += 1;
  });
  return counts;
}

function SeverityBanner({ counts, compact }) {
  const cells = TIER_IDS.map(id => ({ id, s: S[id], n: counts[id] || 0 }));
  if (compact) {
    const active = cells.filter(c => c.n > 0);
    if (active.length === 0) {
      return <span style={{ fontSize: 11, color: "#16A34A", fontWeight: 700 }}>✓ clean</span>;
    }
    return (
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {active.map(c => (
          <span key={c.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: c.s.light, border: `1px solid ${c.s.border}`, color: c.s.accent, borderRadius: 6, padding: "2px 7px", fontSize: 11, fontWeight: 700 }}>
            <span style={{ fontSize: 12, fontWeight: 800 }}>{c.n}</span>{c.s.short}
          </span>
        ))}
      </div>
    );
  }
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
        {cells.map(c => (
          <div key={c.id} style={{ background: c.s.accent, borderRadius: 10, padding: "12px 6px", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{c.n}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#fff", opacity: 0.93, marginTop: 4 }}>{c.s.label}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: "#64748B", marginTop: 8, fontWeight: 600 }}>
        Total flagged items: {tierTotal(counts)}
      </div>
    </div>
  );
}

/* ═══ THE ECOSURE VISIT ══════════════════════════════════════════════════
   Matt, Aug 6 2026: "for food safety i want to add the upload data for our
   Ecosure visits", then "there was no download report but i just did copy and
   paste... that is in ops hub".
   So it is a paste, like every other CFA number here. All the parsing and the
   merge rule live in ecosureVisits.js, which imports nothing and is tested in
   node; this component only renders and writes.
   ⚠️ EVERY COUNT ON SCREEN IS DERIVED FROM THE FINDINGS. The report's own
   summary matrix disagrees with its own findings list — see the warning at the
   top of ecosureVisits.js — so there is nothing here that can be typed. */
function EcosurePanel() {
  const [rec, setRec] = useState(ECOSURE_SEED);
  const [readOk, setReadOk] = useState(null);
  const [round, setRound] = useState("");

  useEffect(() => {
    let live = true;
    (async () => {
      const r = await kvGetResult(ECOSURE_KEY);
      if (!live) return;
      /* ⚠️ ok:false is NOT "no visits". Falling through to the seed and letting
         a save run off that would replace real quarters with the one baked into
         the bundle. Import is refused until a read actually succeeds. */
      if (!r.ok) { setReadOk(false); return; }
      setReadOk(true);
      if (r.value && typeof r.value === "object" && Object.keys(r.value).length) setRec(r.value);
    })();
    return () => { live = false; };
  }, []);

  const rounds = useMemo(() => roundsNewestFirst(rec), [rec]);
  const shown = round && rec[round] ? round : rounds[0];
  const visit = shown ? rec[shown] : null;
  const sum = useMemo(() => summarise(visit && visit.findings), [visit]);
  const worst = worstSeverity(visit && visit.findings);

  const onImport = async (text) => {
    if (readOk !== true) return { ok: false, message: "Cannot import until the saved visits load. Check the wifi and reopen." };
    const p = parseEcosurePaste(text);
    if (p.error) return { ok: false, message: p.error };
    const next = mergeEcosure(rec, p.round, p.rec);
    if (!(await kvSet(ECOSURE_KEY, next))) return { ok: false, message: "That did not save. Check the wifi and paste it again." };
    setRec(next);
    setRound(p.round);
    const s = summarise(p.rec.findings);
    return { ok: true, message: `${p.round} saved: ${s.total} finding${s.total === 1 ? "" : "s"}${s.repeats ? `, ${s.repeats} repeat` : ""}.` };
  };

  return (
    <div style={{ maxWidth: 600, margin: "12px auto 0", padding: "0 16px" }}>
      <div style={{ background: "#fff", backgroundImage: cardSurface(ACCENT_NEUTRAL, 0.45), border: "1px solid #E5E7EB",
        ...accentEdge(worst ? ECOSURE_SEVERITY_TONE[worst] : ACCENT_NEUTRAL, 3), borderRadius: 12, padding: "13px 15px", boxShadow: CARD_3D }}>

        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13.5, fontWeight: 800, color: "#0F172A" }}>EcoSure visit</span>
          {rounds.length > 1 ? (
            <select value={shown} onChange={(e) => setRound(e.target.value)}
              style={{ fontFamily: "inherit", fontSize: 12, fontWeight: 700, color: "#334155", border: "1px solid #E5E7EB", borderRadius: 8, padding: "2px 6px" }}>
              {rounds.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          ) : <span style={{ fontSize: 12, fontWeight: 700, color: "#64748B" }}>{shown || "none yet"}</span>}
          {visit && visit.level != null && (
            <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 800, color: "#334155" }}>
              Level {visit.level}{visit.levelLabel ? ` · ${visit.levelLabel}` : ""}
            </span>
          )}
        </div>

        {!visit ? (
          <div style={{ fontSize: 12.5, color: "#94A3B8", marginTop: 6 }}>No visit entered yet.</div>
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: "#64748B", marginTop: 4 }}>
              {sum.total} finding{sum.total === 1 ? "" : "s"}
              {sum.repeats > 0 && <span style={{ color: "#DD0031", fontWeight: 800 }}> · {sum.repeats} repeat</span>}
            </div>
            {visit.findings.map((f) => (
              <div key={f.code} style={{ borderTop: "1px solid #F1F5F9", padding: "8px 0 2px" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 7, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: ".06em", color: "#fff",
                    background: ECOSURE_SEVERITY_TONE[f.severity], borderRadius: 999, padding: "1px 7px" }}>{f.severity}</span>
                  {f.repeat && (
                    <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: ".06em", color: "#991B1B",
                      background: "#FEE2E2", borderRadius: 999, padding: "1px 7px" }}>REPEAT</span>
                  )}
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: "#0F172A" }}>{f.code}</span>
                  <span style={{ fontSize: 11, color: "#94A3B8" }}>{f.category}</span>
                </div>
                <div style={{ fontSize: 12.5, color: "#475569", marginTop: 2, lineHeight: 1.45 }}>{f.detail}</div>
              </div>
            ))}
          </>
        )}

        <div style={{ marginTop: 10 }}>
          <PasteMonth
            buttonLabel="Paste an EcoSure visit"
            accent="#0F766E"
            disabled={readOk !== true}
            disabledNote={readOk === false ? "Saved visits did not load — importing is off so nothing overwrites them." : ""}
            placeholder={"ECOSURE Q2-2026 | 2 | Good\n101.7 | HIGH | REPEAT | TIME & TEMPERATURE | Boards/Cook-line: TCS foods held at or below 40F"}
            onImport={onImport}
          />
          <div style={{ fontSize: 11.5, color: "#94A3B8", marginTop: 6, lineHeight: 1.45 }}>
            Copy the visit page out of Ops Hub, drop it on Claude, and paste the block it hands back.
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FoodSafetyWalkthrough() {
  const [started, setStarted]           = useState(false);
  const [showHistory, setShowHistory]   = useState(false);
  const [expandedIdx, setExpandedIdx]   = useState(null);
  const [leaderName, setLeaderName]     = useState("");
  /* 🐛 WAS toISOString().split("T")[0] — that is UTC, which rolls to tomorrow
     at 8pm Eastern. A walkthrough done in the evening was therefore stamped
     with TOMORROW'S date, and this value is not cosmetic: it goes into the
     submission, the photo storage path, the weekly roll-up, and the Input
     Health completion stamp.
     ⚠️ THE WORST PART IS THE FALSE GREEN. inputRegistry only flags the row
     late when the stamp is EARLIER than the day it wants. A stamp holding
     tomorrow's date is not earlier than today, so the register printed
     "Done" — and it kept printing "Done" the NEXT day too, over a walkthrough
     nobody had done. A confident all-clear on food safety is worse than a
     blank row. en-CA gives the DEVICE's own date as YYYY-MM-DD. */
  const [walkDate, setWalkDate]         = useState(new Date().toLocaleDateString("en-CA"));
  const [activeSection, setActiveSection] = useState("immediate");
  const [checks, setChecks]             = useState({});
  const [notes, setNotes]               = useState({});
  // itemId -> { path, preview } for photo-required checkpoints.
  const [photos, setPhotos]             = useState({});
  const [photoBusy, setPhotoBusy]       = useState(null);
  const [photoErr, setPhotoErr]         = useState(null);
  const photoInputs                     = useRef({});
  const [recent, setRecent]             = useState([]);
  const [savedMsg, setSavedMsg]         = useState(false);

  // Editable-checklist state
  const [config, setConfig]     = useState(DEFAULT_CFG);
  const [manage, setManage]     = useState(false);
  const [rollup, setRollup]     = useState(false); // corrective-items rollup, opened from the findings strip
  const [editId, setEditId]     = useState(null);
  const [addingSec, setAddingSec] = useState(null);
  const [formText, setFormText] = useState("");

  // A failed cfg read → checklist edits refuse until a clean reload (the
  // config is the whole team's edits; a save off a blank read erases them).
  // The walkthrough itself still submits. saveWarn = a config write after a
  // clean load came back false.
  const [cfgLoadFailed, setCfgLoadFailed] = useState(false);
  const cfgLoadFailedRef = useRef(false);
  const [cfgSaveWarn, setCfgSaveWarn] = useState(false);

  useEffect(() => {
    listSubmissions("food-safety", 30).then(setRecent);
    cfgGet().then(({ ok, value: c }) => {
      if (!ok) { cfgLoadFailedRef.current = true; setCfgLoadFailed(true); }
      if (c) setConfig({ added: c.added || {}, overrides: c.overrides || {}, removed: c.removed || [] });
    });
  }, []);

  const effItems = useMemo(() => buildItems(config), [config]);
  const scoreable = useMemo(() =>
    Object.entries(effItems).filter(([s]) => s !== "info").flatMap(([sid, items]) => items.map(i => ({ ...i, sectionId: sid }))), [effItems]);
  const allFlat = useMemo(() =>
    Object.entries(effItems).flatMap(([sid, items]) => items.map(i => ({ ...i, sectionId: sid }))), [effItems]);
  const watchCount = useMemo(() => allFlat.filter(i => i.watch).length, [allFlat]);

  /* ── THIS WEEK'S FINDINGS ──────────────────────────────────────────────
     Replaces the hardcoded "watch items from Q2 audit" chips. Everything here
     comes from walkthroughs actually saved in the last 7 days — the same
     `flaggedItems` the weekly Slack report totals, so the tile and the report
     can never tell different stories.

     Findings are grouped BY ITEM TEXT, not listed per walkthrough: the same
     thing failing on Monday and Thursday is ONE corrective item that has now
     happened twice, and that repeat count is the signal worth acting on.
     Severity keeps the worst tier the item was ever flagged at. */
  const weekFindings = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const rank = { "Immediate Action": 0, "High Risk": 1, "Medium Risk": 2, "Low Risk": 3 };
    const bag = new Map();
    (Array.isArray(recent) ? recent : []).forEach((r) => {
      const t = new Date(r.submitted_at || r.submittedAt || 0).getTime();
      if (!t || t < cutoff) return;
      const p = r.payload || {};
      (Array.isArray(p.flaggedItems) ? p.flaggedItems : []).forEach((f) => {
        if (!f || !f.text) return;
        const cur = bag.get(f.text) || { text: f.text, section: f.section, times: 0, notes: [], last: null, q2: false };
        cur.times += 1;
        if ((rank[f.section] ?? 9) < (rank[cur.section] ?? 9)) cur.section = f.section;
        if (f.note) cur.notes.push({ note: f.note, date: p.walkDate || "", by: r.submitted_by || "" });
        if (!cur.last || (p.walkDate || "") > cur.last) cur.last = p.walkDate || cur.last;
        cur.q2 = cur.q2 || !!f.q2;
        bag.set(f.text, cur);
      });
    });
    /* 🐛 A FIXED ITEM SAT HERE FOR A WEEK (Matt, Aug 6 2026: "are old findings
       staying on the board if they pass the next walkthrough?" — they were, and
       "I still want them in the history view but I dont want them to pile up on
       the dashboard").
       This counts flags across the last 7 days, and nothing ever asked whether
       the item is STILL failing. So a thing flagged on Monday, fixed on Monday
       night and passed every day since kept sitting on the open list until it
       aged out — and the longer a team fixed things, the longer the list got.
       A corrective list that includes work already done stops being read.
       ⇒ AN ITEM IS OPEN ONLY IF THE MOST RECENT WALKTHROUGH STILL FLAGGED IT.
       ⚠️ THE REPEAT COUNT IS KEPT, NOT RECOMPUTED. "flagged 3 times this week
       AND still failing today" is the signal worth acting on; narrowing this to
       just today's flags would throw that away and make a chronic item look
       like a one-off.
       ⚠️ NOTHING IS DELETED. Each walkthrough's own flaggedItems record is
       untouched, so History still shows exactly what was found on the day —
       which is the half he explicitly wanted kept. */
    const newest = (Array.isArray(recent) ? recent : [])
      .filter((r) => { const t = new Date(r.submitted_at || r.submittedAt || 0).getTime(); return t && t >= cutoff; })
      .sort((a, b) => new Date(b.submitted_at || b.submittedAt || 0) - new Date(a.submitted_at || a.submittedAt || 0))[0];
    /* No walkthrough in the window means nothing to clear against, and the
       honest answer is to show the week as it stands rather than an empty list
       that reads like an all-clear. */
    const stillOpen = newest
      ? new Set(((newest.payload || {}).flaggedItems || []).map((f) => f && f.text).filter(Boolean))
      : null;

    return [...bag.values()]
      .filter((v) => !stillOpen || stillOpen.has(v.text))
      .sort((a, b) =>
        (rank[a.section] ?? 9) - (rank[b.section] ?? 9) || b.times - a.times || a.text.localeCompare(b.text));
  }, [recent]);

  const findingTone = (section) => SECTIONS.find((s) => s.label === section) || SECTIONS[4];

  const stats = useMemo(() => {
    const bySection = {};
    for (const s of SECTIONS.filter(s => s.id !== "summary")) {
      const items = effItems[s.id] || [];
      const passed  = items.filter(i => checks[i.id] === "pass").length;
      const flagged = items.filter(i => checks[i.id] === "flag").length;
      bySection[s.id] = { passed, flagged, total: items.length, checked: passed + flagged };
    }
    const sp = scoreable.filter(i => checks[i.id] === "pass").length;
    const sf = scoreable.filter(i => checks[i.id] === "flag").length;
    return { bySection, overall: { passed: sp, flagged: sf, total: scoreable.length, checked: sp + sf } };
  }, [checks, effItems, scoreable]);

  const overallPct = useMemo(() => {
    const { passed, checked } = stats.overall;
    return checked > 0 ? Math.round((passed / checked) * 100) : null;
  }, [stats]);

  // Live flagged-by-tier counts for the summary banner + saved payload
  const severityCounts = useMemo(() =>
    ["immediate", "high", "medium", "low", "info"].reduce((a, id) => {
      a[id] = stats.bySection[id]?.flagged || 0; return a;
    }, {}), [stats]);

  const flaggedItems = useMemo(() => allFlat.filter(i => checks[i.id] === "flag"), [allFlat, checks]);

  const setStatus = (id, newStatus) =>
    setChecks(prev => ({ ...prev, [id]: prev[id] === newStatus ? null : newStatus }));

  const reset = () => {
    setChecks({}); setNotes({}); setPhotos({}); setPhotoErr(null); setStarted(false); setActiveSection("immediate"); setLeaderName(""); setSavedMsg(false);
  };

  // ── Checklist editing ──
  const saveCfg = async (next) => {
    if (cfgLoadFailedRef.current) return; // banner explains — a save would erase the team's edits
    const prev = config;
    setConfig(next);
    if (!(await cfgSet(next))) { setConfig(prev); setCfgSaveWarn(true); return; }
    setCfgSaveWarn(false);
  };
  const cancelForm = () => { setEditId(null); setAddingSec(null); setFormText(""); };
  const commitAdd = (secId) => {
    const text = formText.trim();
    if (!text) return;
    const item = { id: `fsc_${Date.now()}`, watch: false, text };
    saveCfg({ ...config, added: { ...config.added, [secId]: [...(config.added[secId] || []), item] } });
    cancelForm();
  };
  const commitEdit = (secId, item) => {
    const text = formText.trim();
    if (!text) return;
    if (isCustom(item.id)) {
      saveCfg({ ...config, added: { ...config.added, [secId]: (config.added[secId] || []).map(a => a.id === item.id ? { ...a, text } : a) } });
    } else {
      saveCfg({ ...config, overrides: { ...config.overrides, [item.id]: text } });
    }
    cancelForm();
  };
  const removeItem = (secId, item) => {
    if (isCustom(item.id)) {
      saveCfg({ ...config, added: { ...config.added, [secId]: (config.added[secId] || []).filter(a => a.id !== item.id) } });
    } else {
      saveCfg({ ...config, removed: [...config.removed, item.id], overrides: (() => { const o = { ...config.overrides }; delete o[item.id]; return o; })() });
    }
    setChecks(prev => { const n = { ...prev }; delete n[item.id]; return n; });
    setNotes(prev => { const n = { ...prev }; delete n[item.id]; return n; });
    setPhotos(prev => { const n = { ...prev }; delete n[item.id]; return n; });
  };

  /* Upload the moment a photo is chosen, not at submit. A walkthrough is done
     standing in front of a cooler on a shared iPad; batching every image to the
     end means one bad connection loses the lot. Stores the PATH, never a public
     link — same as TrainerTasks. */
  const handlePhoto = async (itemId, file) => {
    if (!file) return;
    setPhotoErr(null);
    setPhotoBusy(itemId);
    const reader = new FileReader();
    reader.onload = () => setPhotos(prev => ({ ...prev, [itemId]: { ...(prev[itemId] || {}), preview: reader.result } }));
    reader.readAsDataURL(file);
    try {
      const who = (leaderName || "unknown").replace(/\s+/g, "_");
      const path = `${who}/${walkDate}/${itemId}-${Date.now()}-${file.name}`;
      const stored = await uploadPhoto(PHOTO_BUCKET, path, file);
      if (!stored) {
        setPhotoErr("Photo didn't upload — check your connection and try again.");
        setPhotos(prev => { const n = { ...prev }; delete n[itemId]; return n; });
      } else {
        setPhotos(prev => ({ ...prev, [itemId]: { ...(prev[itemId] || {}), path: stored } }));
      }
    } catch {
      setPhotoErr("Photo didn't upload — check your connection and try again.");
      setPhotos(prev => { const n = { ...prev }; delete n[itemId]; return n; });
    }
    setPhotoBusy(null);
  };

  /* ⚠️ REQUIRED MEANS REQUIRED, BUT ONLY ONCE THE ITEM HAS BEEN ANSWERED.
     Blocking on an untouched checkpoint would stop someone saving a partial
     walkthrough they haven't reached yet; blocking on an answered one is the
     whole point of Hannah's ruling. */
  const photoMissing = useMemo(
    () => allFlat.filter(i => i.photo && checks[i.id] && !(photos[i.id] || {}).path),
    [allFlat, checks, photos]
  );

  const saveWalk = async () => {
    if (photoMissing.length) {
      setPhotoErr(`Add the required photo for: ${photoMissing.map(i => i.text.split(":")[0]).join(", ")}`);
      return;
    }
    const saved = await saveSubmission("food-safety", leaderName, {
      walkDate, leaderName, overallPct,
      passed: stats.overall.passed,
      flagged: stats.overall.flagged,
      total: stats.overall.total,
      checked: stats.overall.checked,
      severityCounts, // flagged-by-tier — powers the report banner + weekly summary
      flaggedItems: flaggedItems.map(i => ({ section: S[i.sectionId].label, text: i.text, note: notes[i.id] || "", q2: !!i.watch, photoPath: (photos[i.id] || {}).path || null })),
      /* Photos ride separately as well as on any flagged item — a PASSING
         gasket photo is exactly the "what clean looks like" example Hannah
         asked for, and it would be lost if only flagged items carried one. */
      photos: Object.entries(photos).filter(([, v]) => v && v.path)
        .map(([id, v]) => ({ itemId: id, photoPath: v.path, status: checks[id] || null })),
    });
    /* ⚠️ RESULT CHECKED — it used to be discarded. saveSubmission reports a
       refused write by RETURNING FALSE, never by throwing, so a failed save
       still wrote the completion stamp below and Input Health showed the
       walkthrough "Done" over a record that did not exist — a false green on
       food safety, the same lie the Jul 31 date fix closed from another
       direction. No save, no stamp, no green. */
    if (!saved) {
      setPhotoErr("The walkthrough did not save — nothing was lost, it is all still on screen. Check the wifi and press Save again.");
      return;
    }
    setPhotoErr(null);
    /* ★ COMPLETION STAMP (Jul 28 2026) — so something can finally read BACK
       whether the walkthrough happened.
       The rota has assigned this every morning since Jul 24 and **nothing has
       ever checked that it got done**; Input Health has carried the row as
       "Rota assigns it; completion is not yet read back" from the day the
       panel shipped. The submission itself lands in `submissions`, which the
       register cannot reach — `readExtras` only has kvGet — so a tiny KV stamp
       is the bridge, exactly as equipment / thaw / ops checklists already do.
       ⚠️ SMALLEST POSSIBLE RECORD, and no names beyond the leader already on
       the submission. This is a "did it happen" marker, not a second copy of
       the walkthrough — the real detail stays in the submission.
       ⚠️ Failing to stamp must NEVER fail the save. A walkthrough that got
       done and did not record is a reporting gap; a walkthrough that would not
       save is a person standing in the kitchen unable to finish. */
    try {
      await kvSet("gcfcr-foodsafety-stamp-v1", {
        at: new Date().toISOString(),
        iso: walkDate,
        by: leaderName,
        pct: overallPct,
        flagged: stats.overall.flagged,
      });
    } catch {}
    // Per-save email removed — Adriana now gets the weekly roll-up from the
    // worker's foodsafety-weekly job instead of an email on every walkthrough.
    setSavedMsg(true);
    listSubmissions("food-safety", 30).then(setRecent);
  };

  // ── History screen (read-only, no sign-in required) ────────────────────────
  if (!started && showHistory) {
    return (
      <div style={{ background: "#F8FAFC", minHeight: "100vh", fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px" }}>

          <button
            onClick={() => { setShowHistory(false); setExpandedIdx(null); }}
            style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8, padding: "8px 14px", fontSize: 13, color: "#64748B", cursor: "pointer", fontWeight: 600, marginBottom: 20 }}
          >
            ← Back
          </button>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#0F172A", letterSpacing: "-0.02em" }}>Walkthrough History</div>
            <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>
              {recent.length > 0 ? `Last ${recent.length} walkthrough${recent.length === 1 ? "" : "s"} · tap one to see flagged items` : "Saved walkthroughs will appear here"}
            </div>
          </div>

          {recent.length === 0 && (
            <div style={{ background: "#fff", border: "1px dashed #E5E7EB", borderRadius: 10, padding: 28, textAlign: "center", fontSize: 13, color: "#94A3B8" }}>
              No walkthroughs saved yet
            </div>
          )}

          {recent.map((r, i) => {
            const p = r.payload || {};
            const open = expandedIdx === i;
            const fl = Array.isArray(p.flaggedItems) ? p.flaggedItems : [];
            const flCount = p.flagged ?? fl.length;
            const sev = severityFromPayload(p);
            return (
              <div key={r.id || i} style={{ background: cardSurface(), border: `1px solid ${open ? "#CBD5E1" : "#E5E7EB"}`, borderRadius: 10, marginBottom: 8, ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D, overflow: "hidden" }}>
                <div
                  onClick={() => setExpandedIdx(open ? null : i)}
                  style={{ padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{p.walkDate || "—"}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
                      {r.submitted_by || "Leader"} · {fmtWhen(r.submitted_at)}
                      {flCount > 0
                        ? <span style={{ color: "#DC2626" }}> · {flCount} flagged</span>
                        : <span style={{ color: "#16A34A" }}> · clean</span>}
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <SeverityBanner counts={sev} compact />
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                    {p.overallPct != null && (
                      <div style={{ fontSize: 18, fontWeight: 800, color: scoreColor(p.overallPct) }}>{p.overallPct}%</div>
                    )}
                    <span style={{ fontSize: 11, color: "#CBD5E1" }}>{open ? "▲" : "▼"}</span>
                  </div>
                </div>

                {open && (
                  <div style={{ borderTop: "1px solid #F1F5F9", padding: "12px 14px", background: "#F8FAFC" }}>
                    {/* Score + risk breakdown, report-style */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <div style={{ fontSize: 11, color: "#64748B" }}>
                        {p.passed ?? "—"} pass / {p.flagged ?? 0} flagged of {p.checked ?? "—"} checked
                      </div>
                      {p.overallPct != null && (
                        <div style={{ fontSize: 22, fontWeight: 800, color: scoreColor(p.overallPct) }}>{p.overallPct}%</div>
                      )}
                    </div>
                    <div style={{ marginBottom: fl.length ? 14 : 0 }}>
                      <SeverityBanner counts={sev} />
                    </div>
                    {fl.length > 0 ? fl.map((f, j) => (
                      <div key={j} style={{ background: "#FFF1F2", border: "1px solid #FECDD3", borderRadius: 8, padding: "10px 12px", marginBottom: 6 }}>
                        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: "#DC2626", marginBottom: 4 }}>
                          {(f.section || "").toUpperCase()}
                          {f.q2 && <span style={{ marginLeft: 8, background: "#FEF3C7", color: "#92400E", borderRadius: 4, padding: "1px 5px" }}>Q2 FLAG</span>}
                        </div>
                        <div style={{ fontSize: 12, color: "#991B1B", lineHeight: 1.45 }}>{f.text}</div>
                        {f.note && (
                          <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid #FECDD3", fontSize: 11, color: "#B91C1C", fontStyle: "italic" }}>
                            {f.note}
                          </div>
                        )}
                      </div>
                    )) : (
                      <div style={{ fontSize: 12, color: "#15803D", fontWeight: 600 }}>✓ No items flagged</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ── Corrective items rollup ────────────────────────────────────────────
     Matt, Jul 23: corrective items weren't clickable and there was no
     aggregated list. This is that list — every item flagged in the last 7
     days, worst tier first, with how many times it recurred, the notes the
     leader left, and when it was last seen.

     READ-ONLY. It reports what the walkthroughs found; it does not let anyone
     tick an item "fixed" here, because the only honest way to clear a food
     safety finding is to pass that checkpoint on the next walkthrough. A
     tick-box would let an item look resolved while still failing. */
  if (rollup) {
    const grouped = SECTIONS.filter(s => ["immediate", "high", "medium", "low"].includes(s.id))
      .map(s => ({ sec: s, items: weekFindings.filter(f => f.section === s.label) }))
      .filter(g => g.items.length);
    return (
      <div style={{ background: "#F1F5F4", minHeight: "100vh", fontFamily: "'Inter', system-ui, sans-serif", color: "#0F172A" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600;700&display=swap');`}</style>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "22px 20px 60px" }}>
          <button onClick={() => setRollup(false)}
            style={{ border: "none", background: "none", color: "#0F766E", fontSize: 14, fontWeight: 700, cursor: "pointer", padding: "0 0 14px" }}>
            ← Back
          </button>
          <div style={{ fontFamily: "'IBM Plex Mono',ui-monospace,monospace", fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", color: "#64748B" }}>CORRECTIVE ITEMS</div>
          <h1 style={{ margin: "4px 0 4px", fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>
            {weekFindings.length} open {weekFindings.length === 1 ? "item" : "items"} from the last 7 days
          </h1>
          <p style={{ margin: "0 0 20px", color: "#64748B", fontSize: 14, lineHeight: 1.5, maxWidth: 620 }}>
            Everything flagged in a walkthrough this week, worst tier first. An item that keeps appearing is
            counted, not repeated — that repeat number is the one to act on. Items clear by passing on the next walkthrough.
          </p>

          {!weekFindings.length && (
            <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 12, padding: 18, color: "#0F766E", fontWeight: 600 }}>
              Nothing was flagged in the last 7 days.
            </div>
          )}

          {grouped.map(({ sec, items }) => (
            <div key={sec.id} style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: sec.accent }} />
                <span style={{ fontFamily: "'IBM Plex Mono',ui-monospace,monospace", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: sec.accent }}>
                  {sec.label.toUpperCase()} · {items.length}
                </span>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {items.map(f => (
                  <div key={f.text} style={{ background: "#fff", border: `1px solid ${sec.border}`, borderLeft: `3px solid ${sec.accent}`, borderTop: `3px solid ${sec.accent}`, borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <div style={{ flex: 1, fontSize: 14.5, fontWeight: 600, lineHeight: 1.45 }}>{f.text}</div>
                      {f.times > 1 && (
                        <span style={{ flex: "0 0 auto", fontSize: 11.5, fontWeight: 800, color: "#fff", background: sec.accent, borderRadius: 20, padding: "2px 9px" }}>
                          {f.times}×
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>
                      {f.last ? `Last flagged ${f.last}` : ""}{f.q2 ? " · Q2 audit watch item" : ""}
                    </div>
                    {f.notes.map((n, i) => (
                      <div key={i} style={{ fontSize: 13, color: "#334155", background: "#F8FAFC", borderRadius: 8, padding: "7px 10px", marginTop: 6, lineHeight: 1.45 }}>
                        “{n.note}”
                        <span style={{ color: "#94A3B8" }}>{n.by ? ` — ${n.by}` : ""}{n.date ? `, ${n.date}` : ""}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Welcome screen ── redesign: "the inspection" (green anchor, risk scorecard hero, full width)
  if (!started) {
    const totalCheckpoints = SECTIONS.filter(s => ["immediate", "high", "medium", "low"].includes(s.id))
      .reduce((n, s) => n + (effItems[s.id] || []).length, 0);
    return (
      <div style={{ background: "#F1F5F4", minHeight: "100vh", fontFamily: "'Inter', system-ui, sans-serif", color: "#0F172A" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600;700&display=swap');
          .fs-tile{transition:transform .12s ease,box-shadow .12s ease}
          .fs-tile:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(15,23,42,.08)}
          .fs-in:focus{outline:none;border-color:#0F766E;box-shadow:0 0 0 3px rgba(15,118,110,.10)}
          @media (prefers-reduced-motion:reduce){.fs-tile{transition:none}.fs-tile:hover{transform:none}}`}</style>

        {/* ── Report masthead ── */}
        <div style={{ background: "linear-gradient(120deg,#12907F 0%,#0B554F 55%)", color: "#fff", padding: "18px 22px 20px", borderBottom: "3px solid #0B5751" }}>
          <div style={{ maxWidth: 1080, margin: "0 auto", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "'IBM Plex Mono',ui-monospace,monospace", fontSize: 11, letterSpacing: "0.18em", color: "#8FE3D8", fontWeight: 600 }}>FOOD SAFETY INSPECTION</span>
                <span style={{ background: "#E31837", borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 800, letterSpacing: "0.15em" }}>{STORE.name.toUpperCase()} FSR</span>
              </div>
              <div style={{ fontSize: 27, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 }}>Biweekly Walkthrough</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,.72)", marginTop: 7 }}>Based on Safe Eats Q2 2026 · {STORE.name} FSU</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "'IBM Plex Mono',ui-monospace,monospace", fontSize: 10.5, letterSpacing: "0.1em", color: "#8FE3D8", fontWeight: 600 }}>CHECKPOINTS</div>
              <div style={{ fontFamily: "'IBM Plex Mono',ui-monospace,monospace", fontSize: 30, fontWeight: 700, lineHeight: 1 }}>{totalCheckpoints}</div>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "20px 22px 60px" }}>

          {/* ── Risk scorecard (hero) ── */}
          <div style={{ fontFamily: "'IBM Plex Mono',ui-monospace,monospace", fontSize: 11, letterSpacing: "0.12em", color: "#0F766E", fontWeight: 600, marginBottom: 10 }}>RISK BREAKDOWN · SAFE EATS Q2</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 12 }}>
            {SECTIONS.filter(s => ["immediate", "high", "medium", "low"].includes(s.id)).map(s => (
              <div key={s.id} className="fs-tile" style={{ background: "#fff", border: "1px solid #DCE5E3", borderTop: `3px solid ${s.accent}`, borderRadius: 12, padding: "15px 16px" }}>
                <div style={{ fontSize: 12, color: "#64748B", fontWeight: 600 }}>{s.label}</div>
                <div style={{ fontFamily: "'IBM Plex Mono',ui-monospace,monospace", fontSize: 30, fontWeight: 700, color: s.accent, lineHeight: 1.15, margin: "4px 0 1px" }}>{(effItems[s.id] || []).length}</div>
                <div style={{ fontFamily: "'IBM Plex Mono',ui-monospace,monospace", fontSize: 10.5, color: "#94A3B8", letterSpacing: "0.05em" }}>CHECKPOINTS</div>
              </div>
            ))}
          </div>

          {/* ── This week's findings ──────────────────────────────────────
              WAS a hardcoded list of six Q2-audit watch items — the same six
              regardless of what the store actually found, which meant it went
              stale the day it shipped. Now every chip is a real item flagged in
              a walkthrough this week, worst tier first, and tapping any of them
              opens the corrective rollup. A clean week says so. */}
          {weekFindings.length > 0 ? (
            <div
              onClick={() => setRollup(true)}
              style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderLeft: "3px solid #D97706", borderTop: "3px solid #D97706", borderRadius: 10, padding: "12px 15px", marginBottom: 22, cursor: "pointer" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ flex: 1, fontFamily: "'IBM Plex Mono',ui-monospace,monospace", fontSize: 11, fontWeight: 700, color: "#92400E", letterSpacing: "0.08em" }}>
                  ⚑ {weekFindings.length} OPEN {weekFindings.length === 1 ? "ITEM" : "ITEMS"} FROM THIS WEEK
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#B45309" }}>Open list →</div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {weekFindings.slice(0, 8).map(f => {
                  const t = findingTone(f.section);
                  return (
                    <span key={f.text} title={f.section}
                      style={{ fontSize: 12, fontWeight: 600, color: t.accent, background: "#fff", border: `1px solid ${t.border}`, borderRadius: 20, padding: "3px 10px" }}>
                      {f.text.length > 44 ? f.text.slice(0, 42) + "…" : f.text}
                      {f.times > 1 && <b style={{ marginLeft: 6 }}>×{f.times}</b>}
                    </span>
                  );
                })}
                {weekFindings.length > 8 && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#B45309", padding: "3px 4px" }}>+{weekFindings.length - 8} more</span>
                )}
              </div>
            </div>
          ) : (
            <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderLeft: "3px solid #0F766E", borderTop: "3px solid #0F766E", borderRadius: 10, padding: "12px 15px", marginBottom: 22 }}>
              <div style={{ fontFamily: "'IBM Plex Mono',ui-monospace,monospace", fontSize: 11, fontWeight: 700, color: "#0F766E", letterSpacing: "0.08em" }}>
                ✓ NOTHING FLAGGED IN THE LAST 7 DAYS
              </div>
            </div>
          )}

          {/* ── Start walkthrough ── */}
          <div style={{ background: "#fff", border: "1px solid #DCE5E3", borderRadius: 14, padding: "18px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 16, alignItems: "end" }}>
            <div>
              <label style={{ display: "block", fontFamily: "'IBM Plex Mono',ui-monospace,monospace", fontSize: 10, fontWeight: 600, letterSpacing: "0.15em", color: "#64748B", marginBottom: 7 }}>LEADER NAME</label>
              <input
                className="fs-in"
                value={leaderName}
                onChange={e => setLeaderName(e.target.value)}
                placeholder="Your name"
                style={{ width: "100%", background: "#F8FAFC", border: "1.5px solid #DCE5E3", borderRadius: 9, padding: "11px 13px", color: "#0F172A", fontSize: 15, boxSizing: "border-box", outline: "none" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontFamily: "'IBM Plex Mono',ui-monospace,monospace", fontSize: 10, fontWeight: 600, letterSpacing: "0.15em", color: "#64748B", marginBottom: 7 }}>DATE</label>
              <input
                type="date"
                className="fs-in"
                value={walkDate}
                onChange={e => setWalkDate(e.target.value)}
                style={{ width: "100%", background: "#F8FAFC", border: "1.5px solid #DCE5E3", borderRadius: 9, padding: "11px 13px", color: "#0F172A", fontSize: 15, boxSizing: "border-box", outline: "none" }}
              />
            </div>
            <button
              onClick={() => leaderName.trim() && setStarted(true)}
              style={{
                padding: "13px", borderRadius: 9, border: "none",
                background: leaderName.trim() ? "#0F766E" : "#CBD5E1",
                color: "#fff", fontSize: 14, fontWeight: 700, letterSpacing: "0.03em",
                /* 🐛 THE BUTTON SAT ON TOP OF THE DATE FIELD (Matt, Aug 4 2026:
                   "fix the overlap on the food safety"). The grid tracks have a
                   240px floor — 220px until this commit — and "BEGIN WALKTHROUGH
                   →" at 14px bold plus its padding measures wider than 220. A
                   grid item does not shrink below its content when that content
                   cannot wrap, so it spilled out of its track and over the field
                   beside it.
                   ⚠️ nowrap REMOVED as well, deliberately. The wider floor fixes
                   it today, but the failure mode matters more than the fix: if
                   this label is ever reworded longer, wrapping to two lines is
                   untidy and overlapping the date is broken. Choose untidy. */
                cursor: leaderName.trim() ? "pointer" : "default",
                minWidth: 0,
              }}
            >
              BEGIN WALKTHROUGH →
            </button>
            <button
              onClick={() => setShowHistory(true)}
              style={{
                padding: "13px", borderRadius: 9,
                border: "1.5px solid #DCE5E3", background: "#fff",
                color: "#475569", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              🕘 View History{recent.length > 0 ? ` (${recent.length})` : ""}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main walkthrough ────────────────────────────────────────────────────────
  const currentSection = S[activeSection];
  const currentItems   = effItems[activeSection] || [];
  const curStats       = stats.bySection[activeSection] || {};
  const canManage      = EDITABLE_SECTIONS.includes(activeSection);

  return (
    <div style={{ background: "#F8FAFC", minHeight: "100vh", fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Sticky header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", position: "sticky", top: 0, zIndex: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "10px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: "#94A3B8", letterSpacing: "0.1em" }}>{STORE.name.toUpperCase()} FSU · {walkDate}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>{leaderName}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              {overallPct !== null ? (
                <>
                  <div style={{ fontSize: 26, fontWeight: 800, color: scoreColor(overallPct), lineHeight: 1 }}>{overallPct}%</div>
                  <div style={{ fontSize: 10, color: "#94A3B8" }}>
                    {stats.overall.passed} pass
                    {stats.overall.flagged > 0 && <span style={{ color: "#DC2626" }}> · {stats.overall.flagged} flag</span>}
                    {" "}of {stats.overall.total}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 12, color: "#94A3B8" }}>{stats.overall.total} items</div>
              )}
            </div>
          </div>
          {/* Progress bar */}
          <div style={{ height: 4, background: "#F1F5F9", borderRadius: 2 }}>
            <div style={{
              height: "100%",
              width: `${stats.overall.total ? (stats.overall.checked / stats.overall.total) * 100 : 0}%`,
              background: scoreColor(overallPct),
              borderRadius: 2,
              transition: "width 0.2s",
            }} />
          </div>
        </div>
      </div>

      {cfgLoadFailed && (
        <div style={{ maxWidth: 600, margin: "12px auto 0", padding: "0 16px" }}>
          <div style={{ background: "#FFFBEB", border: "1.5px solid #F59E0B", color: "#92400E", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 700 }}>
            The checklist settings did not load, so list edits are off — saving
            now would erase the team's changes. The walkthrough itself still
            submits. Check the wifi and refresh the page.
          </div>
        </div>
      )}
      {!cfgLoadFailed && cfgSaveWarn && (
        <div style={{ maxWidth: 600, margin: "12px auto 0", padding: "0 16px" }}>
          <div style={{ background: "#FEF2F2", border: "1.5px solid #DC2626", color: "#991B1B", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 700 }}>
            That checklist edit did not save — check the wifi and make it again.
          </div>
        </div>
      )}

      {/* ★ THE ECOSURE VISIT — the quarterly audit, beside the walkthrough that
          is meant to catch its findings before it arrives. It sits ABOVE the
          checklist deliberately: a repeat finding is the one thing a leader
          should see before starting today's walkthrough, because it is the item
          the auditor will look at again. */}
      <EcosurePanel />

      {/* Section tabs */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", overflowX: "auto" }}>
        <div style={{ display: "flex", minWidth: "max-content", padding: "0 8px", maxWidth: 600, margin: "0 auto" }}>
          {SECTIONS.map(s => {
            const isActive = activeSection === s.id;
            const st = stats.bySection[s.id] || {};
            return (
              <button
                key={s.id}
                onClick={() => { setActiveSection(s.id); cancelForm(); }}
                style={{
                  padding: "10px 12px",
                  background: "none", border: "none",
                  borderBottom: isActive ? `2.5px solid ${s.accent}` : "2.5px solid transparent",
                  color: isActive ? s.accent : "#94A3B8",
                  fontSize: 12, fontWeight: isActive ? 700 : 400,
                  cursor: "pointer", whiteSpace: "nowrap",
                  display: "flex", alignItems: "center", gap: 5,
                }}
              >
                {s.short}
                {st.flagged > 0 && (
                  <span style={{ background: "#FEE2E2", color: "#DC2626", borderRadius: 10, padding: "0 5px", fontSize: 9, fontWeight: 800 }}>
                    {st.flagged}
                  </span>
                )}
                {st.flagged === 0 && st.checked > 0 && s.id !== "summary" && (
                  <span style={{ color: "#16A34A", fontSize: 9 }}>✓</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "16px" }}>

        {/* ── SUMMARY ── */}
        {activeSection === "summary" && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#0F172A", marginBottom: 2 }}>Walkthrough Summary</div>
              <div style={{ fontSize: 12, color: "#94A3B8" }}>{walkDate} · {leaderName} · {STORE.name} FSU</div>
            </div>

            {/* Score + risk breakdown (violation-report banner) */}
            <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#94A3B8" }}>OVERALL SCORE</div>
                  <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 3 }}>
                    {stats.overall.passed} pass / {stats.overall.flagged} flagged of {stats.overall.checked} checked
                  </div>
                </div>
                <div style={{ fontSize: 40, fontWeight: 800, color: scoreColor(overallPct), lineHeight: 1 }}>
                  {overallPct !== null ? `${overallPct}%` : "—"}
                </div>
              </div>
              <SeverityBanner counts={severityCounts} />
            </div>

            {SECTIONS.filter(s => s.id !== "summary").map(s => {
              const st = stats.bySection[s.id] || {};
              const pct = st.checked > 0 ? Math.round((st.passed / st.checked) * 100) : null;
              return (
                <div key={s.id} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: "12px 16px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: s.accent }}>{s.label}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
                      {st.checked} of {st.total} checked
                      {st.flagged > 0 && <span style={{ color: "#DC2626" }}> · {st.flagged} flagged</span>}
                    </div>
                  </div>
                  {pct !== null
                    ? <div style={{ fontSize: 22, fontWeight: 800, color: scoreColor(pct) }}>{pct}%</div>
                    : <div style={{ fontSize: 14, color: "#CBD5E1" }}>—</div>
                  }
                </div>
              );
            })}

            {flaggedItems.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#DC2626", marginBottom: 12 }}>
                  ⚑  FLAGGED ITEMS ({flaggedItems.length})
                </div>
                {flaggedItems.map(item => {
                  const sec = S[item.sectionId];
                  return (
                    <div key={item.id} style={{ background: "#FFF1F2", border: "1px solid #FECDD3", borderRadius: 10, padding: "12px 14px", marginBottom: 8 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: sec.accent, marginBottom: 5 }}>
                        {sec.label.toUpperCase()}
                        {item.watch && <span style={{ marginLeft: 8, background: "#FEF3C7", color: "#92400E", borderRadius: 4, padding: "1px 5px" }}>Q2 FLAG</span>}
                      </div>
                      <div style={{ fontSize: 13, color: "#991B1B", lineHeight: 1.45 }}>{item.text}</div>
                      {notes[item.id] && (
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #FECDD3", fontSize: 12, color: "#B91C1C", fontStyle: "italic" }}>
                          {notes[item.id]}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {flaggedItems.length === 0 && stats.overall.checked > 0 && (
              <div style={{ background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 10, padding: 20, textAlign: "center", marginTop: 20 }}>
                <div style={{ fontSize: 24 }}>✓</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#15803D", marginTop: 4 }}>No items flagged</div>
                <div style={{ fontSize: 12, color: "#4ADE80", marginTop: 4 }}>All checked items passed</div>
              </div>
            )}

            {/* ⚠️ photoErr was set in five places and rendered in NONE — a
                missing required photo or a failed photo upload produced no
                message at all, so Save just looked dead. This banner is the
                first time any of those messages has been visible. */}
            {photoErr && (
              <div style={{ marginTop: 16, borderRadius: 8, padding: "10px 12px", background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", fontSize: 13, fontWeight: 600 }}>
                {photoErr}
              </div>
            )}

            {/* Save to shared log */}
            <button
              onClick={saveWalk}
              disabled={stats.overall.checked === 0}
              style={{
                marginTop: 24, width: "100%", borderRadius: 8, padding: 14,
                border: "none",
                background: stats.overall.checked === 0 ? "#E5E7EB" : "#E31837",
                color: stats.overall.checked === 0 ? "#94A3B8" : "#fff",
                fontSize: 14, fontWeight: 700, letterSpacing: "0.04em",
                cursor: stats.overall.checked === 0 ? "default" : "pointer",
              }}
            >
              {savedMsg ? "✓  Saved to Shared Log" : "Save Walkthrough to Shared Log"}
            </button>
            {savedMsg && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#15803D", textAlign: "center", fontWeight: 600 }}>
                Recorded — your team can see this walkthrough. {FS_SEAT_FIRST} gets the weekly roll-up.
              </div>
            )}

            {/* Recent walkthroughs (shared) */}
            {recent.length > 0 && (
              <div style={{ marginTop: 28 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#64748B", marginBottom: 12 }}>
                  RECENT WALKTHROUGHS
                </div>
                {recent.slice(0, 8).map((r, i) => {
                  const p = r.payload || {};
                  const fl = p.flagged || 0;
                  const c = scoreColor(p.overallPct ?? null);
                  const sev = severityFromPayload(p);
                  return (
                    <div key={r.id || i} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: "10px 14px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{p.walkDate || ""}</div>
                        <div style={{ fontSize: 11, color: "#94A3B8" }}>
                          {r.submitted_by || "Leader"} · {fmtWhen(r.submitted_at)}
                          {fl > 0 && <span style={{ color: "#DC2626" }}> · {fl} flagged</span>}
                        </div>
                        <div style={{ marginTop: 5 }}><SeverityBanner counts={sev} compact /></div>
                      </div>
                      {p.overallPct != null && (
                        <div style={{ fontSize: 18, fontWeight: 800, color: c, flexShrink: 0, marginLeft: 10 }}>{p.overallPct}%</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <button
              onClick={reset}
              style={{ marginTop: 16, width: "100%", background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8, padding: 14, fontSize: 13, color: "#64748B", cursor: "pointer", fontWeight: 600 }}
            >
              Start New Walkthrough
            </button>
          </div>
        )}

        {/* ── CHECKLIST ── */}
        {activeSection !== "summary" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: currentSection.accent }}>{currentSection.label}</div>
                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 3 }}>
                  {manage ? `${currentItems.length} items` : (
                    <>
                      {curStats.checked || 0} / {curStats.total || 0} checked
                      {curStats.flagged > 0 && <span style={{ color: "#DC2626", marginLeft: 8 }}>· {curStats.flagged} flagged</span>}
                    </>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                {canManage && (
                  <button
                    onClick={() => { setManage(m => !m); cancelForm(); }}
                    style={{ background: manage ? currentSection.accent : "#fff", border: `1.5px solid ${currentSection.accent}`, color: manage ? "#fff" : currentSection.accent, borderRadius: 7, padding: "6px 11px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    {manage ? "✓ Done" : "✎ Manage items"}
                  </button>
                )}
                {!manage && (
                  <div style={{ width: 72 }}>
                    <div style={{ height: 4, background: "#E5E7EB", borderRadius: 2 }}>
                      <div style={{
                        height: "100%",
                        width: curStats.total ? `${(curStats.checked / curStats.total) * 100}%` : "0%",
                        background: currentSection.accent,
                        borderRadius: 2, transition: "width 0.2s",
                      }} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {manage ? (
              /* MANAGE MODE — add / edit / remove checklist items */
              <div>
                {currentItems.map((item, idx) => {
                  const editing = editId === item.id;
                  return (
                    <div key={item.id} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: "12px 14px", marginBottom: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                      {editing ? (
                        <div>
                          <textarea autoFocus value={formText} onChange={e => setFormText(e.target.value)} rows={3}
                            style={{ width: "100%", background: "#F8FAFC", border: `1.5px solid ${currentSection.accent}`, borderRadius: 6, padding: "8px 10px", color: "#1E293B", fontSize: 13, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit", outline: "none" }} />
                          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                            <button onClick={cancelForm} style={{ background: "#fff", border: "1px solid #E5E7EB", color: "#64748B", borderRadius: 6, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
                            <button onClick={() => commitEdit(activeSection, item)} style={{ background: currentSection.accent, border: "none", color: "#fff", borderRadius: 6, padding: "7px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Save changes</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                            <span style={{ fontSize: 10, color: "#CBD5E1", fontWeight: 600 }}>#{idx + 1}</span>
                            {item.watch && <span style={{ fontSize: 9, fontWeight: 800, background: "#FEF3C7", color: "#92400E", borderRadius: 4, padding: "1px 6px", letterSpacing: "0.05em" }}>⚑ Q2 FLAG</span>}
                            {isCustom(item.id) && <span style={{ fontSize: 9, fontWeight: 800, color: "#94A3B8", letterSpacing: "0.05em" }}>ADDED</span>}
                          </div>
                          <div style={{ fontSize: 13, color: "#1E293B", lineHeight: 1.5, marginBottom: 10 }}>{item.text}</div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => { setEditId(item.id); setAddingSec(null); setFormText(item.text); }}
                              style={{ background: "#EEF2FF", border: "1px solid #C7D2FE", color: "#4338CA", borderRadius: 7, padding: "6px 13px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>✎ Edit</button>
                            <button onClick={() => removeItem(activeSection, item)}
                              style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", borderRadius: 7, padding: "6px 13px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>✕ Remove</button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}

                {addingSec === activeSection ? (
                  <div style={{ background: "#fff", border: `1.5px dashed ${currentSection.accent}`, borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
                    <textarea autoFocus value={formText} onChange={e => setFormText(e.target.value)} rows={3} placeholder="New checklist item…"
                      style={{ width: "100%", background: "#F8FAFC", border: "1px solid #E5E7EB", borderRadius: 6, padding: "8px 10px", color: "#1E293B", fontSize: 13, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit", outline: "none" }} />
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                      <button onClick={cancelForm} style={{ background: "#fff", border: "1px solid #E5E7EB", color: "#64748B", borderRadius: 6, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
                      <button onClick={() => commitAdd(activeSection)} style={{ background: currentSection.accent, border: "none", color: "#fff", borderRadius: 6, padding: "7px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Add item</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => { setAddingSec(activeSection); setEditId(null); setFormText(""); }}
                    style={{ width: "100%", background: "#fff", border: `1.5px dashed ${currentSection.accent}`, color: currentSection.accent, borderRadius: 8, padding: "11px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    + Add item to {currentSection.label}
                  </button>
                )}
              </div>
            ) : (
              /* NORMAL MODE — pass / flag */
              currentItems.map((item, idx) => {
                const status = checks[item.id] || null;
                const note   = notes[item.id]  || "";

                const cardBg     = status === "pass" ? "#F0FDF4" : status === "flag" ? "#FFF1F2" : "#fff";
                const cardBorder = status === "pass" ? "#86EFAC"  : status === "flag" ? "#FECDD3"  : "#E2E8F0";
                const textColor  = status === "pass" ? "#15803D"  : status === "flag" ? "#991B1B"  : "#1E293B";

                return (
                  <div key={item.id} style={{ marginBottom: 10 }}>
                    <div style={{
                      background: cardBg,
                      border: `1px solid ${cardBorder}`,
                      borderRadius: status === "flag" ? "10px 10px 0 0" : 10,
                      padding: "12px 14px",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                      transition: "all 0.15s",
                    }}>
                      {/* Number + watch badge */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                        <span style={{ fontSize: 10, color: "#CBD5E1", fontWeight: 600 }}>#{idx + 1}</span>
                        {item.watch && (
                          <span style={{ fontSize: 9, fontWeight: 800, background: "#FEF3C7", color: "#92400E", borderRadius: 4, padding: "1px 6px", letterSpacing: "0.05em" }}>
                            ⚑ Q2 FLAG
                          </span>
                        )}
                      </div>

                      {/* Item text */}
                      <div style={{ fontSize: 13, color: textColor, lineHeight: 1.5, marginBottom: item.watch && item.hint ? 8 : 12 }}>
                        {item.text}
                      </div>

                      {/* Q2 hint */}
                      {item.watch && item.hint && (
                        <div style={{ fontSize: 11, color: "#92400E", lineHeight: 1.4, padding: "7px 10px", background: "#FFFBEB", borderRadius: 6, border: "1px solid #FDE68A", marginBottom: 12 }}>
                          {item.hint}
                        </div>
                      )}

                      {/* ★ REQUIRED PHOTO. Sits ABOVE Pass/Flag on purpose — it
                          is meant to be taken while looking at the thing, not
                          remembered afterwards. Shown whatever the answer:
                          Hannah asked for examples of clean OR dirty. */}
                      {item.photo && (
                        <div style={{ marginBottom: 12, padding: "10px 12px", background: (photos[item.id] || {}).path ? "#F0FDF4" : "#F8FAFC", border: `1px solid ${(photos[item.id] || {}).path ? "#86EFAC" : "#E5E7EB"}`, borderRadius: 8 }}>
                          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", color: (photos[item.id] || {}).path ? "#15803D" : "#B45309", marginBottom: 6 }}>
                            {(photos[item.id] || {}).path ? "✓ PHOTO ATTACHED" : "📷 PHOTO REQUIRED"}
                          </div>
                          {item.photoHint && (
                            <div style={{ fontSize: 11, color: "#64748B", lineHeight: 1.45, marginBottom: 8 }}>{item.photoHint}</div>
                          )}
                          <button
                            onClick={() => photoInputs.current[item.id] && photoInputs.current[item.id].click()}
                            disabled={photoBusy === item.id}
                            style={{ padding: "9px 14px", borderRadius: 7, border: "1.5px solid #CBD5E1", background: "#fff", color: "#334155", fontSize: 13, fontWeight: 700, cursor: photoBusy === item.id ? "default" : "pointer" }}
                          >
                            {photoBusy === item.id ? "Uploading…" : (photos[item.id] || {}).path ? "Replace photo" : "Take or choose a photo"}
                          </button>
                          <input
                            ref={(el) => { photoInputs.current[item.id] = el; }}
                            type="file"
                            accept="image/*"
                            onChange={(e) => handlePhoto(item.id, e.target.files && e.target.files[0])}
                            style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
                          />
                          {(photos[item.id] || {}).preview && (
                            <img src={photos[item.id].preview} alt="" style={{ display: "block", marginTop: 9, maxWidth: "100%", maxHeight: 190, borderRadius: 7, border: "1px solid #E5E7EB" }} />
                          )}
                        </div>
                      )}

                      {/* Pass / Flag buttons */}
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={() => setStatus(item.id, "pass")}
                          style={{
                            flex: 1, padding: "9px 0", borderRadius: 7, border: `1.5px solid ${status === "pass" ? "#16A34A" : "#E5E7EB"}`,
                            background: status === "pass" ? "#16A34A" : "#F8FAFC",
                            color: status === "pass" ? "#fff" : "#94A3B8",
                            fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
                          }}
                        >
                          ✓ Pass
                        </button>
                        <button
                          onClick={() => setStatus(item.id, "flag")}
                          style={{
                            flex: 1, padding: "9px 0", borderRadius: 7, border: `1.5px solid ${status === "flag" ? "#DC2626" : "#E5E7EB"}`,
                            background: status === "flag" ? "#DC2626" : "#F8FAFC",
                            color: status === "flag" ? "#fff" : "#94A3B8",
                            fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
                          }}
                        >
                          ⚑ Flag
                        </button>
                      </div>
                    </div>

                    {/* Notes field */}
                    {status === "flag" && (
                      <div style={{ background: "#FFF1F2", border: "1px solid #FECDD3", borderTop: "none", borderRadius: "0 0 10px 10px", padding: "8px 14px 12px" }}>
                        <textarea
                          value={note}
                          onChange={e => { const v = e.target.value; setNotes(prev => ({ ...prev, [item.id]: v })); }}
                          placeholder="Describe the finding..."
                          rows={2}
                          style={{
                            width: "100%", background: "#fff", border: "1px solid #FECDD3", borderRadius: 6,
                            padding: "8px 10px", color: "#991B1B", fontSize: 12, resize: "none",
                            boxSizing: "border-box", fontFamily: "inherit", outline: "none",
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {/* Next section */}
            {!manage && (() => {
              const idx  = SECTIONS.findIndex(s => s.id === activeSection);
              const next = SECTIONS[idx + 1];
              if (!next) return null;
              return (
                <button
                  onClick={() => setActiveSection(next.id)}
                  style={{ marginTop: 8, width: "100%", background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8, padding: "13px", fontSize: 13, color: "#64748B", cursor: "pointer", fontWeight: 600, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
                >
                  Next: {next.label} →
                </button>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
