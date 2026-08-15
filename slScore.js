/* slScore.js — the Shift Leader Scorecard values the DASHBOARD needs at
   first paint: the season pin and the composite score bands. A leaf (imports
   nothing) so App.jsx can read them without pulling the 1,900-line tile into
   the first-paint bundle. The tile imports them back from here — one copy. */

export const SEASON_START = "2026-07-13"; // daily metrics begin here

// HR DISCIPLINARY POINTS, and "Watch"/"Needs work" read as write-ups. These are
// the same thresholds and the same math — only the words changed. Every band is
// a place on the climb, so no band reads as a punishment. To revert or retune,
// edit ONLY the strings below; nothing keys off them.
export const scoreBand = (s) => {
  if (s === null || s === undefined) return { word: "Not started", desc: "No shifts scored in this window yet." };
  if (s >= 4.5) return { word: "Summit", desc: "On goal across almost everything you led. This is the bar." };
  if (s >= 3.5) return { word: "Climbing", desc: "Mostly on goal — a metric or two to sharpen." };
  if (s >= 2.5) return { word: "Finding footing", desc: "Some metrics are landing, some aren't yet. This is where coaching helps most." };
  return { word: "Base camp", desc: "Early days on these numbers. Pick one metric to work on first." };
};

// Composite pill colour. ⚠️ The bottom band is a WARM AMBER (#C2410C), not the
// alarm red #DD0031 it used to be: a blood-red pill next to the word "Base
// camp" is a mixed signal, and red is what made leaders read this as a
// write-up. Still visibly the attention band, just not an error state. The
// per-metric RAG dots below are UNCHANGED — real red still shows on the metric
// that's actually off goal, which is the level where it's actionable.
export const scoreColor = (s) => {
  if (s === null) return "#9CA3AF";
  if (s >= 4.5) return "#0F766E";
  if (s >= 3.5) return "#3730A3";
  if (s >= 2.5) return "#C77D0A";
  return "#C2410C";
};
