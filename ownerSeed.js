/* ══════════════════════════════════════════════════════════════════════════
   ownerSeed.empty.js — THE SAME FILE, WITH NOBODY IN IT.

   ★ THIS IS WHAT A NEW STORE GETS. `newstore.mjs` copies this over
   `ownerSeed.js` while it builds the snapshot, so a clone ships zero of the
   origin store's people instead of having fifteen lists emptied by hand inside
   a 1700-line config. Emptying by hand is not a theory: the second store's own
   handoff records three separate name counts that came out wrong.

   ⚠️ EVERY LIST HERE IS EMPTY ON PURPOSE, AND EMPTY IS A WORKING STATE.
   Nothing below needs filling in before a store opens. Each one fails in the
   safe direction, and the direction is written beside it.

   ⚠️ IT MUST KEEP THE SAME KEYS AS `ownerSeed.js`. A missing key is not the
   same as an empty one: `hrConsolePeople`, `tileAllowIds` and friends read a
   dotted path, and a caller that expects a list and gets `undefined` is a
   different bug from one that gets nothing. `newstore.mjs` refuses to run if
   the two files' key sets differ, so this cannot drift silently.

   ⚠️ DO NOT COPY THE ORIGIN STORE'S VALUES IN "TO HAVE SOMETHING THERE". A
   roster id is more dangerous than a name: `["67"]` does not look wrong, it
   just points at whoever THIS store's member 67 happens to be, silently, on a
   real shift.
   ══════════════════════════════════════════════════════════════════════════ */

export const OWNER_SEED = {
  /* ★ THE SEATS KEEP ALL SEVENTEEN ROWS AND LOSE ONLY THE PEOPLE.
     ⚠️⚠️ THIS IS NOT AN EMPTY ARRAY AND MUST NOT BECOME ONE. The seat ids are
     Hub structure, not anybody's staff: `toolArea` below routes the food safety
     tool to the `food-safety` id, `orgSeats.js` groups by `list`, and the
     accountability chart prints `fn`. Dropping the rows breaks routing at the
     NEW store rather than cleaning anything up. Only `holder` and `holderId`
     are this store's business, and both start null.
     ⚠️ A SEAT WITH NO HOLDER STILL RENDERS. It simply cannot be routed to, and
     "nobody" is a true statement about a store that has not decided yet.
     ⚠️ THE `note` FIELDS ARE GONE, not blanked. They said things like "absorbed
     into the FOH Director role", which is one store's org decision and reads as
     fact at any other. */
  seats: [
    { id: "team-culture", list: "ad-foh", fn: "Team Culture", area: "Team culture", holder: null, holderId: null, escalatesTo: null },
    { id: "hospitality", list: "ad-foh", fn: "Hospitality", area: "Hospitality", holder: null, holderId: null, escalatesTo: null },
    { id: "dt-pm", list: "ad-foh", fn: "DT Operations · PM", area: "Drive thru · PM", holder: null, holderId: null, escalatesTo: null },
    { id: "dt-day", list: "ad-foh", fn: "DT · Catering · Daytime", area: "Drive thru · daytime", holder: null, holderId: null, escalatesTo: null },
    { id: "cash-audit", list: "ad-foh", fn: "Cash Mgmt", area: "Cash audit", holder: null, holderId: null, escalatesTo: null },
    { id: "food-safety", list: "ad-boh", fn: "Food Safety", area: "Food safety", holder: null, holderId: null, escalatesTo: null },
    { id: "facilities", list: "ad-boh", fn: "Facilities", area: "Facilities", holder: null, holderId: null, escalatesTo: null },
    { id: "cleaning", list: "ad-boh", fn: "Cleaning Systems", area: "Cleaning", holder: null, holderId: null, escalatesTo: null },
    { id: "quality", list: "ad-boh", fn: "Food Quality", area: "Food quality", holder: null, holderId: null, escalatesTo: null },
    { id: "prep", list: "ad-boh", fn: "Prep Supervisor", area: "Thaw and prep", holder: null, holderId: null, escalatesTo: null },
    { id: "equipment", list: "extra", fn: "Equipment", area: "Equipment", holder: null, holderId: null, escalatesTo: null },
    { id: "waste", list: "unassigned", fn: "Waste and donations", area: "Waste and donations", holder: null, holderId: null, escalatesTo: null },
    { id: "training", list: "unassigned", fn: "Training", area: "Training", holder: null, holderId: null, escalatesTo: null },
    { id: "leadership", list: "unassigned", fn: "Leadership development", area: "Leadership development", holder: null, holderId: null, escalatesTo: null },
    { id: "supply", list: "unassigned", fn: "Supply ordering", area: "Supply ordering", holder: null, holderId: null, escalatesTo: null },
    { id: "hr", list: "unassigned", fn: "HR", area: "HR", holder: null, holderId: null, escalatesTo: null },
    { id: "payroll", list: "unassigned", fn: "Payroll", area: "Payroll", holder: null, holderId: null, escalatesTo: null },
  ],

  /* ★ STRUCTURE, NOT PEOPLE, SO IT STAYS FILLED IN. Which Hub tool routes to
     which seat. It names seat ids, never a person, and it is the same answer at
     every store. */
  toolArea: { foodsafety: "food-safety", equipment: "equipment" },

  /* ⚠️ EMPTY MEANS NOBODY, NOT EVERYBODY. Being on this list is necessary and
     not sufficient — every call site pairs it with a rank test.
     ⇒ A NEW STORE ALMOST CERTAINLY WANTS `HR_CONSOLE_OPEN_BY_RANK = true`
     instead of filling this in, because on day one they have no idea what their
     roster ids are and rank already says the right thing. That flag is a code
     flag on purpose: it decides whether the list gates HR Console at all, so
     putting it on a screen beside the list would let somebody widen access
     while thinking they were tidying one. Shape is { id, names }. */
  hrConsole: [],

  /* ⚠️ THIS IS MONEY AND EMPTY MEANS NOBODY EDITS. A store that has not decided
     gets a read-only profit share screen, never an open one.
     ⚠️ BY ROSTER ID, NEVER BY ROLE, and that is not an oversight. At the origin
     store two people share one title, so any role test that admits one admits
     the other. Ids are the only thing that says "these two people". */
  profitEdit: [],

  /* ⚠️ EMPTY MEANS NOBODY. On `l101tpl`, `orientation` and `schedule` that means
     the tile cannot be opened at all, because all three are tier 4 and this list
     is the only way in. That is the correct starting point for a store that has
     not decided who owns them, not a bug to work around.
     ⚠️⚠️ `schedule` IS AN ALPHA GATE UPSTREAM AND EMPTY IS STILL RIGHT HERE.
     ownerSeed.js gates it to four named people while scheduling is in alpha. A
     clone must NOT inherit those ids: a roster id is more dangerous than a name,
     because ["17"] does not look wrong, it just points at whoever THIS store's
     member 17 happens to be. So the new store's scheduling tiles open for nobody
     until it names its own, exactly like the other two tier 4 tiles.
     ⇒ WHEN THE ALPHA GATE IS DELETED UPSTREAM, DELETE THIS KEY IN THE SAME
     COMMIT. `newstore.mjs` compares the two files' key sets and refuses to build
     a snapshot if they differ, which is how this key came to be added at all. */
  /* ⚠️ THE THREE SCHEDULING KEYS ARE EMPTY FOR THE SAME REASON, AND THE REAL
     FILE ARGUES IT BETTER THAN THIS COMMENT CAN. `requestApprove`'s own note
     upstream says "EMPTY MEANS NOBODY ANSWERS, which is the safe direction:
     requests pile up visibly rather than being waved through by whoever
     wandered in." That reasoning is the same for all three.
     · `scheduleEdit` — nobody may press Build, drag a shift or save a week
       until the store names people. A new store has no schedule to protect yet
       and a wrong name here moves real shifts onto real people.
     · `payAccess` — nobody sees wages. The only safe default there is nobody,
       and the real file records a server-side lock on `gcfcr-hr-pay-v1` as the
       second one, so this list is not the whole protection either way. */
  tileAllow: { facilities: [], l101tpl: [], orientation: [], schedule: [],
               requestApprove: [], scheduleEdit: [], payAccess: [] },

  /* ⚠️ EMPTY MEANS EVERYBODY SIGNS THE HANDBOOK, which is the safe direction
     for a store that has not made an exception yet. */
  handbookExempt: [],

  /* ⚠️ EMPTY IS THE DO-NOTHING ANSWER AND IT IS ALSO THE RIGHT ONE. The tile
     stays locked until this store's own executive releases it, and from that
     moment the ROLE test admits their directors. So a new store never has to
     fill these in, which is why they are not on the settings screen.
     ⚠️ `allowed` and `directors` are NAMES; `instructorIds` are roster ids. Do
     not tidy one into the other without moving the call sites in the same
     change: the tile compares against `user.name`. */
  leadershipDev: { allowed: [], directors: [], instructorIds: [] },

  /* ⚠️ EMPTY MEANS THIS STORE'S OWN PEOPLE FILL THE PICKERS as they enter rocks
     and to-dos, and the tile's release switch plus the role test decide who
     gets in.
     ⚠️ FOUR KEYS, FOUR DIFFERENT FACTS, and they stay four. `allowed` and
     `directors` are full names used as gates; `seatOrder` is FIRST names and is
     the L10 seat ORDER, so it is ordered and not a set; `ownerOptions` is first
     names for the owner picker and is deliberately wider than seatOrder.
     ⚠️ LIST A PERSON EVERY WAY THEY ARE SPELLED. These compare against a roster
     name, and a near-miss fails silently and reads as "the fix did not work". */
  eos: { allowed: [], directors: [], seatOrder: [], ownerOptions: [], facilitator: "" },

  /* ⚠️ EMPTY CLOSES ONLY THE MIDDLE DOOR. Four tiles gate on id, then name,
     then role. This is the name door. A new store's admins still pass on ROLE,
     which is the door that works on day one, so the safe answer and the
     do-nothing answer are the same answer.
     ⚠️ FOUR KEYS, NOT ONE, EVEN WHEN TWO OF THEM MATCH. They are four different
     questions that can happen to share an answer. Levelling them up to the
     longest would widen three real permission gates, including one where a name
     grants outcome-setting and one holding promotion applications. */
  adminNames: {
    teamDirectory: [], teamGoals: [], teamResources: [], professionalGrowth: [],
    skillsPanel: [], l101Editor: [], goalSubmissions: [], memberVote: [], uniformOrder: [],
  },

  /* ⚠️ EMPTY MEANS ROWS THE OPERATOR WOULD OWN HAVE NO OWNER, which is true
     until a store says who theirs is. Nothing errors; the register simply shows
     the row as unclaimed. */
  operator: "",

  /* ⚠️ SUGGESTIONS ONLY, NEVER A GATE. Empty means the cash audit name boxes
     offer nothing and accept anything typed, which is exactly right at a store
     whose people the Hub has never met. */
  /* ⚠️ THE TASKS STAY, THE TRAINERS DO NOT. Ten standard cleaning assignments
     with nobody against them is a rota waiting to be filled. Deleting the rows
     would leave the tile with nothing to show and nothing to assign. */
  trainerTasks: [
    { task: "Cleaning Vacuum", trainer: "" },
    { task: "PlayPlace", trainer: "" },
    { task: "Indoor Trash Bins", trainer: "" },
    { task: "Outside Trash Containers", trainer: "" },
    { task: "Dining Room Trash Compactors", trainer: "" },
    { task: "FOH brooms & Dustpans", trainer: "" },
    { task: "FOH Fridges", trainer: "" },
    { task: "Cleaning Receipt Printers and Screens", trainer: "" },
    { task: "Bagging Screen Cleaning/Dust all around weekly", trainer: "" },
    { task: "Indoor Menu Boards, POP and Signage Cleaning", trainer: "" },
  ],

  cashierNames: [],

  /* ★ COPY, NOT A PERMISSION. Who runs the courses, as a name said out loud.
     ⚠️ EMPTY READS PROPERLY AND IS MEANT TO. `courseOwnerLabel()` hands back
     "your instructor", so all seven sentences in Leadership 101 still parse and
     none of them names a stranger. A first name, not a full one: it is spoken
     copy, so put in whatever this store's people would actually say. */
  courseOwner: "",

  /* ★ THE BOARD RULES. Station locks and seniority order, by roster id.
     ⚠️⚠️ AN EMPTY BOARD BLOCK IS A WORKING BOARD, and starting with nothing is
     the instruction rather than a gap. No lock means the engine places somebody
     on whatever they are trained for and available at, which is already how it
     treats everybody without a rule. Copying the origin store's shape "to have
     something there" is the one way to get this wrong.
     ⚠️ THESE ARE NOT SETTINGS AN OPERATOR TYPES. Each one is a decision a store
     makes out loud on the floor. Ask two questions and fill in only what they
     answer: "is there anybody who only ever works one station?" gives a lock,
     "who is the most senior Assistant Director, then who?" gives an order. Most
     stores answer the first with no, and that is a real answer.
     ⚠️ ORDER IS THE RANK in the four `*Order` lists and is the only thing that
     carries it. Alphabetising one silently re-ranks a live board.
     ⚠️ A LOCK IS A RESTRICTION, NOT A PREFERENCE. "She's usually on register"
     is not a lock; a lock on somebody who works varied shifts leaves holes on
     the board rather than filling them.
     ⚠️ TAKES EFFECT ON RE-IMPORT, which rebuilds the day and drops manual
     edits. Set these before a store's first import. Never mid-shift. */
  board: {
    lockDining: [],
    lockRegister: [],
    lockRegDining: [],
    lockRegDiningWindow: [],
    lockCleanliness: [],
    lockBreader: [],
    fohDirectorOrder: [],
    fohAdOrder: [],
    bohDirectorOrder: [],
    bohAdOrder: [],

    /* ⚠️ NAME FALLBACKS, EMPTY. No name rule means the engine places by id,
       skill and clock-in, which is what it already does for everybody without
       a rule. Filling these with the origin store's patterns would lock
       whoever at THIS store happens to share a first name. */
    lockDiningNames: [],
    lockRegisterNames: [],
    lockRegDiningNames: [],
    lockRegDiningWindowNames: [],
    lockCleanlinessNames: [],
    lockBreaderNames: [],
    fohDirectorNames: [],
    fohAdNames: [],
    bohDirectorNames: [],
    bohAdNames: [],
  },
};
