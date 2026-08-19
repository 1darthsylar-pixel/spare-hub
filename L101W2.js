/**
 * L101W2.js — Leadership 101, Week 2: Conflict & Coaching.
 *
 * ★★ BUILT FROM THE *STUDENT* WORKBOOK ONLY, AND THAT IS A DESIGN CONSTRAINT,
 * NOT AN ACCIDENT. The Drive folder holds two PDFs whose names differ by one
 * word — "W2 - Conflict & Coaching.pdf" (student) and "W2 - Master - L101
 * Workbook.pdf" (master, with every blank filled in). Nothing here was read
 * from the master, and no answer key is stored in this file.
 *
 * ⇒ WHY THAT SHAPES THE CONTENT: every fill-in-the-blank on the printed page is
 * a `qa` (written answer), never a `quiz` (graded against a key). A quiz would
 * need the master's answers to live in the content store — and the content store
 * is what the student's browser downloads. The answers would ship to the people
 * being tested. `qa` items are read by Bri afterwards, so the answers never have
 * to exist in the app at all.
 *
 * ⚠️ IF SOMEONE LATER WANTS THESE GRADED, that is a different build: the key has
 * to live server-side and be checked there. Do not "just add answers" to a quiz
 * item here.
 *
 * ⚠️ CLASS ID "w2" AND EVERY ITEM ID ARE PERMANENT — progress is keyed by them.
 * Renaming an id orphans every answer already recorded against it.
 *
 * ⏳ DRAFT FOR BRI. The structure, the ordering and the prompts are Claude's
 * reading of her workbook; the words are hers to change in the editor. Section
 * order follows the printed pages so she can teach from either.
 *
 * ⚠️⚠️ THE STORE'S NAME IS NOT WRITTEN INTO THIS FILE, AND IT MUST NOT BE PUT
 * BACK. Two prompts here used to name this store. This is a SEED: a clone of
 * this repo ships it verbatim, so those sentences arrived at another
 * restaurant telling their team it was ours, in a class their leaders sit in.
 * ⇒ FIXED BY REWORDING, NOT BY READING THE CONFIG, and that is deliberate.
 * These are module-level `const` strings built once at import, BEFORE
 * `applyStoreOverrides` merges a store's saved settings, so `${STORE.name}`
 * here would freeze whatever was deployed and look dynamic while never being
 * it. That is the same trap L101Week.jsx's header warns about for
 * `courseOwnerLabel`. "here" and "our restaurant" are true at every store and
 * need no lookup at all.
 * ⚠️ AND THE STORE CAN STILL PUT ITS NAME IN. This file is only the starting
 * point — the moment anyone saves an edit the class renders from
 * `ld:l101:content:w2` instead, so a store that wants its name in the wording
 * types it once in the editor. Nothing here has to change for that.
 * ⚠️ W2 AND W3 ARE ONE EXERCISE. The food safety prompt is set here and quoted
 * back in L101W3.js. Change the wording in one and it must change in both, or
 * week 3 asks the student to paste an answer to a question they were never
 * asked.
 */

export const L101_W2 = {
  id: "w2",
  n: 2,
  title: "Conflict & Coaching",
  sections: [
    {
      id: "w2s1",
      title: "Before we start",
      items: [
        { id: "w2-read-intro", type: "read", title: "What this week covers",
          note: "A heavy focus on conflict — the kinds that show up in a restaurant, and your role as a leader when they do. Then coaching, and why building other leaders is part of the job rather than an extra." },
        { id: "w2-qa-what-is", type: "qa", title: "What is conflict?",
          prompt: "Before we define it — write what the word means to you. There's no wrong answer here and it's worth being honest; we'll compare it to the definition next." },
        { id: "w2-read-define", type: "read", title: "Conflict, defined",
          note: "Noun: a serious disagreement or argument, typically a protracted one. Verb: to be incompatible or at variance; to clash.\n\n\"The ability to recognize, engage in, and manage conflict is an important skill for everyone, but especially for those who aspire to succeed in organizations.\"\n\nLike much of leadership, conflict isn't static. It's dynamic and it has dimensions — and understanding them is what gives you the perspective to manage it." },
        { id: "w2-qa-fill-nature", type: "qa", title: "Fill in the blanks — the nature of conflict",
          prompt: "From the workbook page:\n\n\"Conflict is ______ and ______, but offers the potential for ______ and ______.\"\n\n\"______ conflict is not always possible, but ______ conflict is.\"\n\nWrite the words as we fill them in together." },
      ],
    },
    {
      id: "w2s2",
      title: "Two scenarios",
      items: [
        { id: "w2-qa-scenario-1", type: "qa", title: "Scenario 1 — you are in the conflict",
          prompt: "You and another leader disagree on how to move forward with a new process. It escalates and the relationship is damaged. You then hear from others that they're speaking negatively about your leadership.\n\nHow would you address this?" },
        { id: "w2-qa-scenario-2", type: "qa", title: "Scenario 2 — the conflict is brought to you",
          prompt: "Two leaders, neither of them you, each confide in you about a conflict they're having with the other.\n\nDescribe how you'd handle a conflict brought to you from the outside." },
      ],
    },
    {
      id: "w2s3",
      title: "How conflict works",
      items: [
        { id: "w2-qa-guidelines", type: "qa", title: "What are the guidelines for addressing conflict at work?",
          prompt: "Discuss first, then write what we land on." },
        { id: "w2-read-ideally", type: "read", title: "Conflict should ideally be addressed…",
          note: "Face-to-face. After thinking through the scenarios. After the first wave of emotion has settled. After all sides have been heard.\n\nThings to weigh before you start: the dimensions of the conflict · timing · setting · confidentiality · the relationship · personality types." },
        { id: "w2-qa-dimensions", type: "qa", title: "The five dimensions — your notes",
          prompt: "History · Source · Perceptions · Emotions · Behaviour.\n\nWrite what each one means in your own words. Recognising the pull each has is what lets you control your own attitude in a hard moment." },
        { id: "w2-read-types", type: "read", title: "Types of conflict",
          note: "Guest related — team member + guest · leader + guest · guest + guest.\n\nTeam related — team member + team member · team member + leader · leader + leader.\n\nAnd cutting across both: external versus internal." },
        { id: "w2-qa-ext-int", type: "qa", title: "External versus internal — what's your understanding?",
          prompt: "In your own words, before we go through it." },
      ],
    },
    {
      id: "w2s4",
      title: "Yourself, and other people",
      items: [
        { id: "w2-qa-self-aware", type: "qa", title: "Fill in the blanks — self-awareness",
          prompt: "\"Self-awareness is the conscious knowledge of one's own ______, ______, ______, and ______.\"" },
        /* ⛔ THE ENNEAGRAM CAME OUT OF THIS WEEK ON Aug 19 2026. The reading
           "Relationships and personality" lived here and named the Enneagram as
           the assessment used in this class. The Leadership Development
           Director at the origin store, who wrote this week, took the topic out
           of it: "We took all Enneagram stuff out of the class. This is no
           longer something required for applications or the class."

           ⚠️ THIS FILE IS A SEED, NOT THE CLASS. L101Week.jsx: "renders until
           somebody saves an edit; after that the stored version wins. One-way
           door per class." So this changes what a class NOBODY HAS EDITED
           starts from, and nothing else. A store that has saved its own Week 2
           keeps exactly what it saved.

           ⚠️ ONE THING WENT WITH IT THAT WAS NOT ABOUT THE ENNEAGRAM. The first
           half of that reading was ordinary workbook content — that putting a
           relationship in perspective helps when you are managing conflict, and
           that some personalities simply do not mesh. It was pulled with the
           rest because it lived in the same item. Restoring that sentence
           without naming any assessment is a one-line job. */
        { id: "w2-read-approaches", type: "read", title: "Five approaches to conflict management",
          note: "Avoiding · Competing · Accommodating · Compromising · Collaborating." },
        { id: "w2-qa-approaches", type: "qa", title: "Your notes on the five approaches",
          prompt: "What each one is, and when you'd reach for it." },
      ],
    },
    {
      id: "w2s5",
      title: "Mediating, and coaching",
      items: [
        { id: "w2-read-mediate", type: "read", title: "Mediating conflict",
          note: "To mediate: to intervene between people in a dispute in order to bring about agreement or reconciliation.\n\nMediating within the team is a leadership responsibility — and a learning opportunity for everyone involved, including you." },
        { id: "w2-qa-mediation", type: "qa", title: "Fill in the blanks — guidelines to mediation",
          prompt: "\"Treat everyone with ______.\"\n\"______, do not ______.\"\n\"Encourage ______ or ______.\"\n\"Encourage future ______.\"\n\nThe rest of the guidelines, for your notes: listen then think · don't pass judgement or show favouritism · investigate · stay focused · be clear and honest · get to the root · work to resolve it · accept that not all conflict can be resolved." },
        { id: "w2-read-coaching", type: "read", title: "Coaching",
          note: "Coaching is the process of assisting and guiding others to improve performance and reach goals. Leaders combine what they know and what they can do to build new leaders.\n\nIf we don't start moulding someone to take our position, we can't be ready to leave for what's next. Developing someone to surpass you should be the ultimate goal of leadership." },
        { id: "w2-qa-threat", type: "qa", title: "Fill in the blank, and say why",
          prompt: "\"What some see as a ______, leaders should see as an ______.\"\n\nThen: how do we build strong leaders? Leading by example and starting early are two answers — what would you add?" },
        { id: "w2-qa-sbi", type: "qa", title: "SBI, applied to coaching",
          prompt: "You met SBI in Week 1 as a way of giving clear, direct feedback.\n\nHow does it translate to coaching? Share a time you were coached — or coached someone — using it." },
      ],
    },
    {
      id: "w2s6",
      title: "On the floor this week",
      items: [
        { id: "w2-read-skills", type: "read", title: "Guest recovery skills to work through",
          note: "For each of these, note what it is, where it lives and when you'd use it: the HEARD model · phone etiquette · inputting replacements · refunds · printing receipts from previous transactions · CEM scores." },
        { id: "w2-read-application", type: "read", title: "Application points",
          note: "FOH — a heavy focus on guest relations with AD guidance: phone responsibilities, flexing when you're able, embracing confrontation, and coaching the team on HEARD, 2MS, LOH, CORE 4 and guest awareness.\n\nBOH — a heavy focus on coaching the team with the guest in mind: speed, accuracy, food safety, guest awareness.\n\nAll Trainers may now begin documenting on team members as needed — positive cases as well as negative.\n\nCross-training is scheduled W1–W4 if you haven't completed that requirement yet." },
        { id: "w2-upload-w3", type: "upload", title: "Week 3 assignment — bring this to class",
          prompt: "Write down your top food safety concern in our restaurant. Explain why it concerns you, and build a realistic plan of action to address it. Use the SMART method from Week 1, and be ready to share it.",
          requirement: "PDF, Word document or a photo of your written page",
          accept: ".pdf,.doc,.docx,image/*" },
      ],
    },
  ],
};

export default L101_W2;
