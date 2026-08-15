/* ============================================================================
   uniformCatalog.js — Gate City Hub

   THE UNIFORM CATALOGUE. A leaf module: it imports nothing, so both the order
   form and anything that later needs prices can read one list.

   ★ READ OFF BRI'S FORM, NOT REMEMBERED, NOT THE OTHER ONE.
   Source: "Uniform Order Form - Revised", the form Bri keeps in Google Drive.

   ⚠️ THERE ARE TWO UNIFORM FORMS AND I USED THE WRONG ONE FIRST.
   The onboarding page links to a NEW HIRE form — three items, no prices, and a
   "$60 flat rate" that appears nowhere on Bri's. Building from it produced a
   form missing about sixty items and quoting a rate that does not apply.
   Bri, Aug 5 2026: "Where are you pulling the 'new hire flat rate' from. That
   is not on the Google Form I sent... everything on that pdf has pricing
   visible. This is strictly from the form in the Google Drive."
   If a uniform question comes up again, this file is the one that matches what
   she actually sends people.

   ⚠️ THE ROLE MARKERS ARE HERS, WORD FOR WORD. "**AD Only**", "**TL/AD Only**"
   and so on are written into her option labels. They are kept as a separate
   `only` field so they can be shown as a badge rather than buried mid-string,
   but the wording is not reworded, because who may order a Durant Pullover is
   her call and not something to paraphrase.

   ⚠️ PRICES EXCLUDE TAX AND SHIPPING. Her intro says so and so does the form.
   Any total built from these is a subtotal.
   ============================================================================ */

/* `only`  — the role restriction exactly as Bri words it, or null.
   `stock` — "out" for the two she has marked OUT OF STOCK.
   `colors`— offered colours where she lists them, else null. */
/* ⚠️ "Male or Female" IS A FIT, NOT A TAG (Bri, Aug 5 2026: "If the Male/Female
   is not checked, please do not let those options be viewed... on the Directors
   section it is still visible on items not selected").
   Four Director items carried it as a `tag`, which renders as a plain pill on
   the item whatever the fit setting says — so it showed on items where fit was
   never turned on. Colours behaved correctly because they were already a real
   field. These are now fit: FIT_MF, which means the order form asks the
   question instead of just printing the words. */
/* ⚠️ THESE LIVE ABOVE THE CATALOGUE BECAUSE THE CATALOGUE USES THEM.
   They were declared 200 lines below and the seed referenced FIT_MF, which is a
   temporal dead zone: `const` does not hoist a value, so importing this file
   threw "Cannot access 'FIT_MF' before initialization" and took the whole
   uniform tool down. Caught by importing the module rather than by reading it.
   Anything the seed references has to be declared before the seed. */
export const SIZE_NONE = "none";       // one size — show nothing
export const SIZE_SHIRT = "shirt";     // the shirt run
export const SIZE_TEXT = "text";       // typed, e.g. waist and length
export const SIZE_PAIR = "pair";       // S/M or L/XL
/* Bri, Aug 7 2026: "Please add another option to the size selections for
   editing -- one for the options [s, m, and l]". Its own run rather than a
   slice of SHIRT_SIZES, because those are XS-5X and these are three words. */
export const SIZE_SML = "sml";         // Small, Medium, Large

/* The old Male/Female label, in whatever form a stored catalogue holds it.
   Module level and used once, but declared here beside the size constants
   because it is part of the same "what supersedes what" story. */
const MF_TAG_RE = /^\s*male\s*(?:or|\/|&|,)?\s*female\s*$/i;

/* Bri's list, and it runs two steps further than her Google Form, which stops
   at XXXL. She asked for 4X and 5X explicitly. */
export const SHIRT_SIZES = ["XS", "S", "M", "L", "XL", "2X", "3X", "4X", "5X"];
export const PAIR_SIZES = ["S/M", "L/XL"];
export const SML_SIZES = ["Small", "Medium", "Large"];

/* Fit is its own axis because an item can need a size AND a fit, or a fit and
   no size, or neither. Folding it into the size list would make "Female L" a
   size, and then Male/Female could never be offered on an item that has no
   sizes at all — which several of the Director blouses need. */
export const FIT_NONE = "none";
export const FIT_MF = "mf";
export const FIT_LABELS = { m: "Male", f: "Female" };

export const UNIFORM_CATEGORIES = [
  {
    id: "tmShirts",
    label: "Team Member Shirts",
    items: [
      { id: "polo-red-shea", label: "Red Shea Polo", price: 20.0, photo: "/uniform/polo-red-shea.jpg" },
      { id: "polo-red-shea-es", label: "Red Shea Spanish Polo", price: 20.0, photo: "/uniform/polo-red-shea-es.jpg" },
      { id: "coat-navy-lewis", label: "Navy Lewis Chef Coat", price: 33.5, only: "BOH Team Members", photo: "/uniform/coat-navy-lewis.jpg" },
    ],
  },
  {
    id: "leadShirts",
    label: "Leadership Shirts",
    items: [
      { id: "polo-navy-shea", label: "Navy Shea Polo", price: 20.0, only: "TRAINER Only", photo: "/uniform/polo-navy-shea.jpg" },
      { id: "polo-lenexa", label: "Lenexa Polo", price: 29.0, only: "TL Only", photo: "/uniform/polo-lenexa.jpg" },
      { id: "polo-kenwood", label: "Kenwood Polo", price: 29.0, only: "AD Only", photo: "/uniform/polo-kenwood.jpg" },
      { id: "polo-summerville", label: "Summerville Polo", price: 32.0, only: "AD Only", photo: "/uniform/polo-summerville.jpg" },
      { id: "coat-red-lewis", label: "Red Lewis Chef Coat", price: 33.5, only: "BOH TL/AD Only", photo: "/uniform/coat-red-lewis.jpg" },
      { id: "pullover-palomar", label: "Palomar Pullover", price: 35.0, only: "TL/AD Only", photo: "/uniform/pullover-palomar.jpg" },
      { id: "pullover-durant", label: "Durant Pullover", price: 45.0, only: "AD Only", tag: "Limited edition", photo: "/uniform/pullover-durant.jpg" },
    ],
  },
  {
    id: "pants",
    label: "Pants & Shorts",
    items: [
      { id: "pants-smithtown", label: "Smithtown Pants", price: 28.85, photo: "/uniform/pants-smithtown.jpg" },
      { id: "short-hydro-f", label: "Charcoal Hydrochill Short", price: 24.0, photo: "/uniform/short-hydro-f.jpg" },
      { id: "short-hydro-dt", label: "Navy Hydrochill Drive Thru Short", price: 28.0, colors: ["Navy"], photo: "/uniform/short-hydro-dt.jpg" },
    ],
  },
  {
    id: "winter",
    label: "Winter Outerwear",
    items: [
      { id: "crew-cambridge", label: "Cambridge Crew", price: 35.0, photo: "/uniform/crew-cambridge.jpg" },
      { id: "pullover-lindale", label: "Lindale Pullover", price: 33.0, photo: "/uniform/pullover-lindale.jpg" },
      { id: "fleece-chapel", label: "Chapel Fleece Jacket", price: 37.5, colors: ["Red", "Navy"], photo: "/uniform/fleece-chapel.jpg" },
      { id: "softshell-bluemound-m", label: "Bluemound Softshell Jacket", price: 55.0, colors: ["Red", "Navy"], photo: "/uniform/softshell-bluemound-m.jpg" },
      { id: "jacket-ne8-f", label: "Northeast 8 Jacket", price: 72.75, colors: ["Red", "Navy"], photo: "/uniform/jacket-ne8-f.jpg" },
      { id: "rain-tanasbourne", label: "Tanasbourne Rain Jacket", price: 64.0, colors: ["Red", "Navy"], photo: "/uniform/rain-tanasbourne.jpg" },
      { id: "parka-okemos", label: "Okemos Parka", price: 170.0, photo: "/uniform/parka-okemos.jpg" },
      { id: "rainpant-rainier", label: "Unisex Rainier Rain Pant", price: 50.0, photo: "/uniform/rainpant-rainier.jpg" },
      { id: "bib-frontier", label: "Unisex Frontier Bib Pant", price: 68.0, photo: "/uniform/bib-frontier.jpg" },
      { id: "base-top", label: "Unisex Base Layer Top", price: 19.0, photo: "/uniform/base-top.jpg" },
      { id: "base-bottom-f", label: "HW Base Layer Bottom", price: 18.25, only: "No XS Available", photo: "/uniform/base-bottom-f.jpg" },
    ],
  },
  {
    id: "hats",
    label: "Hats",
    items: [
      { id: "visor-flager", label: "Flager Visor", price: 7.5, stock: "out", photo: "/uniform/visor-flager.jpg" },
      { id: "hat-flager", label: "Flager Hat", price: 7.5, stock: "out", photo: "/uniform/hat-flager.jpg" },
      { id: "cap-hydro-crown", label: "Hydrochill Crown Cap", price: 7.5, photo: "/uniform/cap-hydro-crown.jpg" },
      { id: "wrap-keller", label: "Unisex Keller Headwrap", price: 9.15, only: "BOH Only", photo: "/uniform/wrap-keller.jpg" },
      { id: "hat-cherrydale", label: "Drive Thru Cherrydale Hat", price: 22.0, photo: "/uniform/hat-cherrydale.jpg" },
      { id: "beanie-commack", label: "Commack Cable Knit Beanie", price: 9.75, photo: "/uniform/beanie-commack.jpg" },
      { id: "beanie-drexel", label: "Drexel Pom-Pom Beanie", price: 15.0, photo: "/uniform/beanie-drexel.jpg" },
      { id: "hat-lake-trapper", label: "Totem Lake Trapper Hat", price: 13.5, photo: "/uniform/hat-lake-trapper.jpg" },
      { id: "headband-hialeah", label: "Hialeah Headband", price: 6.0, photo: "/uniform/headband-hialeah.jpg" },
      { id: "headband-perf", label: "Performance Headband", price: 12.0, tag: "Fleece lined", photo: "/uniform/headband-perf.jpg" },
    ],
  },
  {
    id: "accessories",
    label: "Accessories",
    items: [
      { id: "belt-navy-taylors", label: "Navy Taylors Belt", price: 13.25, only: "TM/TRAINERS", photo: "/uniform/belt-navy-taylors.jpg" },
      { id: "belt-red-taylors", label: "Red Taylors Belt", price: 13.25, only: "TL/AD Only", photo: "/uniform/belt-red-taylors.jpg" },
      { id: "apron-cicero", label: "Kitchen Cicero Apron", price: 13.0, photo: "/uniform/apron-cicero.jpg" },
      { id: "scarf-towson", label: "Towson Rib Knit Infinity Scarf", price: 12.5, photo: "/uniform/scarf-towson.jpg" },
      { id: "scarf-branson", label: "Branson Cable Knit Infinity Scarf", price: 12.5, photo: "/uniform/scarf-branson.jpg" },
      { id: "gloves-fitted", label: "Fitted Tech Touch Gloves", price: 13.0, sizes: ["S/M", "L/XL"], photo: "/uniform/gloves-fitted.jpg" },
      { id: "gloves-softshell", label: "Softshell Tech Touch Gloves", price: 19.75, photo: "/uniform/gloves-softshell.jpg" },
      { id: "sleeves-perf", label: "Unisex Performance Sleeves", price: 11.75, sizes: ["S/M", "L/XL"], colors: ["Navy"], photo: "/uniform/sleeves-perf.jpg" },
      { id: "towel-hydro", label: "Hydrochill Cooling Towel", price: 8.0, photo: "/uniform/towel-hydro.jpg" },
    ],
  },
  {
    id: "director",
    label: "Director",
    only: "Director Only",
    items: [
      { id: "blouse-elodie", label: "Female Elodie Blouse", price: 58.5, photo: "/uniform/blouse-elodie.jpg" },
      { id: "blouse-celine", label: "Female Celine Blouse", price: 58.5, photo: "/uniform/blouse-celine.jpg" },
      { id: "blouse-helena", label: "Female Helena Blouse", price: 40.0, photo: "/uniform/blouse-helena.jpg" },
      { id: "cardigan-emily", label: "Female Emily Cardigan", price: 45.0, photo: "/uniform/cardigan-emily.jpg" },
      { id: "polo-together", label: "Together Polo", price: 42.0, fit: FIT_MF, photo: "/uniform/polo-together.jpg" },
      { id: "polo-serramonte", label: "Serramonte Polo", price: 32.0, colors: ["Navy", "Red"], fit: FIT_MF, photo: "/uniform/polo-serramonte.jpg" },
      { id: "jacket-hayden", label: "Hayden Jacket", price: 71.0, fit: FIT_MF, photo: "/uniform/jacket-hayden.jpg" },
      { id: "vest-hayden", label: "Hayden Vest", price: 60.0, fit: FIT_MF, photo: "/uniform/vest-hayden.jpg" },
      { id: "shirt-houston-plaid", label: "Male Houston Plaid Shirt", price: 40.0, photo: "/uniform/shirt-houston-plaid.jpg" },
      { id: "shirt-houston-check", label: "Male Houston Check Shirt", price: 40.0, photo: "/uniform/shirt-houston-check.jpg" },
      { id: "shirt-houston-mini", label: "Male Houston Mini Check Shirt", price: 40.0, photo: "/uniform/shirt-houston-mini.jpg" },
      { id: "zip-greendale", label: "Male Greendale 1/4 Zip", price: 45.0, photo: "/uniform/zip-greendale.jpg" },
    ],
  },
];

/* Her intro, kept verbatim. The payroll-deduction line and the two-check line
   are the reason the comments box has to exist. */
export const UNIFORM_INTRO =
  "Uniforms will be paid for via payroll deduction. If you need to split payments between 2 checks rather than 1, please let us know in the comments. Pricing below does not include tax and shipping.";

/* Flat lookup, built once. Nothing downstream should re-walk the categories to
   find an item — that is how two readers of one list start disagreeing. */
export const UNIFORM_BY_ID = UNIFORM_CATEGORIES.reduce((m, c) => {
  c.items.forEach((it) => { m[it.id] = { ...it, category: c.label, categoryId: c.id }; });
  return m;
}, {});

/**
 * Subtotal for a set of ticked ids.
 * ⚠️ A SUBTOTAL, NOT A TOTAL. Tax and shipping are not known here and are not
 * guessed. Every caller must say so on screen, because a number labelled
 * "total" that is not the total is worse than no number at all when it is
 * coming out of somebody's paycheque.
 * Unknown ids are ignored rather than counted as zero, so a stale saved order
 * cannot quietly shrink its own price.
 */
export function uniformSubtotal(ids) {
  const list = Array.isArray(ids) ? ids : [];
  return list.reduce((sum, id) => {
    const it = UNIFORM_BY_ID[id];
    return it && Number.isFinite(it.price) ? sum + it.price : sum;
  }, 0);
}

/* Out of stock is a real state on her form — two hats carry OUT OF STOCK in
   their label — and the Google Form still lets people tick them. Here it is a
   flag so the control can be disabled rather than accepting an order that
   cannot be filled. */
export const isOrderable = (it) => !!it && it.stock !== "out";

/* ============================================================================
   THE CATALOGUE BECOMES SOMETHING BRI AND HANNAH OWN (Bri, Aug 5 2026: "I
   would like full editing ability -- add, delete, change names, change prices,
   update pictures of each item, check/uncheck out of stock").

   Everything above is now a SEED, not the catalogue. The live list lives in KV
   so it can be edited without a deploy.

   ⚠️ A FAILED READ IS NOT AN EMPTY CATALOGUE, and the difference matters more
   here than almost anywhere else in the Hub. If a read failure fell through to
   the seed and the autosave then wrote it back, one bad moment of wifi would
   silently undo every price change Bri had made. `loadCatalog` reports whether
   the read actually succeeded and the caller must refuse to save when it did
   not. This is the same trap TeamResources documents, and the reason it is
   documented there is that it happened.

   ⚠️ EVERY FIELD IS GUARDED ON READ. A record written today has `price` and
   `stock`; one written after somebody adds a field will not have it, and one
   written before will be missing whatever comes next. `normaliseCatalog` fills
   in what is absent rather than assuming, because a missing `items` array is
   the exact shape that took a whole class down in June.
   ============================================================================ */
export const UNIFORM_KEY = "gc-uniform-catalog-v1";

/* ============================================================================
   THE NEW HIRE FORM — A DIFFERENT FORM, NOT A SUBSET OF THE ONE ABOVE.

   Hannah, Aug 8 2026: "can you make the new hire uniform form like the regular
   uniform form? I would like to stop using Google forms and just use everything
   on the hub. The only items in need on that form are the 3 that are on the
   Google form."

   ★ READ OFF HER FORM, NOT REMEMBERED, NOT BRI'S.
   Source: the Google Form the public onboarding page links to. This file's own
   header already records that using the wrong uniform form once produced a
   screen missing sixty items and quoting a rate that does not apply. Same trap,
   opposite direction — these three and this flat rate are correct HERE and
   wrong on Bri's form.

   ⚠️ HER SIZE RUN IS XS-XXXL, NOT SHIRT_SIZES. Bri's form uses 2X/3X/4X/5X;
   Hannah's says XXL and XXXL. Deliberately NOT unified — the values a new hire
   picks from should match the form Hannah has been fulfilling from, and
   silently renaming somebody's size is how a wrong shirt gets ordered.

   ⚠️ FLAT RATE, NO PER-ITEM PRICES. Her form shows "$28.85" beside the pants
   AND "New Hire uniforms are a flat $60!" in the same breath. Matt's call:
   carry the flat $60 and show no per-item price, because that is what the
   store actually charges. A per-item price next to a flat rate is exactly the
   contradiction that sent the first build to the wrong form.

   ⚠️ ONE DEFINITION, TWO READERS. worker.js imports this to VALIDATE what is
   submitted, and serves the same list to the signed-out onboarding page over
   GET /api/newhire-uniform. The page must never carry its own copy — a second
   list is a second place for a size to drift.
   ============================================================================ */
export const NEWHIRE_FLAT_PRICE = 60;

export const NEWHIRE_INTRO =
  "Uniforms are paid for by payroll deduction. New hire uniforms are a flat $60. " +
  "If you need to split it across 2 checks rather than 1, say so in the comments.";

/* The acknowledgement is a REQUIRED typed name, exactly as her form has it.
   Shoes are the one thing they buy themselves, so it is the one line that
   changes what a person has to do before their first shift. */
export const NEWHIRE_SHOES_ACK =
  "Black slip-resistant shoes are required. You can buy them yourself, but you " +
  "need them on your first day. Type your name to confirm you understand.";

/* `size: null` means the item takes no size. `sizes` is a pick list; `typed`
   is a free-text box with a hint. Same two shapes the main form already uses,
   named plainly because nothing else reads them. */
export const NEWHIRE_ITEMS = [
  { id: "nh-polo", label: "Red Shea Polo", sizes: ["XS", "S", "M", "L", "XL", "XXL", "XXXL"] },
  { id: "nh-pants", label: "Smithtown Pants", typed: "Waist and length, e.g. 4x29 or 30x32" },
  { id: "nh-belt", label: "Navy Taylors Belt", sizes: ["Small", "Medium", "Large"] },
];

/* Pure, and used on BOTH sides — the page to enable its submit button, the
   worker to refuse a bad order. Keeping one function means the page can never
   allow something the worker then rejects with a shrug. */
export function newHireLineOk(item, value) {
  const v = String(value == null ? "" : value).trim();
  if (!v) return false;
  if (Array.isArray(item.sizes)) return item.sizes.includes(v);
  if (item.typed) return v.length <= 40;
  return false;
}

/* ============================================================================
   PER-ITEM SIZING, COLOURS AND FIT (Bri, Aug 5 2026, redesigning the form after
   using the first one).

   Her words: "it would be easier if we took off the size and color box and
   moved those to options inside each item... I think this will help sizes and
   color options to not get missed."

   She is right about the failure it fixes. One free-text box covering a whole
   order put the entire job on the person ordering and gave whoever fulfils it
   nothing to check against. A missing size was invisible until the box arrived.

   ⚠️ "none" IS A REAL, CHOSEN VALUE — NOT AN ABSENT ONE. A hat has no size
   because hats are one size, and that is a fact somebody decided, not a field
   they forgot. So SIZE_NONE renders no control at all and the order is still
   complete. Treating absent and none as the same thing is what would put an
   empty size box under every hat.
   ============================================================================ */

/* What a person must still answer for one item. Pure, so the form and the
   validator cannot disagree about whether an order is complete — they were
   always going to be written by different hands otherwise. */
export function itemNeeds(it) {
  const sizeType = it && it.sizeType ? it.sizeType : SIZE_NONE;
  const colors = it && Array.isArray(it.colors) ? it.colors.filter(Boolean) : [];
  const fit = it && it.fit === FIT_MF;
  return {
    size: sizeType !== SIZE_NONE ? sizeType : null,
    colors: colors.length ? colors : null,
    fit,
  };
}

/* Is this one line finished? `pick` is what the person chose for this item. */
export function lineComplete(it, pick) {
  const need = itemNeeds(it);
  const p = pick || {};
  if (need.size && !String(p.size || "").trim()) return false;
  if (need.colors && !String(p.color || "").trim()) return false;
  if (need.fit && !String(p.fit || "").trim()) return false;
  return true;
}

const str = (v, fb = "") => (typeof v === "string" ? v : fb);
const numOr = (v, fb = null) => (Number.isFinite(Number(v)) && String(v).trim() !== "" ? Number(v) : fb);
const arr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : null);

/* One item, whatever shape it arrived in. Returns null for something that is
   not an item at all, so a corrupt row drops out instead of rendering blank. */
function normaliseItem(it, i, catId) {
  if (!it || typeof it !== "object") return null;
  const label = str(it.label).trim();
  if (!label) return null;
  return {
    id: str(it.id).trim() || `${catId}-${i}`,
    label,
    /* ⚠️ null, NOT 0. An item with no price yet must not read as free — it has
       to be visibly missing so somebody fills it in. */
    price: numOr(it.price, null),
    only: str(it.only).trim() || null,
    /* ⚠️ `tag` SURVIVES, MINUS ONE SHAPE. "Fleece lined" and "Limited edition"
       are real descriptions Bri wrote and she did not ask for those to go. What
       she asked to lose is the Male/Female label, which duplicates the `fit`
       setting she can now switch on herself and contradicts it when she has
       not. Only that shape is stripped, and only here, so a stored catalogue
       written before `fit` existed stops printing it without anybody editing
       sixty items by hand.
       Bri, Aug 7 2026: "Please remove any of these labels that I can now set
       myself." */
    tag: MF_TAG_RE.test(str(it.tag)) ? null : (str(it.tag).trim() || null),
    colors: arr(it.colors),
    /* ⚠️ `sizes` IS READ AND DROPPED. It predates the per-item model and is
       display only — nothing reads it, itemNeeds works off `sizeType`. It was
       printing "S/M or L/XL" under the sleeves permanently, whatever she set.
       Not carried across into sizeType: the two runs it holds do not map
       cleanly (one is ["XS"…"XXXL"], and SHIRT_SIZES is 2X/3X/4X/5X), and
       silently changing which sizes an item offers is how somebody orders a
       size that was never on the list. She sets the type herself, which is
       exactly what she asked for. */
    /* Anything other than the string "out" is in stock. A truthy check would
       make the string "in" mean out of stock. */
    stock: it.stock === "out" ? "out" : null,
    /* Bri adds these one at a time after the framework exists, so an item
       without one is the normal case and not a fault. */
    photo: str(it.photo).trim() || null,
    /* ⚠️ EVERY EXISTING ITEM DEFAULTS TO "no size, no fit". The 60 seeded items
       were written before any of this existed, so they carry none of these
       fields — and defaulting the other way would put an unanswerable size box
       under all sixty at once. Bri turns them on item by item, which is the
       same way she is adding the photos. */
    sizeType: [SIZE_SHIRT, SIZE_TEXT, SIZE_PAIR, SIZE_SML].includes(it.sizeType) ? it.sizeType : SIZE_NONE,
    sizeHint: str(it.sizeHint).trim() || null,
    fit: it.fit === FIT_MF ? FIT_MF : FIT_NONE,
  };
}

export function normaliseCatalog(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list.map((c, ci) => {
    if (!c || typeof c !== "object") return null;
    const label = str(c.label).trim();
    if (!label) return null;
    const id = str(c.id).trim() || `cat-${ci}`;
    const items = (Array.isArray(c.items) ? c.items : [])
      .map((it, i) => normaliseItem(it, i, id))
      .filter(Boolean);
    return { id, label, only: str(c.only).trim() || null, items };
  }).filter(Boolean);
}

/* Flat lookup for any catalogue, seed or saved. Replaces UNIFORM_BY_ID for
   callers that hold a live list — one way to find an item, not two. */
export function indexOf(categories) {
  const m = {};
  (Array.isArray(categories) ? categories : []).forEach((c) => {
    (c.items || []).forEach((it) => { m[it.id] = { ...it, category: c.label, categoryId: c.id }; });
  });
  return m;
}

/* Subtotal against a LIVE catalogue rather than the frozen seed, so a price Bri
   changed this morning is the price on today's order. Unknown ids are ignored,
   never counted as zero — a stale saved order cannot quietly shrink its price. */
export function subtotalFrom(index, ids) {
  const list = Array.isArray(ids) ? ids : [];
  return list.reduce((sum, id) => {
    const it = index[id];
    return it && Number.isFinite(it.price) ? sum + it.price : sum;
  }, 0);
}
