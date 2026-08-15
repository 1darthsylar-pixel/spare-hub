import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Play, Pause, Music, FileText, ArrowLeft, Lock } from 'lucide-react';

/* ============================================================================
   RosterImportTraining.jsx — Gate City Hub

   Leader Training: "Importing the Roster" — a slideshow module teaching how to
   pull the daily roster from HotSchedules and import it into the Hub's Auto
   Assignment board. Gated to Leader tier (2) and up, matching the same pattern
   the rest of the Hub uses (e.g. DocumentingTeamMembers.jsx, TrainingSite.jsx).

   Usage (wire into App.jsx like any other tile):
     <RosterImportTraining tier={tier} />
       tier = 1 → Team Member  → LOCKED
       tier = 2 → Leader       → unlocked
       tier = 3 → Director     → unlocked
       tier = undefined        → preview/admin context → unlocked
   ============================================================================ */

const MIN_TIER = 2; // Leader and up

const ACCENT = '#E51C2A';        // Chick-fil-A red (GC logo)
const CTA = '#4F6EF7';           // active/pause blue
const AUTO_ADVANCE_MS = 11000;   // time per slide when playing

const SLIDES = [
  {
    title: 'Importing the Roster',
    eyebrow: 'Leader Training · Lineup · Daily Setup',
    script:
      /* ⚠️ SAYS "the Hub", NOT this store's app name, AND NOT `STORE.appName`.
         SLIDES is a MODULE-LEVEL const, so it is built when the chunk is
         imported — which can be before `applyStoreOverrides` has run. A getter
         read here would freeze whatever the code default was and look dynamic
         forever. "the Hub" is true at every store and cannot go stale.
         ⇒ The render-time sites in this repo use {STORE.appName}. This one
         cannot, and that difference is the reason, not an oversight. */
      "Welcome! This walks through how to pull the daily schedule from HotSchedules and import it into the Hub — so the setup builds itself, with everyone placed by skill and the hours they work, and breaks assigned automatically.",
    steps: null,
  },
  {
    title: 'Open the Roster Report',
    eyebrow: 'Step 1 · HotSchedules',
    script:
      "In HotSchedules, open the menu with the grid icon in the top-left corner. Go to Reporting, then choose Roster Report.",
    steps: ['Menu (top-left grid icon)', 'Reporting', 'Roster Report'],
  },
  {
    title: 'Pick the Day',
    eyebrow: 'Step 2 · Date',
    script:
      "At the top of the report, set the date to the day you're building the setup for — usually the next business day.",
    steps: ['Set the date to the day you\u2019re building'],
  },
  {
    title: 'Check Your Settings',
    eyebrow: 'Step 3 · Formatting',
    script:
      "Under Formatting, set Output to Web and Sort Column to Start Time. Web output is what lets you copy the whole roster cleanly.",
    steps: ['Output \u2192 Web', 'Sort Column \u2192 Start Time'],
  },
  {
    title: 'Turn On Jobs + Skill Level',
    eyebrow: 'Step 4 · Report Details',
    script:
      "In Roster Report Details, make sure First Name, Last Name, Preferred Name, In Times, Out Times, Jobs, and Skill Level Names are all checked. Jobs and Skill Level are what place each person on the right station by skill — don't skip those two.",
    steps: [
      'First Name · Last Name · Preferred Name',
      'In Times · Out Times',
      'Jobs \u2713  (required)',
      'Skill Level Names \u2713  (required)',
    ],
  },
  {
    title: 'Include Every Schedule',
    eyebrow: 'Step 5 · Shifts + Schedules',
    script:
      "Under Available Shifts, check Total Day. Then under Schedules, check all of them — Back of House, Front of House, Leadership, Training, and the rest — so nobody gets left off.",
    steps: ['Available Shifts \u2192 Total Day', 'Schedules \u2192 check ALL'],
  },
  {
    title: 'Generate & Copy',
    eyebrow: 'Step 6 · Pull the roster',
    script:
      "Click Generate Report. A new window opens with the full roster — names, jobs, skill levels, and times. Select all of it: press and hold, then Select All, then Copy. Grab everything from the first time block down to the last person.",
    steps: ['Generate Report', 'Press & hold \u2192 Select All', 'Copy'],
  },
  {
    title: 'Paste Into the Hub',
    eyebrow: 'Step 7 · Lineup · Daily Setup',
    script:
      "In the Hub, open Lineup \u00b7 Daily Setup. Make sure the Auto Assignment tab is selected, then tap Import. Pick the day, leave Target on Auto, and paste the roster into the box.",
    steps: ['Lineup \u00b7 Daily Setup \u2192 Auto Assignment', 'Tap Import', 'Pick day \u00b7 paste roster'],
  },
  {
    title: 'Preview & Apply',
    eyebrow: 'Step 8 · Finish',
    script:
      "Tap Preview to check that names, times, and stations parsed correctly. Then tap Apply — and the whole board fills in automatically. Use the Edit button for any small tweaks. That's it!",
    steps: ['Preview \u2192 check it looks right', 'Apply', 'Edit for small tweaks'],
  },
];

/* Gentle ambient background pad via Web Audio — no audio file needed. Starts
   only on a user gesture (the Play/Music tap), so it never autoplays. */
function useAmbientMusic() {
  const ctxRef = useRef(null);
  const nodesRef = useRef(null);

  const start = useCallback(() => {
    if (ctxRef.current) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const master = ctx.createGain();
      master.gain.value = 0.05; // very soft
      master.connect(ctx.destination);
      // A quiet triad that slowly breathes.
      const freqs = [146.83, 220.0, 293.66]; // D3 · A3 · D4
      const oscs = freqs.map((f) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.value = 0.33;
        o.connect(g);
        g.connect(master);
        o.start();
        return o;
      });
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.08;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.02;
      lfo.connect(lfoGain);
      lfoGain.connect(master.gain);
      lfo.start();
      ctxRef.current = ctx;
      nodesRef.current = { oscs, lfo, master };
    } catch (e) {
      /* audio not available — silently ignore */
    }
  }, []);

  const stop = useCallback(() => {
    const ctx = ctxRef.current;
    const nodes = nodesRef.current;
    if (!ctx) return;
    try {
      nodes.oscs.forEach((o) => o.stop());
      nodes.lfo.stop();
      ctx.close();
    } catch (e) {
      /* ignore */
    }
    ctxRef.current = null;
    nodesRef.current = null;
  }, []);

  useEffect(() => () => stop(), [stop]);
  return { start, stop };
}

export default function RosterImportTraining({ tier, onBack }) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [music, setMusic] = useState(false);
  const [showScript, setShowScript] = useState(false);
  const music_ = useAmbientMusic();
  const last = SLIDES.length - 1;
  const slide = SLIDES[i];

  // Tier gate — an explicit tier below the minimum is locked out; no tier prop
  // at all (internal preview) is treated as allowed.
  const locked = typeof tier === 'number' && tier < MIN_TIER;

  const go = useCallback((n) => setI((c) => Math.max(0, Math.min(last, n))), [last]);
  const next = useCallback(() => setI((c) => (c >= last ? c : c + 1)), [last]);
  const prev = useCallback(() => setI((c) => (c <= 0 ? c : c - 1)), []);

  // Auto-advance while playing; stop at the end.
  useEffect(() => {
    if (!playing) return undefined;
    if (i >= last) { setPlaying(false); return undefined; }
    const t = setTimeout(() => setI((c) => Math.min(last, c + 1)), AUTO_ADVANCE_MS);
    return () => clearTimeout(t);
  }, [playing, i, last]);

  const togglePlay = () => {
    const willPlay = !playing;
    setPlaying(willPlay);
    if (willPlay && i >= last) setI(0); // restart from the top if finished
  };

  const toggleMusic = () => {
    const on = !music;
    setMusic(on);
    if (on) music_.start();
    else music_.stop();
  };

  // Keyboard: ← → to navigate, space to play/pause.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next, prev, playing, i]);

  if (locked) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center text-white px-8 text-center"
        style={{ background: 'radial-gradient(120% 90% at 50% 15%, #1c3157 0%, #12213f 45%, #0c1730 100%)' }}
      >
        <div
          className="grid place-items-center h-16 w-16 rounded-2xl mb-5"
          style={{ background: 'rgba(255,255,255,0.08)' }}
        >
          <Lock size={24} className="text-slate-300" />
        </div>
        <div className="text-[20px] font-extrabold mb-2">Leader training</div>
        <p className="text-[15px] text-slate-300 max-w-sm leading-relaxed">
          This module covers importing the daily roster. It's available to Team Leaders and Directors.
        </p>
        {onBack && (
          <button
            onClick={onBack}
            className="mt-6 rounded-xl px-4 py-2.5 text-[14px] font-semibold"
            style={{ background: 'rgba(255,255,255,0.1)' }}
          >
            Back to Tools
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col text-white"
      style={{ background: 'radial-gradient(120% 90% at 50% 15%, #1c3157 0%, #12213f 45%, #0c1730 100%)' }}
    >
      {/* Top bar */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[14px] font-semibold"
          style={{ background: 'rgba(255,255,255,0.08)' }}
        >
          <ArrowLeft size={16} />
          Tools
        </button>
        <div className="flex items-center gap-2 text-[15px] font-bold">
          <span className="grid place-items-center h-6 w-6 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }}>
            <Play size={12} className="ml-0.5" />
          </span>
          Roster Import Training
        </div>
      </div>

      {/* Slide body */}
      <div className="flex-1 flex flex-col px-6 pt-2 pb-4 max-w-xl mx-auto w-full">
        <h1 className="text-[34px] leading-[1.05] font-extrabold tracking-tight mb-8">
          {slide.title}
        </h1>

        <div className="flex flex-col items-center text-center mb-6">
          <div
            className="grid place-items-center h-24 w-24 rounded-[22px] mb-6 shadow-lg"
            style={{ background: ACCENT, boxShadow: `0 0 60px -8px ${ACCENT}` }}
          >
            <span className="text-[30px] font-extrabold tracking-tight">GC</span>
          </div>
          <div className="text-[24px] font-extrabold leading-tight mb-2 px-4">{slide.title}</div>
          <div className="text-[12px] font-bold uppercase tracking-[0.18em] text-slate-400">
            {slide.eyebrow}
          </div>
        </div>

        {/* Narration / script box */}
        <div
          className="rounded-2xl border p-5 mb-3"
          style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.03)' }}
        >
          <p className="text-[17px] leading-relaxed text-slate-100">{slide.script}</p>

          {slide.steps && (
            <ul className="mt-4 space-y-2">
              {slide.steps.map((s, idx) => (
                <li key={idx} className="flex items-start gap-2.5 text-[15px] text-slate-200">
                  <span
                    className="mt-1 h-1.5 w-1.5 rounded-full shrink-0"
                    style={{ background: CTA }}
                  />
                  {s}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Progress dots */}
      <div className="px-6 max-w-xl mx-auto w-full">
        <div className="flex gap-1.5 mb-3">
          {SLIDES.map((_, idx) => (
            <button
              key={idx}
              onClick={() => go(idx)}
              className="h-1.5 flex-1 rounded-full transition-colors"
              style={{ background: idx <= i ? '#93a4c8' : 'rgba(255,255,255,0.12)' }}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>
      </div>

      {/* Control bar */}
      <div className="px-4 pb-6 max-w-xl mx-auto w-full">
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={prev}
            disabled={i === 0}
            className="grid place-items-center h-11 w-11 rounded-xl disabled:opacity-30"
            style={{ background: 'rgba(255,255,255,0.06)' }}
            aria-label="Previous"
          >
            <ChevronLeft size={20} />
          </button>

          <button
            onClick={togglePlay}
            className="flex items-center justify-center gap-2 h-11 flex-1 rounded-xl font-bold text-[15px]"
            style={{ background: playing ? CTA : 'rgba(255,255,255,0.06)' }}
          >
            {playing ? <Pause size={18} /> : <Play size={18} />}
            {playing ? 'Pause' : i >= last ? 'Replay' : 'Play'}
          </button>

          <button
            onClick={next}
            disabled={i === last}
            className="grid place-items-center h-11 w-11 rounded-xl disabled:opacity-30"
            style={{ background: 'rgba(255,255,255,0.06)' }}
            aria-label="Next"
          >
            <ChevronRight size={20} />
          </button>

          <div className="px-2 text-[14px] font-bold text-slate-300 tabular-nums whitespace-nowrap">
            {i + 1} / {SLIDES.length}
          </div>

          <button
            onClick={toggleMusic}
            className="flex items-center gap-1.5 h-11 rounded-xl px-3 text-[14px] font-bold"
            style={{ background: music ? 'rgba(79,110,247,0.2)' : 'rgba(255,255,255,0.06)', color: music ? '#c3cffb' : '#cbd5e1' }}
          >
            <Music size={16} />
            {music ? 'On' : 'Off'}
          </button>
        </div>

        <button
          onClick={() => setShowScript((s) => !s)}
          className="flex items-center gap-2 h-11 rounded-xl px-3.5 text-[14px] font-bold"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        >
          <FileText size={16} />
          {showScript ? 'Hide Script' : 'Script'}
        </button>

        {showScript && (
          <div
            className="mt-3 rounded-2xl border p-4 text-[14px] leading-relaxed text-slate-200 max-h-56 overflow-y-auto"
            style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.2)' }}
          >
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              Full script — {slide.title}
            </div>
            {slide.script}
            {slide.steps && (
              <div className="mt-2 text-slate-300">
                {slide.steps.map((s, idx) => (
                  <div key={idx}>• {s}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================================
   WIRING INTO App.jsx
   ----------------------------------------------------------------------------
   Same pattern as DocumentingTeamMembers.jsx. In App.jsx:

     import RosterImportTraining from './RosterImportTraining.jsx';

   Then add a tile in the People & Team section, right after the
   "Leader Training: Documenting" tile so they sit together:

     Title:    Roster Import Training
     Subtitle: Learn how to import the daily roster
     Icon:     the same play-circle used by the Documenting tile

   And render it the same way that tile is rendered:

     <RosterImportTraining tier={tier} />

   The component handles its own tier gating (Leader = 2 and up), so there's
   nothing else to configure. Pass `onBack` if your tile shell expects it.
   ============================================================================ */
