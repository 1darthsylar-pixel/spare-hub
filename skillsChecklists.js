/**
 * skillsChecklists.js — the Leadership 101 and Senior Trainer skills checklists.
 *
 * ★ CONTENT, NOT CODE. Built from Bri's five "W_ Skills" PDFs in the Drive
 * folder "Checklists" (1f4RbJOKc49tdz7JOHdWqFkAf6Gp0Fwfs), Jul 28 2026. Kept in
 * its own file for the same reason L101W2/W3 are: the shape below is a seed she
 * edits in the app afterwards, and a seed that lives inside a component is one
 * nobody can find.
 *
 * ⚠️ TWO KINDS OF THING PER WEEK, AND THEY BEHAVE DIFFERENTLY.
 *   `applied` — "Application Points: Daily". READ-ONLY by Bri's instruction, split
 *               FOH / BOH, each with a lead line and its own bullets. Nothing here
 *               is ever ticked; it is what they should be DOING that week.
 *   `skills`  — the checklist proper. Each entry is ticked by the student
 *               themselves, and un-ticked freely: her words, "students can check
 *               and uncheck, I just want to see what they've completed."
 *
 * ⚠️ ITEM IDS ARE PERMANENT — a student's ticks are keyed by them. Renaming an id
 * silently un-ticks that skill for everyone who has done it. Add freely; never
 * rename or reuse.
 *
 * ⚠️⚠️ THE CROSS-TRAINING AND TRUCK-EXPERIENCE DEADLINES ARE GONE ON PURPOSE
 * (Bri, Jul 28 2026: "these are no longer accurate"). Her printed W2-W6 sheets
 * STILL CONTAIN THEM, so anyone rebuilding this file from Drive will put them
 * straight back. Don't. The same applies to "All Trainers may begin documenting
 * on team members as needed" — removed at her instruction.
 *
 * ⚠️ NO DUE DATES ON THE LEADERSHIP 101 CARD. Bri: "no due dates needed for
 * these, they're more like self-check progress reports." The Senior Trainer card
 * is assigned and MAY carry one.
 */

/* Bri's own footnotes from each sheet. Shown under the week, not tickable —
   they are reminders about requirements tracked elsewhere (cross-training, truck
   experience), and turning them into checkboxes would create a second place
   those are recorded. */
export const L101_CHECKLIST = {
  id: "l101",
  title: "Leadership 101",
  blurb: "Tick these off on shift as you go. Your class covers the why; this is the doing.",
  weeks: [
    {
      id: "w2",
      title: "W2 Skills",
      subtitle: "Guest Recovery",
      applied: {
        foh: {
          lead: "Heavy focus on guest relations with AD guidance.",
          points: [
            "Phone responsibilities",
            "Flexing, when able",
            "Embrace confrontation",
            "Coach the team on the HEARD model",
            "Coach the team on 2MS, LOH and CORE 4",
            "Coach the team on guest awareness",
          ],
        },
        boh: {
          lead: "Heavy focus on coaching the team with the guest in mind.",
          points: ["Speed", "Accuracy", "Food safety", "Coach the team on guest awareness"],
        },
      },
      skills: [
        { id: "sk-w2-heard", label: "HEARD model" },
        { id: "sk-w2-phone", label: "Phone etiquette" },
        { id: "sk-w2-replacements", label: "Inputting replacements" },
        { id: "sk-w2-refunds", label: "Refunds" },
        { id: "sk-w2-receipts", label: "Printing receipts from previous transactions" },
        { id: "sk-w2-cem", label: "CEM scores" },
        { id: "sk-w2-points", label: "Documenting points" },
      ],
    },
    {
      id: "w3",
      title: "W3 Skills",
      subtitle: "Food Safety & Accountability",
      applied: {
        foh: {
          lead: "Continue guest recovery training from W2.",
          points: ["Coach the team on food safety practices and the 'why' behind them"],
        },
        boh: {
          lead: "Heavy focus on food safety and accountability for practices.",
          points: ["Practise eRQA when able", "Practise SAFE Daily Critical when able"],
        },
        /* ⚠️ "documentation is at your discretion" → "if documentation seems
           fitting, notify a leader" (Bri, Jul 28 2026). This is an AUTHORITY
           change, not wording: trainers stop documenting and start escalating.
           ✅ RESOLVED — Aug 10 2026. The Hub now matches this sentence. Bri
           ruled it again on Aug 8, asked directly: "Senior Trainer and Junior
           Trainer are the same tier in regards to documentation — neither can
           document a Team Leader." `DOC_MIN` itself did NOT move; instead the
           trainer titles get a documentation rank below Team Leader, so the
           New Documentation block no longer renders for them at all (see
           docRankOf and canDocument in HRConsole.jsx). The class said escalate
           for thirteen days while the button still existed. It no longer does.
           ⚠️ ACCESS RANK IS UNCHANGED — a Senior Trainer is still rank 3 and
           still has every tile they had. This moved documentation only. */
        all: "FOH and BOH focus on food safety and hold team members and fellow leaders accountable — practices, appearance and grooming, wasting product properly. Verbal accountability is fine; if documentation seems fitting, notify a leader. Follow up with clear timeframes.",
      },
      skills: [
        { id: "sk-w3-waste-pos", label: "Waste (POS version)" },
        { id: "sk-w3-waste-inform", label: "Waste (Inform version)" },
        { id: "sk-w3-erqa", label: "eRQA" },
        { id: "sk-w3-sdc", label: "SAFE Daily Critical" },
      ],
    },
    {
      id: "w4",
      title: "W4 Skills",
      subtitle: "Facilities & Operations Management",
      applied: {
        foh: {
          lead: "Heavy focus on catering and managing facilities with AD guidance.",
          points: [
            "Taking, communicating and prepping catering orders with AD guidance",
            "Continue coaching on guest recovery and food safety",
          ],
        },
        boh: {
          lead: "Heavy focus on catering.",
          points: [
            "Communicating and prepping catering orders",
            "Coaching the team on time management around catering, so quality holds",
          ],
        },
        /* Bri, Jul 28: "responsible for" → "encouraged to focus on". A trainer
           is no longer on the hook for vendor and Sedgwick calls; they ask for a
           chance to practise or observe instead. */
        all: "FOH and BOH are encouraged this week to focus on facilities and operations issues. Ask an AD or Director if you see an opportunity to practice or observe any of the skills discussed in class. Continue holding the team accountable for standards.",
      },
      skills: [
        { id: "sk-w4-inputting", label: "Inputting / recalling" },
        { id: "sk-w4-callingit", label: "Calling IT" },
        { id: "sk-w4-deferred", label: "Deferred orders" },
        { id: "sk-w4-truck", label: "Truck checkoff" },
        { id: "sk-w4-pmvendors", label: "Calling PM & vendors" },
        { id: "sk-w4-sedgwick", label: "Sedgwick claims" },
        { id: "sk-w4-credit", label: "Submitting credit" },
      ],
    },
  ],
};

/* ⚠️ SEPARATE CARD, SEPARATE ACCESS. Bri: this is for Junior Trainers pursuing
   Senior Trainer or Team Leader, "done so rarely" that it is assigned rather
   than opened to a cohort. The full W5/W6 classes may move into the Hub later —
   until then these checklists stand alone. */
export const SENIOR_TRAINER_CHECKLIST = {
  id: "sr-trainer",
  title: "Senior Trainer",
  blurb: "A continuation of Leadership 101, for Junior Trainers moving toward Senior Trainer or Team Leader.",
  weeks: [
    {
      id: "w5",
      title: "W5 Skills",
      subtitle: "Operational Efficiency",
      applied: {
        foh: {
          lead: "Heavy focus on monitoring metrics as well as shift efficiency.",
          points: [
            "Responsible for monitoring the AHA system",
            "Setting contests, managing transfers and troubleshooting technology with AD guidance",
            "Continue coaching on food safety",
          ],
        },
        boh: {
          lead: "Heavy focus on monitoring AHA and the efficiency of shifts with AD guidance.",
          points: ["Responsible for monitoring the AHA system", "Continue coaching on food safety"],
        },
        all: "All Trainers are responsible this week for monitoring metrics — sales, labor, productivity, SOS and time punch — with AD guidance. Trainers will assist with running breaks and checking off areas at closing.",
      },
      skills: [
        { id: "sk-w5-routing", label: "Custom routing" },
        { id: "sk-w5-sar", label: "Sales activity report" },
        { id: "sk-w5-dttech", label: "Setting up DT technology" },
        { id: "sk-w5-labor", label: "Labor report" },
        { id: "sk-w5-salesmix", label: "Sales mix report" },
        { id: "sk-w5-clockedin", label: "Clocked in" },
        { id: "sk-w5-sos", label: "Speed of service" },
        { id: "sk-w5-contests", label: "Contests" },
        { id: "sk-w5-financial", label: "Financial report" },
        { id: "sk-w5-transfers", label: "Transfers" },
      ],
    },
    {
      id: "w6",
      title: "W6 Skills",
      subtitle: "Cash Management",
      applied: {
        foh: {
          lead: "Heavy focus on cash management and operational efficiency with AD guidance.",
          points: [
            "Cash management duties: paid in / paid out, counting and settling registers and bags, pick up, and inputting money into the SmartSafe — with AD guidance",
          ],
        },
        boh: {
          lead: "Heavy focus continues on monitoring AHA, as well as shift efficiency.",
          points: ["Responsible for monitoring the AHA system", "Continue coaching on food safety"],
        },
        all: "All Trainers combine skills this week to run shifts, identify and solve bottlenecks, manage metrics, and continue coaching and holding the team accountable.",
      },
      skills: [
        { id: "sk-w6-paidinout", label: "Paid in & paid out" },
        { id: "sk-w6-drawer", label: "Drawer events" },
        { id: "sk-w6-pickup", label: "Pick up" },
        { id: "sk-w6-forcesignout", label: "Force cashier sign out" },
        { id: "sk-w6-counting", label: "Counting registers" },
        { id: "sk-w6-knowledge", label: "Knowledge v. practice" },
        { id: "sk-w6-smartsafe", label: "Inputting into the SmartSafe" },
        { id: "sk-w6-safecount", label: "Safe count" },
        { id: "sk-w6-cashier", label: "Open / close a cashier" },
        { id: "sk-w6-closing", label: "Closing the day" },
      ],
      /* ⚠️ HER SAFETY LINE, KEPT VERBATIM AND SHOWN AS A WARNING RATHER THAN A
         FOOTNOTE. A trainer who ticks "counting registers" and concludes they may
         now do it alone is the exact misreading this prevents. */
      warn: "Trainers MAY NOT manage cash alone during this time. Cash management training continues for an undetermined period, depending on how often each Trainer can practise with an AD.",
    },
  ],
};

export const CHECKLIST_CARDS = [L101_CHECKLIST, SENIOR_TRAINER_CHECKLIST];
export default CHECKLIST_CARDS;
