import React from "react";
import Leadership101, { L101_PROGRAM, registerProgram } from "./Leadership101.jsx";
import L101Week from "./L101Week.jsx";

/**
 * Trainer Orientation — the program someone takes after Leadership 101.
 *
 * Bri, Jul 26: "a separate space that someone would take after Leadership 101
 * is completed in full… a tab in my Leadership Development Tile that is
 * accessed by the same permissions where I can edit, set PIns, show student
 * progress, also with a 'back door' entrance by Pin number on the Growth &
 * Development section. Essentially a copy of the Leadership 101 class, but
 * content and pin entrance is different."
 *
 * ★★ IT IS NOT A COPY. This whole file is a config object and thirty lines of
 * wiring. The program page, the PIN gate, prep work, due dates, Class Progress
 * and the admin controls are all `Leadership101.jsx` running under a different
 * namespace — so a fix to any of that lands here for free, and a third program
 * (Leadership 201) is another file this size.
 *
 * ★ WHAT IS ITS OWN, AND WHAT IT SHARES.
 * Its own: PIN, open/closed switch, prep work, materials — everything under
 *   `ld:orientation:*`.
 * Shared with L101: a student's PROGRESS RECORD, saved class content, and due
 *   dates. Those are keyed by person and by class id, and the class ids here
 *   are `to-*`, so nothing collides. ⚠️ This is deliberate — one record per
 *   person means Bri sees somebody's Orientation work beside their L101 work
 *   rather than in a second place she has to remember to check.
 *
 * ⚠️ SINGLE COHORT, SO ONE PIN. `splitPins: false`. L101's two PINs exist
 * because Week 1 gates the Trainer application and has a different audience
 * from Weeks 2-4. Everyone here has already been through that.
 *
 * ⏳ THE CONTENT IS A SCAFFOLD AND BRI HAS NOT ANSWERED THE FOUR QUESTIONS YET
 * (who gets in · class-or-handbook · her PowerPoints read-or-rebuilt · how
 * big). Every title below is written to be replaced. She can open it, click
 * around and start arranging today; the answers change what goes inside, not
 * whether it works.
 */

/* ⚠️ CLASS IDS ARE PERMANENT — progress is keyed by them. `to-` prefixed so
   they can never collide with w1/w4/wel ids in the shared progress record. */
const TO_WELCOME = {
  id: "to-1",
  n: 1,
  title: "Welcome to the Trainer Role",
  sections: [
    {
      id: "to1-start",
      title: "Start here",
      items: [
        { id: "to-read-welcome", type: "read", title: "Congratulations — and what this is",
          note: "Replace with your own words. Worth covering: that they earned the role, what changes tomorrow, and what this orientation will walk them through." },
        { id: "to-read-expect", type: "read", title: "What a Trainer is responsible for",
          note: "The day-to-day, not the title. This is the part new trainers most often guess at." },
      ],
    },
    {
      id: "to1-people",
      title: "Training people",
      items: [
        { id: "to-read-how", type: "read", title: "How we train here",
          note: "Your approach — the standard you want held, and how you want it taught." },
        { id: "to-qa-first", type: "qa", title: "Who trained you, and what did they do well?",
          prompt: "Think about the person who trained you. What did they do that you want to carry into how you train others?" },
      ],
    },
  ],
};

const TO_TOOLS = {
  id: "to-2",
  n: 2,
  title: "Tools, Standards & Where to Find Things",
  sections: [
    {
      id: "to2-tools",
      title: "What you'll use",
      items: [
        { id: "to-read-tools", type: "read", title: "Pathway, the Hub, and the checklists",
          note: "Where each one lives and what it's for." },
        { id: "to-upload-final", type: "upload", title: "Orientation sign-off",
          prompt: "Upload anything you've been asked to complete as part of orientation.",
          requirement: "PDF or Word document",
          accept: ".pdf,.doc,.docx" },
      ],
    },
  ],
};

/* ⚠️ `sequential={false}`. Bri delivers this live and her order varies —
   "sometimes tasks first, info last." A lock would make the tool argue with her
   in front of a new trainer. Submit-to-complete still applies, so completion is
   still recorded; it simply isn't gated. */
function TOWelcome() {
  return <L101Week weekId="to-1" weekLabel="Welcome to the Trainer Role" seed={TO_WELCOME} sequential={false} />;
}
function TOTools() {
  return <L101Week weekId="to-2" weekLabel="Tools, Standards & Where to Find Things" seed={TO_TOOLS} sequential={false} />;
}

export const TRAINER_ORIENTATION = {
  ns: "ld:orientation",
  name: "Trainer Orientation",
  tagline: "Complete upon promotion",   // Bri, Aug 1 2026 — her exact wording
  splitPins: false,
  /* Bri's rule: promotion IS the enrolment. The moment Hannah sets someone to a
     trainer title in HR Console, Orientation opens for them — no PIN to send,
     no list to keep.
     ⚠️ ALL THREE TITLES. Hannah retired plain "Trainer" (only Junior and Senior
     remain), but it stays listed so anyone still holding the old title is not
     locked out of the class that explains their own job. */
  autoRoles: ["trainer", "junior trainer", "senior trainer"],
  weeks: [
    { n: 1, key: "to-1", label: "ONE", title: "Welcome to the Trainer Role",
      modules: [{ id: "tom1", title: "Welcome to the Trainer Role", type: "hub", hub: "to-1", note: "Runs in the Hub" }] },
    { n: 2, key: "to-2", label: "TWO", title: "Tools, Standards & Where to Find Things",
      modules: [{ id: "tom2", title: "Tools, Standards & Where to Find Things", type: "hub", hub: "to-2", note: "Runs in the Hub" }] },
  ],
  /* Starts empty on purpose. Bri adds prep sections the same way she does in
     L101, and they anchor between these two the same way. */
  prepSeed: [],
  hubModules: {
    "to-1": { title: "Welcome to the Trainer Role", Component: TOWelcome },
    "to-2": { title: "Tools, Standards & Where to Find Things", Component: TOTools },
  },
  seeds: { "to-1": TO_WELCOME, "to-2": TO_TOOLS },
};

/* ★ ANNOUNCE THIS PROGRAM TO THE SHELL (Jul 27).
   Progress is one shared record per person, so Leadership 101 looking at that
   record cannot tell "belongs to a class I don't run" from "belongs to no class
   at all" — it called both orphans. That is why Orientation was displaying the
   whole of Leadership 101 under "Recorded, but no longer part of any class",
   and why L101 would have started listing Orientation answers as strays.
   Registering here means every program knows the others' class ids.
   ⚠️ THE CALL BELONGS IN THIS FILE, NOT IN Leadership101.jsx. That file must
   never import this one — it would close an import cycle and break the build,
   the same trap ProfessionalGrowth documents around loadHRTeam. */
registerProgram(TRAINER_ORIENTATION);

export default function TrainerOrientation(props) {
  return <Leadership101 {...props} program={TRAINER_ORIENTATION} />;
}

export { L101_PROGRAM };
