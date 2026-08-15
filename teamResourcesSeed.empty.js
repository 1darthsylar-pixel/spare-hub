/* ══════════════════════════════════════════════════════════════════════════
   teamResourcesSeed.empty.js — the version a new store gets. `newstore.mjs`
   copies this over `teamResourcesSeed.js` while it builds the snapshot.

   ⚠️ WHAT COMES OUT: every `file`. The origin store's seven PDFs live in ITS
   `hub-assets` bucket, and `/docs/<file>` returns a real 404 — a plain-text
   "Document not found" page — when the object is not there. So a clone
   inherited seven cards that all looked normal and all opened onto nothing.
   Found Aug 13 2026 while measuring the finished Guilford snapshot.

   ⚠️⚠️ THE CARDS THEMSELVES STAY, AND THAT IS THE POINT, NOT A COMPROMISE.
   `openable()` in TeamResources.jsx already treats a `pdf` with an empty `file`
   as NOT openable — it renders greyed out and cannot be tapped. That guard
   exists because Bri hit this exact state in July on "TM Review Breakdown".
   ⇒ So a new store opens Resources and sees the six standard documents greyed
   out, each with its own upload button, which reads as a list of what to send
   rather than a dead link or a blank page. Matt, Aug 13 2026, asked for exactly
   this over an empty page: "a new store has no idea what belongs there".

   ⚠️ WHY THESE SIX AND NOT SEVEN. `r1`–`r4`, `r7` and `r8` are documents every
   Chick-fil-A has: the two handbooks, the appearance guide, the point system
   and the two review breakdowns. Same reasoning that kept `uniformCatalog.js`
   at the second store — a standard is not a store-specific fact.
   ⛔ `r9` IS DROPPED, not blanked. It is the origin store's mentorship
   programme guide, and a programme is something an operator invents rather
   than something every restaurant has. A store running one adds the card in
   the editor, where it can name it whatever its programme is called. Carrying
   an empty "<Programme> Guide" card would be inventing a document for them.
   ⚠️ `r5` (Uniform Order) KEEPS ITS TOOL. It is `kind: "tool"`, not a PDF, so
   it points at the Hub's own uniform tile rather than at a file in anybody's
   bucket. It works on day one at any store.
   ⚠️ `r6` IS ALREADY `pending` upstream and stays that way. `openable()`
   refuses `pending` outright, so it is already the safe shape.

   ⚠️ IDS MATCH THE REAL FILE so `Restore defaults` behaves the same way, and so
   a store that later receives a ported card does not collide. Do not renumber.
   ══════════════════════════════════════════════════════════════════════════ */

export const SEED = [
  { id: "r1", label: "Team Member Handbook", kind: "pdf", cat: "handbook", file: "" },
  { id: "r2", label: "Leadership Handbook", kind: "pdf", cat: "handbook", file: "" },
  { id: "r3", label: "Point Performance System", kind: "pdf", cat: "system", file: "" },
  { id: "r4", label: "Appearance Guide", kind: "pdf", cat: "guide", file: "" },
  { id: "r5", label: "Uniform Order", kind: "tool", cat: "form", tool: "uniform" },
  { id: "r6", label: "TM Review Breakdown", kind: "pending", cat: "review" },
  { id: "r7", label: "Trainer Review Breakdown", kind: "pdf", cat: "review", file: "" },
  { id: "r8", label: "Senior Leader Review Breakdown", kind: "pdf", cat: "review", file: "" },
];
