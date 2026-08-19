/* ============================================================================
   UniformOrder.jsx — Gate City Hub

   THE INTERNAL UNIFORM ORDER FORM (Bri, Aug 5 2026, asked for more than once).
   Replaces the Google Form she keeps in Drive: "Uniform Order Form - Revised".

   Every item, price, role marker and colour option lives in uniformCatalog.js,
   a leaf that imports nothing. Read that file's header before changing
   anything here — it records that there are TWO uniform forms and that the
   first version of this screen was built from the wrong one.

   ⚠️ THE SIZE MODEL IS HERS, NOT MINE. Her form asks for sizes and colours in
   ONE free-text box covering the whole order ("Please note sizes/color
   preferences for each item if necessary"). A per-item size picker would be a
   better form and it is NOT what she asked for, so the box stays as she wrote
   it. It is required, exactly as on her form.

   ⚠️ ONE THING IS ADDED AND IT IS ARITHMETIC, NOT DESIGN: a running subtotal.
   Every item on her form carries a price and the whole thing is paid by
   payroll deduction, so somebody ticking eleven boxes has a right to see what
   is about to come out of their cheque before they send it. It is labelled a
   subtotal and says tax and shipping are not included, because her own intro
   says so.

   ⚠️ AND ONE THING IS PREVENTED: the two hats marked OUT OF STOCK cannot be
   ticked. Her Google Form happily accepts them.
   ============================================================================ */
import React, { useEffect, useMemo, useState } from "react";
import { CARD_3D, cardSurface, accentEdge, ACCENT_NEUTRAL } from "./cardStyle.js";
import { saveSubmission, kvGetResult, kvSet, uploadPhoto, signedDocUrl } from "./store.js";
import { adminNames } from "./storeConfig.js";
import { UNIFORM_CATEGORIES, UNIFORM_INTRO, UNIFORM_KEY, normaliseCatalog, indexOf, subtotalFrom, isOrderable,
         itemNeeds, lineComplete, SHIRT_SIZES, PAIR_SIZES, SML_SIZES,
         SIZE_SHIRT, SIZE_TEXT, SIZE_PAIR, SIZE_SML, SIZE_NONE,
         FIT_LABELS, FIT_NONE, FIT_MF } from "./uniformCatalog.js";

/* hr-files is already allow-listed for uploads by the worker, so item photos
   need no new bucket and no new storage policy. A public bucket with zero
   policies is the trap that meant Team Goals image upload never once worked. */
const PHOTO_BUCKET = "hr-files";

/* ⚠️ THE PATH IS STORED, NEVER A URL. A provider signed URL is a bearer token
   for that file: it leaks the backend host and lands in the history of a shared
   iPad. Every viewer mints a short-lived one through the worker instead, which
   is the rule the rest of the Hub already follows. */
const photoPathFor = (id) => `uniform/${String(id).replace(/[^\w.-]+/g, "-")}-${Date.now()}.jpg`;

/* Small by default with tap to enlarge — the same control Bri asked for on the
   class pictures, and enlarging happens INLINE so the signed URL never leaves
   the page. */
/* ★ ONE MINTER, TWO VIEWS. The editor's photo enlarges on tap and the ordering
   row's cannot (see ItemThumb), but both need exactly the same short-lived
   signed URL — and a second copy of this effect is a second place for the
   bucket name, the expiry or the cleanup flag to drift. */
function useSignedPhoto(path) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let live = true;
    if (!path) { setUrl(null); return undefined; }
    /* ★ TWO KINDS OF PHOTO, ONE HOOK (Aug 13 2026). A path starting with "/" is
       a BUILT-IN that ships with the app in public/uniform. The uniforms and
       their prices come from Chick-fil-A and are identical at every store, so
       those pictures belong in the code rather than being uploaded into each
       store's database one at a time — which is what was happening here, and
       why a clone's ordering screen had no pictures at all while this one had
       fifty-seven.
       ⚠️ IT NEEDS NO SIGNING AND NO ROUND TRIP. Handing a public path to
       signedDocUrl asks the storage bucket for an object that is not in it, and
       the null that comes back renders as no picture at all.
       ⚠️ A STORE'S OWN UPLOAD STILL WINS, with nothing here needing to know.
       Items carry the built-in path in the seed and uploading overwrites that
       value, so an uploaded photo is simply a different string by the time it
       reaches this hook. That is why THIS store sees no change: its saved
       catalogue already holds fifty-five uploaded paths. */
    if (path.startsWith("/")) { setUrl(path); return undefined; }
    (async () => {
      const u = await signedDocUrl(PHOTO_BUCKET, path, 300).catch(() => null);
      if (live) setUrl(u);
    })();
    return () => { live = false; };
  }, [path]);
  return url;
}

/* ★ THE ORDERING ROW'S PICTURE. Deliberately NOT a button: the row it sits in
   is itself a button, and a button inside a button is invalid markup that
   swallows the tap meant to select the item. Fixed size so sixty rows do not
   jump about as pictures arrive, and it renders nothing at all until the URL
   is ready rather than showing a "loading" line on every row. */
function ItemThumb({ path, alt }) {
  const url = useSignedPhoto(path);
  if (!path || !url) return null;
  return (
    <img src={url} alt={alt || ""} aria-hidden="true"
      style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8,
        border: "1px solid #E5E7EB", flexShrink: 0, marginTop: 1 }} />
  );
}

function ItemPhoto({ path, alt }) {
  const url = useSignedPhoto(path);
  const [big, setBig] = useState(false);
  if (!path) return null;
  if (!url) return <div style={{ fontSize: 11.5, color: "#9CA3AF" }}>🖼 loading…</div>;
  return (
    <button type="button" onClick={() => setBig((b) => !b)}
      title={big ? "Tap to shrink" : "Tap to enlarge"}
      style={{ all: "unset", cursor: "zoom-in", display: "block", width: big ? "100%" : "auto" }}>
      <img src={url} alt={alt || "item"}
        style={{ display: "block", borderRadius: 10, border: "1px solid #E5E7EB",
          maxWidth: "100%", ...(big ? {} : { maxHeight: 64, width: "auto" }) }} />
    </button>
  );
}

/* Who may edit the catalogue (Bri, Aug 5 2026: "Hannah should also be able to
   edit"). Same shape as TeamResources' own gate, including BOTH of Bri's
   spellings — this file would otherwise be the next one to lock her out, which
   is exactly what happened there and was caught by the hardcoded-people census. */
const USER_KEY = "gcfcr-access-user";
/* ⚠️ WAS A HARDCODED Set OF THIS STORE'S PEOPLE. Read at CALL time. */
const normName = (s) => (s || "").trim().toLowerCase();
function canEditCatalog() {
  try {
    const v = JSON.parse(localStorage.getItem(USER_KEY));
    if (!v) return false;
    if (adminNames("uniformOrder").includes(normName(v.name))) return true;
    const r = normName(v.role);
    return r === "owner" || r === "executive director" || r === "human resources"
        || r === "leadership development director";
  } catch { return false; }
}

const INK = "#14243D";
const INK2 = "#4B5563";
const INK3 = "#9CA3AF";
const RED = "#C8102E";
const LINE = "#E5E7EB";

/* ⚠️ A PRICE CAN BE MISSING NOW AND MUST NOT READ AS FREE. Bri can add an item
   before she knows what it costs, so `price` is null until she fills it in.
   `n.toFixed` on null throws; printing $0.00 would be worse than throwing,
   because somebody would order it believing it was free. */
const money = (n) => (Number.isFinite(n) ? `$${n.toFixed(2)}` : "—");

/* Pure, module level. What is wrong with this order right now, keyed by field
   so each control shows its own message instead of one banner that makes
   somebody hunt for the problem. */
export function validateOrder(o) {
  const errs = {};
  const picked = Array.isArray(o.picked) ? o.picked : [];
  if (!String(o.name || "").trim()) errs.name = "We need your name to file the order.";
  if (!picked.length) errs.picked = "Tick at least one item.";
  /* ⚠️ EACH LINE IS CHECKED ON ITS OWN AND NAMED. A single "fill in the sizes"
     error made somebody hunt; this says which item is unanswered, which is the
     whole point of moving the controls into the items. */
  const ix2 = o.index || {};
  const pk = o.picks || {};
  picked.forEach((id) => {
    const it = ix2[id];
    if (it && !lineComplete(it, pk[id])) errs[`line_${id}`] = "Choose the options for this item.";
  });
  /* Defensive: nothing in the UI can tick an out-of-stock item, but an order
     rebuilt from an older draft could carry one. */
  const ix = o.index || {};
  const dead = picked.filter((id) => ix[id] && !isOrderable(ix[id]));
  if (dead.length) errs.picked = "Something you ticked is out of stock. Untick it and send again.";
  return errs;
}

/* ★ WHAT IS STILL MISSING, NAMED, ITEM BY ITEM (Bri, Aug 8 2026: "can we also
   have a pop up or some kind of notification on the main screen if a selection
   is missing? It shows inside an individual item, but can it be visible at the
   bottom what's missing and for which item(s) before it can be submitted?").

   ⚠️ THE PER-ITEM MESSAGE ALREADY EXISTS AND STAYS. Her point is that it is
   INSIDE a collapsed section, so somebody at the bottom of a 60-item form taps
   Send, nothing appears to happen, and there is no way to tell which of the
   seven sections is holding it up. This is the same facts gathered where the
   button is.

   ⚠️ IT NAMES THE SELECTION, NOT JUST THE ITEM. "Red Shea Polo" sends somebody
   back to a row that looks answered to them. "Red Shea Polo — needs a size"
   does not.

   ⚠️ "color", NOT "colour". Bri asked for US spelling on this form
   specifically (Aug 7: "can we change that to US spelling (colors)?") and it
   was fixed once already. Do not let it drift back.

   ⚠️ PURE AND AT MODULE LEVEL, beside validateOrder for the same reason: it is
   read during render, and a helper declared inside the component can be reached
   in its temporal dead zone. */
export function missingLines(o) {
  const picked = Array.isArray(o.picked) ? o.picked : [];
  const ix = o.index || {};
  const pk = o.picks || {};
  const out = [];
  picked.forEach((id) => {
    const it = ix[id];
    if (!it || lineComplete(it, pk[id])) return;
    const need = itemNeeds(it);
    const p = pk[id] || {};
    const wants = [];
    if (need.size && !String(p.size || "").trim()) wants.push("a size");
    if (need.colors && !String(p.color || "").trim()) wants.push("a color");
    if (need.fit && !String(p.fit || "").trim()) wants.push("male or female");
    out.push({ id, label: (it && it.label) || "This item", wants });
  });
  return out;
}

export function buildOrder(o) {
  const picked = Array.isArray(o.picked) ? o.picked : [];
  const ix = o.index || {};
  const lines = picked
    .map((id) => ix[id])
    .filter(Boolean)
    .map((it) => {
      const p = (o.picks || {})[it.id] || {};
      return {
        id: it.id, item: it.label, category: it.category,
        price: it.price, only: it.only || null,
        /* Only what the item actually asked for reaches the record. An empty
           string here would read as "they left it blank" rather than "it was
           never asked", and whoever fulfils it cannot tell those apart. */
        size: String(p.size || "").trim() || null,
        color: String(p.color || "").trim() || null,
        fit: p.fit ? (FIT_LABELS[p.fit] || String(p.fit)) : null,
      };
    });
  return {
    name: String(o.name || "").trim(),
    lines,
    /* Named `subtotal`, never `total`. Tax and shipping are unknown here. */
    subtotal: subtotalFrom(ix, picked),
    /* Kept, empty, so a reader written against the old shape still finds the
       key rather than throwing on undefined. Sizes now live on each line. */
    sizeNotes: "",
    comments: String(o.comments || "").trim(),
    at: new Date().toISOString(),
  };
}

/* 🐛 THE NAME WAS NEVER WIRED TO THE SIGN-IN (Bri, Aug 5 2026: "did the
   automatic name filler get added? My view is still showing manual entry",
   and again the next morning).
   She was told "name comes from their sign-in, not typed" when the ordering
   side was designed. It was designed that way and never built: `name` started
   as "" and nothing ever seeded it, while USER_KEY was read only by the
   editor gate a few lines below. So the one field everybody fills in was
   still being typed by hand, sixty orders at a time.
   ⚠️ PREFILLED, STILL EDITABLE. Locking it would break the real case of a
   leader ordering on behalf of somebody who has no sign-in yet — a new hire
   getting their first uniform is exactly when that happens. */
/* 🐛 IT MUST BE PARSED. `gcfcr-access-user` holds JSON.stringify(person), not a
   name — App.jsx writes it that way in two places. Reading it as a plain string
   put the WHOLE BLOB in the box, so an order filed as
   {"id":"20","name":"Daisy","role":"Director",...} instead of
   a person, and Hannah would have been fulfilling it.
   ⚠️ canEditCatalog() TEN LINES ABOVE ALREADY DOES THIS CORRECTLY. Two readers
   of one key in one file and only one of them right is the whole reason this
   class of bug keeps happening here. Read the neighbour before writing the
   second reader. */
const signedInName = () => {
  try {
    const v = JSON.parse(localStorage.getItem(USER_KEY));
    return v && typeof v.name === "string" ? v.name.trim() : "";
  } catch { return ""; }
};

export default function UniformOrder() {
  const [name, setName] = useState(signedInName);
  const [picked, setPicked] = useState([]);
  /* ⚠️ ONE ANSWER SET PER ITEM, KEYED BY ITEM ID (Bri, Aug 5 2026: "took off
     the size and color box and moved those to options inside each item").
     The old single notes box put the whole job on the person ordering and gave
     whoever fulfils it nothing to check. Now each item asks only for what it
     actually needs, and the validator can tell when one is unanswered. */
  const [picks, setPicks] = useState({});   // id -> { size, color, fit }
  const [comments, setComments] = useState("");
  const [open, setOpen] = useState(UNIFORM_CATEGORIES[0].id);
  const [errs, setErrs] = useState({});
  const [state, setState] = useState("");   // "" | "saving" | "done" | "failed"

  /* ⚠️ A FAILED READ IS NOT AN EMPTY CATALOGUE. `readOk` starts null (unknown)
     and only becomes true when the read actually succeeded. Every save path
     below refuses while it is false, because falling through to the seed and
     then saving would wipe every price Bri had changed — one bad moment of wifi
     undoing an afternoon of work. TeamResources documents this same trap, and
     the reason it is documented there is that it happened. */
  const [cats, setCats] = useState(() => normaliseCatalog(UNIFORM_CATEGORIES));
  const [readOk, setReadOk] = useState(null);
  const [editing, setEditing] = useState(false);
  const mayEdit = useMemo(() => canEditCatalog(), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await kvGetResult(UNIFORM_KEY);
      if (!alive) return;
      if (!r.ok) { setReadOk(false); return; }          // keep the seed on screen, refuse to save
      setReadOk(true);
      const saved = normaliseCatalog(r.value);
      if (saved.length) setCats(saved);
    })();
    return () => { alive = false; };
  }, []);

  const index = useMemo(() => indexOf(cats), [cats]);
  const draft = { name, picked, picks, comments, index };
  const subtotal = useMemo(() => subtotalFrom(index, picked), [index, picked]);

  const toggle = (id) => {
    setPicked((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
    /* Unticking clears that item's answers, so a size from an item somebody
       changed their mind about can never ride along on a later order. */
    setPicks((m) => {
      if (!picked.includes(id)) return m;
      const next = { ...m }; delete next[id]; return next;
    });
  };
  /* ⚠️ REFUSES WHILE readOk IS NOT true. If the read failed we are showing the
     SEED, and saving that would overwrite every price and photo Bri has set
     with the sixty defaults. A refused save says so; a silent one loses her
     afternoon. */
  const [saveMsg, setSaveMsg] = useState("");
  const [priceDraft, setPriceDraft] = useState({});
  /* 🐛 SPACES DID NOT REGISTER (Bri, Aug 7 2026: "spaces not registering in the
     edit boxes of the uniform ordering form -- who can order and colours
     section").
     Both boxes NORMALISED ON EVERY KEYSTROKE. `only` stored `v.trim()`, so the
     space she had just typed was removed before the next character arrived and
     "AD Only" came out "ADOnly". `colors` re-joined from the parsed array, so
     typing ", " to begin the next colour vanished under her.
     Same shape as the cents bug on the price field, and the same fix: hold
     exactly what she types until she leaves the field.
     ⚠️ KEYED BY `${itemId}:field`, not by item. One item has both boxes, and a
     shared draft would put the colours into the who-can-order line. */
  const [textDraft, setTextDraft] = useState({});
  const draftKey = (id, field) => `${id}:${field}`;
  const saveCatalog = async (next) => {
    if (readOk !== true) {
      setSaveMsg("Not saved — the catalogue could not be read, so saving would overwrite it. Reopen the tool.");
      return false;
    }
    setCats(next);
    const ok = await kvSet(UNIFORM_KEY, next);
    setSaveMsg(ok ? "Saved" : "That did not save. Check the connection and try again.");
    if (ok) setTimeout(() => setSaveMsg(""), 1600);
    return ok;
  };

  /* Every edit is the same shape: replace one item inside one category. */
  const editItem = (catId, itemId, patch) => saveCatalog(cats.map((c) => (c.id !== catId ? c : {
    ...c, items: c.items.map((it) => (it.id !== itemId ? it : { ...it, ...patch })),
  })));
  const addItem = (catId) => saveCatalog(cats.map((c) => (c.id !== catId ? c : {
    ...c,
    /* ⚠️ A UNIQUE id THAT CANNOT COLLIDE WITH AN EXISTING ONE. Reusing an id
       would make a new item share a saved order's line, and the order would
       silently change what it says somebody bought. */
    items: [...c.items, { id: `${c.id}-new-${Date.now()}`, label: "New item", price: null,
      sizeType: SIZE_NONE, fit: FIT_NONE, colors: null, stock: null, photo: null }],
  })));
  const removeItem = (catId, itemId) => {
    const it = (cats.find((c) => c.id === catId)?.items || []).find((x) => x.id === itemId);
    if (!window.confirm(`Remove "${(it && it.label) || "this item"}" from the catalogue?\n\nOrders already placed keep it — this only stops it being ordered again.`)) return;
    saveCatalog(cats.map((c) => (c.id !== catId ? c : { ...c, items: c.items.filter((x) => x.id !== itemId) })));
  };

  /* ★ SECTION EDITING (Bri, Aug 5 2026: "I want to also add/delete/reorder
     sections and rename them"). Same shape as the item mutations above: build
     the next catalogue and hand it to saveCatalog, which is the one place that
     refuses while the read is unproven. */
  const renameCat = (catId, label) =>
    saveCatalog(cats.map((c) => (c.id !== catId ? c : { ...c, label })));

  const setCatOnly = (catId, only) =>
    saveCatalog(cats.map((c) => (c.id !== catId ? c : { ...c, only: only.trim() || null })));

  /* ⚠️ A TIMESTAMPED id, like the items. A reused section id would make a new
     section collide with a saved order's category name. */
  const addCat = () => saveCatalog([...cats, { id: `cat-${Date.now()}`, label: "New section", only: null, items: [] }]);

  const removeCat = (catId) => {
    const c = cats.find((x) => x.id === catId);
    const n = c ? c.items.length : 0;
    /* ⚠️ DELETING A SECTION DELETES ITS ITEMS, AND THE COUNT IS IN THE PROMPT.
       "Remove this section?" on a section holding fourteen priced items is not
       an informed question. Orders already placed keep their lines either way,
       because a submission is a copy, not a pointer. */
    if (!window.confirm(
      `Remove "${(c && c.label) || "this section"}"` +
      (n ? ` and the ${n} item${n > 1 ? "s" : ""} in it` : "") +
      `?\n\nOrders already placed keep everything they listed. This only stops these being ordered again.`
    )) return;
    saveCatalog(cats.filter((x) => x.id !== catId));
  };

  const moveCat = (catId, dir) => {
    const i = cats.findIndex((c) => c.id === catId);
    const j = i + dir;
    /* Silently doing nothing at the ends is right — the arrows are disabled
       there too, and this is the guard for the case where they are not. */
    if (i < 0 || j < 0 || j >= cats.length) return;
    const next = cats.slice();
    [next[i], next[j]] = [next[j], next[i]];
    saveCatalog(next);
  };

  const uploadItemPhoto = async (catId, it, file) => {
    if (!file) return;
    setSaveMsg("Uploading…");
    try {
      const path = await uploadPhoto(PHOTO_BUCKET, photoPathFor(it.id), file);
      await editItem(catId, it.id, { photo: typeof path === "string" ? path : (path && path.path) || null });
    } catch (e) {
      setSaveMsg(`Photo did not upload: ${e && e.message ? e.message : "unknown error"}`);
    }
  };

  const setPick = (id, field, v) =>
    setPicks((m) => ({ ...m, [id]: { ...(m[id] || {}), [field]: v } }));

  const submit = async () => {
    const e = validateOrder(draft);
    setErrs(e);
    if (Object.keys(e).length) return;
    setState("saving");
    /* ⚠️ THREE ARGUMENTS: (tool, submittedBy, payload), and the result is a
       boolean that is false on a refused write rather than a throw. Telling
       somebody their uniform is ordered when nothing was written is the worst
       outcome this screen has. */
    const order = buildOrder(draft);
    let ok = false;
    try { ok = await saveSubmission("uniform-order", order.name, order); }
    catch { ok = false; }
    setState(ok ? "done" : "failed");
  };

  const card = {
    background: "#fff", backgroundImage: cardSurface(ACCENT_NEUTRAL, 0.5),
    border: `1px solid ${LINE}`, borderRadius: 12, padding: "13px 15px",
    marginBottom: 11, ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D,
  };
  const input = {
    fontSize: 15, padding: "9px 11px", borderRadius: 9, border: `1px solid ${LINE}`,
    width: "100%", boxSizing: "border-box", color: INK, background: "#fff", outline: "none",
  };
  const errStyle = { fontSize: 12, color: RED, fontWeight: 700, marginTop: 5 };
  const optLabel = { fontSize: 11.5, fontWeight: 800, color: INK, marginBottom: 5,
    textTransform: "uppercase", letterSpacing: ".04em" };
  const chip = (on) => ({ padding: "6px 11px", borderRadius: 9, cursor: "pointer", fontFamily: "inherit",
    fontSize: 12.5, fontWeight: 800, border: `1px solid ${on ? INK : LINE}`,
    background: on ? INK : "#fff", color: on ? "#fff" : INK2 });

  if (state === "done") {
    return (
      <div style={{ padding: "24px 6px" }}>
        <div style={{ ...card, textAlign: "center" }}>
          <div style={{ fontSize: 34, marginBottom: 6 }}>✅</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: INK }}>Order sent</div>
          <div style={{ fontSize: 13, color: INK2, marginTop: 6, lineHeight: 1.5 }}>
            {/* 🐛 THIS SAID "Leadership Development" (Bri, Aug 8 2026: "this needs
                to say with HR"). Orders land in Hannah's uniform tab in HR
                Console and always have — the confirmation named the wrong
                department to every person who has ordered, and the one thing it
                exists to tell them is where their order went. */}
            It is filed with HR. The cost comes out through payroll deduction.
            If you asked for it to be split across two checks, that is in your
            comments and they will sort it out.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "0 4px 96px" }}>
      <p style={{ fontSize: 12.5, color: INK2, lineHeight: 1.55, margin: "0 0 14px" }}>{UNIFORM_INTRO}</p>

      {/* Only Bri, Hannah and the HR/LDD roles ever see this. */}
      {mayEdit && (
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12, flexWrap: "wrap" }}>
          <button type="button" onClick={() => setEditing((v) => !v)} style={chip(editing)}>
            {editing ? "Done editing" : "Edit catalogue"}
          </button>
          {saveMsg && (
            <span style={{ fontSize: 12, fontWeight: 700,
              color: /not save|could not|did not/i.test(saveMsg) ? RED : "#0F766E" }}>{saveMsg}</span>
          )}
          {/* ⚠️ SAYS SO RATHER THAN FAILING QUIETLY. If the read failed we are
              showing the seed, and every edit would overwrite the real thing. */}
          {readOk === false && (
            <span style={{ fontSize: 12, fontWeight: 700, color: RED }}>
              Catalogue could not be read — editing is off. Reopen the tool.
            </span>
          )}
        </div>
      )}

      <div style={card}>
        <label style={{ fontSize: 12.5, fontWeight: 800, color: INK, display: "block", marginBottom: 6 }}>
          Your name
        </label>
        <input style={input} value={name} onChange={(e) => setName(e.target.value)}
          placeholder="First and last name" autoComplete="name" />
        {errs.name && <div style={errStyle}>{errs.name}</div>}
      </div>

      {cats.map((cat, ci) => {
        const isOpen = open === cat.id;
        const n = cat.items.filter((it) => picked.includes(it.id)).length;
        return (
          <div key={cat.id} style={{ ...card, padding: 0, overflow: "hidden" }}>
            <button type="button" onClick={() => setOpen(isOpen ? "" : cat.id)}
              style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left",
                background: "none", border: "none", padding: "12px 15px", cursor: "pointer", fontFamily: "inherit" }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 14.5, fontWeight: 800, color: INK }}>{cat.label}</span>
                <span style={{ display: "block", fontSize: 11.5, color: INK3, marginTop: 1 }}>
                  {cat.items.length} items{cat.only ? ` · ${cat.only}` : ""}
                </span>
              </span>
              {n > 0 && (
                <span style={{ fontSize: 11.5, fontWeight: 800, color: "#fff", background: INK,
                  borderRadius: 999, padding: "2px 9px" }}>{n}</span>
              )}
              <span style={{ fontSize: 13, color: INK3 }}>{isOpen ? "▲" : "▼"}</span>
            </button>

            {/* ★ SECTION EDITING. Sits under the header rather than inside it,
                because the header is a button and a button must not contain
                other controls — the same trap the item options hit. */}
            {editing && (
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center",
                padding: "0 15px 11px" }}>
                <input style={{ ...input, flex: "2 1 140px" }} value={cat.label}
                  onChange={(e) => { const v = e.target.value; renameCat(cat.id, v); }}
                  placeholder="Section name" />
                {/* Bri: "I'd like an area to edit the roles label to order (right
                    now these are labels, but I want to edit or add if needed)." */}
                <input style={{ ...input, flex: "1 1 120px" }} value={cat.only || ""}
                  onChange={(e) => { const v = e.target.value; setCatOnly(cat.id, v); }}
                  placeholder="Who it is for, e.g. AD Only" />
                <button type="button" onClick={() => moveCat(cat.id, -1)} disabled={ci === 0}
                  style={{ ...chip(false), opacity: ci === 0 ? 0.4 : 1 }} aria-label="Move section up">↑</button>
                <button type="button" onClick={() => moveCat(cat.id, 1)} disabled={ci === cats.length - 1}
                  style={{ ...chip(false), opacity: ci === cats.length - 1 ? 0.4 : 1 }} aria-label="Move section down">↓</button>
                <button type="button" onClick={() => removeCat(cat.id)}
                  style={{ ...chip(false), color: RED, borderColor: "#F3D6C4" }}>Remove section</button>
              </div>
            )}

            {isOpen && (
              <div style={{ padding: "0 15px 12px" }}>
                {cat.items.map((it) => {
                  const on = picked.includes(it.id);
                  const dead = !isOrderable(it);
                  return (
                    /* ⚠️ THE ROW IS A WRAPPER NOW, NOT A BARE BUTTON. The
                       options panel is a SIBLING of the button, and a button
                       cannot contain interactive controls — nesting the size
                       chips inside it would make every tap on a chip also
                       toggle the item off. `key` moves up here with it. */
                    <div key={it.id} style={{ borderTop: `1px solid ${LINE}` }}>
                    <button type="button" disabled={dead}
                      onClick={() => !dead && toggle(it.id)}
                      style={{ display: "flex", alignItems: "flex-start", gap: 10, width: "100%",
                        textAlign: "left", background: "none", border: "none",
                        padding: "10px 0",
                        cursor: dead ? "default" : "pointer", opacity: dead ? 0.45 : 1,
                        fontFamily: "inherit" }}>
                      <span style={{ width: 21, height: 21, borderRadius: 6, flexShrink: 0, marginTop: 1,
                        border: `2px solid ${on ? INK : "#CBD5E1"}`, background: on ? INK : "#fff",
                        color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 13, fontWeight: 900, lineHeight: 1 }}>{on ? "✓" : ""}</span>
                      {/* 🐛 THE PHOTO WAS ONLY EVER RENDERED IN THE EDITOR (Bri,
                          Aug 5 2026: "Photos are being attached, but not
                          visible on the ordering view", and again the next
                          morning). She was right and the upload was never the
                          problem — <ItemPhoto> appeared exactly once in this
                          file, inside the `editing &&` block, so the person
                          choosing a uniform saw a name and a price while the
                          person who uploaded the picture saw it fine. Exactly
                          the editor-writes-one-thing / renderer-reads-another
                          split, and the reason to always check both sides.
                          ⚠️ A THUMBNAIL, NOT THE ENLARGING BUTTON. ItemPhoto's
                          tap-to-enlarge is a <button>, and this row is itself a
                          button — nesting one inside the other is invalid and
                          would swallow the tap that selects the item. Here the
                          picture is decoration for a row whose whole job is to
                          be tapped; enlarging stays in the editor where there
                          is no outer button to fight. */}
                      {it.photo && <ItemThumb path={it.photo} alt={it.label} />}
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: INK, flex: 1, minWidth: 0 }}>
                            {it.label}
                          </span>
                          <span style={{ fontSize: 13.5, fontWeight: 800, whiteSpace: "nowrap",
                            color: Number.isFinite(it.price) ? INK2 : INK3 }}>
                            {money(it.price)}
                          </span>
                        </span>
                        {/* Her role markers, kept word for word — who may order
                            a Durant Pullover is her call, not something to
                            paraphrase into something friendlier. */}
                        <span style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 3 }}>
                          {it.only && (
                            <span style={{ fontSize: 10.5, fontWeight: 800, color: "#8A5B00",
                              background: "#FFF7E6", borderRadius: 999, padding: "1px 8px" }}>{it.only}</span>
                          )}
                          {it.colors && (
                            <span style={{ fontSize: 10.5, fontWeight: 700, color: INK2,
                              background: "#F1F3F6", borderRadius: 999, padding: "1px 8px" }}>
                              {it.colors.join(" or ")}
                            </span>
                          )}
                          {/* 🐛 TWO PILLS USED TO PRINT HERE AND WOULD NOT GO AWAY
                              (Bri, Aug 7 2026: "The Unisex Performance Sleeves
                              are still showing the S/M or L/XL permanently,
                              under the name. Together Polo, Serramonte Polo,
                              Hayden Jacket, and Hayden Vest are still showing
                              Male or Female permanently under their names.
                              Please remove any of these labels that I can now
                              set myself.")
                              `it.sizes` and `it.tag` are LEFTOVERS from before
                              the per-item model. Neither drives anything —
                              itemNeeds reads `sizeType` and `fit` — so they were
                              pure decoration that contradicted her settings.
                              They are dropped in normaliseItem now, and their
                              meaning is carried across to the real fields there
                              rather than thrown away. The colours pill above
                              stays: colours ARE a live field and she said that
                              one behaves right. */}
                          {/* `tag` still renders. "Fleece lined" and "Limited
                              edition" are descriptions Bri wrote and she did not
                              ask to lose them — only the Male/Female one, which
                              normaliseItem now strips because `fit` owns that
                              question. Removing the whole pill would have taken
                              two useful labels with it. */}
                          {it.tag && (
                            <span style={{ fontSize: 10.5, fontWeight: 700, color: INK2,
                              background: "#F1F3F6", borderRadius: 999, padding: "1px 8px" }}>{it.tag}</span>
                          )}
                          {dead && (
                            <span style={{ fontSize: 10.5, fontWeight: 800, color: RED,
                              background: "#FEF2F2", borderRadius: 999, padding: "1px 8px" }}>Out of stock</span>
                          )}
                        </span>
                      </span>
                    </button>
                    {/* ★ THE EDIT PANEL. Bri and Hannah only — everyone else
                        never renders it. What she sets here decides what the
                        person ordering is asked for, which is the whole point:
                        "for editing, I want a selection for the different
                        sizing options the item needs". */}
                    {editing && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${LINE}`,
                        display: "flex", flexDirection: "column", gap: 9, background: "#FCFBF8",
                        borderRadius: 10, padding: 11 }}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <input style={{ ...input, flex: "2 1 150px" }} value={it.label}
                            onChange={(e) => editItem(cat.id, it.id, { label: e.target.value })}
                            placeholder="Item name" />
                          {/* 🐛 CENTS COULD NOT BE TYPED (Bri, Aug 5 2026: "Some of
                              my pricing adjustments are not being input --
                              specifically if i need to change the cents").
                              The field was controlled by the NUMBER. Typing
                              "28." ran Number("28.") = 28, which re-rendered
                              the box as "28" and ate the decimal point the
                              instant she typed it. There was no way through to
                              the cents at all.
                              ⚠️ THE DRAFT IS A STRING AND THE STORE IS A NUMBER.
                              What she is typing has to stay exactly as typed
                              until she stops, because half-typed decimals are
                              not numbers yet. */}
                          <input style={{ ...input, flex: "1 1 90px" }} inputMode="decimal"
                            value={priceDraft[it.id] !== undefined ? priceDraft[it.id]
                                   : (it.price == null ? "" : String(it.price))}
                            onChange={(e) => {
                              /* ⚠️ CAPTURED FIRST. Reading e.target inside the
                                 updater is a recycled-event read — the check
                                 caught this on the way in. */
                              const v = e.target.value;
                              setPriceDraft((m) => ({ ...m, [it.id]: v }));
                            }}
                            onBlur={() => {
                              const raw = priceDraft[it.id];
                              if (raw === undefined) return;
                              const v = String(raw).trim();
                              /* Empty means "not priced yet", which is null and must
                                 never become 0 — somebody would order it believing it
                                 was free. A value that is not a number at all is left
                                 alone rather than saved as NaN. */
                              const n = v === "" ? null : Number(v);
                              if (v !== "" && !Number.isFinite(n)) { setPriceDraft((m) => { const x = { ...m }; delete x[it.id]; return x; }); return; }
                              editItem(cat.id, it.id, { price: n });
                              setPriceDraft((m) => { const x = { ...m }; delete x[it.id]; return x; });
                            }}
                            placeholder="Price" />
                        </div>
                        <div>
                          <div style={optLabel}>What size does it need?</div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {[[SIZE_NONE, "No size"], [SIZE_SHIRT, "Shirt XS-5X"],
                              [SIZE_TEXT, "Typed box"], [SIZE_PAIR, "S/M or L/XL"],
                              /* Bri, Aug 7 2026: "add another option to the size
                                 selections for editing -- one for the options
                                 [s, m, and l]". */
                              [SIZE_SML, "Small / Medium / Large"]].map(([v, lbl]) => (
                              <button key={v} type="button" onClick={() => editItem(cat.id, it.id, { sizeType: v })}
                                style={chip((it.sizeType || SIZE_NONE) === v)}>{lbl}</button>
                            ))}
                          </div>
                        </div>
                        {it.sizeType === SIZE_TEXT && (
                          <input style={input} value={it.sizeHint || ""}
                            onChange={(e) => editItem(cat.id, it.id, { sizeHint: e.target.value })}
                            placeholder="What to type, e.g. Waist and length" />
                        )}
                        <div>
                          {/* An item can carry its own restriction even inside a
                              section that has none — "BOH Team Members" sits on
                              one shirt in a section with no rule at all. */}
                          <div style={optLabel}>Who can order this</div>
                          <input style={input}
                            value={textDraft[draftKey(it.id, "only")] !== undefined
                                   ? textDraft[draftKey(it.id, "only")] : (it.only || "")}
                            onChange={(e) => {
                              /* Captured first. Reading e.target inside the
                                 updater is a recycled-event read. */
                              const v = e.target.value;
                              setTextDraft((m) => ({ ...m, [draftKey(it.id, "only")]: v }));
                            }}
                            onBlur={() => {
                              const k = draftKey(it.id, "only");
                              const raw = textDraft[k];
                              if (raw === undefined) return;
                              editItem(cat.id, it.id, { only: String(raw).trim() || null });
                              setTextDraft((m) => { const x = { ...m }; delete x[k]; return x; });
                            }}
                            placeholder="Leave blank for anyone. Otherwise: AD Only" />
                        </div>
                        <div>
                          {/* US spelling — Bri, Aug 7 2026: "can we change that
                              to US spelling (colors)?" The only reader-facing
                              one; the comment at the top of this file keeps her
                              original wording because it quotes her form. */}
                          <div style={optLabel}>Colors</div>
                          <input style={input}
                            value={textDraft[draftKey(it.id, "colors")] !== undefined
                                   ? textDraft[draftKey(it.id, "colors")] : (it.colors || []).join(", ")}
                            onChange={(e) => {
                              const v = e.target.value;
                              setTextDraft((m) => ({ ...m, [draftKey(it.id, "colors")]: v }));
                            }}
                            onBlur={() => {
                              /* Blank means no colour choice, and then the
                                 orderer is never asked. Split happens HERE, on
                                 the way out, not on every keystroke. */
                              const k = draftKey(it.id, "colors");
                              const raw = textDraft[k];
                              if (raw === undefined) return;
                              const list = String(raw).split(",").map((x) => x.trim()).filter(Boolean);
                              editItem(cat.id, it.id, { colors: list.length ? list : null });
                              setTextDraft((m) => { const x = { ...m }; delete x[k]; return x; });
                            }}
                            placeholder="Leave blank for no color options. Otherwise: Red, Navy" />
                        </div>
                        <div>
                          <div style={optLabel}>Male or female</div>
                          <div style={{ display: "flex", gap: 6 }}>
                            {[[FIT_NONE, "Not asked"], [FIT_MF, "Ask male or female"]].map(([v, lbl]) => (
                              <button key={v} type="button" onClick={() => editItem(cat.id, it.id, { fit: v })}
                                style={chip((it.fit || FIT_NONE) === v)}>{lbl}</button>
                            ))}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <button type="button" onClick={() => editItem(cat.id, it.id, { stock: it.stock === "out" ? null : "out" })}
                            style={chip(it.stock === "out")}>
                            {it.stock === "out" ? "Out of stock" : "In stock"}
                          </button>
                          {/* Bri: "I do not see the option to upload images with
                              each — is this built yet or am I overlooking it?"
                              It was built and it looked like the two grey chips
                              beside it, so it read as another toggle rather than
                              an upload. Given a camera and its own colour. */}
                          <label style={{ ...chip(false), cursor: "pointer",
                            borderColor: "#0F766E", color: "#0F766E", background: "#E4F3EE" }}>
                            {it.photo ? "📷 Replace photo" : "📷 Add photo"}
                            <input type="file" accept="image/*" style={{ display: "none" }}
                              onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; uploadItemPhoto(cat.id, it, f); }} />
                          </label>
                          <ItemPhoto path={it.photo} alt={it.label} />
                          <button type="button" onClick={() => removeItem(cat.id, it.id)}
                            style={{ ...chip(false), marginLeft: "auto", color: RED, borderColor: "#F3D6C4" }}>Remove</button>
                        </div>
                      </div>
                    )}
                    {/* ★ THE ITEM'S OWN OPTIONS, AND ONLY THE ONES IT HAS.
                        Appears when ticked, nothing before. An item with no
                        size, no colour and no fit shows nothing at all, which
                        is why a hat stays one tap. */}
                    {on && (() => {
                      const need = itemNeeds(it);
                      if (!need.size && !need.colors && !need.fit) return null;
                      const p = picks[it.id] || {};
                      const chipRow = (vals, field) => (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {vals.map((v) => {
                            const sel = (p[field] || "") === v;
                            return (
                              <button key={v} type="button" onClick={() => setPick(it.id, field, v)}
                                style={{ minWidth: 42, padding: "7px 11px", borderRadius: 9, cursor: "pointer",
                                  fontFamily: "inherit", fontSize: 13, fontWeight: 800,
                                  border: `1px solid ${sel ? INK : LINE}`,
                                  background: sel ? INK : "#fff", color: sel ? "#fff" : INK2 }}>
                                {v}
                              </button>
                            );
                          })}
                        </div>
                      );
                      return (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${LINE}`,
                          display: "flex", flexDirection: "column", gap: 10 }}>
                          {need.size === SIZE_SHIRT && (
                            <div><div style={optLabel}>Size</div>{chipRow(SHIRT_SIZES, "size")}</div>
                          )}
                          {need.size === SIZE_PAIR && (
                            <div><div style={optLabel}>Size</div>{chipRow(PAIR_SIZES, "size")}</div>
                          )}
                          {need.size === SIZE_SML && (
                            <div><div style={optLabel}>Size</div>{chipRow(SML_SIZES, "size")}</div>
                          )}
                          {need.size === SIZE_TEXT && (
                            <div>
                              <div style={optLabel}>{it.sizeHint || "Size"}</div>
                              <input style={input} value={p.size || ""} placeholder={it.sizeHint || "For example 30x32"}
                                onChange={(e) => setPick(it.id, "size", e.target.value)} />
                            </div>
                          )}
                          {need.colors && (
                            <div><div style={optLabel}>Colour</div>{chipRow(need.colors, "color")}</div>
                          )}
                          {need.fit && (
                            <div><div style={optLabel}>Fit</div>{chipRow(["m", "f"].map((k) => FIT_LABELS[k]), "fit")}</div>
                          )}
                          {errs[`line_${it.id}`] && <div style={errStyle}>{errs[`line_${it.id}`]}</div>}
                        </div>
                      );
                    })()}
                    </div>
                  );
                })}
                {editing && (
                  <button type="button" onClick={() => addItem(cat.id)}
                    style={{ ...chip(false), marginTop: 10, width: "100%", textAlign: "center" }}>
                    + Add an item to {cat.label}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
      {editing && (
        <button type="button" onClick={addCat}
          style={{ ...chip(false), width: "100%", textAlign: "center", marginBottom: 11, padding: "11px" }}>
          + Add a section
        </button>
      )}
      {errs.picked && <div style={{ ...errStyle, marginTop: -4, marginBottom: 11 }}>{errs.picked}</div>}

      <div style={card}>
        <label style={{ fontSize: 12.5, fontWeight: 800, color: INK, display: "block", marginBottom: 6 }}>
          Comments
        </label>
        <textarea style={{ ...input, minHeight: 64, resize: "vertical" }} value={comments}
          onChange={(e) => setComments(e.target.value)}
          placeholder="Anything else. For example, split the cost across two checks." />
      </div>

      {state === "failed" && (
        <div style={{ ...card, borderColor: RED, background: "#FEF2F2" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: RED }}>That did not send</div>
          <div style={{ fontSize: 12.5, color: INK2, marginTop: 4, lineHeight: 1.5 }}>
            Nothing was ordered. Your answers are still on screen, so check the
            connection and tap Send again.
          </div>
        </div>
      )}

      {/* ★ THE RUNNING SUBTOTAL, pinned so it is visible while ticking rather
          than only at the bottom. This is arithmetic on her own prices, not a
          design change: it is coming out of somebody's paycheque and they
          should see it before they send. Says subtotal, and says what is not
          in it, because a number labelled "total" that is not the total is
          worse than no number at all. */}
      <div style={{ position: "sticky", bottom: 0, paddingTop: 8,
        background: "linear-gradient(180deg, rgba(247,247,245,0) 0%, #F7F7F5 38%)" }}>
        <div style={{ ...card, marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 11, fontWeight: 800, letterSpacing: ".06em",
              textTransform: "uppercase", color: INK3 }}>
              Subtotal · {picked.length} item{picked.length === 1 ? "" : "s"}
            </span>
            <span style={{ display: "block", fontSize: 10.5, color: INK3, marginTop: 2 }}>
              Before tax and shipping
            </span>
          </span>
          <span style={{ fontSize: 20, fontWeight: 800, color: INK }}>{money(subtotal)}</span>
        </div>
        {/* ★ WHAT IS STOPPING THIS ORDER, AT THE BUTTON (Bri, Aug 8 2026). See
            missingLines above for the reasoning.
            ⚠️ LIVE, NOT ONLY AFTER A FAILED TAP. She asked to see it "before it
            can be submitted", and a list that appears only once you have already
            been refused is the same dead end with an extra step.
            ⚠️ SILENT UNTIL SOMETHING IS TICKED. On an untouched form every item
            is "missing" and a wall of red on arrival teaches people to ignore it.
            ⚠️ THE NAME IS IN HERE TOO. It has its own message at the top of the
            form, which is 60 items away from the button somebody is tapping. */}
        {!editing && picked.length > 0 && (() => {
          const gaps = missingLines(draft);
          const noName = !String(name || "").trim();
          if (!gaps.length && !noName) return null;
          return (
            <div style={{ ...card, marginBottom: 8, borderColor: "#F3D6C4", background: "#FFF8F3" }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".06em",
                textTransform: "uppercase", color: RED }}>
                Before you can send
              </div>
              <ul style={{ margin: "7px 0 0", paddingLeft: 18 }}>
                {noName && <li style={{ fontSize: 12.5, color: INK, marginBottom: 3 }}>Your name, at the top</li>}
                {gaps.map((m) => (
                  <li key={m.id} style={{ fontSize: 12.5, color: INK, marginBottom: 3 }}>
                    <b>{m.label}</b>
                    {m.wants.length ? ` — needs ${m.wants.join(" and ")}` : " — needs its options choosing"}
                  </li>
                ))}
              </ul>
            </div>
          );
        })()}
          {/* ⚠️ ORDERING IS HIDDEN WHILE EDITING. Bri changing a price and
            accidentally submitting an order for the items she is editing is a
            confusing thing to explain afterwards, and the two jobs have
            nothing to do with each other. */}
        {!editing && (
      <button type="button" onClick={submit} disabled={state === "saving"}
          style={{ width: "100%", padding: "13px 18px", borderRadius: 11, border: "none",
            background: state === "saving" ? "#9CA3AF" : RED, color: "#fff", fontFamily: "inherit",
            fontSize: 15.5, fontWeight: 800, cursor: state === "saving" ? "default" : "pointer" }}>
          {state === "saving" ? "Sending…" : "Send my order"}
        </button>
        )}
      </div>
    </div>
  );
}
