# How Gate City's board got its values

**This is a historical record, not live code.** The station names and posted
hours now live in `storeConfig.js` under `stations`, where a settings screen can
edit them. This file is the reasoning that produced the values Gate City is
running today, kept verbatim from `stationTemplates.js` before the store
configuration layer moved the data out on Aug 11 2026.

Read it before changing anyone's hours. Almost every line here is a decision
Matt made against a real roster, with the date and usually his own words. The
values are easy to change; the reasons are not recoverable once lost.

Two things to know about the shape it was written in:

- Monday to Wednesday shared one template. **Thursday and the weekend were
  written as transforms of it** ("Thursday is Monday except Expo 1 runs to
  9PM"), which is why the notes below read as edits rather than as tables.
- The config now holds all six days **flat**, one full list per day. That is
  what the grid editor needs, and it means the transforms below no longer run.
  A change to Monday no longer moves Thursday with it.

---

/* ============================== FOH ==================================== */

const FOH_WEEKDAY = () => [
  st("window", "WINDOW", "FRONT LINE", [blk(T(6), T(23))], "STOCK SAUCES"),
  st("expo1", "EXPO 1", "FRONT LINE", [blk(T(11), T(20))], "CLEAN OUTSIDE WINDOW"),
  st("expo2", "EXPO 2", "FRONT LINE", [blk(T(11, 15), T(14)), blk(T(17), T(20))], "PARKING LOT CHECK"),
  st("drinks", "DRINKS", "FRONT LINE", [blk(T(8, 30), T(22))], "CLEAN AND STOCK DRINKS"),
  st("desserts", "DESSERTS", "FRONT LINE", [blk(T(11, 15), T(23))], "CLEAN AND STOCK DESSERTS"),
  st("dtTraditional", "DT TRADITIONAL", "DRIVE THRU", [blk(T(11), T(23))], "STOCK AREA",
    { cellOverrides: { breakfast: "✔️" } }),
  st("dtMobiles", "DT MOBILES", "DRIVE THRU", [blk(T(8, 30), T(11))], "CHECK OFF AREAS",
    { cellOverrides: { lunch: "✔️", mid: "✔️", night: "✔️" } }),
  st("traditionalBagger", "TRADITIONAL BAGGER", "FRONT COUNTER", [blk(T(11), T(14)), blk(T(17), T(22))], "STOCK AREA", // Jul 26: cut 2-5 (Mon-Wed only)
    { cellOverrides: { breakfast: "✔️" } }),
  st("mobileBagger", "MOBILE BAGGER", "FRONT COUNTER", null, "CHECK OFF AREAS", { leader: true }),
  /* ⚠️ RENAMED "DRINKS/DESSERTS" -> "MOBILE DRINKS/DESSERTS" (Matt, Aug 6 2026).
     This is a TEMPLATE change, so it only appears on a board that is RE-IMPORTED
     — and a re-import rebuilds the day and wipes any manual edits a leader has
     made to it. Never ship this mid-shift.
     Boards already saved in KV keep the old name until they are re-imported, so
     both names have to keep working. DailySetup's FC_COVERED and the Drive Thru
     category test each match both spellings; changing one without the other
     hands saved weekend boards to the wrong leader or drops the row into the
     "Other" bucket at the bottom of the board. */
  st("drinksDesserts", "MOBILE DRINKS/DESSERTS", "FRONT LINE", null, "STOCK AREA",
    { leader: true, cellText: "split duties" }),
  st("register1", "REGISTER 1", "FRONT COUNTER", [blk(T(6), T(11))], "STOCK FC",
    { cellOverrides: { lunch: "✔️(Line!!)", mid: "✔️(Line!!)", night: "✔️(Line!!)" } }),
  st("register2", "REGISTER 2", "FRONT COUNTER", [blk(T(11), T(21))], "TRASH AND FLOORS"), // Jul 26: cut 9-11
  st("register3", "REGISTER 3", "FRONT COUNTER", [blk(T(11), T(17))], "STOCK AREA"),
  /* ⚠️ BACK TO 8PM, REVERTING THE Jul 26 6:33 AM CHANGE (commit 42a63b3), which
     took this row from 8AM-8PM to 8AM-10PM under the note "full-time role, to
     10PM". The Google Sheet still reads HOSPITALITY (8AM-8PM) on every tab.

     🐛 WHAT IT COST. Closing at 10 makes SIX non-leader stations need a body
     until 10 on Fri/Sat instead of five. Matt, Jul 30: "1 uncovered slot,
     nobody on the clock covers these — OT 1 Night 5:30-10", and "I didn't have
     this problem last week and it's the same schedule." He was right on both
     counts: the roster never changed, this line did.

     Verified against the real Friday roster he pasted, same people both runs:
       hospitality to 10PM → OT 1 night gap 5:30-10
       hospitality to 8PM  → zero gaps
     The engine was doing the correct thing with a station that was open two
     hours longer than it really is: it held a 5-to-10 body on Hospitality past
     closing and left OT 1 bare.
     ⚠️ If Hospitality really is meant to run to 10PM, this revert is wrong and
     the fix is a body scheduled to 10, not a template edit. Ask before keeping
     this if that Jul 26 note was a deliberate operational change. */
  /* 8AM-10PM, EVERY DAY. Matt, Jul 30: "hospitality is now until 10 everyday."
     The Jul 26 change to 10PM was a real operational change, not a slip.
     ⚠️ THE GOOGLE SHEET STILL PRINTS (8AM-8PM) ON EVERY TAB AND IS STALE HERE.
     I reverted this line to 8PM off the sheet and Matt corrected it. The sheet
     is not authoritative for station hours; neither is the "Daily Setup
     Reference" doc, which is generated from THIS FILE. Ask him. */
  st("hospitality", "HOSPITALITY", "DINING", [blk(T(8), T(22))], "REFRESH /TABLE TOUCHES"),
  /* ⚠️ NO NIGHT BLOCK MON-WED. Matt, Jul 30: "no cleanliness on mon to wed night
     and 5-8 thu to sat." The Jul 26 cut was RIGHT for these three days; the
     Google Sheet's Mon-Wed tabs still print the old 5PM-10PM and are stale.
     I briefly restored the night block here off the sheet alone and Matt
     corrected it — the sheet is not authoritative on this row.
     Thursday and the weekend set their own hours below. */
  st("cleanliness", "CLEANLINESS", "DINING", [blk(T(11, 15), T(14))], "BATHROOMS / PLAYPLACE"),
  st("training", "TRAINING", "TRAINING", null, "🔥"),
  st("trainer", "TRAINER", "TRAINING", null, "♠️"),
  st("otCaptain", "OT CAPTAIN", "OUTSIDE", [blk(T(6), T(22))], "TABLETS AND CARD READERS"),
  st("ot1", "OT 1", "OUTSIDE", [blk(T(6), T(22))], "TABLETS AND CARD READERS"),
  st("ot2", "OT 2", "OUTSIDE", [blk(T(11, 15), T(14))], "TABLETS AND CARD READERS"),
  st("leaderDt", "LEADER DT", "LEADERSHIP", [blk(T(5, 15), T(23))], "TRANSITIONS"),
  st("leaderFc", "LEADER FC", "LEADERSHIP", [blk(T(5, 45), T(22))], "MONEY"),
  /* Matt, Jul 31 2026: "add director and then AD on shift x2 for both front
     and back." Director sits above the AD rows. All three are hours:null like
     the AD rows already were — no posted hours, every cell open, filled by
     hand, and the engines never place into them. Duties left blank on the new
     rows rather than invented; leaders type the day's task on the board. */
  st("dirFoh", "DIRECTOR", "LEADERSHIP", null, ""),
  st("adFoh1", "ASSISTANT DIRECTOR", "LEADERSHIP", null, "COMPLETE PROBIZ LISTS"),
  st("adFoh2", "ASSISTANT DIRECTOR", "LEADERSHIP", null, "ECOSURE WALKTHROUGH"),
];

const FOH_THURSDAY = () => {
  const s = FOH_WEEKDAY();
  const g = (id) => s.find((x) => x.id === id);
  g("expo1").hours = [blk(T(11), T(21))];       // Thu: Expo 1 to 9PM
  g("register3").hours = [blk(T(11), T(20))];   // Thu: Register 3 11AM-8PM
  // Jul 26 2026 — Thursday takes ONLY the Register 2 9-11 cut. The Mon-Wed
  // Traditional Bagger 2-5 cut and the Mon-Wed Cleanliness night cut are
  // restored here (Matt: bagger 2-5 is Mon-Wed, cleanliness 5-8 is Mon-Wed).
  g("traditionalBagger").hours = [blk(T(11), T(22))];
  // Matt, Jul 30: "5-8 thu to sat". Night ends at 8, not 10.
  g("cleanliness").hours = [blk(T(11, 15), T(14)), blk(T(17), T(20))];
  return s;
};

const FOH_WEEKEND = () => {
  const s = FOH_WEEKDAY();
  const g = (id) => s.find((x) => x.id === id);
  g("expo1").hours = [blk(T(11), T(21))];                       // 11AM-9PM
  g("expo2").hours = [blk(T(11, 15), T(21))];                   // continuous 11:15AM-9PM
  g("register1").hours = [blk(T(6), T(21))];                    // 6AM-9PM — real all day
  g("register1").cellOverrides = undefined;
  g("register2").hours = [blk(T(8, 30), T(21))];                // 8:30AM-9PM
  g("register3").hours = [blk(T(11), T(14))];                   // 11AM-2PM
  g("ot2").hours = [blk(T(11, 15), T(20))];                     // 11:15AM-8PM
  g("traditionalBagger").hours = [blk(T(11), T(22))];           // Jul 26: 2-5 cut is Mon-Wed only
  // ── July 17, 2026 — WEEKEND SPOT COUNT (Matt). Fri/Sat lunch is 17 body
  // spots + 2 leaders, and mid is 14 + 2; the weekend roster is written to
  // match exactly, so a body left over is a template bug, not a shortage.
  // Two rows were one short:
  //  • DT MOBILES — ⚠️ SUPERSEDED Jul 26 2026. It ran through lunch as a real
  //    body spot from Jul 17; Matt has now cut that body and the leader bags
  //    it, so the row is back to 8:30-11 with a lunch ✔️. See below.
  //  • CLEANLINESS — the 11:15-2 + 5-10 split closes it 2-5, but Matt counts
  //    it as a real MID spot ("2-5 … hospitality and cleanliness"). Made
  //    continuous on the weekend so mid opens. Lunch/night are unchanged;
  //    Bronson's Cleanliness lock is unaffected (he's 11:15-2).
  // Verified on the real Fri 7/17 roster: every daypart balances with zero
  // unplaced and zero gaps — breakfast 9/9, lunch 17/17, mid 14/14, night
  // 14 cells / 15 bodies via the Maria→Hanna handoff.
  // Jul 26 2026 — Matt cut the 11-2 DT Mobiles body; the leader bags it, same
  // as the weekday. Hours go back to 8:30-11 and lunch returns to a ✔️.
  const dtm = g("dtMobiles");
  dtm.hours = [blk(T(8, 30), T(11))];                            // 8:30AM-11AM
  dtm.cellOverrides = { lunch: "✔️", mid: "✔️", night: "✔️" };
  /* 11:15AM-8PM continuous. Matt, Jul 30: "5-8 thu to sat" — the night block
     ends at 8, not 10. Kept CONTINUOUS rather than split so 2-5 stays an open
     mid spot, which is his Jul 17 ruling ("2-5 … hospitality and cleanliness")
     and is unchanged by the new close time. */
  g("cleanliness").hours = [blk(T(11, 15), T(20))];
  // Leader stations become real staffed stations on the weekend:
  // Jul 26 2026 — Matt cut the 11-2 FC Mobile Bagger body; the leader covers
  // it, so this reverts to the weekday pure-leader row (the same leader is
  // now on DT Mobiles and Mobile Bagger at lunch — Matt: "they cover 2 spots").
  const mb = g("mobileBagger");
  mb.leader = true;
  mb.hours = null;
  mb.cellOverrides = undefined;
  const dd = g("drinksDesserts");
  dd.leader = false;
  dd.cellText = undefined;
  dd.hours = [blk(T(9), T(11))];                                // 9AM-11AM
  dd.cellOverrides = { lunch: "✔️", mid: "✔️", night: "✔️" };
  // Jul 26 2026 — DRINKS 2 REMOVED (Matt: "kill drinks 2"). It was a
  // weekend-only fully-marked row (❌/✔️/❌/❌), never engine-filled, so
  // removing it changes no spot count.
  return s;
};

/* ============================== BOH ==================================== */

const BOH_WEEKDAY = () => [
  st("primaryPoint", "Primary Point", "PRIMARY", [blk(T(6), T(20))], "STOCK SAUCES / CHECK TICKET TIMES"),
  st("specialsPoint", "Specials / Point", "PRIMARY", [blk(T(5), T(23))], "CLEAN SPECIALS AREA / RESTOCK"),
  st("specialsGrilledBuns", "Specials / Grilled / Buns", "PRIMARY", [blk(T(11), T(14))], "CLEAN GRILL / RESTOCK BUNS",
    { cellOverrides: { breakfast: "✔️", night: "✔️" } }),
  st("biscuitsEggs", "Biscuits / Eggs", "SECONDARY", [blk(T(5, 15), T(11))], "CLEAN BISCUIT STATION / WRAP REMAINING"),
  st("nuggetsStrips", "Nuggets / Strips", "SECONDARY", [blk(T(6), T(23))], "CLEAN HOLDING / RESTOCK NUGGETS"),
  st("grilledSoupMac", "Grilled / Soup / Mac", "SECONDARY", [blk(T(8, 30), T(14))], "CLEAN SOUP AREA / CHANGE MAC WATER",
    { cellOverrides: { night: "✔️" } }),
  st("hashPFry", "Hash / P Fry", "FRY STATION", [blk(T(7), T(23))], "FILTER HASH OIL / CLEAN FRY AREA"),
  // Jul 26 2026 — the 9-11 body is CUT (Matt: "cut 9-11 fries every day").
  // Matt: "Secondary fry needs a split duties when there isn't a scheduled
  // person" — so breakfast joins lunch/mid as split duties. The ROW STAYS.
  st("hashSFry", "Hash/S Fry", "FRY STATION", null, "CLEAN SECONDARY FRY / RECORD WASTE",
    { cellOverrides: { breakfast: "split duties", lunch: "split duties", mid: "split duties", night: "✔️" } }),
  st("machines123", "Machines 1,2,3 — DT Lead", "MACHINES", [blk(T(8, 30), T(23))], "CLEAN MACHINES / CHECK OIL LEVELS"),
  st("machines45", "Machines 4,5 / Grills — FOH Lead", "MACHINES", [blk(T(17), T(23))], "FILTER MACHINES / STOCK BREADING TABLE"),
  st("breader", "Breader", "BREADING", [blk(T(5, 45), T(23))], "CLEAN BREADING TABLE (AFTER LAST ORDER)"),
  st("loader1", "Loader / Filter / Thaw", "BREADING", [blk(T(11), T(14))], "THAW ROTATION / FILTER SCHEDULE"),
  st("loader2", "Loader / Filter / Thaw", "BREADING", [blk(T(11), T(14))], "CHECK THAW TEMPS / ASSIST LOADER"),
  st("bulkPrep", "Bulk Prep", "PREP", [blk(T(5), T(23))], "LABEL & DATE ALL PREP / CLEAN PREP AREA"),
  st("truck", "Truck", "TRUCK / RECEIVING", [blk(T(5), T(8, 30))], "PUT AWAY TRUCK ORDER / BOX COMPACTOR"),
  st("dish1", "Dish 1", "DISH / SANITATION", [blk(T(17), T(23))], "DISH SINK / DISH SHELVING / MOP SINK"),
  st("kitchenLeadDt", "Kitchen Lead / DT", "LEADERSHIP", [blk(T(5), T(23))], "TRANSITIONS / WASTE LOG"),
  st("kitchenManagerFc", "Kitchen Manager / FC", "LEADERSHIP", [blk(T(17), T(23))], "ERQA / FOOD SAFETY CHECKS",
    { cellOverrides: { breakfast: "✔️", lunch: "✔️", mid: "✔️" } }),
  /* Same Jul 31 ask on the BOH side: Director above the ADs, and a second AD
     row so both houses carry AD-on-shift x2. Same hours:null edit-only shape. */
  st("dirBoh", "Director", "LEADERSHIP", null, ""),
  st("adBoh", "Assistant Director", "LEADERSHIP", null, "COMPLETE PROBIZ LISTS / WALK KITCHEN"),
  st("adBoh2", "Assistant Director", "LEADERSHIP", null, ""),
  // TRAINING mirrors the FOH template exactly: no posted hours, every cell
  // open, EDIT-ONLY (Matt: "Training and trainer are edit only"). Listed LAST
  // so buildDayBoard's first-appearance section order puts it at the bottom
  // of the BOH board. Added Jul 24 2026 — BOH had no training rows at all.
  st("training", "TRAINING", "TRAINING", null, "🔥"),
  st("trainer", "TRAINER", "TRAINING", null, "♠️"),
];

const BOH_THURSDAY = () => {
  const s = BOH_WEEKDAY();
  const g = (id) => s.find((x) => x.id === id);
  g("primaryPoint").hours = [blk(T(6), T(22))];                 // 6AM-10PM
  // July 16: Thursday's two odd-ones-out REMOVED — it now matches the other
  // weekdays for PRIMARY and DISH, so both lines below are simply gone and the
  // weekday defaults stand:
  //   • Specials / Grilled / Buns was forced to (Leader) here, leaving only
  //     TWO open PRIMARY stations at lunch. It's back to the weekday
  //     [11AM-2PM] real station → THREE people on PRIMARY 11-2 every day.
  //   • Dish 1 had a lunch block (11-2 + 5-11). It's back to the weekday
  //     [5PM-11PM] → no lunch dish position.
  // WHY: Chloe reported the auto setup putting the buns person on Dishes at
  // lunch (Ivanna, Thu 7/16) and the team following it. With a third
  // Boards-1 body coded PRIMARY and nowhere to seat them, the Pass 2 fallback
  // dropped her on the only other open cell — Dish 1 lunch. The engine did
  // exactly what this template told it. Matt: "Eliminate the lunch dish
  // position and have 3 people on primary 11-2 everyday."
  g("nuggetsStrips").hours = [blk(T(6), T(22))];                // 6AM-10PM
  const gsm = g("grilledSoupMac");
  gsm.hours = [blk(T(8, 30), T(23))];                           // 8:30AM-11PM
  gsm.cellOverrides = undefined;                                // open mid/night now
  g("loader1").hours = [blk(T(8, 30), T(14))];                  // 8:30AM-2PM
  return s;
};

const BOH_WEEKEND = () => {
  const s = BOH_WEEKDAY();
  const g = (id) => s.find((x) => x.id === id);
  g("primaryPoint").hours = [blk(T(6), T(22))];                 // 6AM-10PM
  g("nuggetsStrips").hours = [blk(T(6), T(22))];                // 6AM-10PM
  const gsm = g("grilledSoupMac");
  gsm.hours = [blk(T(8, 30), T(23))];                           // 8:30AM-11PM
  gsm.cellOverrides = undefined;
  // Jul 26 2026 — 9-11 cut here too, but the weekend keeps its 11-2 body.
  const hsf = g("hashSFry");                                    // staffed through lunch
  hsf.hours = [blk(T(11), T(14))];                              // outcome: 11AM-2PM
  hsf.cellOverrides = { breakfast: "split duties", mid: "✔️", night: "✔️" };
  g("machines45").hours = [blk(T(11), T(14)), blk(T(17), T(23))]; // adds 11-2 lunch
  const l1 = g("loader1");
  l1.hours = [blk(T(8, 30), T(14)), blk(T(17), T(20))];           // 8:30-2 + 5-8
  l1.cellOverrides = { mid: "✔️" };                               // sheet: lead covers 2-5, not ❌
  const kmfc = g("kitchenManagerFc");
  kmfc.hours = [blk(T(11), T(23))];                             // opens 11AM
  // Sheet marks mid ✔️ on Fri/Sat: Machines 4,5 is closed 2-5PM, so there is
  // never a second Machines person for Pass 3 to promote to Manager at mid —
  // the Kitchen Lead covers. Leaving this open produced a permanent blank.
  kmfc.cellOverrides = { breakfast: "✔️", mid: "✔️" };
  // Dish 1: sheet label says 11AM-2PM but lunch is ❌ and it is staffed at
  // night — encoded as 5PM-11PM (see header note). Weekday default already is.
  return s;
};

