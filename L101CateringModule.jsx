import React from "react";
import L101Week from "./L101Week.jsx";

/**
 * Week 4 of Leadership 101 — content only.
 *
 * ★ This file used to carry its own ~650-line copy of the class renderer. That
 * renderer now lives once, in L101Week.jsx, and this file is the seed content
 * plus three lines of wiring. The two copies had already drifted — W1's could
 * not grade a select-all quiz question and had no upload item type at all —
 * which is exactly what a second copy of anything eventually does.
 *
 * ⚠️ `weekId` IS PERMANENT. Saved content (`ld:l101:content:w4`), every
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
export const CATERING_W4 = {
  id: "w4",
  n: 4,
  title: "Catering",
  sections: [
    {
      id: "w4-main",
      title: "W4: Catering",
      items: [
        { id: "w4-watch-overview", type: "watch", title: "Catering Overview", youtube: "_p57-aH2K1Q" },

        { id: "w4-qa-pathway", type: "qa", title: "Q&A: Catering Pathway",
          prompt: "What is something that you noticed from the Catering Pathway plan? This can be something new that you learned, something that surprised you, or anything else that you found interesting from the lessons." },

        { id: "w4-qa-importance", type: "qa", title: "Q&A: Importance of Catering",
          prompt: "Why is catering an important part of the business?" },

        { id: "w4-watch-impact", type: "watch", title: "Impact of Catering", youtube: "oDGovGZqIyE" },

        { id: "w4-watch-discounts", type: "watch", title: "Discounts & Payments", youtube: "RBIfypxXU7U" },

        { id: "w4-quiz-1", type: "quiz", title: "Quiz 1",
          questions: [
            { q: "Which of the following is NOT a way that we can create a \u201cREMARK\u201dable experience for catering guests?",
              choices: [
                "Carrying large bags to a guests\u2019 vehicle.",
                "Offering a beverage to a guest waiting for a catering order.",
                "Telling a guest to wait at the end of the counter for their order.",
                "Ensuring an order goes out on time.",
              ], answer: 2 },
            { q: "Which is correct regarding discounts on catering?",
              choices: [
                "All employees receive a discount on catering items.",
                "We only offer discounts on catering deliveries for Guilford County Schools.",
                "Any uniformed officer may receive a discount on catering items.",
                "We do not offer any type of discount on catering.",
              ], answer: 1 },
            { q: "Catering provides us with the opportunity to impact our community outside of our walls.",
              choices: ["True", "False"], answer: 0 },
            { q: "Tendering a catering order should only occur at the time the order is picked up / out for delivery.",
              choices: ["True", "False"], answer: 0 },
            // Bri's key is "a, b, d" — the only multi-select question in either quiz.
            { q: "Which of the following are acceptable forms of payment for catering orders? Select all that apply.",
              choices: ["Cash", "Credit / Debit Card", "Personal Check", "CFA One App"],
              answers: [0, 1, 3] },
          ] },

        { id: "w4-qa-2ms", type: "qa", title: "Q&A: 2MS & Catering",
          prompt: "How can we provide 2MS to our catering guests?" },

        { id: "w4-watch-2ms", type: "watch", title: "2MS & Catering", youtube: "uNl01EpHBD0" },

        { id: "w4-watch-pickup", type: "watch", title: "Pickup v. Delivery", youtube: "Ya0KRig_9z8" },

        { id: "w4-watch-unapproved", type: "watch", title: "Unapproved Delivery Items", youtube: "3FMgxaQdeC0" },

        { id: "w4-watch-prepping", type: "watch", title: "Prepping Catering", youtube: "lxq_beiBEPU" },

        { id: "w4-quiz-2", type: "quiz", title: "Quiz 2",
          questions: [
            { q: "What is the reason for offering only specific items for delivery?",
              choices: [
                "To ensure the highest quality product is received by our guests.",
                "To reduce the risk of foodborne illness by upholding time-temperature requirements.",
                "Neither response is correct.",
                "Both responses are correct.",
              ], answer: 3 },
            { q: "Which of the following is NOT required when taking a pickup order?",
              choices: ["Condiments", "Payment > $50", "Paper Goods", "Contact Information"], answer: 2 },
            { q: "All menu items are available for Chick-fil-A catering delivery.",
              choices: ["True", "False"], answer: 1 },
            { q: "All of the following items are approved for catering delivery EXCEPT:",
              choices: ["Grilled Club Sandwich", "Grilled Market Salad", "Coffee box", "Spicy Sandwich"], answer: 0 },
            { q: "The TBC (To Be Collected) function should only be used for schools that have an existing account with us.",
              choices: ["True", "False"], answer: 0 },
          ] },

        { id: "w4-watch-skills", type: "watch", title: "Skills & Application Points", youtube: "tzODq8maXhw" },

        { id: "w4-watch-wrapup", type: "watch", title: "Wrap-up", youtube: "oNYsKlfGQt8" },

        { id: "w4-assign-w5", type: "upload", title: "W5 Assignment",
          prompt: "Find an article on LEADWELL and summarize the content. How will the information help you develop yourself as a leader? What is one nugget of wisdom that you would share with the group from the article?",
          requirement: "2 paragraph minimum",
          accept: ".pdf,.doc,.docx" },
      ],
    },
  ],
};

export default function L101CateringModule() {
  return <L101Week weekId="w4" weekLabel="Week 4" seed={CATERING_W4} />;
}
