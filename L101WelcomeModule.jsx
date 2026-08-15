import React from "react";
import L101Week from "./L101Week.jsx";

/**
 * Welcome to Leadership 101 — the bridge class between Week 1 and Week 2.
 *
 * Bri, Jul 26 2026: "W1 is taken by all applicants as part of the Trainer
 * application, but if they are selected to move into the class, they will need
 * an introduction to the flow, expectations, and general info regarding the
 * role they are pursuing as a Trainer before moving into W2-4."
 *
 * ★ THIS FILE IS A WRAPPER, NOT A CLASS. Everything below the seed is
 * L101Week.jsx — the shared renderer. That is the whole point: the next class
 * (Trainer Orientation) is another file this short, not another 700 lines.
 *
 * ★ THE SEED IS A SCAFFOLD, DELIBERATELY THIN.
 * Bri authors this class herself in the editor — she asked for "a basic
 * framework started based on the current things I have in place… for me to
 * begin playing around with". So this is the SHAPE of the class with her own
 * words still to come, not content invented on her behalf. Every title and
 * prompt here is meant to be rewritten; the first time she saves, this seed
 * stops rendering entirely and her version takes over (one-way door — see
 * L101Editor.jsx).
 *
 * ⚠️ NO QUIZ AND NO MATCHING ACTIVITY in this seed, on purpose. Those two types
 * carry answer keys and are the only things the editor cannot rewrite, so
 * seeding one would hand her a graded item she can't change. Every item type
 * used below is fully editable by her.
 *
 * ⚠️ ITEM IDS ARE PERMANENT. Student progress is keyed by them, so renaming an
 * item in the editor is safe but changing an id here after anyone has started
 * would orphan their record. Prefixed `wel-` so they can never collide with
 * w1-* or w4-*.
 */
/* ★ EXPORTED for Class Progress. Bri's roster has to say which activities
   belong to which class, and a student's progress record is one flat map of
   item ids that says nothing about class membership. Reading the ids off the
   content is the only honest answer — the tempting shortcut, matching an "w1-"
   prefix, drops every item Bri adds through the editor (those get ids like
   `it-1785…`). ⚠️ Stored content wins over this seed when she has saved edits;
   this is the fallback for a class she has never touched. */
export const WELCOME_SEED = {
  id: "welcome",
  n: 1.5,
  title: "Welcome to Leadership 101",
  sections: [
    {
      id: "wel-start",
      title: "Welcome: Start Here",
      items: [
        {
          id: "wel-read-welcome",
          type: "read",
          title: "You've been selected — what happens next",
          note: "Replace this with your own welcome. Worth covering: that they were chosen rather than simply signed up, what the next three classes are, and roughly how long the whole thing takes.",
        },
        {
          id: "wel-watch-intro",
          type: "watch",
          title: "A word before you start",
          youtube: "",
          note: "Optional — add a YouTube video id in the editor, or delete this item if you'd rather open with the reading.",
        },
      ],
    },
    {
      id: "wel-flow",
      title: "How the class runs",
      items: [
        {
          id: "wel-read-flow",
          type: "read",
          title: "The flow of Weeks 2, 3 and 4",
          note: "What each week covers, which are in person and which run in the Hub, and how prep work fits between them.",
        },
        {
          id: "wel-read-expect",
          type: "read",
          title: "What's expected of you",
          note: "Attendance, prep work, turning things in on time — and what happens if something comes up. Say it plainly here so nobody is guessing later.",
        },
      ],
    },
    {
      id: "wel-role",
      title: "The role you're working toward",
      items: [
        {
          id: "wel-read-role",
          type: "read",
          title: "What a Trainer actually does",
          note: "The part applicants most often get wrong. Worth being concrete about the day-to-day rather than the title.",
        },
        {
          id: "wel-qa-why",
          type: "qa",
          title: "Why do you want to be a Trainer?",
          prompt: "In your own words — what made you apply, and what do you want to be better at by the end of this class?",
        },
      ],
    },
  ],
};

export default function L101WelcomeModule() {
  return (
    <L101Week
      weekId="welcome"
      weekLabel="Welcome to Leadership 101"
      seed={WELCOME_SEED}
    />
  );
}
