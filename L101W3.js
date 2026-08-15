/**
 * L101W3.js — Leadership 101, Week 3: Food Safety.
 *
 * ★★ SAME CONSTRAINT AS WEEK 2, AND IT MATTERS MORE HERE. Built from
 * "W3 - Food Safety.pdf" (student) only. "W3 - Master - L101 Workbook.pdf" sits
 * in the same Drive folder with every blank filled in, and was never opened.
 *
 * ⇒ EVERY FILL-IN IS A WRITTEN ANSWER (`qa`), NEVER A GRADED QUIZ. The content
 * store is what the student's browser downloads, so a key stored here would ship
 * the answers to the people being tested. Written answers mean the answers never
 * need to exist in the app.
 *
 * ⚠️ THIS WEEK CONTAINS THE COOKING TEMPERATURES AND THE HANDWASH DURATION, AND
 * THEY ARE DELIBERATELY LEFT BLANK. Do not "helpfully" fill them in from general
 * knowledge. Gate City's numbers must come from Gate City's master and Bri's
 * teaching — a food safety figure that is close but wrong is worse than a blank,
 * because it will be believed and acted on. Same for the Big Six and the
 * reportable symptoms.
 *
 * ⚠️ THE FOOD SAFETY PROMPT IS THE SECOND HALF OF AN EXERCISE SET IN
 * L101W2.js, and its wording must match that file's. It used to name this
 * store in both places; see the header of L101W2.js for why it is reworded
 * rather than read from the config, and why changing one means changing both.
 *
 * ⚠️ CLASS ID "w3" AND EVERY ITEM ID ARE PERMANENT — progress is keyed by them.
 *
 * ⏳ DRAFT FOR BRI. Section order follows the printed pages so she can teach from
 * either. The mock inspection is the centrepiece of the class and is built as
 * its own section.
 */

export const L101_W3 = {
  id: "w3",
  n: 3,
  title: "Food Safety",
  sections: [
    {
      id: "w3s1",
      title: "Before we start",
      items: [
        { id: "w3-read-intro", type: "read", title: "What this week covers",
          note: "Basic food safety practices, with a focus on spotting and preventing hazards. Later in the session we run a mock inspection as a group — you'll walk the restaurant the way an inspector would." },
        { id: "w3-qa-assignment", type: "qa", title: "Your W3 assignment — share it",
          prompt: "You wrote down your top food safety concern in our restaurant, why it concerns you, and a SMART plan to address it.\n\nPaste it here, and be ready to share it with the group." },
        { id: "w3-read-why", type: "read", title: "Why this matters",
          note: "Proper food safety protects our team and our guests, and it protects the brand.\n\nFoodborne illness carries costs on both sides — to the victim, and to the organisation. Every one of them is too high when you consider how often it could have been prevented." },
      ],
    },
    {
      id: "w3s2",
      title: "How food becomes unsafe",
      items: [
        { id: "w3-qa-contaminants", type: "qa", title: "The three kinds of contaminant",
          prompt: "Biological · Chemical · Physical.\n\nWrite what each one is and give an example of each from our restaurant." },
        { id: "w3-qa-five-ways", type: "qa", title: "How does food become unsafe? — the five",
          prompt: "List all five as we go through them." },
        { id: "w3-read-tcs", type: "read", title: "TCS food",
          note: "TCS: food requiring Time and temperature Control for Safety.\n\nTCS and ready-to-eat foods are the most likely to become unsafe." },
        { id: "w3-qa-big-six", type: "qa", title: "The Big Six, and HENSS",
          prompt: "Write out the Big Six pathogens, and what HENSS stands for." },
        { id: "w3-qa-reportable", type: "qa", title: "Which symptoms are reportable?",
          prompt: "List them. ⚠️ This is one to actually know rather than look up — you need it in the moment when someone tells you they don't feel well." },
        { id: "w3-qa-fattom", type: "qa", title: "FAT TOM — the six conditions for bacterial growth",
          prompt: "Food · Acidity · Temperature · Time · Oxygen · Moisture.\n\nYour notes on each, and which of them we can actually control here." },
      ],
    },
    {
      id: "w3s3",
      title: "Chemical, physical, and allergens",
      items: [
        { id: "w3-qa-chemical", type: "qa", title: "Fill in the blanks — preventing chemical contamination",
          prompt: "\"Purchase chemicals from ______ suppliers.\"\n\"Store chemicals ______ from food and food-contact surfaces by space or partition — NEVER ______ food or food-contact surfaces.\"\n\"Use chemicals only for their ______ use.\"\n\"Make sure labels are ______ and remain on chemicals.\"\n\"Follow directions and local regulations for ______ of chemicals.\"\n\nAnd: if an illness is suspected, locate the SDS and call the ______ ______ number, plus emergency medical attention." },
        { id: "w3-read-sds", type: "read", title: "Safety Data Sheets",
          note: "An SDS is required to be available for every chemical used in the restaurant.\n\nLeaders need to know where those sheets are AT ALL TIMES. They belong near the chemicals, not filed away somewhere." },
        { id: "w3-qa-physical", type: "qa", title: "Physical contamination",
          prompt: "Sources, and the signs and symptoms — minor to fatal injuries, bleeding, pain.\n\nFill in: \"Some physical contaminants occur ______, but these still present a hazard to consumers.\"\n\nThe best prevention is following uniform guidelines on hair, jewellery and nails — why do you think that is?" },
        { id: "w3-qa-allergens", type: "qa", title: "The Big Eight allergens",
          prompt: "List all eight, and the signs and symptoms of a reaction.\n\n⚠️ Reactions run from mild to fatal and must always be taken seriously. Symptoms can look mild at first and turn serious very quickly. If a severe reaction is present, call for emergency medical attention." },
      ],
    },
    {
      id: "w3s4",
      title: "Handwashing, appearance and grooming",
      items: [
        { id: "w3-qa-handwash", type: "qa", title: "Handwashing — the steps, and the number",
          prompt: "Proper handwashing is the single most important step in preventing the spread of pathogens, and it happens only in designated handwashing sinks — never in prep or dish sinks.\n\nWrite the five steps, including how many seconds you scrub for, and list when handwashing is required." },
        { id: "w3-read-appearance", type: "read", title: "Why appearance is a food safety topic",
          note: "Uniform and grooming standards aren't only about brand consistency for guests. Anything that can come into contact with food during prep or service can create a hazard — which is why hair, nails and jewellery sit in this class rather than in a style guide." },
        { id: "w3-qa-grooming", type: "qa", title: "The grooming rules that exist for food safety",
          prompt: "From the TeamStyle standards, note the ones with a food safety reason behind them: hair restraints, nails and polish, rings under gloves, necklaces tucked in, watches out of food prep areas.\n\nFor each, write the reason — not just the rule. You'll be holding people to these, and \"because it's the rule\" doesn't hold up on a busy shift." },
      ],
    },
    {
      id: "w3s5",
      title: "The flow of food",
      items: [
        { id: "w3-read-flow", type: "read", title: "What the flow of food means",
          note: "The path food takes through our operation, from delivery to the guest.\n\nHazards can occur at almost any point along it. Foodborne illness most often comes from time-temperature abuse." },
        { id: "w3-qa-prevent", type: "qa", title: "Preventing cross-contamination and time-temperature abuse",
          prompt: "Cross-contamination: separate · clean · prep at different times · buy prepared.\nTime and temperature: monitoring · tools · recording · time/temp control · corrective actions.\n\nYour notes on each — and how we'd actually prevent both here, on a real shift." },
        { id: "w3-qa-temps", type: "qa", title: "Internal temperature requirements",
          prompt: "Fill in the temperature and the hold time for each:\n\n• Poultry · stuffing made with fish, meat or poultry · stuffed meat, seafood, poultry or pasta\n• Ground meat · injected meat · ground seafood · shell eggs held hot for service\n• Seafood · steaks and chops · shell eggs served immediately\n• Fruits, vegetables, grains and legumes\n\n⚠️ Write the numbers as we cover them. Don't fill these in from memory or from another restaurant — these are the ones you'll be held to." },
      ],
    },
    {
      id: "w3s6",
      title: "Mock inspection",
      /* ★ REBUILT TO BRI'S SPEC (Jul 31 2026) as a `walk` item — her table of
         Area · Observations · Concerns, BOH then FOH, with her exact wording.
         Replaces the two `qa` items that collected the whole walk as one blob
         ("w3-qa-mock-findings", "w3-qa-inspect") and the "How this works" read
         whose area list disagreed with hers. Verified before the swap: no
         progress record anywhere references those ids and nobody has submitted
         W3, so nothing on any student record is orphaned.
         ⚠️ Notes save per row under `${item.id}:${row.id}:obs|con`, so ROW IDS
         ARE AS PERMANENT AS ITEM IDS once anyone has written in a box. */
      items: [
        { id: "w3-walk-mock", type: "walk", title: "Inspect What You Expect!",
          // Bri, Aug 1 2026: the prep checklist should be a warning box (like
          // the FOH "wash hands" callout) sitting right before the BOH group,
          // not plain intro text. It rides `note` on the BOH area — the amber
          // callout the renderer draws above a group — and stays editable in
          // the class editor's "Callout shown before this group" field.
          intro: "As you move through the restaurant, look for general violations and risks -- cross-contamination concerns, holding temperatures, hair/jewelry violations, etc. Don't be afraid to ask questions and seek clarity, it helps everyone learn!",
          areas: [
            { id: "wa-boh", label: "BOH", note: "Before the walkthrough, make sure you have slip-resistant shoes, hair is pulled back, hairnet is on, and you wash your hands!", rows: [
              { id: "wr-backdoor", label: "Back Door", detail: "Chemical Shelf and SDS sheets" },
              { id: "wr-cooler", label: "Walk-In Cooler" },
              { id: "wr-freezer", label: "Walk-In Freezer" },
              { id: "wr-dishes", label: "Dishes" },
              { id: "wr-prep", label: "Prep" },
              { id: "wr-secondary", label: "Secondary" },
              { id: "wr-primary", label: "Primary" },
              { id: "wr-raw", label: "Raw (Breading)" },
            ] },
            { id: "wa-foh", label: "FOH", note: "Wash hands before moving to the FOH!", rows: [
              { id: "wr-counter", label: "Front Counter" },
              { id: "wr-dt", label: "Drive Thru" },
            ] },
          ],
          outro: "Let's Discuss! What risks or violations did you see that require immediate action?" },
      ],
    },
    {
      id: "w3s7",
      title: "On the floor this week",
      items: [
        { id: "w3-qa-skills", type: "qa", title: "Food safety skills — what, where, when",
          prompt: "For each: Waste (POS version) · Waste (Inform version) · eRQA · SAFE Daily Critical." },
        { id: "w3-read-application", type: "read", title: "Application points",
          note: "FOH — continue guest recovery training from Week 2, and coach the team on food safety practices and the 'why' behind them.\n\nBOH — a heavy focus on food safety and on accountability for practices. Practise eRQA and SAFE Daily Critical when you're able.\n\nAll Trainers: focus on food safety, and hold team members and fellow leaders accountable — practices, appearance and grooming, wasting product properly. Verbal accountability is fine, and documentation is at your discretion. Follow up with verbal warnings and clear timeframes.\n\n⚠️ Next week is the FINAL week to complete cross-training if you haven't." },
        { id: "w3-upload-w4", type: "upload", title: "Week 4 assignment — the Catering Pathway plan",
          prompt: "Complete the Catering Pathway plan assigned to you. Note any questions you want answered in the next class.\n\nThe W4 virtual course also needs completing by its due date.",
          requirement: "PDF, Word document or a photo of your written page",
          accept: ".pdf,.doc,.docx,image/*" },
      ],
    },
  ],
};

export default L101_W3;
