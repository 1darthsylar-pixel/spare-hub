/* ============================================================================
   cardStyle.js — Gate City Hub

   THE RAISED-CARD LOOK. One definition, for every tool tile and every card.

   Matt, Aug 4 2026: "I want all tools and cards to have the 3d shade on the top
   and left side for every tool."

   ★ WHAT MAKES IT LOOK RAISED, in order of what each line is doing:
     1. a hairline ring, so the card has an edge on a white background
     2. a tight contact shadow, the bit directly under the card
     3. a wide ambient shadow, which is what gives it height off the page
     4. an INSET highlight along the TOP edge, and
     5. an INSET highlight down the LEFT edge
   Four and five are the ones that actually sell it. They read as a light source
   sitting above and to the left, catching the two near edges. Without them a
   card is a rectangle with a blur under it, which is what the tiles were.

   ⚠️ TOP IS BRIGHTER THAN LEFT ON PURPOSE. Equal highlights read as a glowing
   outline rather than a lit object, because a single light source never hits two
   perpendicular faces equally. The top edge faces the light most directly.

   ⚠️ A LEAF — THIS FILE IMPORTS NOTHING, so App.jsx and SetupByPosition.jsx can
   both hold the same look without one importing the other. The shadow used to be
   written out 13 times in App.jsx alone, plus its own version in the setup
   cards, which is why the tiles and the position cards had drifted into looking
   like different products.
   ============================================================================ */

/* The monospace stack, for a figure or a micro-label that has to line up in a
   column. It was defined byte-identically in ManualTile.jsx and TokensTile.jsx,
   which is design rule 8 waiting to happen: two copies of a font stack drift the
   moment one of them gains a fallback the other does not, and a number that
   changes width between two tools looks like a rendering bug.
   ⚠️ NOT the same stack as line 302 below. That one is 'IBM Plex Mono' for the
   import zone, which is a deliberate look; this is the system stack. */
export const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

/* The standard raised card. Use this for a tool tile, a panel, any surface that
   should sit above the page. */
export const CARD_3D = [
  /* ★★ THE BACK LAYER, VISIBLE ON THE TOP AND LEFT (Matt, Aug 4 2026: "for all
     cards and tools i want to see the back on the left and top").
     Two offset blocks behind the card, up and to the left, each further out and
     fainter than the last. That is a card sitting on another card — you can see
     the one underneath along the two edges nearest the light, and it steps away
     rather than stopping, so it fades instead of drawing a hard border.
     ⚠️ FIRST IN THE LIST. Box-shadows paint in order, first on top, so these two
     have to be declared before the contact and ambient shadows or the soft dark
     ones would be painted over them.
     ⚠️ Negative spread on both, so each block is smaller than the card and the
     step is visible as a corner rather than a full outline. */
  /* ⚠️ FIVE LAYERS, NOT SEVEN, AND THE COUNT IS THE POINT (Matt, Aug 4 2026:
     "The screen is glitching").
     This was seven shadows painted on 141 elements, over 45 radial gradients.
     That is a lot of compositing for one scroll, and iOS Safari tears rather
     than slows down when it cannot keep up — which is what glitching looks
     like. Nothing was wrong with the CSS; there was just too much of it.
     ⇒ The two back-layer steps became one slightly wider step, and the tight
     contact shadow was folded into the hairline ring. The card still sits on
     something and still lifts off the page; it costs about a third less to
     draw. If it ever needs to get cheaper again, the ambient shadow is the next
     one to go — it is the most expensive single layer here, because a 28px blur
     is the one the compositor actually works at. */
  /* ⚠️ IT HAS A BLUR NOW, AND THAT IS THE WHOLE POINT (Matt, Aug 4 2026: "these
     are blocked at the edge").
     This was `-6px -6px 0 -2px`, a zero-blur offset — geometrically a second
     rectangle behind the card with a hard edge all the way round. On a small
     dense tile that reads as a card underneath. On the big pale cards of the
     Shift Leader Scorecard it reads as a grey BLOCK stuck to the corner, because
     nothing about it fades and the eye sees the join.
     ⇒ Spread pulled in and a 10px blur added, so it still peeks out along the
     top and left but dissolves instead of ending. Same instruction Matt has now
     given three times about this exact layer: "i want them to fade out", "they
     are showing gaps on the back cards", and now this.
     ⚠️ Alpha went UP to compensate. A blurred shadow spreads the same ink over
     more pixels, so keeping .45 would have made the back layer disappear rather
     than soften — which is the "gradient still didn't take" mistake in a
     different costume. */
  "-7px -7px 10px -4px rgba(200,212,228,.9)",
  "0 0 0 1px rgba(17,24,39,.06)",
  "0 12px 28px -10px rgba(17,24,39,.22)",
  /* 🐛 THE INSET HIGHLIGHTS ARE GONE, AND THEY WERE THE WHITE LINE (Matt,
     Aug 4 2026: "I noticed the white line on this as well", on the Shift
     Leader Scorecard).
     They were `inset 0 1px 0 rgba(255,255,255,.9)` and `inset 1px 0 0
     rgba(255,255,255,.55)`: a 1px white line just inside the top and left
     edges, standing in for a light source above and to the left. That was
     right when a card was a flat white rectangle with a hairline border, which
     is what this file was written against.

     Three things have changed since, and all three landed on those same two
     edges. `accentEdge` puts a 3px COLOURED border on the top and left.
     `cardSurface` anchors its tint at the top-left corner, so the face is at
     its most tinted exactly there. And the back layer steps out the same way.
     A white line between a navy strip and a navy-tinted face is not a
     highlight, it is a seam, and on a big pale card it reads as a gap.

     ⚠️ THE CARD DOES NOT NEED THEM ANY MORE. The job those two lines did, telling
     you where the card's near edges are, is now done better by the coloured
     strip. Four layers left: the back step, the hairline ring, the ambient
     shadow, and the gradient face. Cards with no strip still have the ring plus
     their own accent cap.
     ⚠️ DO NOT ADD THEM BACK to "brighten" a card. Turn the gradient up instead.
     Every surface in the Hub carries a strip now, so a white inset on the top
     and left has nowhere to sit that is not against colour. */
].join(", ");

/* THE CARD SURFACE — a gradient, not flat white.

   Matt, Aug 4 2026: "the backgrounds still don't have the gradient look in the
   3d shadows". He is right, and it is the piece that was missing. A shadow says
   the card is ABOVE the page; it says nothing about the card itself. A flat
   white face under a shadow still reads flat, because a real surface catches
   more light on the edge nearest the light source and less as it falls away.

   ⚠️ 160°, MATCHING THE SHADOWS. CARD_3D's insets light the top and the left,
   so the gradient has to run from that same corner or the card is lit from two
   directions at once and looks wrong without anyone being able to say why.

   ⚠️ THE STRENGTH IS ONE NUMBER, HERE, AND IT HAS ALREADY BEEN WRONG ONCE.
   First version ran white to #F7F9FB, about 3%, on the reasoning that a page
   full of grey-ish cards looks dirty rather than raised. That reasoning is
   sound and the value was still wrong: Matt shipped it, looked at it and said
   "the gradient still didn't take". An effect nobody can see is not restraint,
   it is a change that did not happen.
   ⇒ Roughly tripled, white to #E9EFF6. Visible on a real screen, still short of
   the point where a card reads as a grey box. If it ever needs moving again it
   is these two lines and every surface in the Hub follows.

   `tint` is optional: pass a tool's colour and the face carries a breath of it,
   the way the tool tiles already do. */
export function cardSurface(tint, strength) {
  /* ⚠️ RADIAL FROM THE TOP-LEFT CORNER, not a linear sweep. Matt, Aug 4 2026:
     "the top left back card the same color but get light as it goes to the
     edges". A linear gradient is darkest along one whole edge and lightest along
     the opposite one, so the colour reads as a band. Anchored at the corner it
     radiates out, which is how a real surface behaves under a light sitting
     above and to the left — the same corner CARD_3D's insets light.
     ⚠️ 140% radius so the falloff is still going at the far corner. Anything
     tighter finishes early and leaves a flat dead zone across the bottom-right
     half of the card, which looks like a mistake rather than a gradient. */
  /* `strength` scales the tint only. FCR carries five of these side by side and
     at full strength the page reads as five coloured blocks rather than five
     cards — Matt, Aug 4 2026: "the fcr colors are just a tad too strong". One
     card alone can take more colour than five in a row, so the caller decides
     rather than the constant. */
  const a = (hex, mul) => {
    const v = Math.round(parseInt(hex, 16) * mul);
    return Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0");
  };
  /* ⚠️ IT MUST END IN TRANSPARENT, NOT IN ANOTHER PALE COLOUR (Matt, Aug 4 2026:
     "i don't want them flat. i want them to fade out" and "they are showing gaps
     on the back cards").
     Ending on a solid light grey means the card stops at a definite colour, and
     against a page that is a slightly different light grey that boundary is
     visible as a seam — a gap. Fading to fully transparent lets the card
     dissolve into whatever it is sitting on, whether that is the page, another
     card, or a coloured section. That is the difference between a shape and a
     surface, and it is why the flat reading would not go away no matter how the
     colours were tuned. */
  const k = typeof strength === "number" ? strength : 1;
  return tint
    ? `radial-gradient(140% 140% at 0% 0%, ${tint}${a("2E", k)} 0%, ${tint}${a("14", k)} 42%, ${tint}00 100%)`
    : "radial-gradient(140% 140% at 0% 0%, #FFFFFF 0%, #FFFFFFD9 42%, #FFFFFF00 100%)";
}

/* The strip colour to use when a card has no status and no tool colour of its
   own. Matt, Aug 4 2026: every card and tool carries the strip, so a card with
   nothing to say still needs one — and 23 of them had nothing to reach for.
   ⚠️ It is the Hub navy, not a grey. A grey strip reads as a disabled card. */
export const ACCENT_NEUTRAL = "#223C6A";

/* THE BACK SURFACE — the layer other cards sit ON.

   Matt, Aug 4 2026: "I do love the gradient on the face cards so the back card
   would almost be opposite in color."

   ⚠️ ANCHORED AT THE OPPOSITE CORNER. cardSurface() radiates from the top-left,
   where the light is. A container using that same gradient competes with the
   cards standing on it — two surfaces lit identically read as one flat thing,
   which is exactly the layered-card muddle this is fixing. Anchoring the back
   layer at the bottom-right turns it into the shaded side of the arrangement:
   the face cards catch the light, the tray they sit in falls away from it.

   ⚠️ AND IT IS FLATTER. A back layer with as much contrast as its cards fights
   them for attention. Half the range, deliberately. */
export function cardSurfaceBack(tint) {
  /* Same rule as the face: it fades to nothing rather than landing on a colour.
     A back layer that ends on solid grey draws a rectangle behind the cards,
     which is exactly the gap Matt saw at the bottom of the tool list. */
  return tint
    ? `radial-gradient(140% 140% at 100% 100%, ${tint}1A 0%, ${tint}0A 45%, ${tint}00 100%)`
    : "radial-gradient(140% 140% at 100% 100%, #C8D4E4 0%, #C8D4E455 45%, #C8D4E400 100%)";
}

/* THE ACCENT EDGE — a coloured top AND left, in the surface's own colour.

   Matt, Aug 4 2026: "I love the gradient details on the side if the tools", then
   "still want the same on top for the 3d view". The left edge landed first on
   the KPI tiles and he wants both edges carrying it.

   ⚠️ SOLID BORDERS, NOT `border-image`. A 135° gradient across both edges is the
   prettier idea and it is unusable here: `border-image` makes a browser drop
   `border-radius` entirely, so every card in the Hub would have gone
   square-cornered to gain a gradient nobody asked for. Written, caught, replaced
   before it shipped. Do not reach for it again.

   ⇒ Two solid edges in the surface's own colour. The corner still reads as lit
   because CARD_3D's inset highlights run along the same two edges underneath —
   the light source is implied by the highlight, and the colour just names what
   the card IS.

     style={{ ...accentEdge(tone), borderRadius: 12, boxShadow: CARD_3D }}

   `tone` is the surface's own status colour, so the shape carries meaning as
   well as depth: a red metric gets a red edge, not a decorative grey one. */
export function accentEdge(tone, width = 3) {
  return {
    borderTop: `${width}px solid ${tone}`,
    borderLeft: `${width}px solid ${tone}`,
  };
}

/* A shallower version for something already sitting INSIDE a raised card, where
   the full ambient shadow would read as a second floating layer rather than a
   detail. Same light source, less height. */
export const CARD_3D_SOFT = [
  /* One step instead of two, and closer in. A nested card should show a hint of
     what it sits on without restating the whole stack. */
  /* Same fade as CARD_3D's back layer, at nested scale. A hard-edged step is
     even worse here: a small block inside an already-raised card reads as a
     rendering artefact rather than depth. */
  "-4px -4px 6px -2px rgba(200,212,228,.85)",
  "0 0 0 1px rgba(17,24,39,.05)",
  "0 1px 2px rgba(17,24,39,.07)",
  "0 6px 14px -8px rgba(17,24,39,.18)",
  /* Same seam, same removal as CARD_3D above. Worse here if anything: a nested
     card sits on a surface that is already tinted, so a white line inside its
     top and left edges has colour on both sides of it. */
].join(", ");

/* ══════════════════════════════════════════════════════════════════════════
   PASTE BOXES — Matt, Aug 7 2026: "Can we also make the paste boxes stand out
   more? Color?"

   ⚠️ THE ANSWER IS TREATMENT, NOT A NEW HUE, AND THAT IS A DELIBERATE CALL.
   Both spare colours in this palette are already spoken for, and they say
   something a paste box must not say:

       #DD0031 as a BACKGROUND means destructive. Every use of it is a
       confirm button — "Yes, remove", "Yes, delete". An import box wearing
       red would be the only red thing in the Hub that is not about to
       destroy something.
       green (#ECFDF5 / #047857) means it worked, amber (#FFFBEB / #92400E)
       means careful. A box you have not used yet is neither.

   So the accent stays ACCENT_NEUTRAL and the box gets loud in the ways that
   carry no meaning of their own: a thicker accent edge, a stronger tint, and
   a DASHED, tinted textarea, which is the one universally-read "put something
   here" affordance. The ghost button that used to open these is now filled —
   a white outline button next to real content reads as disabled.

   ★ ONE DEFINITION, TWO BOXES. TeamImportBox takes its styles as a prop from
   HRConsole and CatalogImportBox carries its own; before this they were two
   hand-written textareas that happened to look alike. Anything that has to
   match in two places and is written twice has already started drifting.
   ══════════════════════════════════════════════════════════════════════════ */

/* ★ THE IMPORT BLUE (Matt, Aug 8 2026: "the pase boxes dont stand out with
   colour. please make that update to all").

   ⚠️ THE OLD DEFAULT WAS ACCENT_NEUTRAL, WHICH IS #223C6A — THE HUB'S OWN NAVY.
   That is why these never stood out: a paste box was wearing the same colour as
   the header, the HR tile and half the cards on the page. The reasoning above
   about which hues are taken was right and still holds; what it missed is that
   "neutral" here is not grey, it is the single most-used colour in the app.

   #1D4ED8 is a genuinely free hue and a much brighter one. It is not #DD0031
   (destructive), not #047857 (success), not #92400E (careful), and not the
   navy. Blue is also the one colour a person already reads as "put information
   in here" rather than as a status. The only prior use is the "Guide" category
   chip in Team Resources, which is a label, not a state. */
export const ACCENT_IMPORT = "#1D4ED8";

/* The card an import box lives in. Louder than a normal card on purpose: this
   is a thing you go and find, not a thing you read past. */
export function importCard(tone = ACCENT_IMPORT) {
  return {
    backgroundColor: "#fff",
    /* 1.15 → 1.6. At 1.15 the tint was there and invisible next to a normal
       card; the whole complaint was that these do not announce themselves. */
    backgroundImage: cardSurface(tone, 1.6),
    border: `1px solid ${tintOf(tone, 0.28)}`,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    ...accentEdge(tone, 6),
    boxShadow: CARD_3D,
  };
}

/* The textarea. Dashed says "drop something in me" in a way no amount of
   colour does, and the tint keeps it from reading as an empty disabled field.
   ⚠️ `resize: "vertical"` on purpose — a pasted sheet is often longer than the
   rows we guessed, and a fixed box makes people think it truncated. */
export function importZone(tone = ACCENT_IMPORT) {
  return {
    width: "100%",
    boxSizing: "border-box",
    fontFamily: "'IBM Plex Mono',ui-monospace,monospace",
    fontSize: 12,
    lineHeight: 1.45,
    padding: 11,
    color: "#111827",
    /* 0.05 → 0.10 fill and 0.42 → 0.70 border. The dash was already the right
       shape; it was drawn in a colour you had to look for. */
    background: tintOf(tone, 0.10),
    border: `2px dashed ${tintOf(tone, 0.70)}`,
    borderRadius: 9,
    resize: "vertical",
    outline: "none",
  };
}

/* The button that opens one. Filled, because the ghost version of this button
   sat under a wall of real content and nobody could see it. */
export function importOpenBtn(tone = ACCENT_IMPORT) {
  return {
    display: "block",
    width: "100%",
    background: tone,
    color: "#fff",
    border: "none",
    borderRadius: 9,
    padding: "11px 15px",
    fontWeight: 800,
    fontSize: 13.5,
    letterSpacing: 0.1,
    cursor: "pointer",
    marginBottom: 12,
    boxShadow: CARD_3D_SOFT,
  };
}

/* A hex tone at a given strength over white. Kept here rather than in each box
   so the dashed border and the fill are provably the same hue. */
function tintOf(hex, a) {
  const h = String(hex || "").replace("#", "");
  if (h.length !== 6) return `rgba(34,60,106,${a})`;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/* ══════════════════════════════════════════════════════════════════════════
   THE SECTION PALETTE — ten hues, walked in order, one per section of a board.

   ★ IT MOVED HERE FROM ScheduleBuilder.jsx (Aug 14 2026) because a SECOND
   screen wanted it. It was a module-private const there, so the Training
   priorities list either had to re-type the ten hex codes or go grey. Two
   copies of a palette is rule 8 wearing paint: they drift, and the day they
   drift is the day the same station is teal on one screen and blue on the next.

   ⚠️ BY INDEX, NOT BY NAME. A section is coloured by its POSITION in the
   store's own list, so another store's sections get colours without anybody
   writing a mapping for them. Rule 18 — their section names are theirs.

   ⚠️⚠️ THE INDEX MUST COME FROM `sectionsOf(...)` IN storeConfig.js, WHICH IS
   SIDE-WIDE. Do not hand this the position within one day's list. Saturday has
   no BREADING, so a per-day index shifts every section after it up a slot and
   the same area changes colour between two days of the same board. That was the
   original bug here and the reason `sectionsOf` exists.

   ⚠️ TEN, AND THE MODULO IS DELIBERATE. A store with eleven sections repeats a
   hue rather than running out and rendering black. Guarded for a negative or
   junk index too, because a caller that hands over -1 should get a colour, not
   `undefined` painted into a style attribute. */
export const SECTION_TINTS = Object.freeze([
  "#E11D48", "#EA580C", "#D97706", "#65A30D", "#0D9488",
  "#0891B2", "#2563EB", "#7C3AED", "#C026D4", "#DB2777",
]);

/* ⚠️ FLOORED, NOT JUST COERCED. `Number(i) || 0` turns undefined, null and "x"
   into 0, which was the whole point of the guard — but it lets 1.5 through, and
   `SECTION_TINTS[1.5]` is `undefined`, which reaches a style attribute as no
   colour at all and reports nothing. Caught by sectionColor.test.mjs. */
export const sectionTint = (i) => {
  const n = Math.floor(Number(i)) || 0;
  return SECTION_TINTS[(n % SECTION_TINTS.length + SECTION_TINTS.length) % SECTION_TINTS.length];
};

/* A darker version of any of them, for the far stop of a gradient and for text
   that has to stay readable on a pale tint of the same hue.

   ⚠️ ONE FUNCTION, NOT A SECOND TEN-VALUE PALETTE. A hand-picked "dark" list
   beside the light one is two things that have to be kept in step, and the day
   somebody adds an eleventh hue to one of them is the day a badge renders black.
   Multiplying the channels cannot fall out of step with the list it reads from.

   ⚠️ NOT A REPLACEMENT FOR CHOOSING A READABLE HUE. At 0.72 these clear 4.5:1
   against white for body text; do not push `mul` up to 0.9 and assume small text
   on the result is still legible.

   ★ MODULE LEVEL AND PURE (rule 7). Accepts `#RGB` and `#RRGGBB`; anything else
   comes back unchanged rather than as `#NaNNaNNaN`, because a style attribute
   with a junk colour in it silently renders as black. */
export function shade(hex, mul = 0.72) {
  const s = String(hex || "").trim();
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (!m) return s;
  const full = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  const k = Number.isFinite(mul) ? mul : 0.72;
  let out = "#";
  for (let i = 0; i < 6; i += 2) {
    const v = Math.max(0, Math.min(255, Math.round(parseInt(full.slice(i, i + 2), 16) * k)));
    out += v.toString(16).padStart(2, "0");
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   ★★ THE WHOLE CARD LOOK, IN ONE CALL — a tool's own colour on its own cards.

   Matt, Aug 14 2026, after the Training list was rebuilt: "I love the look of
   the training lines and that's how I want the schedule and setup", and
   "I want the same look for the other tools like communication, tell a leader".

   ⇒ THAT REQUEST IS THE REASON THIS IS A FUNCTION AND NOT A PASTED RECIPE.
   Three lines repeated across a hundred cards is three lines to get subtly
   wrong a hundred times, and "make this tool match" turns into an afternoon.
   With this, matching a tool is one call with its own colour.

       style={toolCard("#8C2F39")}      // Tell a Leader
       style={toolCard()}               // no colour of its own, Hub navy

   ⚠️ THE STRIP, THE FACE AND THE ICON MUST BE THE SAME HUE, which is what
   makes a card read as one object rather than a white box with a coloured line
   on it. Passing a tone here and then painting the icon a different colour
   undoes most of the effect.

   ⚠️ 0.5 IS THE DEFAULT ON PURPOSE. `cardSurface` at full strength turns a
   large card into a coloured block, and a screen of them reads as a paint chart
   — the exact note behind the `strength` argument on cardSurface itself
   ("the fcr colors are just a tad too strong"). Raise it for a small card that
   has to hold its own, never for a page of them.

   ⚠️ SPREAD THIS, DO NOT ASSIGN IT. It returns a style OBJECT, unlike CARD_3D
   which is a box-shadow STRING. `style={toolCard(X)}` is right;
   `style={{ boxShadow: toolCard(X) }}` paints nothing. The reverse mistake —
   `style={{ ...CARD_3D }}` — throws "Indexed property setter is not supported"
   and takes the tab down, which is a real crash this repo has shipped. */
export function toolCard(tone, strength = 0.5) {
  const t = tone || ACCENT_NEUTRAL;
  return {
    boxShadow: CARD_3D,
    backgroundImage: cardSurface(t, strength),
    ...accentEdge(t),
  };
}

/* A row INSIDE one of those cards, drawn the way the Training priorities list
   draws a priority: shallower depth, the tint washed across it, and a stripe
   the caller renders as its first child.

   ⚠️ THE STRIPE IS THE CALLER'S JOB, deliberately. It has to be a real element
   so it can stretch to the row's height whatever wraps inside it; a border-left
   cannot round with the card and a background-image stripe cannot survive
   `overflow-hidden` on a wrapped row. The caller adds:
       <span className="self-stretch shrink-0" style={{ width: 4, background: tone }} />
   ⚠️ AND THE ROW NEEDS `overflow-hidden` AND `flex`, or the stripe corners
   square off against the rounded card. */
export function toolRow(tone, strength = 0.9) {
  return {
    boxShadow: CARD_3D_SOFT,
    backgroundImage: cardSurface(tone || ACCENT_NEUTRAL, strength),
  };
}
