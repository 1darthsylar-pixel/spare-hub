/* ============================================================================
   holidayPaste.test.mjs — a ControlPoint holiday block becomes store hours

       node holidayPaste.test.mjs

   Matt, Aug 21 2026: "i don't want to type them in. i want you to."

   He cannot be typed for: writing store hours needs a signed-in session, and
   hand-writing the store's database bypasses every writer in storeHours.js. So
   the typing has to stop being necessary.

   ⚠️⚠️ THE FIXTURE IS HIS REAL PAGE, transcribed from the ControlPoint
   screenshots he sent, including the two channels that are switched off and
   print a default of 6:00 am to 9:00 pm on every single holiday — Labor Day
   where the restaurant shuts at 4pm, Christmas Eve, New Year's Eve, and days
   the store never opens at all. Matt: "its just a default for control point to
   show." A parser that took the widest window, or the earliest open, or simply
   the first row it met, would put the store open until 9pm on Christmas Eve.
   ============================================================================ */
import { parseHolidayPaste, readClock, readDate, channelOf, newOnly, lateForAHoliday, HOLIDAY_CLOSE } from "./holidayPaste.js";

let pass = 0; const fails = [];
const t = (label, cond, extra) => {
  if (cond) { pass++; console.log("  ok    " + label); }
  else { fails.push(label); console.log(`  FAIL  ${label}${extra === undefined ? "" : "  " + JSON.stringify(extra)}`); }
};
const g = (n) => console.log(`\n── ${n}`);

/* Transcribed from the ControlPoint screenshots, Gate City 04010. */
const PASTE = `
04010 · Gate City FSU

Labor Day    09/07/2026    Edit hours
Restaurant (Dine-In, Carry-out, Catering Pick-up)    10:30 am  to  4:00 pm
Drive Thru    10:30 am  to  4:00 pm
Curb Side    6:00 am  to  9:00 pm
3rd Party Delivery    10:30 am  to  4:00 pm
CFA Delivery    6:00 am  to  9:00 pm
Catering Delivery    Closed

Thanksgiving Day    11/26/2026    Not editable
Restaurant (Dine-In, Carry-out, Catering Pick-up)    Closed
Drive Thru    Closed
Curb Side    Closed
3rd Party Delivery    Closed
CFA Delivery    Closed
Catering Delivery    Closed

Black Friday    11/27/2026    Edit hours
Restaurant (Dine-In, Carry-out, Catering Pick-up)    6:00 am  to  9:00 pm
Drive Thru    6:00 am  to  10:00 pm
Curb Side    6:00 am  to  9:00 pm
3rd Party Delivery    6:00 am  to  10:00 pm
CFA Delivery    6:00 am  to  9:00 pm
Catering Delivery    6:00 am  to  9:00 pm

Christmas Eve    12/24/2026    Edit hours
Restaurant (Dine-In, Carry-out, Catering Pick-up)    6:00 am  to  4:00 pm
Drive Thru    6:00 am  to  4:00 pm
Curb Side    6:00 am  to  9:00 pm
3rd Party Delivery    6:00 am  to  4:00 pm
CFA Delivery    6:00 am  to  9:00 pm
Catering Delivery    Closed

Christmas Day    12/25/2026    Not editable
Restaurant (Dine-In, Carry-out, Catering Pick-up)    Closed
Drive Thru    Closed
Curb Side    Closed
3rd Party Delivery    Closed
CFA Delivery    Closed
Catering Delivery    Closed

New Year's Eve    12/31/2026    Edit hours
Restaurant (Dine-In, Carry-out, Catering Pick-up)    6:00 am  to  4:00 pm
Drive Thru    6:00 am  to  4:00 pm
Curb Side    6:00 am  to  9:00 pm
3rd Party Delivery    6:00 am  to  4:00 pm
CFA Delivery    6:00 am  to  9:00 pm
Catering Delivery    Closed

New Year's Day    01/01/2027    Edit hours
Restaurant (Dine-In, Carry-out, Catering Pick-up)    10:30 am  to  4:00 pm
Drive Thru    10:30 am  to  4:00 pm
Curb Side    6:00 am  to  9:00 pm
3rd Party Delivery    10:30 am  to  4:00 pm
CFA Delivery    6:00 am  to  9:00 pm
Catering Delivery    Closed
`;

g("0. the pieces");
t("10:30 am is 630 (control)", readClock("10:30 am") === 630, readClock("10:30 am"));
t("★ 4:00 pm is 960, not 240", readClock("4:00 pm") === 960, readClock("4:00 pm"));
t("★ 12:00 am is midnight, not noon", readClock("12:00 am") === 0, readClock("12:00 am"));
t("★ 12:00 pm is noon", readClock("12:00 pm") === 720, readClock("12:00 pm"));
t("★ nonsense is null, not a guess", readClock("sometime") === null && readClock("25:00 am") === null);
t("09/07/2026 reads as an ISO date (control)", readDate("09/07/2026") === "2026-09-07");
t("★ an impossible date is refused rather than rolled forward", readDate("02/30/2026") === null, readDate("02/30/2026"));

g("1. ★★ the Restaurant row is the store, and nothing else is");
{
  /* ⚠️ "Catering Pick-up" LIVES INSIDE THE RESTAURANT LABEL and "Catering
     Delivery" is its own row. A loose match put a Closed delivery row onto the
     whole store. */
  t("★★ the Restaurant label is the restaurant, despite saying Catering",
    channelOf("Restaurant (Dine-In, Carry-out, Catering Pick-up)   10:30 am to 4:00 pm") === "restaurant");
  t("★★ and Catering Delivery is not", channelOf("Catering Delivery   Closed") === "cateringDelivery");
  t("★ the two switched-off channels are recognised, so they can be ignored on purpose",
    channelOf("Curb Side  6:00 am to 9:00 pm") === "curbSide"
    && channelOf("CFA Delivery  6:00 am to 9:00 pm") === "cfaDelivery");
}

g("2. ★★ his real page");
const out = parseHolidayPaste(PASTE);
{
  t("it parsed (control)", !out.error, out.error);
  t("★★ seven holidays", out.days.length === 7, out.days.map((d) => d.iso));
  t("★ and nothing was quietly dropped", out.skipped.length === 0, out.skipped);

  const by = Object.fromEntries(out.days.map((d) => [d.iso, d]));

  /* ⚠️⚠️ THE WHOLE POINT. Curb Side and CFA Delivery say 6:00am-9:00pm on
     every one of these, and none of it may reach the store's hours. */
  t("★★★ Labor Day is 10:30 to 4, NOT 6 to 9",
    by["2026-09-07"].open === 630 && by["2026-09-07"].close === 960, by["2026-09-07"]);
  t("★★★ Christmas Eve is 6 to 4, NOT 6 to 9",
    by["2026-12-24"].open === 360 && by["2026-12-24"].close === 960, by["2026-12-24"]);
  t("★★★ New Year's Eve is 6 to 4, NOT 6 to 9",
    by["2026-12-31"].open === 360 && by["2026-12-31"].close === 960, by["2026-12-31"]);
  t("★ New Year's Day is 10:30 to 4",
    by["2027-01-01"].open === 630 && by["2027-01-01"].close === 960, by["2027-01-01"]);
  t("★ Black Friday is 6 to 9",
    by["2026-11-27"].open === 360 && by["2026-11-27"].close === 1260, by["2026-11-27"]);

  /* ⚠️ THE TWO THAT MATTER MOST. A missing Closed does not look like an error;
     it rosters a full crew for a shut store and the board looks normal. */
  t("★★★ Thanksgiving is Closed", by["2026-11-26"].closed === true && by["2026-11-26"].open === null);
  t("★★★ Christmas Day is Closed", by["2026-12-25"].closed === true && by["2026-12-25"].open === null);
  t("★ and a Closed day carries no hours at all",
    by["2026-11-26"].close === null && by["2026-12-25"].close === null);

  /* The drive thru genuinely outruns the dining room on Black Friday. Kept as
     its own value so the screen can offer it as a station cut. */
  t("★★ Black Friday's drive thru is kept separately, at 10pm",
    by["2026-11-27"].driveThru && by["2026-11-27"].driveThru.close === 1320, by["2026-11-27"].driveThru);
  t("★ and it did not leak into the store's close",
    by["2026-11-27"].close === 1260, by["2026-11-27"].close);
  t("★ the holiday names came through", by["2026-11-26"].name === "Thanksgiving Day", by["2026-11-26"].name);
}

g("3. ★★ what it must refuse rather than guess");
{
  const noRestaurant = parseHolidayPaste("Some Day  07/04/2026\nCurb Side  6:00 am to 9:00 pm\nCFA Delivery  6:00 am to 9:00 pm");
  t("★★ a card with no Restaurant row is skipped, by name", noRestaurant.days.length === 0 && noRestaurant.skipped.length === 1, noRestaurant);
  /* ⚠️ THAT IS THE EXACT SHAPE OF THE DANGER: two switched-off channels, both
     reading 6am-9pm, and nothing about the building. Taking them would open
     the store for fifteen hours on a day nobody knows about. */
  t("★ and its reason names the missing row", /Restaurant/.test(noRestaurant.skipped[0]), noRestaurant.skipped);

  const backwards = parseHolidayPaste("Some Day  07/04/2026\nRestaurant (Dine-In)  9:00 pm to 6:00 am");
  t("★★ a close before the open is refused, not repaired", backwards.days.length === 0, backwards);

  t("★ an empty paste says so", !!parseHolidayPaste("").error);
  t("★ and prose is not silently read as a holiday", !!parseHolidayPaste("hello there").error);
}

g("4. ★ it says what would actually change");
{
  const stored = { dates: {
    "2026-11-26": { closed: true, open: null, close: null },
    "2026-09-07": { closed: false, open: 360, close: 1260 },   // wrong, the old default
  } };
  const d = newOnly(out.days, stored);
  t("★ already-right days are not counted as changes", d.same.length === 1 && d.same[0].iso === "2026-11-26", d.same.map((x) => x.iso));
  t("★★ a day whose hours differ is a change, not an add", d.change.length === 1 && d.change[0].iso === "2026-09-07", d.change.map((x) => x.iso));
  t("★ the rest are new", d.add.length === 5, d.add.map((x) => x.iso));
}

g("5. ★★ the store's own rule, checked against the page");
{
  /* Matt, Aug 13 2026: "for holidays we only open 10:30-4."
     And Aug 21 2026: "all holidays close at 4 if open."

     ControlPoint agrees on four of the six open days and disagrees on exactly
     one. That disagreement is the finding, and it must reach a person rather
     than be resolved by whichever source the code happened to trust. */
  const by = Object.fromEntries(out.days.map((d) => [d.iso, d]));
  t("4pm is the rule (control)", HOLIDAY_CLOSE === 960);

  const late = out.days.filter(lateForAHoliday);
  t("★★ exactly one day breaks the store's own rule", late.length === 1, late.map((d) => `${d.name} ${d.close}`));
  t("★★ and it is Black Friday", late[0] && late[0].iso === "2026-11-27", late[0] && late[0].iso);

  /* ⛔ FLAGGED, NOT CORRECTED. Guessing 4pm on a day the store trades until 9
     leaves a busy Friday short of everybody; guessing 9pm on a day it shuts at
     4 rosters a full crew for five hours of a closed building. */
  t("★★★ Black Friday is NOT silently changed to 4pm", by["2026-11-27"].close === 1260, by["2026-11-27"].close);
  t("★ the four that follow the rule are not flagged",
    !lateForAHoliday(by["2026-09-07"]) && !lateForAHoliday(by["2026-12-24"])
    && !lateForAHoliday(by["2026-12-31"]) && !lateForAHoliday(by["2027-01-01"]));
  /* ⚠️ A CLOSED DAY IS NOT LATE. It has no close time at all, and reading null
     as 0 or as "before 4pm" are both wrong in ways that read as fine. */
  t("★★ a closed day is never flagged as late",
    !lateForAHoliday(by["2026-11-26"]) && !lateForAHoliday(by["2026-12-25"]));
  t("★ and exactly 4pm is not late", !lateForAHoliday({ closed: false, close: 960 }));
  t("★ one minute past is", lateForAHoliday({ closed: false, close: 961 }));
}

console.log(`\n${fails.length ? `${fails.length} FAILED, ` : ""}${pass} passed`);
if (fails.length) process.exit(1);
