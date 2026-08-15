import React, { useRef, useState } from "react";
/* The shared raised look — see cardStyle.js. The dark hero cards do NOT use it;
   the reason is written at .ts-feat in the stylesheet below. */
import { CARD_3D, cardSurface, accentEdge } from "./cardStyle.js";
import { programLabel, storeCfg, STORE } from "./storeConfig.js";
/* Peak Reachers' own red, already on the icons, the arrows and the emblem flag.
   Named once here so the strip and the face tint cannot drift apart. */
const PEAK_RED = "#E51636";
import TeamDirectory from "./TeamDirectory.jsx";
import TeamResources from "./TeamResources.jsx";
import TeamGoals from "./TeamGoals.jsx";
import ProfessionalGrowth from "./ProfessionalGrowth.jsx";
import Leadership101 from "./Leadership101.jsx";
import TrainerOrientation from "./TrainerOrientation.jsx";

const ACCENT = "#E51636";
// Routing keys off `route`, NOT the display label. Labels are Bri's to rename;
// before this the onClick ternaries matched on label text, so renaming a card
// silently dropped it through to a dead Wix URL. `route` never changes.
// ★ ROUTE → HOW TO OPEN IT. Bri, Jul 25: "I see the back door, but it is not
// functioning. I click and stay on the same Peak Reachers page."
// The onClick below used to be a hardcoded ternary chain — teams / goals /
// growth, then `null`. Adding "l101" to SECTIONS rendered a button whose click
// fell straight through to null, so it looked live and did nothing.
// One table now, so adding a sub is a single edit and can't half-work.
// `dir` opens TeamDirectory, `page` opens a sub-page component.
const SUB_ROUTES = {
  teams:  { kind: "dir" },
  goals:  { kind: "page" },
  growth: { kind: "page" },
  l101:   { kind: "page" },
  orientation: { kind: "page" },
};

const SECTIONS = [
  {
    route: "our-team",
    label: "Our Team",
    desc: "Who we are",
    subs: [
      { route: "teams", label: "Meet Our Teams" },
    ],
  },
  {
    route: "peak",
    label: "Growth & Development",
    desc: "Keep Climbing!",
    subs: [
      { route: "goals", label: "Team Goals" },
      { route: "growth", label: "Professional Growth" },
      // ★ Bri's item 3: a way into Leadership 101 that doesn't go through her
      // own tile. Before this, the class was reachable ONLY from Leadership
      // Development — a director-only tile — so no team member could open it
      // at all. It sits beside Professional Growth because that is where
      // someone goes when they want to move up; the class is the next step.
      // The class PIN is still the gate; this is a door, not a key.
      { route: "l101", label: "Leadership 101" },
      /* Bri's "back door" — Trainer Orientation is PIN-gated on its own key, so
         the card being visible costs nothing: anyone without the PIN gets the
         sign-in screen. It sits after Leadership 101 because that is the order
         people take them in. */
      { route: "orientation", label: "Trainer Orientation" },
    ],
  },
  { route: "resources", label: "Resources", desc: "Links & materials" },
];

// Scoped styles. Everything is nested under .ts-root so nothing leaks into the
// rest of the Hub, and there are NO global * / body resets (those would wreck
// the surrounding app). Keyframes are ts-prefixed for the same reason.
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
.ts-root { --cfa-red:#E51636; --cfa-navy:#0F1B33; --cfa-cream:#FFF8F0; --cfa-gray:#6B7280;
  font-family:'Plus Jakarta Sans',-apple-system,system-ui,"Segoe UI",sans-serif; color:#1A1A2E; }
.ts-root *{ box-sizing:border-box; }

/* Hero */
.ts-hero{ position:relative; border-radius:18px; overflow:hidden; padding:52px 24px 44px;
  text-align:center; color:#fff;
  background:linear-gradient(135deg,var(--cfa-navy) 0%,#1e3a5f 50%,var(--cfa-red) 100%); }
.ts-badge{ display:inline-flex; align-items:center; gap:.4rem; background:rgba(255,255,255,.12);
  border:1px solid rgba(255,255,255,.22); padding:.4rem 1rem; border-radius:999px;
  font-size:.72rem; font-weight:500; letter-spacing:.02em; margin-bottom:1.25rem;
  animation:tsFadeInDown .8s ease-out; }
.ts-hero h1{ font-size:clamp(1.7rem,7vw,2.6rem); font-weight:800; line-height:1.08; margin:0 0 1rem;
  animation:tsFadeInUp .8s ease-out .15s both; }
.ts-hero h1 span{ background:linear-gradient(90deg,#FFD700,#FFA500); -webkit-background-clip:text;
  background-clip:text; -webkit-text-fill-color:transparent; }
.ts-quote{ font-size:clamp(.95rem,3.5vw,1.15rem); font-style:italic; font-weight:300;
  color:rgba(255,255,255,.9); margin:0 0 .35rem; animation:tsFadeInUp .8s ease-out .3s both; }
.ts-author{ font-size:.85rem; color:rgba(255,255,255,.6); margin:0 0 1.6rem;
  animation:tsFadeInUp .8s ease-out .4s both; }
.ts-cta{ display:flex; gap:.6rem; justify-content:center; flex-wrap:wrap;
  animation:tsFadeInUp .8s ease-out .5s both; }
.ts-btn{ padding:.8rem 1.6rem; border-radius:999px; font-weight:600; font-size:.9rem;
  cursor:pointer; border:none; transition:transform .2s ease; }
.ts-btn:active{ transform:translateY(1px); }
.ts-btn-primary{ background:var(--cfa-red); color:#fff; box-shadow:0 8px 26px rgba(229,22,54,.4); }
.ts-btn-ghost{ background:rgba(255,255,255,.12); color:#fff; border:1px solid rgba(255,255,255,.3); }

/* Stats */
.ts-stats{ background:var(--cfa-red); border-radius:16px; padding:1.4rem 1rem; margin-top:14px;
  display:grid; grid-template-columns:repeat(2,1fr); gap:1rem; text-align:center; }
.ts-stat h3{ font-size:1.9rem; font-weight:800; color:#fff; line-height:1; margin:0; }
.ts-stat p{ color:rgba(255,255,255,.85); font-size:.78rem; font-weight:500; margin:.35rem 0 0; }

/* Section heading */
.ts-eyebrow{ display:inline-block; background:linear-gradient(135deg,var(--cfa-red),#ff6b6b);
  color:#fff; padding:.3rem .8rem; border-radius:999px; font-size:.65rem; font-weight:700;
  text-transform:uppercase; letter-spacing:.1em; margin-bottom:.6rem; }
.ts-h2{ font-size:clamp(1.4rem,5vw,1.9rem); font-weight:800; color:var(--cfa-navy); margin:0 0 .4rem; }
.ts-lead{ font-size:.95rem; color:var(--cfa-gray); line-height:1.6; margin:0 auto; max-width:34ch; }
.ts-block{ margin-top:34px; }
.ts-center{ text-align:center; }

/* Mission cards */
.ts-mgrid{ display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:12px;
  margin-top:20px; }
/* The shared raised look, written out because this file styles in a CSS
   block rather than inline. Same stack cardStyle.js exports. */
.ts-mcard{ background:#fff; border:1px solid rgba(0,0,0,.06); border-top:3px solid #223C6A; border-left:3px solid #223C6A; border-radius:16px; padding:1.4rem; box-shadow:-7px -7px 10px -4px rgba(200,212,228,.9), 0 0 0 1px rgba(17,24,39,.06), 0 12px 28px -10px rgba(17,24,39,.22);
  box-shadow:0 4px 18px rgba(0,0,0,.05); position:relative; overflow:hidden; }
.ts-mcard::before{ content:""; position:absolute; top:0; left:0; width:100%; height:4px;
  background:linear-gradient(90deg,var(--cfa-red),#ff6b6b); }
.ts-mcard .ic{ width:46px; height:46px; border-radius:13px; display:flex; align-items:center;
  justify-content:center; font-size:1.3rem; margin-bottom:.9rem; }
.ts-mcard h3{ font-size:1.05rem; font-weight:700; color:var(--cfa-navy); margin:0 0 .5rem; }
.ts-mcard p{ color:var(--cfa-gray); font-size:.88rem; line-height:1.6; margin:0; }
.ts-mcard ul{ list-style:none; padding:0; margin:0; display:grid; grid-template-columns:1fr 1fr;
  gap:.3rem; color:var(--cfa-gray); font-size:.85rem; }
.ts-mcard li::before{ content:"•"; color:var(--cfa-red); font-weight:bold; margin-right:.4rem; }
.ic-mission{ background:#EEF2FF; color:#4F46E5; } .ic-vision{ background:#FEF2F2; color:var(--cfa-red); }
.ic-values{ background:#ECFDF5; color:#059669; } .ic-rally{ background:#FEF3C7; color:#D97706; }

/* Core Values as an ascending ridge (signature) */
.ts-ridge{ background:#fff; border:1px solid rgba(0,0,0,.06); border-radius:16px; margin-top:12px;
  padding:1.2rem 1rem .6rem; box-shadow:0 4px 18px rgba(0,0,0,.05); }
.ts-ridge-head{ display:flex; align-items:center; gap:.5rem; margin-bottom:.2rem; }
.ts-ridge-head h3{ font-size:1.05rem; font-weight:700; color:var(--cfa-navy); margin:0; }
.ts-ridge-head span{ font-size:.6rem; font-weight:800; letter-spacing:.14em; text-transform:uppercase; color:#C9A24B; }
.ts-ridge svg{ width:100%; height:auto; display:block; }
` +
/* ── The ridge draws itself, then the values arrive on it ──────────────────
   ⚠️ THE STRING IS BROKEN IN TWO SO THIS IS JS, NOT CSS (Aug 8 2026). A block
   comment inside this template literal is part of the STRING, so the minifier
   cannot strip it and it shipped to the browser word for word, Matt's quotes
   included. Concatenating keeps the note beside its rule and out of the bundle.
   Matt, Aug 4 2026: the ladder should be animated "like it was before".
   ⚠️ THE RESTING STATE IS THE FINISHED PICTURE, not the empty one. Same rule
   the emblem follows above: with .ts-play absent — no JS, an old browser, or
   reduced motion — the line is fully drawn and every value is visible. An
   animation that hides content until it runs is a blank panel the day it
   breaks, and this one is the store's core values.
   The dash length is the polyline's own length rounded up; anything shorter
   leaves a visible gap at the end of the draw. */
`
.ts-ridge-line{ stroke-dasharray:1000; stroke-dashoffset:0; }
.ts-ridge-stop{ opacity:1; }
.ts-ridge.ts-play .ts-ridge-line{ animation:tsDrawPath 1.5s cubic-bezier(.35,.75,.4,1) both; }
/* Each value lands as the line reaches it, left to right. The delays trail the
   draw rather than matching it exactly, so a dot appears just after the line
   arrives rather than racing it. */
.ts-ridge.ts-play .ts-ridge-stop{ animation:tsFadeInUp .5s ease-out both; }
.ts-ridge.ts-play .ts-ridge-stop:nth-of-type(1){ animation-delay:.25s; }
.ts-ridge.ts-play .ts-ridge-stop:nth-of-type(2){ animation-delay:.55s; }
.ts-ridge.ts-play .ts-ridge-stop:nth-of-type(3){ animation-delay:.85s; }
.ts-ridge.ts-play .ts-ridge-stop:nth-of-type(4){ animation-delay:1.15s; }
.ts-ridge.ts-play .ts-ridge-stop:nth-of-type(5){ animation-delay:1.45s; }
/* The flag plants itself last, after the final value lands, then waves. Two
   animations on one element would fight, so the pole group does the arrival and
   the cloth inside it does the waving. */
.ts-ridge-flag{ opacity:1; }
.ts-flag-cloth{ transform-box:fill-box; transform-origin:left center; }
.ts-ridge.ts-play .ts-ridge-flag{ animation:tsFadeInUp .5s ease-out 1.7s both; }
.ts-ridge.ts-play .ts-flag-cloth{ animation:tsWaveFlag 2.6s ease-in-out 2.2s infinite; }
/* Somebody who has asked their device to stop moving things gets the finished
   picture and no motion. */
@media (prefers-reduced-motion: reduce){
  .ts-ridge.ts-play .ts-ridge-line,
  .ts-ridge.ts-play .ts-ridge-stop,
  .ts-ridge.ts-play .ts-ridge-flag,
  .ts-ridge.ts-play .ts-flag-cloth{ animation:none; }
}

/* Rally cry band */
.ts-rally{ position:relative; overflow:hidden; margin-top:12px; background:var(--cfa-navy);
  border-radius:16px; padding:2rem 1.4rem; text-align:center; }
.ts-rally span{ font-size:.62rem; font-weight:800; letter-spacing:.16em; text-transform:uppercase; color:#7f9bc4; }
.ts-rally .big{ font-size:clamp(1.4rem,5.5vw,2rem); font-weight:800; color:#fff; margin:.4rem 0 .3rem; letter-spacing:-.5px; }
.ts-rally .big em{ color:var(--cfa-red); font-style:normal; }
.ts-rally p{ margin:0 auto; max-width:32ch; color:#c7d2e2; font-size:.9rem; line-height:1.55; }

/* Mentorship programme section */
.ts-peak{ background:linear-gradient(180deg,var(--cfa-navy) 0%,#1e3a5f 100%); color:#fff;
  border-radius:18px; padding:34px 22px; margin-top:34px; }
.ts-peak .ts-h2, .ts-peak .ts-lead{ color:#fff; }
.ts-peak .ts-eyebrow{ background:rgba(255,255,255,.15); }
.ts-peak-visual{ display:flex; justify-content:center; margin:22px 0 26px; }
.ts-emblem{ position:relative; width:min(320px,80vw); }
.ts-emblem::before{ content:""; position:absolute; inset:6%; border:3px solid rgba(255,255,255,.28);
  border-radius:50%; pointer-events:none; }
.ts-emblem.ts-play::before{ animation:tsRingPulse 4s ease-in-out infinite; }
.ts-emblem svg{ position:relative; width:100%; height:auto; display:block; filter:drop-shadow(0 14px 34px rgba(0,0,0,.4)); }
/* base state = finished emblem (shown whenever .ts-play is absent) */
.ts-emblem .prScene,.ts-emblem .prGlowEl,.ts-emblem .prTree,.ts-emblem .prClimber,.ts-emblem .prBob,.ts-emblem .prFlag,.ts-emblem .prCloth,.ts-emblem .prWord{ transform-box:fill-box; }
.ts-emblem .prTree{ transform-origin:bottom center; } .ts-emblem .prFlag{ transform-origin:bottom center; } .ts-emblem .prCloth{ transform-origin:left center; }
.ts-emblem .prRing{ stroke-dasharray:1885; stroke-dashoffset:0; } .ts-emblem .prRope{ stroke-dasharray:520; stroke-dashoffset:0; }
.ts-emblem .prGlowEl{ opacity:.5; } .ts-emblem .prStar{ opacity:.5; }
/* animations run only while in view (.ts-play toggled by IntersectionObserver) */
.ts-emblem.ts-play .prRing{ animation:prDrawRing 1.2s .1s ease both; } .ts-emblem.ts-play .prRingIn{ animation:prFade .6s .9s ease both; }
.ts-emblem.ts-play .prScene{ animation:prRise .9s .35s cubic-bezier(.2,.7,.3,1) both; }
.ts-emblem.ts-play .prGlowEl{ animation:prFade 1s 1s ease both, prGlow 3.4s 2s ease-in-out infinite; }
.ts-emblem.ts-play .prRope{ animation:prDraw 1.1s 1.2s ease both; }
.ts-emblem.ts-play .prTree{ animation:prPop .5s ease both; }
.ts-emblem.ts-play .prTree:nth-of-type(1){animation-delay:1.0s} .ts-emblem.ts-play .prTree:nth-of-type(2){animation-delay:1.1s}
.ts-emblem.ts-play .prTree:nth-of-type(3){animation-delay:1.2s} .ts-emblem.ts-play .prTree:nth-of-type(4){animation-delay:1.3s}
.ts-emblem.ts-play .prTree:nth-of-type(5){animation-delay:1.4s} .ts-emblem.ts-play .prTree:nth-of-type(6){animation-delay:1.5s}
.ts-emblem.ts-play .prClimber{ animation:prClimb .7s cubic-bezier(.3,.6,.2,1) both; }
.ts-emblem.ts-play .prC1{animation-delay:1.35s} .ts-emblem.ts-play .prC2{animation-delay:1.6s} .ts-emblem.ts-play .prC3{animation-delay:1.85s} .ts-emblem.ts-play .prLead{animation-delay:2.1s}
.ts-emblem.ts-play .prBob{ animation:prBob 2.4s 3s ease-in-out infinite; }
.ts-emblem.ts-play .prFlag{ animation:prPlant .5s 2.45s cubic-bezier(.2,1.4,.4,1) both; }
.ts-emblem.ts-play .prCloth{ animation:prWave 2.6s 3s ease-in-out infinite; }
.ts-emblem.ts-play .prW1{ animation:prRise .6s 2.5s ease both; } .ts-emblem.ts-play .prW2{ animation:prRise .6s 2.7s ease both; } .ts-emblem.ts-play .prSub{ animation:prRise .6s 2.9s ease both; }
.ts-emblem.ts-play .prStar{ animation:prTwinkle 3s ease-in-out infinite; } .ts-emblem.ts-play .prStar:nth-of-type(even){ animation-delay:1.6s }
.ts-feats{ display:grid; grid-template-columns:1fr 1fr; gap:14px; }
` +
/* ★ THE SAME RAISED LOOK, WRITTEN FOR A DARK SURFACE (Matt, Aug 4 2026: "same
   look"). These four sit on the navy hero, and cardStyle.js cannot be used here
   for two reasons: these are CSS rules rather than a JS style object, and every
   value in CARD_3D is tuned for a light page. Its back layer is a pale grey
   block, which on navy reads as a smudge rather than a card underneath, and its
   .9-alpha white insets blow out against a dark face.
   ⇒ Same light source, same five layers, values inverted for dark:
     · the back step is white at low alpha, not grey
     · the ring and ambient shadow are BLACK, since a shadow on navy has to be
       darker than navy to be seen at all
     · the top and left insets are white but a quarter of the strength
   ⚠️ If cardStyle ever grows a dark variant, this should move there. Until then
   this is deliberately not a copy of it — the numbers genuinely differ. */
`
.ts-feat{ display:flex; gap:.8rem; align-items:flex-start;
  background:
    radial-gradient(140% 140% at 0% 0%, rgba(255,255,255,.15) 0%, rgba(255,255,255,.06) 42%, rgba(255,255,255,0) 100%),
    rgba(255,255,255,.05);
  border:1px solid rgba(255,255,255,.09);
  /* The section's own red, the same one already on the icons and the arrows, so
     the edge names what this is rather than just adding a line. 3px to match
     every other card in the Hub. */
  border-top:3px solid #E51636; border-left:3px solid #E51636;
  border-radius:15px; padding:16px;
  box-shadow:
    -6px -6px 0 -2px rgba(255,255,255,.07),
    0 0 0 1px rgba(0,0,0,.20),
    0 12px 28px -10px rgba(0,0,0,.45),
    inset 0 1px 0 rgba(255,255,255,.22),
    inset 1px 0 0 rgba(255,255,255,.12); }
.ts-feat .fic{ width:40px; height:40px; border-radius:11px; background:rgba(229,22,54,.16);
  display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.ts-feat .fic svg{ width:22px; height:22px; stroke:#ff5a76; stroke-width:2; fill:none;
  stroke-linecap:round; stroke-linejoin:round; }
.ts-feat h4{ font-size:.92rem; font-weight:700; margin:0 0 .15rem; color:#fff; }
.ts-feat p{ font-size:.78rem; color:rgba(255,255,255,.6); margin:0; line-height:1.45; }

/* Divider into the launcher cards */
.ts-launch-label{ margin:36px 0 14px; text-align:center; font-size:.72rem; font-weight:700;
  text-transform:uppercase; letter-spacing:.12em; color:var(--cfa-gray); }

@keyframes tsFadeInUp{ from{opacity:0;transform:translateY(24px);} to{opacity:1;transform:translateY(0);} }
@keyframes tsFadeInDown{ from{opacity:0;transform:translateY(-16px);} to{opacity:1;transform:translateY(0);} }
@keyframes tsRingPulse{ 0%,100%{transform:scale(1);opacity:1;} 50%{transform:scale(1.03);opacity:.7;} }
@keyframes tsDrawPath{ from{stroke-dashoffset:1000;} to{stroke-dashoffset:0;} }
@keyframes tsFadeIn{ from{opacity:0;} to{opacity:1;} }
@keyframes tsSlideUp{ from{opacity:0;transform:translateY(18px);} to{opacity:1;transform:translateY(0);} }
@keyframes tsWaveFlag{ 0%,100%{transform:rotate(0);} 25%{transform:rotate(5deg);} 75%{transform:rotate(-3deg);} }
@keyframes tsFloatCloud{ 0%,100%{transform:translateX(0);} 50%{transform:translateX(8px);} }
@keyframes tsTwinkle{ 0%,100%{opacity:.3;} 50%{opacity:1;} }

/* Mentorship programme emblem keyframes */
@keyframes prDraw{ from{ stroke-dashoffset:1735; } }
@keyframes prDrawRing{ from{ stroke-dashoffset:1885; } }
@keyframes prFade{ from{ opacity:0; } to{ opacity:1; } }
@keyframes prRise{ from{ opacity:0; transform:translateY(16px); } to{ opacity:1; transform:translateY(0); } }
@keyframes prPop{ from{ opacity:0; transform:scaleY(0); } to{ opacity:1; transform:scaleY(1); } }
@keyframes prClimb{ from{ opacity:0; transform:translate(-16px,30px); } to{ opacity:1; transform:translate(0,0); } }
@keyframes prPlant{ from{ opacity:0; transform:scale(.3) rotate(-14deg); } to{ opacity:1; transform:scale(1) rotate(0); } }
@keyframes prBob{ 0%,100%{ transform:translateY(0); } 50%{ transform:translateY(-2px); } }
@keyframes prWave{ 0%,100%{ transform:skewX(0); } 50%{ transform:skewX(-10deg); } }
@keyframes prGlow{ 0%,100%{ opacity:.4; } 50%{ opacity:.72; } }
@keyframes prTwinkle{ 0%,100%{ opacity:.2; } 50%{ opacity:.9; } }

@media (prefers-reduced-motion: reduce){
  .ts-emblem svg *{ animation:none !important; }
  .ts-emblem::before{ animation:none !important; }
  .ts-emblem .prGlowEl{ opacity:.5; } .ts-emblem .prStar{ opacity:.6; }
}

@media (max-width:520px){
  .ts-feats{ grid-template-columns:1fr; }
  .ts-mcard ul{ grid-template-columns:1fr; }
}
`;

// Animated mentorship-programme mountain — kept as raw markup
// (dangerouslySetInnerHTML) so the SVG's hyphenated attributes and inline
// animation strings survive exactly as Matt authored them. Keyframes are the
// ts-prefixed ones above; the flag red is hardcoded (CSS var() is unreliable as
// an SVG presentation attribute).
/* ⚠️ A FUNCTION RATHER THAN A CONST, AND ONLY BECAUSE OF THE aria-label. The
   emblem is what a screen reader announces this section as, so it has to carry
   the store's own programme name like the heading beside it does. Reading
   `storeCfg` into a module-level const would capture the default before
   `applyStoreOverrides` has run, which is the trap storeConfig.js warns about.
   A pure helper taking the name sidesteps it and stays at module level
   (design rule 7). The body has no other `${}` in it, checked, so nothing else
   changed meaning by becoming interpolated. */
/* ⚠️ THE RIDGE WAS A HAND-WRITTEN TABLE OF EXACTLY FIVE STOPS holding this
   store's five values by name. Two faults in one list: the words were ours, and
   the count was welded to five, so a store with four or six would have been
   drawn wrong or told to pad.

   ⇒ DERIVED FROM THE STORE'S OWN LIST NOW. Same climb, same flag at the top,
   any length.

   ⚠️ MEASURED RATHER THAN ASSUMED, because the first draft of this comment
   copied the second store's "within about ten units" and that is not true here.
   Both ENDS land exactly on the old table — Family at 30,190 and Excellence at
   910,34 — and the middle stops move right by 10, 30 and 50 units, because the
   hand table bunched them toward the left. 50 on a viewBox 1000 wide is 5% of
   the width in a decorative drawing, and it buys any number of values. The
   wrapping is unchanged: only "Continuous Improvement" takes two lines, exactly
   as the hand table had it.

   ★ MODULE LEVEL, per design rule 7: pure, read during render, and it takes the
   labels as an argument so it never reads settings at import time. */
function splitLabel(raw) {
  /* Two lines only when the words are long enough to crowd a neighbour.
     "Continuous Improvement" wraps and "Family" does not, which is what the hand
     table did, without anyone deciding it value by value. */
  const s = String(raw == null ? "" : raw).trim();
  const cut = s.lastIndexOf(" ");
  if (s.length <= 12 || cut < 1) return [s];
  return [s.slice(0, cut), s.slice(cut + 1)];
}

const RIDGE_X0 = 30, RIDGE_X1 = 910;
const RIDGE_Y0 = 190, RIDGE_Y1 = 34;
function ridgeStops(labels) {
  const n = labels.length;
  return labels.map((raw, i) => {
    /* ⚠️ A SINGLE VALUE SITS AT THE PEAK, NOT AT THE FOOT, and this is the one
       place the ridge deliberately differs from the second store's street. The
       flag marks the last stop; with one value the last stop is also the first,
       and a lone flag planted at the bottom-left of a climb reads as a mistake.
       At the top it reads as one value, reached. */
    const t = n <= 1 ? 1 : i / (n - 1);
    return {
      x: Math.round(RIDGE_X0 + t * (RIDGE_X1 - RIDGE_X0)),
      y: Math.round(RIDGE_Y0 - t * (RIDGE_Y0 - RIDGE_Y1)),
      peak: i === n - 1,
      label: splitLabel(raw),
    };
  });
}

/* "April 2018" → 8, for the Years of Service stat.
   ⚠️ RETURNS null RATHER THAN 0 for anything it cannot read. A team site that
   says "0+ Years of Service" about its own store is worse than one that says
   nothing, and an unparseable setting must not become a confident wrong number.
   ⚠️ DERIVED, NEVER TYPED BESIDE THE DATE, so the badge and the stat cannot
   disagree — and so this store's "8+" stops being a number that quietly goes
   stale next April.
   ⚠️ MODULE LEVEL (design rule 7). It is pure and takes the date as an
   argument, so it never reads settings at import time. */
const MONTH_NAMES = ["january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december"];
function yearsSince(monthYear) {
  const m = String(monthYear || "").trim().match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const mi = MONTH_NAMES.indexOf(m[1].toLowerCase());
  if (mi < 0) return null;
  const years = Math.floor((Date.now() - new Date(Number(m[2]), mi, 1).getTime()) / 31557600000);
  return years >= 1 ? years : null;
}

const mountainSvg = (programName) => `
<svg class="prSvg" viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${programName} mentorship program emblem">
  <defs>
    <radialGradient id="prBg" cx="50%" cy="32%" r="72%"><stop offset="0%" stop-color="#1a2d4e"/><stop offset="55%" stop-color="#132443"/><stop offset="100%" stop-color="#0c1a31"/></radialGradient>
    <linearGradient id="prFaceL" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#26406e"/><stop offset="100%" stop-color="#1a2c4d"/></linearGradient>
    <linearGradient id="prFaceR" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1b2e50"/><stop offset="100%" stop-color="#122139"/></linearGradient>
    <radialGradient id="prHalo" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#7fd0ff" stop-opacity=".9"/><stop offset="45%" stop-color="#4a86c9" stop-opacity=".35"/><stop offset="100%" stop-color="#4a86c9" stop-opacity="0"/></radialGradient>
    <clipPath id="prDisc"><circle cx="400" cy="400" r="300"/></clipPath>
  </defs>
  <circle cx="400" cy="400" r="300" fill="url(#prBg)"/>
  <g clip-path="url(#prDisc)"><g>
    <ellipse class="prGlowEl" cx="400" cy="280" rx="230" ry="190" fill="url(#prHalo)"/>
    <g fill="#bcd0ec"><circle class="prStar" cx="300" cy="250" r="2.6"/><circle class="prStar" cx="500" cy="250" r="2.2"/><circle class="prStar" cx="350" cy="205" r="2"/><circle class="prStar" cx="470" cy="192" r="2.6"/><circle class="prStar" cx="540" cy="300" r="2"/><circle class="prStar" cx="262" cy="300" r="2.2"/><circle class="prStar" cx="430" cy="176" r="2"/><circle class="prStar" cx="360" cy="300" r="1.8"/><circle class="prStar" cx="400" cy="146" r="2.4"/><circle class="prStar" cx="318" cy="163" r="1.9"/><circle class="prStar" cx="486" cy="154" r="2.2"/><circle class="prStar" cx="252" cy="214" r="2.3"/><circle class="prStar" cx="556" cy="232" r="2"/><circle class="prStar" cx="224" cy="268" r="1.7"/><circle class="prStar" cx="592" cy="286" r="2.4"/><circle class="prStar" cx="288" cy="186" r="1.5"/><circle class="prStar" cx="516" cy="206" r="1.6"/><circle class="prStar" cx="452" cy="222" r="1.5"/><circle class="prStar" cx="336" cy="242" r="1.6"/><circle class="prStar" cx="608" cy="342" r="1.8"/><circle class="prStar" cx="206" cy="330" r="2"/><circle class="prStar" cx="380" cy="188" r="1.4"/></g>
    <g class="prScene">
      <polygon points="150,470 290,320 430,470" fill="#152744"/><polygon points="470,470 590,340 700,470" fill="#152744"/>
      <polygon points="400,210 560,470 400,470" fill="url(#prFaceR)"/><polygon points="400,210 400,470 240,470" fill="url(#prFaceL)"/>
      <polygon points="400,210 434,300 414,288 400,308 386,286 366,300" fill="#eef4fc"/><polygon points="400,210 400,308 386,286 366,300" fill="#dbe6f5"/>
      <g fill="#16273f">
        <path class="prTree" d="M268,470 h-17 l11,-20 h-7 l10,-18 h-6 l9,-18 9,18 h-6 l10,18 h-7 l11,20 Z"/>
        <path class="prTree" d="M306,470 h-15 l10,-18 h-6 l9,-16 h-5 l8,-16 8,16 h-5 l9,16 h-6 l10,18 Z"/>
        <path class="prTree" d="M332,470 h-13 l9,-15 h-5 l8,-14 h-4 l7,-14 7,14 h-4 l8,14 h-5 l9,15 Z"/>
        <path class="prTree" d="M468,470 h-13 l9,-15 h-5 l8,-14 h-4 l7,-14 7,14 h-4 l8,14 h-5 l9,15 Z"/>
        <path class="prTree" d="M500,470 h-15 l10,-18 h-6 l9,-16 h-5 l8,-16 8,16 h-5 l9,16 h-6 l10,18 Z"/>
        <path class="prTree" d="M534,470 h-17 l11,-20 h-7 l10,-18 h-6 l9,-18 9,18 h-6 l10,18 h-7 l11,20 Z"/>
      </g>
      <polyline class="prRope" points="315,447 345,352 372,286 397,222" fill="none" stroke="#c9a24b" stroke-width="3" stroke-linecap="round" opacity=".9"/>
      <g fill="#eaf1fb">
        <g transform="translate(315,440)"><g class="prClimber prC1"><g class="prBob"><circle cx="0" cy="-26" r="6"/><rect x="-9" y="-22" width="11" height="15" rx="4" fill="#cdd9ee"/><path d="M0,-20 L2,-6" stroke="#eaf1fb" stroke-width="5" stroke-linecap="round"/><path d="M1,-18 L12,-26" stroke="#eaf1fb" stroke-width="4.5" stroke-linecap="round"/><path d="M2,-6 L-6,6 M2,-6 L9,4" stroke="#eaf1fb" stroke-width="4.5" stroke-linecap="round"/></g></g></g>
        <g transform="translate(345,366)"><g class="prClimber prC2"><g class="prBob"><circle cx="0" cy="-26" r="6"/><rect x="-9" y="-22" width="11" height="15" rx="4" fill="#cdd9ee"/><path d="M0,-20 L2,-6" stroke="#eaf1fb" stroke-width="5" stroke-linecap="round"/><path d="M1,-18 L12,-26" stroke="#eaf1fb" stroke-width="4.5" stroke-linecap="round"/><path d="M2,-6 L-6,6 M2,-6 L9,4" stroke="#eaf1fb" stroke-width="4.5" stroke-linecap="round"/></g></g></g>
        <g transform="translate(372,300)"><g class="prClimber prC3"><g class="prBob"><circle cx="0" cy="-26" r="6"/><rect x="-9" y="-22" width="11" height="15" rx="4" fill="#cdd9ee"/><path d="M0,-20 L2,-6" stroke="#eaf1fb" stroke-width="5" stroke-linecap="round"/><path d="M1,-18 L12,-26" stroke="#eaf1fb" stroke-width="4.5" stroke-linecap="round"/><path d="M2,-6 L-6,6 M2,-6 L9,4" stroke="#eaf1fb" stroke-width="4.5" stroke-linecap="round"/></g></g></g>
        <g transform="translate(396,240)"><g class="prClimber prLead"><g class="prBob"><circle cx="0" cy="-28" r="6.2"/><rect x="-10" y="-24" width="11" height="15" rx="4" fill="#cdd9ee"/><path d="M0,-22 L1,-7" stroke="#eaf1fb" stroke-width="5" stroke-linecap="round"/><path d="M0,-20 L-11,-30" stroke="#eaf1fb" stroke-width="4.5" stroke-linecap="round"/><path d="M1,-7 L-7,5 M1,-7 L8,4" stroke="#eaf1fb" stroke-width="4.5" stroke-linecap="round"/></g></g></g>
      </g>
      <g class="prFlag"><line x1="400" y1="232" x2="400" y2="196" stroke="#e9eef7" stroke-width="4" stroke-linecap="round"/><path class="prCloth" d="M402,200 L438,210 L402,222 Z" fill="#E51636"/></g>
    </g>
  </g></g>
  <text class="prWord prW1" x="400" y="560" text-anchor="middle" fill="#f4f8ff" font-family="'Plus Jakarta Sans',Arial,sans-serif" font-weight="800" font-size="66" letter-spacing="1">PEAK</text>
  <text class="prWord prW2" x="400" y="620" text-anchor="middle" fill="#f4f8ff" font-family="'Plus Jakarta Sans',Arial,sans-serif" font-weight="800" font-size="66" letter-spacing="1">REACHERS</text>
  <text class="prWord prSub" x="400" y="652" text-anchor="middle" fill="#7f9bc4" font-family="'Plus Jakarta Sans',Arial,sans-serif" font-weight="700" font-size="19" letter-spacing="4">MENTORSHIP PROGRAM</text>
  <circle class="prRing" cx="400" cy="400" r="300" fill="none" stroke="#cdd8ea" stroke-width="10"/>
  <circle class="prRingIn" cx="400" cy="400" r="286" fill="none" stroke="#41598a" stroke-width="3"/>
</svg>`;

/* ★ `pendingRecs` IS PASSED IN, NEVER RECOMPUTED HERE (Bri's alert trail,
   Jul 27). App.jsx already counts it for the tile badge; a second count in this
   file would be a second source that can disagree with the first, which is the
   exact fault that made the recommendation banner unreachable for an AD all
   week. One counter, displayed in three places. */
/* Toggle `.ts-play` while an element is on screen. Every animation on this page
   keys off that class, so this is what makes anything move.

   ⇒ ONE implementation. It was written inline for the emblem, and the ridge
   needed the same thing; a second copy is how the two would have drifted into
   different thresholds and different replay behaviour.
   ⚠️ REMOVE, REFLOW, RE-ADD. Dropping the class and adding it back in the same
   tick does nothing — the browser coalesces it and the animation never restarts.
   Reading offsetWidth in between forces the reflow that makes the replay real.
   That is why scrolling away and back plays it again instead of once per load. */
function usePlayInView(ref, threshold = 0.4) {
  React.useEffect(() => {
    const el = ref && ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { el.classList.remove("ts-play"); void el.offsetWidth; el.classList.add("ts-play"); }
        else { el.classList.remove("ts-play"); }
      }),
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, threshold]);
}

export default function PeakReachers({ onBack, pendingRecs = 0, goalsDue = 0, onOpenTool }) {
  /* ⚠️ INSIDE THE COMPONENT, NOT AT MODULE LEVEL. See the teamSite note in
     storeConfig.js: `applyStoreOverrides` merges a store's saved settings after
     these modules have imported, so a module-level read pins the default. */
  const programName = programLabel();
  /* ⚠️ THE STREET IS A SETTING, NOT A CONSTANT. This stat used to read
     "1 · Gate City Blvd" at every store that ran a copy of this file, which is
     design rule 18 with a road name on it: another operator would have to
     change it and could not.
     ⚠️ READ HERE FOR THE SAME REASON `programName` IS. A module-level read
     lands before `applyStoreOverrides` merges a store's saved settings.
     ⚠️ BLANK FALLS BACK TO THE STORE'S NAME rather than dropping the stat, so
     the row still has four tiles and the grid does not reflow. */
  const street = String(storeCfg("identity.street", "") || "").trim() || STORE.name;
  const established = String(storeCfg("teamSite.established", "") || "").trim();
  const teamCount = String(storeCfg("teamSite.teamCount", "") || "").trim();
  const place = [storeCfg("identity.city", ""), storeCfg("identity.state", "")]
    .filter(Boolean).join(", ");
  const tenure = yearsSince(established);
  const mission = String(storeCfg("teamSite.mission", "") || "").trim();
  const vision = String(storeCfg("teamSite.vision", "") || "").trim();
  const valuesTitle = String(storeCfg("teamSite.valuesTitle", "") || "").trim();
  const rallyCry = String(storeCfg("teamSite.rallyCry", "") || "").trim();
  const rallyLine = String(storeCfg("teamSite.rallyLine", "") || "").trim();
  /* ⚠️ GUARDED BECAUSE KV CAN HOLD ANYTHING. A saved record from an older shape
     could carry a string or null here; `.map` on either takes the whole team
     site down, and rule 1 says old records must still read. Blank entries are
     dropped so a stray comma cannot draw a nameless stop. */
  const rawValues = storeCfg("teamSite.values", []);
  const stops = ridgeStops(
    (Array.isArray(rawValues) ? rawValues : [])
      .map((v) => String(v == null ? "" : v).trim())
      .filter(Boolean),
  );
  /* ⚠️ ANYTHING UNKNOWN IS DROPPED RATHER THAN GUESSED, so a store that has not
     filled these in gets a shorter row instead of a made-up one. `filter` is
     what makes blank a working state here. */
  const stats = [
    tenure ? { n: `${tenure}+`, label: "Years of Service" } : null,
    teamCount ? { n: teamCount, label: "Team Members" } : null,
    { n: "1", label: street },
    { n: "∞", label: "Hearts Won" },
  ].filter(Boolean);
  const [dirView, setDirView] = useState(null); // "teams" | "our-team" → renders TeamDirectory in-Hub
  const [subPage, setSubPage] = useState(null); // "resources" | "goals" → in-Hub pages
  const missionRef = useRef(null);
  const peakRef = useRef(null);
  const ridgeRef = useRef(null);
  const emblemRef = useRef(null);
  const savedY = useRef(0);
  const scrollTo = (ref) =>
    ref.current && ref.current.scrollIntoView({ behavior: "smooth", block: "start" });

  // Remember where the main page was scrolled when entering a sub-page, so
  // backing out lands you right where you left instead of jumping to the top.
  const enterSub = (setter, val) => { savedY.current = window.scrollY; setter(val); };
  React.useLayoutEffect(() => {
    if (dirView || subPage) window.scrollTo(0, 0);        // sub-page opens at its top
    else window.scrollTo(0, savedY.current);              // back → restore main scroll
  }, [dirView, subPage]);

  // Replay the emblem's climb each time it scrolls into view (on a long page
  // a mount-triggered animation would finish off-screen). Restart trick:
  // remove the class, force reflow, re-add.
  usePlayInView(emblemRef, 0.4);
  /* 🐛 THE RIDGE NEVER ANIMATED (Matt, Aug 4 2026: "on the team site page i want
     the ladder to be animated too. it was before but it stopped").
     tsDrawPath — a stroke-dashoffset draw — was written for this exact line and
     was attached to nothing; so were tsSlideUp, tsWaveFlag, tsFloatCloud and the
     plain tsFadeIn. Five animations defined and never referenced. The emblem was
     the only element with an observer, and .ts-play is what every animation on
     this page keys off, so the ridge simply sat still.
     ⚠️ A LOWER THRESHOLD THAN THE EMBLEM ON PURPOSE. The ridge is a wide, short
     band; at 0.4 it has to be almost fully on screen before it starts, which on
     a phone means the draw finishes before you have read the first value. */
  usePlayInView(ridgeRef, 0.15);

  // In-Hub directory views (replaces the old Wix bounce for Our Team / Meet Our Teams)
  if (dirView) {
    return <TeamDirectory initialView={dirView} onBack={() => setDirView(null)} />;
  }
  if (subPage === "resources") {
    return <TeamResources onBack={() => setSubPage(null)} onOpenTool={onOpenTool} />;
  }
  if (subPage === "goals") {
    return <TeamGoals onBack={() => setSubPage(null)} />;
  }
  if (subPage === "growth") {
    return <ProfessionalGrowth onBack={() => setSubPage(null)} />;
  }
  if (subPage === "l101") {
    return <Leadership101 onBack={() => setSubPage(null)} />;
  }
  if (subPage === "orientation") {
    return <TrainerOrientation onBack={() => setSubPage(null)} />;
  }

  /* ⚠️ 640 squeezed the two hero cards into a column on a laptop — see Matt's
     Jul 30 Peak Reachers screenshot. Widened to 960 so the mission card and the
     stats card sit side by side on a 13" screen; phones and iPad portrait are
     below 960 and render exactly as before. */
  return (
    <div className="ts-root" style={{ maxWidth: "min(100%, 960px)", margin: "0 auto", padding: "16px 14px 40px" }}>
      <style>{CSS}</style>

      {onBack && (
        <button
          onClick={onBack}
          style={{
            border: "none", background: "transparent", color: "#6B7280", fontSize: 15,
            fontWeight: 600, padding: "6px 0", marginBottom: 8, cursor: "pointer",
          }}
        >
          ← Back
        </button>
      )}

      {/* HERO */}
      <section className="ts-hero">
        {/* ⚠️ THE DATE AND THE PLACE WERE HARDCODED HERE, both facts about this
            store sitting in a file every clone runs. Both come from settings
            now, and a blank date renders no date rather than a plausible one. */}
        <span className="ts-badge">
          🏔️ {established ? `Est. ${established}` : STORE.name}
          {place ? ` · ${place}` : ""}
        </span>
        <h1>
          We're not just in the <span>chicken business</span>, we're in the <span>people business</span>.
        </h1>
        <p className="ts-quote">
          "Great food served quickly by friendly team members in a clean and safe environment."
        </p>
        <p className="ts-author">— S. Truett Cathy</p>
        <div className="ts-cta">
          <button className="ts-btn ts-btn-primary" onClick={() => scrollTo(missionRef)}>
            Explore Our Mission
          </button>
          <button className="ts-btn ts-btn-ghost" onClick={() => scrollTo(peakRef)}>
            {programName}
          </button>
        </div>
      </section>

      {/* STATS */}
      <div className="ts-stats">
        {stats.map((s) => (
          <div className="ts-stat" key={s.label}><h3>{s.n}</h3><p>{s.label}</p></div>
        ))}
      </div>

      {/* MISSION / VISION / VALUES
          ⚠️ EVERY SENTENCE HERE WAS THIS STORE'S, HARDCODED, and a clone's team
          read it as their own. The vision is the one that started design rule
          18. Both come from settings now, and the HEADING GOES WITH THE CARDS,
          because an empty "Our Foundation" panel is a question nobody asked.
          ⚠️ THE LEAD LINE IS GONE, NOT MOVED TO A FIELD, and this is the one
          change on this page a reader here will notice. It read "rooted in
          excellence, family, and serving our community with integrity" — which
          is this store's own five values recited as prose, so it is the same
          bug as the ridge below it wearing different clothes. It cannot be made
          generic without becoming filler, and the values ridge says the same
          thing in the store's own words a few lines down. The second store
          reached this conclusion first; matching it keeps one implementation
          across both pages. */}
      {(mission || vision) && (
        <>
        <div className="ts-block ts-center" ref={missionRef}>
          <span className="ts-eyebrow">Our Foundation</span>
          <h2 className="ts-h2">Mission, Vision &amp; Values</h2>
        </div>
        <div className="ts-mgrid">
          {mission && (
            <div className="ts-mcard">
              <div className="ic ic-mission">🎯</div>
              <h3>Mission</h3>
              <p>{mission}</p>
            </div>
          )}
          {vision && (
            <div className="ts-mcard">
              <div className="ic ic-vision">❤️</div>
              <h3>Vision</h3>
              <p>{vision}</p>
            </div>
          )}
        </div>
        </>
      )}

      {/* Core Values — the ridge we climb.
          ⚠️ THE STOPS AND THE POLYLINE BOTH COME FROM `stops`, so the line can
          never end up joining points the labels are not on. That was the real
          risk in the hand table: two lists of the same five coordinates, typed
          twice, free to drift.
          ⚠️ THE WHOLE PANEL GOES when a store has named no values, rather than
          drawing an empty ridge with a flag on nothing. */}
      {stops.length > 0 && (
        <div className="ts-ridge" ref={ridgeRef}>
          <div className="ts-ridge-head">
            <h3>{valuesTitle || "Core Values"}</h3><span>The Ridge We Climb</span>
          </div>
          <svg viewBox="0 -16 1000 226" preserveAspectRatio="xMidYMid meet"
               aria-label={`${valuesTitle || "Core values"}: ${stops.map((v) => v.label.join(" ")).join(", ")}`}>
            <polyline className="ts-ridge-line" points={stops.map((v) => `${v.x},${v.y}`).join(" ")}
                      fill="none" stroke="#E7E2D8" strokeWidth="3"/>
            <g fontFamily="'Plus Jakarta Sans',sans-serif">
              {stops.map((v) => (
                <g className="ts-ridge-stop" key={`${v.x}-${v.label.join(" ")}`}>
                  <circle cx={v.x} cy={v.y} r={v.peak ? 9 : 8} fill={v.peak ? "#C9A24B" : "#E51636"}/>
                  <text x={v.x} y={v.y - (v.peak ? 14 : 20)} textAnchor="middle"
                        fontSize={v.peak ? 21 : (v.label.length > 1 ? 19 : 20)}
                        fontWeight={v.peak ? 900 : 800} fill="#0F1B33">{v.label[0]}</text>
                  {/* The second line hangs BELOW the stop, where the first line
                      has no room. Only long labels ever have one. */}
                  {v.label[1] && (
                    <text x={v.x} y={v.y + 32} textAnchor="middle" fontSize="12" fill="#5b6b82">{v.label[1]}</text>
                  )}
                </g>
              ))}
              {/* ★ THE FLAG AT THE PEAK (Matt, Aug 4 2026: "the flag is missing
                  from the ladder"). tsWaveFlag had been defined in this file the
                  whole time and attached to nothing — the animation was written
                  for a flag that never got drawn.
                  ⚠️ transform-origin is the pole base, so the cloth pivots where
                  it is attached rather than swinging from its own middle. The
                  pole itself never moves; only the cloth waves, which is what
                  stops it reading as a wobbling stick.
                  ⚠️ DRAWN FROM THE LAST STOP rather than from typed coordinates,
                  so it stands on the peak whatever the peak turns out to be. */}
              {stops.length > 0 && (() => {
                const top = stops[stops.length - 1];
                return (
                  <g className="ts-ridge-flag">
                    <line x1={top.x} y1={top.y} x2={top.x} y2={top.y - 38}
                          stroke="#C9A24B" strokeWidth="3" strokeLinecap="round"/>
                    <path className="ts-flag-cloth"
                          d={`M${top.x},${top.y - 36} L${top.x + 48},${top.y - 25} L${top.x},${top.y - 14} Z`}
                          fill="#E51636"/>
                  </g>
                );
              })()}
            </g>
          </svg>
        </div>
      )}

      {/* Rally cry.
          ⚠️ THE WHOLE BAND GOES WHEN THERE IS NO CRY, rather than leaving a dark
          stripe with a label and nothing in it. The line under it only shows
          when there is something for it to sit under. */}
      {rallyCry && (
        <div className="ts-rally">
          <span>Our Rally Cry</span>
          <div className="big">{rallyCry}</div>
          {rallyLine && <p>{rallyLine}</p>}
        </div>
      )}

      {/* PEAK REACHERS */}
      <section className="ts-peak" ref={peakRef}>
        <div className="ts-center">
          <span className="ts-eyebrow">Mentorship Program</span>
          <h2 className="ts-h2">{programName}</h2>
          <p className="ts-lead">Climbing higher together — one team member at a time.</p>
        </div>
        <div className="ts-peak-visual">
          <div className="ts-emblem" ref={emblemRef} dangerouslySetInnerHTML={{ __html: mountainSvg(programName) }} />
        </div>
        <div className="ts-feats">
          <div className="ts-feat">
            <div className="fic"><svg viewBox="0 0 24 24"><circle cx="8" cy="9" r="3"/><path d="M2.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="8" r="2.4"/><path d="M15 19a4.5 4.5 0 0 1 6.5-4"/></svg></div>
            <div><h4>1-on-1 Mentoring</h4><p>Personal guidance from experienced leaders</p></div>
          </div>
          <div className="ts-feat">
            <div className="fic"><svg viewBox="0 0 24 24"><path d="M4 18 L10 11 L14 15 L20 6"/><path d="M20 6 h-4 M20 6 v4"/></svg></div>
            <div><h4>Career Growth</h4><p>Clear pathways to leadership roles</p></div>
          </div>
          <div className="ts-feat">
            <div className="fic"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.4"/><circle cx="12" cy="12" r="1"/></svg></div>
            <div><h4>Skill Building</h4><p>Hands-on training in operations &amp; service</p></div>
          </div>
          <div className="ts-feat">
            <div className="fic"><svg viewBox="0 0 24 24"><path d="M8 4 h8 v4 a4 4 0 0 1-8 0z"/><path d="M8 5 H5 a2.5 2.5 0 0 0 3 3M16 5 h3 a2.5 2.5 0 0 1-3 3"/><path d="M12 12 v4 M9 20 h6 M10 20 l.6-4h2.8l.6 4"/></svg></div>
            <div><h4>Recognition</h4><p>Celebrating wins and milestones</p></div>
          </div>
        </div>
      </section>

      {/* LAUNCHER CARDS — the original nav, kept as-is (opens the full Wix site) */}
      <div className="ts-launch-label">Explore the full site</div>

      {SECTIONS.map((s) => (
        <div
          key={s.label}
          /* The Explore cards sit on the light page, so these DO take the shared
             look straight from cardStyle rather than the dark variant above. */
          style={{
            border: "1px solid #E5E7EB", borderRadius: 12, padding: "14px 14px 12px",
            marginBottom: 12, backgroundColor: "#fff",
            backgroundImage: cardSurface(PEAK_RED, 0.5),
            ...accentEdge(PEAK_RED, 3), boxShadow: CARD_3D,
          }}
        >
          <button
            onClick={() => (s.route === "our-team" ? enterSub(setDirView, "our-team") : s.route === "peak" ? scrollTo(peakRef) : s.route === "resources" ? enterSub(setSubPage, "resources") : null)}
            style={{
              width: "100%", textAlign: "left", border: "none", background: "transparent",
              padding: 0, cursor: "pointer", display: "flex", alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>
              <span style={{ fontSize: 16, fontWeight: 700, color: "#111827", display: "block" }}>
                {s.label}
                {/* Step 2 of the trail. Same count as the People & Team card,
                    handed down rather than recalculated. */}
                {s.route === "peak" && (pendingRecs + goalsDue) > 0 && (
                  <span style={{ marginLeft: 8, background: "#DC2626", color: "#fff", borderRadius: 999,
                    fontSize: 11.5, fontWeight: 800, padding: "1px 7px", verticalAlign: "middle" }}>
                    {pendingRecs + goalsDue}
                  </span>
                )}
              </span>
              <span style={{ fontSize: 13, color: "#6B7280" }}>{s.desc}</span>
            </span>
            <span style={{ color: ACCENT, fontSize: 18, fontWeight: 700, marginLeft: 10 }}>↗</span>
          </button>

          {s.subs && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              {s.subs.map((sub) => (
                <button
                  key={sub.label}
                  onClick={() => {
                    const r = SUB_ROUTES[sub.route];
                    if (!r) return;
                    enterSub(r.kind === "dir" ? setDirView : setSubPage, sub.route);
                  }}
                  style={{
                    border: `1px solid ${ACCENT}`, color: ACCENT, background: "#fff",
                    borderRadius: 999, padding: "6px 12px", fontSize: 13, fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {sub.label}
                  {/* Step 3, the last one before the banner. Bri: the trail has
                      to run People & Team → Peak Reachers → Professional
                      Growth, or a leader never finds the thing waiting. */}
                  {sub.route === "growth" && pendingRecs > 0 && (
                    <span style={{ marginLeft: 6, background: "#DC2626", color: "#fff", borderRadius: 999,
                      fontSize: 11, fontWeight: 800, padding: "1px 6px" }}>
                      {pendingRecs}
                    </span>
                  )}
                  {/* Step 2 of the goals trail (Bri, Jul 30): "starts on Peak
                      Reachers, then the Team Goals, and lands on Submissions". */}
                  {sub.route === "goals" && goalsDue > 0 && (
                    <span style={{ marginLeft: 6, background: "#DC2626", color: "#fff", borderRadius: 999,
                      fontSize: 11, fontWeight: 800, padding: "1px 6px" }}>
                      {goalsDue}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}

    </div>
  );
}
