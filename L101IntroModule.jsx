import React from "react";
import L101Week from "./L101Week.jsx";

/**
 * Week 1 of Leadership 101 — content only.
 *
 * ★ This file used to carry its own ~650-line copy of the class renderer. That
 * renderer now lives once, in L101Week.jsx, and this file is the seed content
 * plus three lines of wiring. The two copies had already drifted — W1's could
 * not grade a select-all quiz question and had no upload item type at all —
 * which is exactly what a second copy of anything eventually does.
 *
 * ⚠️ `weekId` IS PERMANENT. Saved content (`ld:l101:content:w1`), every
 * student's progress and the submission record all hang off it. Changing it
 * orphans live records.
 *
 * ⚠️ THE SEED IS NOT THE LIVE CONTENT once Bri has saved an edit — from her
 * first save this object stops rendering entirely and her stored version wins.
 * Editing it here after that point changes nothing on screen. See
 * L101Editor.jsx, and [[l101-content-store]] in memory.
 */
/* ★ EXPORTED for Class Progress. Bri's roster has to say which activities
   belong to which class, and a student's progress record is one flat map of
   item ids that says nothing about class membership. Reading the ids off the
   content is the only honest answer — the tempting shortcut, matching an "w1-"
   prefix, drops every item Bri adds through the editor (those get ids like
   `it-1785…`). ⚠️ Stored content wins over this seed when she has saved edits;
   this is the fallback for a class she has never touched. */
export const INTRO_TO_LEADERSHIP = {
  id: "w1",
  n: 1,
  title: "Intro to Leadership",
  sections: [
    {
      id: "welcome",
      title: "Welcome: Start Here",
      items: [
        { id: "w1-read-principles", type: "read", title: "Leadership Principles",
          note: "Read before you begin.",
          images: ["resource-leadership-principles-1", "resource-leadership-principles-2"] },
        { id: "w1-watch-overview", type: "watch", title: "Welcome / Course Overview",
          youtube: "t2cFeL3Tr-U" },
      ],
    },
    {
      id: "w1-main",
      title: "W1: Intro to Leadership",
      items: [
        { id: "w1-watch-intro", type: "watch", title: "Intro to Leadership", youtube: "l5Bg-cLVPEM" },
        { id: "w1-qa-qualities", type: "qa", title: "Q&A: Leadership Qualities",
          prompt: "What leadership qualities do you look for in a leader? What makes these qualities desirable to followers?" },
        { id: "w1-watch-qualities", type: "watch", title: "Leadership Qualities", youtube: "BR7WGOBpE_U" },

        { id: "w1-match", type: "match", title: "Activity: Leadership Principles Matching Game",
          instructions: "Match each definition to the correct principle or quality.",
          // Each pair: the definition (left) and its correct principle (right).
          // Answer key from Bri's separate key PDF (num→letter, mapped to labels).
          pairs: [
            { def: "Dependable; giving the same result on successive trials.", answer: "Reliable" },
            { def: "Worthy of confidence", answer: "Trustworthy" },
            { def: "Tending to communicate", answer: "Communicative" },
            { def: "Fairness and straightforwardness of conduct", answer: "Honesty" },
            { def: "Unswerving in allegiance; faithful in allegiance", answer: "Loyalty" },
            { def: "Acting in anticipation of future problems, needs, or changes", answer: "Proactive" },
            { def: "Devoted to a cause, ideal, or purpose", answer: "Dedication" },
            { def: "To advocate for a cause", answer: "Supportive" },
            { def: "Prompt to act or respond by choice, without reluctance", answer: "Willing" },
            { def: "A mental attitude or inclination of progressive development", answer: "Growth mindset" },
            { def: "Marked by kindness or courtesy", answer: "Gracious" },
            { def: "Moral, legal, or mental accountability; able to answer for one's conduct and obligations", answer: "Responsibility" },
            { def: "Freedom from pride or arrogance", answer: "Humility" },
            { def: "Ability to adjust to environmental conditions or changing circumstances", answer: "Adaptive" },
            { def: "Firm adherence to a code of especially moral or artistic values", answer: "Integrity" },
            { def: "The state, relation, or fact of being an owner", answer: "Ownership" },
            { def: "Exhibiting a courteous, conscientious, and generally businesslike manner in the workplace", answer: "Professionalism" },
            { def: "Concentrating attention or effort on group work or activities", answer: "Team-focused" },
            { def: "Easy to meet or deal with", answer: "Approachable" },
            { def: "A mental attitude or inclination of the entire perspective on a situation or issue", answer: "'Big Picture' mindset" },
            { def: "The ability to understand and share the feelings of another.", answer: "Empathy" },
            { def: "Characterized by a ready capability to adapt to new, different, or changing requirements; fluid", answer: "Flexibility" },
          ],
          keyPoints: [
            "Honesty — leaders are being fair when we give hard feedback.",
            "Loyalty — being loyal is showing a united front on decisions.",
            "Growth mindset — pour into ourselves before we can pour into others.",
            "Gracious — seeing the gray area.",
            "Humility — creates relatability.",
            "Adaptability — changing yourself (personalities).",
            "Integrity — right vs. wrong; make hard decisions.",
            "Empathy — key in relationship building.",
            "Flexibility — meeting halfway.",
          ],
        },

        { id: "w1-watch-principles", type: "watch", title: "Leadership Principles", youtube: "TaKnHfFDl5E" },
        { id: "w1-watch-whatis", type: "watch", title: "What is a leader?", youtube: "nmltXU07n_c" },

        { id: "w1-quiz-1", type: "quiz", title: "Quiz 1", timeLabel: "3 min · 5 questions",
          questions: [
            { q: "Complete this definition of leadership: \"It is a ______ of directing people's efforts, motivating them, controlling their actions, and modifying behaviors to benefit the needs of the organization.\"",
              choices: ["movement", "process", "plan", "goal"], answer: 1 },
            { q: "Which of the following BEST describes a leader based on what we have discussed?",
              choices: ["A person who relies on control.", "A person who achieves by any means necessary.", "A person who has commanding authority or influence.", "A person who pushes others to complete tasks."], answer: 2 },
            { q: "Which of the following is NOT a responsibility of all leaders?",
              choices: ["Cash Management", "Innovating", "Maintaining Relationships", "Mediating Conflict"], answer: 0 },
            { q: "A leader must mediate conflict, but is not responsible for teaching others to mediate conflict.",
              choices: ["True", "False"], answer: 0 },
            { q: "Celebrating successes helps reinforce teamwork and encourage continued growth.",
              choices: ["True", "False"], answer: 0 },
          ],
        },

        { id: "w1-watch-motivating", type: "watch", title: "Motivation", youtube: "PfzLk8XCl9Q" },
        { id: "w1-qa-motivation", type: "qa", title: "Q&A: Motivation",
          prompt: "What motivates you? How do we motivate others?" },
        { id: "w1-watch-purpose", type: "watch", title: "Purpose & Mission", youtube: "otoqmWIvsSs" },
        { id: "w1-qa-mission", type: "qa", title: "Q&A: Mission",
          prompt: "What is your professional mission statement? Develop a mission statement that demonstrates what you value." },
        { id: "w1-watch-blindspots", type: "watch", title: "Blind Spots & Feedback", youtube: "HDZxWOFDslA" },

        { id: "w1-quiz-2", type: "quiz", title: "Quiz 2", timeLabel: "3 min · 5 questions",
          questions: [
            { q: "Our motivations help us determine what drives us to be successful.",
              choices: ["True", "False"], answer: 0 },
            { q: "In leadership, blind spots are areas where things are viewed __________.",
              choices: ["poorly", "realistically", "fairly", "unrealistically"], answer: 3 },
            { q: "Which of the following is true of blind spots in leadership?",
              choices: ["Blind spots are never fixable.", "Blind spots in leadership refers to physically being unable to see parts of the building.", "Identifying blind spots is necessary to growth as a leader.", "It is not necessary to ask others to help identify blind spots."], answer: 2 },
            { q: "Asking for feedback is only half of the process. The other half is...",
              choices: ["finding a different method of receiving feedback.", "developing a plan of action to change behaviors.", "asking individuals why they gave you negative feedback in certain areas.", "thinking through every reason why you received any negative feedback."], answer: 1 },
            { q: "Asking for feedback from your team can help you appear more approachable as a leader.",
              choices: ["True", "False"], answer: 0 },
          ],
        },

        { id: "w1-watch-goals", type: "watch", title: "Goal Setting & Accountability", youtube: "cG8sFLz19vE" },
        { id: "w1-qa-goals", type: "qa", title: "Q&A: Share Your Goals",
          prompt: "What is one of your professional goals?" },

        { id: "w1-quiz-3", type: "quiz", title: "Quiz 3", timeLabel: "3 min · 5 questions",
          // Wording from Bri's quiz PDF (SMART goals + accountability). Key 1b 2b 3d 4b 5a;
          // Q3=d confirmed by Bri via Slack Jul 21.
          questions: [
            { q: "What does the 'A' in SMART represent?",
              choices: ["Accountable", "Attainable", "Approachable", "Absolute"], answer: 1 },
            { q: "The 'R' in SMART stands for 'Responsible.'",
              choices: ["True", "False"], answer: 1 },
            /* ⚠️ "here", NOT this store's name. This is a SEED that a clone
               ships verbatim, so the name asked another restaurant's leaders a
               graded question about ours. Reworded rather than read from the
               config: these are module-level strings built at import, before a
               store's saved settings merge, so a config read here would freeze
               and only look dynamic. A store that wants its name in the wording
               types it in the editor, which overrides this seed. */
            { q: "What is the process for holding others accountable here?",
              choices: ["Observing, Confronting, Documenting", "Documenting, then telling the team member about the documentation", "I am only responsible for holding myself accountable, not others.", "Confronting, Discussing, Addressing Consequences"], answer: 3 },
            { q: "Holding our team accountable for issues like uniform appearance, performance, or behavior will only lower morale and make us weaker as a team.",
              choices: ["True", "False"], answer: 1 },
            { q: "Which of the following is TRUE?",
              choices: ["Leaders are the eyes and ears of the business.", "Documentation should be used in only extreme situations.", "Leaders are not responsible for addressing issues with team members.", "It is okay to avoid addressing an issue if someone is a friend."], answer: 0 },
          ],
        },

        { id: "w1-watch-wrapup", type: "watch", title: "Wrap-up", youtube: "bWtpx5GnCDQ" },
      ],
    },
    {
      id: "w2-assign",
      title: "W2 Assignment",
      items: [
        { id: "w1-assign", type: "assign", title: "W2 Assignment",
          // Bri, Jul 25: "Can we remove Part B from the Week 2 assignment at the
          // end? This is no longer needed. Only Part A (but we can remove the
          // Part A title since there is a single item now.)"
          parts: [
            { label: "",
              body: "Imagine two different scenarios of conflict and discuss how you would address EACH if you were faced with either case.",
              scenarios: [
                "Scenario 1: Another leader and yourself disagree on how to move forward with a new process in operations. The disagreement escalates and the relationship becomes damaged. You hear from others that your fellow leader is talking negatively about your leadership. How would you address the conflict in this situation?",
                "Scenario 2: Two leaders (neither are you personally) both confide in you a conflict they are dealing with. Describe how you would handle the conflict brought to you from the outside.",
              ] },
          ],
          submit: "text", // free-response submission
        },
      ],
    },
  ],
};



// ============================================================
// L101_IntroModule_Prototype.jsx — Gate City Hub · Leadership 101
// VISUAL PROTOTYPE (Bri chose "look first"). Real content, real
// layout + flow. Mechanics are LIGHT on purpose: quizzes score
// in-page so you can feel the interaction, but progress-saving,
// the answer-persistence, and the authorable editor come in the
// next pass once Bri likes the feel.
//
// Renders the Week 1 "Intro to Leadership" lesson from
// l101_intro_content.js. This same shell will host all 4 weeks.
// ============================================================

export default function L101IntroModule() {
  return <L101Week weekId="w1" weekLabel="Week 1" seed={INTRO_TO_LEADERSHIP} />;
}
