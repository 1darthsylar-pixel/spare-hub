import React, { useState, useMemo, useRef, useEffect } from "react";
/* The one raised look, shared with every tool — see cardStyle.js. */
import { CARD_3D, CARD_3D_SOFT, cardSurface, accentEdge } from "./cardStyle.js";
import { Check } from "lucide-react";
import { kvGet, kvSet, kvGetResult } from "./store";
import { HR_TEAM, loadHRTeam } from "./HRConsole.jsx";
import RosterImportTraining from "./RosterImportTraining.jsx";
import { CHECKLIST_CARDS } from "./skillsChecklists.js";
/* ★ THE SKILLS PANEL MOVED OUT (Bri, Jul 30 2026 — see skillsPanel.jsx).
   It is imported back rather than copied, so Team Training and a Leadership
   101 class render the one component against the one storage key. ACCENT,
   eyebrowStyle and SideEdit went with it and come back the same way: a second
   copy of any of them is a thing that drifts. */
import SkillsChecklists, { slug, ACCENT, eyebrowStyle, SideEdit } from "./skillsPanel.jsx";
import { effectiveRole } from "./accessOverrides.js";
import { TRAINING_ADMIN_ROLES } from "./adminRoles.js";
import { HR_RANK_BY_TITLE } from "./hrRoster.js";
import { HUB_DECKS, decksFor } from "./hubTraining.js";

// Gate City Training tile — videos + station checklists + leader training
//
// Four views inside one tile, toggled by the pill switcher under the hero:
//   1) "Training Videos"     — Hub training videos (all tiers)
//   2) "Station Checklists"  — FOH / BOH training checklists (Leader+)
//   3) "Roster Progress"     — every trainee's completion, live (Leader+)
//   4) "Leader Training"     — the two slideshow modules that used to be their
//                              own People & Team tiles: Documenting Team Members
//                              and Roster Import (Leader+)
//
// The Leader Training view shows two launcher cards; tapping one renders that
// module full-screen. Both modules take an onBack prop wired to return here to
// the Leader Training tab (not all the way out to the tool grid), so the two
// modules that used to be top-level tiles now nest cleanly.
//
// Tier gating: pass the signed-in person's tier as a prop,
//   <TrainingSite tier={2} />   // 1 = Team Member, 2 = Leader, 3 = Director
// Videos at or below that tier are shown, same as before. The Station
// Checklists, Roster Progress, and Leader Training tabs only appear for
// tier >= 2 (Leader/Director) or when no tier prop is passed at all (admin
// preview). Team Members never see those tabs.


/* The five decks, their coverage lists and the gate rule all live in
   hubTraining.js now. App.jsx needs the same list to decide which deck to
   REQUIRE on someone's first sign-in, and two copies of "which deck is yours"
   would drift silently: the tile would offer one and the gate would demand
   another. See the header there for why each deck gates the way it does, and
   for the Director-lockout bug that rule fixed. */
const VIDEOS = HUB_DECKS;


/* ---------------------------------------------------------------
   LEADER TRAINING MODULES — the two slideshow tiles that used to
   live in People & Team, now launched from inside this tile.
--------------------------------------------------------------- */

const LEADER_MODULES = [
  {
    key: "rosterimport",
    title: "Importing the Roster",
    desc: "Pull the daily schedule from HotSchedules into the Auto Assignment board",
    color: "#DD0031", // brand red
    Component: RosterImportTraining,
  },
];

/* ---------------------------------------------------------------
   STATION CHECKLIST DATA — DR / DT / FC pulled from the Trello
   training templates; BOH rebuilt from the CFA Pathway Trainer
   Facilitator Cards + Operational Excellence Cards.
--------------------------------------------------------------- */

const STATIONS = {
  FOH: {
    code: "FOH",
    name: "Front of House",
    color: "#6B4A6E",
    note:
      "Pathway FOH modules — role-based. Supersedes the old DR / DT / FC boards; " +
      "everything worth keeping from those was merged in. Items prefixed 'OpEx ·' " +
      "are the Operational Excellence standards for that role.",
    sections: [
      {
        title: "POS & Menu Training · 60 min",
        items: [
          "All POS buttons — condiments",
          "All POS buttons — entrees, sides, desserts, beverages",
          "All POS buttons — salads and toppings/dressings for each",
          "All POS buttons — seasonal items",
          "Editing menu items",
          "Basic catering",
          "Ingredients list",
          "Store specific local items",
          "Knowledge of the breakfast menu",
          "Knowledge of the lunch menu",
          "Speed",
          "Guest descriptions based on destination — table marker, clothing, etc.",
          "Uses accurate names and descriptors for dine in and carry out guests",
          "Payment methods — gift card, Apple Pay, cash, etc.",
          "Scanning the CFA App and DOCs",
          "Language of hospitality when taking an order",
          "Navigating orders with high complexity",
          "Responding to allergy and health questions",
          "Fulfilling beverage orders before the guest leaves the front counter",
          "Directing guests to the proper waiting area once the order is completed",
          "Knows the sales channels — mobile, third party, dine-in, carry-out, catering, curbside",
          "Takes practice orders on the iPad/POS (Practice Orders 1 & 2)",
          "Practices greeting Team Members walking in the door",
          "OpEx · Tastefully describes menu items, locates the ingredient list for allergy questions",
          "OpEx · Never assumes what a guest may be allergic or sensitive to",
          "OpEx · Personalizes the order to enhance the guest's meal",
          "OpEx · Menu knowledge — enters orders quickly and efficiently",
          "OpEx · Asks clarifying questions and repeats orders",
          "OpEx · 2-minute rule — order taken within 2 minutes of entering the line",
          "OpEx · Uses elevated language and addresses the guest by name",
          "OpEx · Core 4 — eye contact and a smile",
          "OpEx · Warm welcome and fond farewell",
          "OpEx · Cleans and tidies counters between transactions",
        ],
      },

      {
        title: "Upstream Ordering",
        items: [
          "Storing / recalling orders",
          "Repeating orders",
          "Asks for sauces / makes drinks",
          "Accurate names & descriptors",
          "Understands the Flex role",
          "Sees and corrects bottlenecks",
        ],
      },

      {
        title: "Bagging · 45 min",
        items: [
          "Identifying product locations in chutes & lowboys",
          "Bag sizes and what goes in each size bag",
          "Bagging hot and cold items",
          "Quality hold times for fries, sandwiches, and boxed items",
          "Bagging matrix — condiments and additional items that pair with menu items",
          "Reading labels and screens correctly",
          "Correct bumping from the screen",
          "Reading the KPS and preparing the items in order",
          "Preparing meals for different sales channels — 3PD, dine-in, carry out",
          "Knows the store's bagging type — task-oriented or order-based",
          "Proper communication with the kitchen",
          "Proper communication with the server(s)",
          "Proper communication with window / expo",
          "Bags hot and cold items separately",
          "Bags soup separately from other items",
          "Bags 2+ bags in a shopping bag",
          "Does not overfill bags",
          "Napkins between fries and sauces for bagged meals",
          "Bags a kid's meal",
          "Bags soup",
          "Bags prep items",
          "Bags brownies + cookies",
          "Bags entrees",
          "Bags sides",
          "Passes the condiment quiz for each item",
          "OpEx · Wears gloves — no bare hand contact with food",
          "OpEx · Verifies food quality and freshness",
          "OpEx · FIFO when removing products from the chutes",
          "OpEx · Checks date labels so cold items are served within hold times",
          "OpEx · Assembles quickly — hot stays hot, cold stays cold",
          "OpEx · Follows the bagging matrix for correct condiments",
          "OpEx · Places the service receipt on the bag or tray",
          "OpEx · Communicates any waits for menu items",
          "OpEx · Arranges orders neatly in the bag or on trays",
          "OpEx · Food and logo face the same way on trays",
          "OpEx · Serves all meals 'dine ready'",
        ],
      },

      {
        title: "Serving",
        items: [
          "Reading tickets for accuracy",
          "Searching for guests before addressing the name — no calling names out",
          "Repeating carry out orders",
          "Returning table markers from dine in orders",
          "Discarding serving receipts after serving",
          "Making mobile and Door Dash beverages",
          "Confirming Door Dash orders with the deliverer before sealing the bag with a sticker",
        ],
      },

      {
        title: "Drinks & Desserts · 45 min",
        items: [
          "Portion control on the scale — milkshake, frosted beverage, icedream cone",
          "Reading the KPS and preparing the items in order",
          "Where to place completed drinks & desserts based on destination",
          "Placing beverages in order",
          "Preparing third party delivery drinks/desserts",
          "Beverage dimple guide",
          "Proper ice portioning and food safety when handling ice",
          "Preparing bulk lemonade & diet lemonade",
          "Brewing tea",
          "Preparing coffee base & hot coffee",
          "Makes a milkshake to weight on the scale",
          "Makes a frosted beverage to weight",
          "Makes an icedream cone to weight",
          "Marks soda options with the correct dimples using the guide",
          "OpEx · Wipes excess spillage off the sides of cups",
          "OpEx · Packaging is clean and undamaged",
          "OpEx · Portion control — over-portioning raises food cost, under-portioning hurts the guest",
          "OpEx · Uses the beverage label and presses the correct dimples",
          "OpEx · Puts orders with 2+ beverages in cup carriers",
          "OpEx · Keeps the area clean and stocked",
          "OpEx · Wipes down the icedream machine often",
          "OpEx · Sanitizes milkshake spindles every 4 hours",
        ],
      },

      {
        title: "Hospitality · 45 min",
        items: [
          "1st mile behaviors",
          "2nd mile behaviors",
          "CORE 4",
          "HEARD model",
          "Guest awareness",
          "How to clean a table",
          "Quick table turnover",
          "How to sweep and mop — correct colored brooms and mops",
          "Different chemicals and proper usage",
          "Cleaning supplies — blue, red, yellow",
          "Maintaining sanitizer water properly",
          "Knowledge of the bodily fluid cleaning procedure",
          "Proper window cleaning",
          "Cleaning trays",
          "Table touch-ins",
          "Restocking condiment stations — including the drawers",
          "Emptying trash receptacles",
          "Cleans tables and windows",
          "Performs table touch-ins",
          "Clears trays",
          "Refreshes beverages at the end of the counter and tableside",
          "OpEx · Provides additional sauce, utensils, and beverage refreshments to dining room guests",
          "OpEx · Anticipates guest needs — high chairs, opening doors",
          "OpEx · Quickly clears and cleans tables as guests depart",
          "OpEx · Clean and comfortable seating areas",
          "OpEx · Creates personal connections through frequent table touch-ins",
          "OpEx · Keeps the condiment station stocked",
        ],
      },

      {
        title: "Restroom Checks",
        items: [
          "Consistent checks (hourly)",
          "Stocking — seat liners, toilet paper, paper towels, hand soap, hand sanitizer",
          "Change large trash cans",
          "Change small trash cans in the ladies restroom",
          "Mirrors",
          "Cleaning out sinks and wiping down the counter",
          "Floors — sweeping and mopping with the correct colored items",
        ],
      },

      {
        title: "Parking Lot & Perimeter Checks",
        items: [
          "Multiple laps to ensure all areas are covered",
          "Uses the proper bucket and grabber",
          "Drive Thru included",
          "Patio included",
          "Consistent checks (hourly)",
        ],
      },

      {
        title: "PlayPlace Checks",
        items: [
          "Behind benches",
          "Floor",
          "Windows",
          "Consistent checks (hourly)",
        ],
      },

      {
        title: "iPOS & OMD · Exterior Drive Thru Play · 45 min",
        items: [
          "'Gearing Up' safety procedures when working outside",
          "Where to find iPads, headsets, safety vests, handheld menus",
          "Taking outside orders and payments",
          "Labeling guest orders — license plate, vehicle make & model",
          "Correct storing of cars (for up to 4 iPads)",
          "Sequencing cars if needed",
          "Always gives the guest a total",
          "Knowledge of technology setup / troubleshooting",
          "Uses the 'No Condiment / No Sauce' button when needed",
          "Giving guests correct instructions for traffic merging and payments",
          "Pulling cars forward using elevated language",
          "Setting up OMD cones",
          "When and where to park cars",
          "Tenders orders in the correct order",
          "Provides receipts to each guest and directs them to the window",
          "Communicates any changes with the lead inside",
          "Knows the store's DT layout — escape lane, merge points, misters, DT door, Mobile Thru",
          "Knows how inside + outside teams communicate",
          "Role plays the OMD position",
          "Role plays iPOS taking outside orders",
          "OpEx · iPOS tastefully describes menu items and locates the ingredient list for allergy questions",
          "OpEx · OMD hands out meals quickly to ensure freshness",
          "OpEx · iPOS enters the correct vehicle description & name",
          "OpEx · iPOS asks clarifying questions and repeats orders",
          "OpEx · iPOS closes gaps without making the guest feel rushed or unsafe",
          "OpEx · OMD confirms all items are in the bag before handing the order over",
          "OpEx · iPOS offers handheld menus to assist with questions",
          "OpEx · iPOS uses elevated language and the CORE 4",
          "OpEx · OMD greets the guest by name",
          "OpEx · OMD stays connected through the transaction and gives a fond farewell",
        ],
      },

      {
        title: "Mobile Cash",
        items: [
          "Always give the guest a total",
          "Accurate car descriptors",
          "Accurate names",
          "No storing / sequencing — only tendering",
          "Multiple cars use the same car (1 of 2, 2 of 2, etc.)",
          "Sign in as yourself",
          "Communicate with your lane buddy",
          "No lane hopping",
          "Close gaps — do not walk and talk with guests",
          "Gather all materials quickly",
          "Accurate condiments / no sauce if none needed",
          "Knowledge of the float position",
        ],
      },

      {
        title: "Headset & Window · Interior Drive Thru Play · 45 min",
        items: [
          "Where to find headsets + buttons and settings",
          "Headset order taking process — greeting, verbiage, storing orders",
          "Accuracy",
          "Repeating orders",
          "Providing totals",
          "Uses accurate names and car descriptors",
          "Window responsibilities with and without OMD",
          "Looks at car descriptors before recalling",
          "Reading tickets for accuracy",
          "Repeats names and orders before tendering",
          "Tendering orders",
          "Able to make corrections as needed",
          "Adjusting orders / communicating with the bagger",
          "Pairing beverages with meals",
          "Sends the correct meals and beverages",
          "Making connections at the window",
          "Pulling cars with 30+ second wait times",
          "When and where to park cars",
          "Knows the headset role and its times of use",
          "Greets guests over the headset (Headset Script)",
          "Role plays the window position",
          "OpEx · Headset tastefully describes menu items and locates the ingredient list",
          "OpEx · Window hands out meals quickly to ensure freshness",
          "OpEx · Window pairs the correct beverages with meals",
          "OpEx · Window verifies everything requested is in the bag — straws, sauce, napkins, utensils",
          "OpEx · Window parks guests when there's a wait, to keep the line moving",
          "OpEx · Headset greets the guest immediately — elevated language, by name",
          "OpEx · Window leaves the guest with a fond farewell",
          "OpEx · Uses a wait as a chance to connect with the guest",
        ],
      },

      {
        title: "Multitasking",
        items: [
          "Making drinks while taking orders",
          "Cleaning / serving during slow times",
          "Stocking (FIFO)",
          "Making salad kits",
          "Making desserts with correct portions",
          "Stuffing bags / assisting with expo between cars",
          "Stuffing kids meal bags",
        ],
      },

      {
        title: "Leaving at the End of Shift",
        items: [
          "Checks in with a leader before leaving",
          "Finishes tasks delegated by the leader before leaving if required",
        ],
      },
    ],
  },

  BOH: {
    code: "BOH",
    name: "Back of House",
    color: "#8B5E34",
    note:
      "Sections follow the Pathway Facilitator modules; the last items in each " +
      "are the Operational Excellence standards for that station.",
    sections: [
      {
        title: "Primary · 45 min",
        items: [
          "Buttering, toasting, and pickle placement",
          "Assembling an Original Chicken Sandwich with emphasis on folds",
          "Assembling a Chick-fil-A Deluxe Sandwich",
          "Assembling a Grilled Sandwich and Grilled Club",
          "Placing products in the correct chute",
          "Checking out AHA chicken kanbans",
          "Checking in AHA chicken kanbans",
          "Hot holding temperatures and taking the temperature of filets",
          "Reading the LEAN chutes iPad and preparing product accordingly",
          "Reading the KPS and preparing the items in order",
          "Rotates through preparing each sandwich type unassisted",
          "OpEx · Follows all hold times",
          "OpEx · Chicken held at 140°F or higher",
          "OpEx · Sanitizes food contact surfaces every 4 hours or when soiled",
          "OpEx · Works one order at a time — no batching sandwiches",
          "OpEx · Checks cheese selection on deluxe sandwiches for custom orders",
          "OpEx · Sweeps often to keep debris off the floor",
          "OpEx · Communicates with kindness to front of house",
        ],
      },

      {
        title: "Secondary · 45 min",
        items: [
          "Boxing 5-count, 8-count, 12-count, & 30-count nuggets",
          "Boxing 2-count, 3-count, 4-count, & 10-count strips",
          "Cupping 5-count, 8-count, 12-count, & 30-count grilled nuggets",
          "Placing products in the correct chute",
          "Checking out AHA chicken kanbans",
          "Checking in AHA chicken kanbans",
          "Cooking mac & cheese & cupping to the correct weight",
          "Preparing soup with soup base and shredded chicken & serving soup",
          "Preparing Cobb Salads",
          "Hot holding temperatures and using the nugget screening tool",
          "Reading the LEAN chutes iPad and preparing product accordingly",
          "Reading the KPS and preparing the items in order",
          "Rotates through preparing products from this station unassisted",
          "OpEx · Strip & nugget hold time drops to 5 minutes once boxed",
          "OpEx · Chicken held at 140°F or higher",
          "OpEx · Sanitizes food contact surfaces every 4 hours or when soiled",
          "OpEx · LCE recommended quantity in the chutes, on top of KPS orders",
          "OpEx · Marks the correct menu tab",
        ],
      },

      {
        title: "Machines & Fries · 45 min",
        items: [
          "Completing an express clean on a pressure fryer",
          "Dropping each type of chicken",
          "Starting the grill for each protein type",
          "Removing chicken from the machines and scanning into AHA at the respective station",
          "Completing an express clean on an open fryer",
          "Preparing Waffle Potato Fries",
          "Salting, scooping, serving, and holding Waffle Potato Fries",
          "Reading the KPS and preparing the items in order",
          "Knows what a boil out is and how to test oil quality",
          "Rotates through Waffle Potato Fries from cooking to serving",
          "OpEx · Fry hold time 5 minutes, 2 minutes once packaged",
          "OpEx · Waffle Potato Fries held at 170°F or higher",
          "OpEx · Changes gloves after touching uniform or non-food surfaces",
          "OpEx · Follows KPS so the right fry sizes are up at the right time",
          "OpEx · Clearly marks 'no salt' fries",
          "OpEx · Cleans oil drippings promptly, especially on the floor",
          "OpEx · Avoids contact with raw product/coater",
          "OpEx · Never places the handle on the front shelf of a fryer being loaded",
          "OpEx · Wipes the front shelf and area around the fryer with a damp sanitized towel",
          "OpEx · Avoids Filter Lockout and an express clean landing at the same time",
          "OpEx · Starts peak with the maximum cooking cycles",
          "OpEx · Moves the fryer from the knob/spindle — never dead weight or exhaust pipe",
        ],
      },

      {
        title: "Breading · 45 min",
        items: [
          "Breading & loading nuggets",
          "Breading & loading filets",
          "Breading & loading strips",
          "Loading grilled filets",
          "Loading grilled nuggets",
          "Communicating with the machine Team Member when chicken is ready to be dropped",
          "Maintaining the breading table",
          "Utilizing the LEAN breading iPad",
          "Reading the AHA kanban order above the machines with the LEAN breading iPad",
          "Knows the raw foot print, yellow color indicators, & cross contamination",
          "Rotates through breading nuggets & filets unassisted",
          "OpEx · Follows the breading procedure for each protein type, uses the sidekicks",
          "OpEx · Loads filets properly — loading drives filet quality",
          "OpEx · Watches the LEAN Breading iPad for drop sizes",
          "OpEx · Wears a yellow apron and never leaves the raw zone",
          "OpEx · Never touches machines without removing apron/gloves and washing hands",
        ],
      },

      {
        title: "Chicken Rotation & Fileting · 45 min",
        items: [
          "Reading the thaw cabinet allocations to decide what chicken to pull",
          "Pulling chicken from the freezer and restocking in the cabinet",
          "Date labeling the control label",
          "Reading the holding cabinet allocation to decide what chicken to filet",
          "Pulling chicken to filet from the thaw cabinets and moving the use first clip",
          "Fileting & trimming regular filets",
          "Preparing milk and egg wash",
          "Marinating grilled filets",
          "Draining & marinating grilled nuggets",
          "Prints a date label and filets chicken unassisted",
          "OpEx · Date labels chicken as soon as it leaves the freezer",
          "OpEx · Uses the raw-zone Prep-n-Print only",
          "OpEx · Trims fat from filets for quality",
          "OpEx · Never filets expired chicken",
          "OpEx · Moves the use first clip after every case",
          "OpEx · Wears a yellow apron and never leaves the raw zone",
        ],
      },

      {
        title: "Systems & Utilities · 45 min",
        items: [
          "Setting up the compartment sink and testing sanitizer",
          "Washing a dish from scrape to air dry",
          "Draining, cleaning, & sanitizing the sinks between raw and ready to eat dishes",
          "Preventing wet nesting",
          "Filling chemical bottles and each chemical's usage",
          "Taking out the trash",
          "Washes a dish unassisted",
          "Moving chicken from the line to the designated cool down area",
          "Setting the cool down chicken timer",
          "Printing a date label and why it matters",
          "Wrapping cool down chicken when the timer is up and placing it in the walk in cooler",
          "OpEx · Never stacks wet dishes — puts away only when completely dry",
          "OpEx · Never washes raw and ready to eat dishes at the same time",
          "OpEx · Runs the dish machine and compartment sink at the same time for speed",
          "OpEx · Cleans and sanitizes the compartment sink between raw and ready to eat",
        ],
      },

      {
        title: "Biscuits · 45 min",
        items: [
          "Setting up the biscuit table with necessary materials",
          "Sanitizing workstation before use",
          "Setting up the biscuit water dispenser",
          "Mixing biscuit dough",
          "Rolling out and preparing biscuits for baking",
          "Baking biscuits",
          "Plays a part in preparing one batch start to finish",
          "OpEx · Tests water is 40°F or lower before dispensing",
          "OpEx · Checks pans for carbon, black specks, or gray buildup",
          "OpEx · Selects the correct oven timer",
          "OpEx · Bakes continually so biscuits are always within hold time",
          "OpEx · Cleans biscuit mix and flour off nearby equipment and stations",
        ],
      },

      {
        title: "Breakfast Assembly · 45 min",
        items: [
          "Cutting a biscuit safely",
          "Toasting muffins and adjusting the toaster settings",
          "Assembling & wrapping each type of biscuit & muffin",
          "Baking mini bread",
          "Assembling & wrapping each type of Hash Brown Scramble Bowl",
          "Assembling each type of Hash Brown Scramble Burrito",
          "Assembling each count of Chick-n-Minis",
          "Practices the wrap for each type of breakfast sandwich",
          "Practices wrapping burritos",
        ],
      },

      {
        title: "Machines & Eggs · 45 min",
        items: [
          "Cooking folded yellow eggs",
          "Cooking folded white eggs",
          "Cooking scrambled eggs",
          "Dropping sausage",
          "Cooking and cutting bacon",
          "Cooking and boxing hashbrowns",
          "Drops 3 folded yellow eggs and one batch of scrambled eggs",
        ],
      },

      {
        title: "Breakfast Breading · 45 min",
        items: [
          "Opening the breading table",
          "Fileting breakfast chicken — the difference between breakfast & lunch",
          "Marinating grilled breakfast filets",
          "Dropping grilled breakfast filets",
          "Breading breakfast filets",
          "Maintaining the breading table throughout the day",
          "Practices breading breakfast filets",
          "Practices breading nuggets",
        ],
      },

      {
        title: "Prep · Prep Table · 60 min",
        items: [
          "Reading the LEAN Prep iPad or Build To Worksheet to determine how much to prepare",
          "Setting up & maintaining the prep table",
          "Knows where cut resistant gloves are and when to use them",
          "Preparing Fruit Cups",
          "Preparing Berry Parfaits",
          "Preparing Kale Crunch",
          "Preparing Side Salads",
          "Preparing Cool Wraps",
          "Preparing Southwest Salads",
          "Preparing Market Salads",
          "Preparing Cobb Salad Bases",
          "OpEx · Follows all expiration dates on prep ingredients",
          "OpEx · Does not use produce that fails quality standards",
          "OpEx · Checks the KPS for special order prep items",
          "OpEx · Follows the build to for cold prep items",
          "OpEx · Cleans & sanitizes prep countertops every 4 hours, on task change, or when soiled",
        ],
      },

      {
        title: "Prep · Bulk Prep · 60 min",
        items: [
          "Setting up the Saber King and inserting cartridges",
          "Chopping romaine filets",
          "Preparing produce wash and testing for proper concentration",
          "Washing grape tomatoes",
          "Washing strawberries",
          "Slicing strawberries",
          "Slicing 6x6 tomatoes",
          "Preparing Spring Mix lettuce & cabbage blend",
          "Sorting & tearing green leaf lettuce",
        ],
      },

      {
        title: "Prep · Mac & Cheese & Bakery · 60 min",
        items: [
          "Determining how much mac & cheese to prepare based on allocation",
          "Pulling mac & cheese from the walk in cooler",
          "Panning mac & cheese, labeling, & placing in the designated holding cooler",
          "Restocking mac & cheese from the walk-in freezer to the walk-in cooler",
          "Baking cookies",
          "Packaging cookies & brownies",
        ],
      },

      {
        title: "Prep · Prep Chicken · 60 min",
        items: [
          "Setting up the Hobart chicken slicer attachment",
          "Slicing grilled chicken",
          "Debreading chicken using the debreading tool",
          "Setting up the Hobart chicken shredder attachment",
          "Shredding debreaded and grilled chicken",
          "Taking apart the chicken slicer & shredder attachments",
          "Preparing chicken to proper measurements to be added into soup",
          "Knows the safety procedures when operating the Hobart slicer",
          "Repeats setting up and breaking down the Hobart chicken slicer attachment",
        ],
      },
    ],
  },

};

const STATION_ORDER = ["FOH", "BOH"];

// Trainee dropdown names — pulled from the HR Console roster (the same
// HR_TEAM the other tiles import), so a person's checklist always saves to
// one record instead of splitting when a name is spelled differently.
// Sorted alphabetically.
/* 🐛 NEW HIRES WERE INVISIBLE HERE (Bri, Jul 28 2026: "can we please have
   station checklists update team members from HR automatically. We are missing
   new hires like Abril, Savannah, and Valerie Hernandez").
   `HR_TEAM` is the SEED roster — the original people baked into the bundle.
   Anyone hired since lives in `gcfcr-hr-added-v1` and was never read here, so a
   new hire could not be given a station checklist at all. HRConsole warns about
   exactly this for PIN lookups; the trainee list had the same hole.
   ⚠️ `loadHRTeam()` ALREADY MERGES BOTH and is the one place that should ever
   answer "who is on the roster". Do not re-merge the two lists by hand here —
   a second merge is a second thing to drift.
   ⚠️ THE SEED STAYS AS THE FALLBACK. If the fetch fails the dropdown still
   works with the original roster rather than emptying, because an empty trainee
   list would look like the tile is broken. */
const TRAINEE_SEED = [...HR_TEAM]
  .map((m) => m.name)
  .filter(Boolean)
  .sort((a, b) => a.localeCompare(b));

/* 🐛 THE TRAINING BOARD KEPT PEOPLE WHO HAD LEFT (Matt, Aug 6 2026: "the team
   training board is stale. its not reflecting the hr terms").
   loadHRTeam() answers "who is on the roster", and it does NOT mean "who still
   works here" — it merges the seed with everyone hired since and stops there.
   Terminating somebody in HR Console writes gcfcr-hr-status, which this file
   never read, so all 12 terminated people stayed in the trainee list forever
   and a leader could assign a station checklist to someone who left in April.
   DailySetup already solved this with departedNames(); the training board
   simply never got the same line.
   ⚠️ FILTERED BY ROSTER ID, NOT BY NAME. The status map is keyed by id, and
   this repo has two people whose names differ by one word (both Lizbeths, both
   Adrianas) — matching on name here would drop the wrong person from a list
   that decides who gets trained.
   ⚠️ A FAILED STATUS READ LEAVES EVERYONE IN. kvGet cannot tell "nobody is
   terminated" from "the read failed", and the safe direction is obvious: an
   extra name in a dropdown is a nuisance, a missing trainee looks like the
   tile is broken and blocks a real person's training. */
const HR_STATUS_KEY = "gcfcr-hr-status";

function useTraineeNames() {
  const [names, setNames] = useState(TRAINEE_SEED);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [team, status] = await Promise.all([
          loadHRTeam(),
          kvGet(HR_STATUS_KEY).catch(() => null),
        ]);
        const gone = status && typeof status === "object" ? status : {};
        const out = [...new Set(
          (team || [])
            .filter((m) => m && m.name && gone[m.id] !== "terminated")
            .map((m) => m.name)
        )].sort((a, b) => a.localeCompare(b));
        if (live && out.length) setNames(out);
      } catch { /* seed stands */ }
    })();
    return () => { live = false; };
  }, []);
  return names;
}

// Leader-set skill level, saved per team member alongside their checklist.
const SKILL_LEVELS = [
  { value: "advanced", label: "Advanced", color: "#15803D" },
  { value: "intermediate", label: "Intermediate", color: "#B45309" },
  { value: "beginner", label: "Beginner", color: "#2563EB" },
];


// The key a person's checklist record saves under. Shared by the checklist
// editor and the roster progress view so both read/write the same record.
const traineeKey = (name) => `gcfcr-training-${slug(name)}-v1`;

/* Who is ticking. Read at call time rather than held in state so a sign-in
   during the session is picked up without a reload — the same reason
   `canEditCourse()` is read at render in L101Week. */
/* Rank of the signed-in person, for the two decks tier cannot separate.
   ⚠️ Goes through `effectiveRole`, not `u.role`. That is the per-person clamp
   (accessOverrides.js) — Kyleeka's HR record still says Executive Director
   while her session is a team member's. Reading `u.role` raw would hand her
   the Executive Director deck, which is the exact thing the clamp exists to
   stop. Every other gate in the app goes through it; so does this one.
   ⚠️ Read at CALL TIME, never held in state, so a sign-in during the session
   is picked up without a reload — same reason as signedInName below. */
function signedInRank() {
  try {
    const u = JSON.parse(localStorage.getItem("gcfcr-access-user"));
    return u ? (HR_RANK_BY_TITLE[effectiveRole(u)] || 0) : 0;
  } catch { return 0; }
}

function signedInName() {
  try {
    const u = JSON.parse(localStorage.getItem("gcfcr-access-user"));
    return u && u.name ? u.name : null;
  } catch { return null; }
}


function ProgressBar({ pct, color }) {
  return (
    <div style={{ height: 6, borderRadius: 4, background: "#E5E7EB", overflow: "hidden" }}>
      <div
        style={{
          height: "100%",
          width: `${pct}%`,
          background: color,
          borderRadius: 4,
          transition: "width 200ms ease",
        }}
      />
    </div>
  );
}

/* ---------------------------------------------------------------
   LEADER TRAINING VIEW — two launcher cards
--------------------------------------------------------------- */

function LeaderTraining({ tier, onOpen }) {
  return (
    <div>
      <div style={{ ...eyebrowStyle, color: "#6B21A8" }}>Leader Training Modules</div>
      <p style={{ fontSize: 14, color: "#6B7280", margin: "0 0 16px", lineHeight: 1.45 }}>
        Guided walkthroughs for leaders. Tap one to start — each plays as a short
        slideshow you can pause, replay, or read the script for.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {LEADER_MODULES.map((m) => (
          <button
            key={m.key}
            onClick={() => onOpen(m.key)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              textAlign: "left",
              width: "100%",
              boxSizing: "border-box",
              padding: "14px 16px",
              background: "#fff",
              border: "1px solid #E5E7EB",
              borderLeft: `3px solid ${m.color}`, borderTop: `3px solid ${m.color}`,
              borderRadius: 12,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                flex: "0 0 auto",
                width: 38,
                height: 38,
                borderRadius: 10,
                background: m.color,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 15,
                paddingLeft: 3,
              }}
            >
              ▶
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 16, fontWeight: 700, color: "#1F2937" }}>
                {m.title}
              </span>
              <span style={{ display: "block", fontSize: 13, color: "#6B7280", marginTop: 3 }}>
                {m.desc}
              </span>
            </span>
            <span style={{ flex: "0 0 auto", fontSize: 22, color: "#9CA3AF", lineHeight: 1 }}>›</span>
          </button>
        ))}
      </div>
      <p style={{ fontSize: 12, color: "#9CA3AF", margin: "12px 2px 0" }}>
        Leader tier and up · these used to be their own tiles, now they live here.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------
   STATION CHECKLIST VIEW
--------------------------------------------------------------- */

function StationChecklist() {
  const traineeNames = useTraineeNames();
  const [station, setStation] = useState("FOH");
  const [trainee, setTrainee] = useState("");
  const [checked, setChecked] = useState({});
  /* ★ WHO TICKED IT, AND WHEN (Bri, Aug 10 2026: "when an item is checked off,
     can there by a log across from it that notes the Trainer (the leader that
     checked the box) and the date? If it's unchecked, it can self-remove and
     whoever checks it next will pop up — just a log of who checked any item
     last is fine").
     ⚠️ A PARALLEL MAP, NOT A FIELD ON THE TICK. `checked` is a map of booleans
     and every record written before today is exactly that; turning a `true`
     into an object would make every stored tick unreadable to the old shape and
     to the counts below. Rule 1.
     ⚠️ LAST ONE ONLY, which is what she asked for. Not a history. */
  const [by, setBy] = useState({});
  const [skill, setSkill] = useState(""); // "" | advanced | intermediate | beginner — leader-set, per member
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | loading | saving | saved

  const data = STATIONS[station];

  const loadTimer = useRef(null);
  const saveTimer = useRef(null);
  const loadedKey = useRef(null);
  const skipNextSave = useRef(false);

  useEffect(() => {
    const name = trainee.trim();
    clearTimeout(loadTimer.current);
    if (!name) {
      loadedKey.current = null;
      skipNextSave.current = true;
      setChecked({});
      setBy({});
      setSkill("");
      setSaveStatus("idle");
      return;
    }
    loadTimer.current = setTimeout(async () => {
      const key = traineeKey(name);
      setSaveStatus("loading");
      /* ⚠️ kvGetResult, and loadedKey stays null on failure. A FAILED read
         used to arrive as null, render as an unchecked list, and — since
         skipNextSave only eats the FIRST save — the next checkbox wrote that
         emptiness over the trainee's whole station record. With loadedKey
         null the autosave effect below cannot fire at all. */
      const r = await kvGetResult(key);
      skipNextSave.current = true;
      if (r.ok) {
        const record = r.value;
        setChecked(record?.checked || {});
        // Absent on every record written before today — those ticks simply
        // carry no stamp, because nobody knows who made them.
        setBy(record?.by || {});
        setSkill(record?.skill || "");
        loadedKey.current = key;
        setSaveStatus("idle");
      } else {
        setChecked({});
        setBy({});
        setSkill("");
        loadedKey.current = null;
        setSaveStatus("readfail");
      }
    }, 500);
    return () => clearTimeout(loadTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainee]);

  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    if (!loadedKey.current) return;
    clearTimeout(saveTimer.current);
    setSaveStatus("saving");
    saveTimer.current = setTimeout(async () => {
      // kvSet returns false on refusal, it never throws — the old catch was
      // dead and a refused write showed "Saved" anyway. The ticks stay on
      // screen; the next change re-runs this effect and retries the write.
      const ok = await kvSet(loadedKey.current, {
        trainee: trainee.trim(),
        checked,
        by,
        skill,
        updatedAt: new Date().toISOString(),
      });
      setSaveStatus(ok === false ? "savefail" : "saved");
    }, 600);
    return () => clearTimeout(saveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked, by, skill]);

  /* ⚠️ BOTH MAPS MOVE TOGETHER, and the stamp is decided from the SAME `prev`
     the tick is. Reading `checked[key]` out here instead would use the value
     from the last render, which is one tap behind on a fast double-tap and
     would stamp a box that just came off. */
  const toggleItem = (sectionIdx, itemIdx) => {
    const key = `${station}:${sectionIdx}:${itemIdx}`;
    setChecked((prev) => {
      const now = !prev[key];
      setBy((b) => {
        if (!now) { const n = { ...b }; delete n[key]; return n; }   // unticked: self-removes
        return { ...b, [key]: { name: signedInName() || "", at: new Date().toLocaleDateString("en-CA") } };
      });
      return { ...prev, [key]: now };
    });
  };

  const sectionStats = useMemo(
    () =>
      data.sections.map((section, sIdx) => {
        const total = section.items.length;
        const done = section.items.reduce(
          (acc, _, iIdx) => acc + (checked[`${station}:${sIdx}:${iIdx}`] ? 1 : 0),
          0
        );
        return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
      }),
    [checked, data, station]
  );

  const overall = useMemo(() => {
    const total = sectionStats.reduce((a, s) => a + s.total, 0);
    const done = sectionStats.reduce((a, s) => a + s.done, 0);
    return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
  }, [sectionStats]);

  return (
    <div>
      {/* Trainee + overall progress card */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #E5E7EB",
          borderLeft: `3px solid ${data.color}`, borderTop: `3px solid ${data.color}`,
          borderRadius: 12,
          padding: "14px 16px",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 220px", minWidth: 180 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Trainee
            </div>
            <select
              value={trainee}
              onChange={(e) => setTrainee(e.target.value)}
              style={{
                width: "100%",
                boxSizing: "border-box",
                fontSize: 16,
                padding: "8px 0",
                border: "none",
                borderBottom: "1px solid #E5E7EB",
                outline: "none",
                fontFamily: "inherit",
                color: trainee ? "#1F2937" : "#9CA3AF",
                background: "transparent",
              }}
            >
              <option value="">Select trainee…</option>
              {traineeNames.map((nm) => (
                <option key={nm} value={nm} style={{ color: "#1F2937" }}>
                  {nm}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>
              Names come from the HR Console roster, so each person's progress always saves to the same record.
            </div>
          </div>
          <div style={{ flex: "0 0 auto", minWidth: 150 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Skill Level
            </div>
            <select
              value={skill}
              onChange={(e) => setSkill(e.target.value)}
              disabled={!trainee}
              style={{
                width: "100%",
                boxSizing: "border-box",
                fontSize: 16,
                padding: "8px 0",
                border: "none",
                borderBottom: `1px solid ${(SKILL_LEVELS.find((s) => s.value === skill) || {}).color || "#E5E7EB"}`,
                outline: "none",
                fontFamily: "inherit",
                fontWeight: skill ? 700 : 400,
                color: (SKILL_LEVELS.find((s) => s.value === skill) || {}).color || "#9CA3AF",
                background: "transparent",
                opacity: trainee ? 1 : 0.5,
              }}
            >
              <option value="">Not set…</option>
              {SKILL_LEVELS.map((s) => (
                <option key={s.value} value={s.value} style={{ color: "#1F2937" }}>
                  {s.label}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>
              Leader's overall read on this person — saved with their record.
            </div>
          </div>
          <div style={{ flex: "0 0 auto", minWidth: 140 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.5 }}>
                Overall
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: data.color }}>{overall.pct}%</span>
            </div>
            <ProgressBar pct={overall.pct} color={data.color} />
            <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>
              {overall.done} / {overall.total} items
            </div>
          </div>
          <div style={{ flex: "0 0 auto", fontSize: 11, color: "#9CA3AF" }}>
            {saveStatus === "loading" && "Loading…"}
            {saveStatus === "saving" && "Saving…"}
            {saveStatus === "saved" && "Saved"}
            {saveStatus === "readfail" && "Couldn't load this trainee — checkboxes are off so nothing overwrites their record. Re-pick the name to retry."}
            {saveStatus === "savefail" && "Not saved — check the wifi. Your ticks are still on screen; the next change retries."}
          </div>
        </div>
      </div>

      {/* Station tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: data.note ? 8 : 16, flexWrap: "wrap" }}>
        {STATION_ORDER.map((key) => {
          const s = STATIONS[key];
          const active = key === station;
          return (
            <button
              key={key}
              onClick={() => setStation(key)}
              style={{
                flex: "1 1 calc(50% - 4px)",
                minWidth: 110,
                padding: "10px 8px",
                borderRadius: 10,
                border: `1px solid ${active ? s.color : "#E5E7EB"}`,
                background: active ? s.color : "#fff",
                color: active ? "#fff" : "#1F2937",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                minHeight: 40,
              }}
            >
              {s.code}
              <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.85 }}>{s.name}</div>
            </button>
          );
        })}
      </div>

      {data.note && (
        <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 16 }}>{data.note}</div>
      )}

      {/* Section cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {data.sections.map((section, sIdx) => {
          const stat = sectionStats[sIdx];
          const complete = stat.total > 0 && stat.done === stat.total;
          return (
            <div
              key={section.title}
              style={{
                background: "#fff",
                border: "1px solid #E5E7EB",
                borderLeft: `3px solid ${data.color}`, borderTop: `3px solid ${data.color}`,
                borderRadius: 12,
                padding: "14px 16px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: "#1F2937" }}>{section.title}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "#6B7280" }}>
                    {stat.done}/{stat.total}
                  </span>
                  {complete && (
                    <span
                      style={{
                        fontSize: 9.5,
                        fontWeight: 800,
                        letterSpacing: 1,
                        color: "#fff",
                        background: data.color,
                        borderRadius: 999,
                        padding: "2px 8px",
                      }}
                    >
                      COMPLETE
                    </span>
                  )}
                </div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <ProgressBar pct={stat.pct} color={data.color} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {section.items.map((item, iIdx) => {
                  const key = `${station}:${sIdx}:${iIdx}`;
                  const isChecked = !!checked[key];
                  return (
                    <div key={key} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <button
                        onClick={() => toggleItem(sIdx, iIdx)}
                        aria-pressed={isChecked}
                        aria-label={item}
                        style={{
                          flex: "0 0 auto",
                          width: 34,
                          height: 34,
                          borderRadius: 8,
                          border: `2px solid ${data.color}`,
                          background: isChecked ? data.color : "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                        }}
                      >
                        {isChecked && <Check size={19} color="#fff" strokeWidth={3} />}
                      </button>
                      <span
                        style={{
                          fontSize: 14.5,
                          lineHeight: 1.4,
                          paddingTop: 6,
                          color: isChecked ? "#9CA3AF" : "#1F2937",
                          textDecoration: isChecked ? "line-through" : "none",
                        }}
                      >
                        {item}
                      </span>
                      {/* ★ THE LOG, ACROSS FROM THE ITEM (Bri, Aug 10 2026).
                          ⚠️ ONLY WHEN THERE IS ONE. Ticks made before today have
                          no stamp because nobody knows who made them, and
                          inventing "unknown" on a training record would be worse
                          than a blank. It fills in the moment somebody re-ticks.
                          ⚠️ `marginLeft: auto` so it sits on the right of the row
                          and never pushes the item text around as names change
                          length. */}
                      {isChecked && by[`${station}:${sIdx}:${iIdx}`] && (
                        <span style={{ marginLeft: "auto", flex: "0 0 auto", paddingTop: 7,
                          fontSize: 11.5, color: "#9CA3AF", textAlign: "right", lineHeight: 1.35 }}>
                          {by[`${station}:${sIdx}:${iIdx}`].name || "—"}
                          <br />{by[`${station}:${sIdx}:${iIdx}`].at || ""}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   ROSTER PROGRESS VIEW — every trainee's completion, live.
   Fresh on open, on focus/visibility, and on a light interval,
   so it never shows a stale snapshot while checklists are edited
   elsewhere.
--------------------------------------------------------------- */

// Totals derived from STATIONS so the denominator always matches
// the checklists — no hardcoded counts to drift.
const STATION_TOTALS = STATION_ORDER.reduce((acc, code) => {
  acc[code] = STATIONS[code].sections.reduce((n, s) => n + s.items.length, 0);
  return acc;
}, {});
const GRAND_TOTAL = Object.values(STATION_TOTALS).reduce((a, b) => a + b, 0);

const REFRESH_MS = 60000; // focus/visibility is the primary refresh; this is a backstop

function personStats(record) {
  const checked = record?.checked || {};
  const per = {};
  let done = 0;
  STATION_ORDER.forEach((code) => {
    let d = 0;
    STATIONS[code].sections.forEach((sec, sIdx) => {
      sec.items.forEach((_, iIdx) => {
        if (checked[`${code}:${sIdx}:${iIdx}`]) d++;
      });
    });
    const total = STATION_TOTALS[code];
    per[code] = { done: d, total, pct: total ? Math.round((d / total) * 100) : 0 };
    done += d;
  });
  return {
    done,
    total: GRAND_TOTAL,
    pct: GRAND_TOTAL ? Math.round((done / GRAND_TOTAL) * 100) : 0,
    per,
    skill: record?.skill || "",
  };
}

function RosterProgress() {
  /* ⚠️ Same live roster as the dropdown — a new hire must appear in BOTH or
     they can be given a checklist and then never show up in progress. */
  const traineeNames = useTraineeNames();
  const [records, setRecords] = useState({});
  const [status, setStatus] = useState("loading"); // loading | ready
  const [lastSync, setLastSync] = useState(null);
  const [sortBy, setSortBy] = useState("progress"); // progress | name
  const alive = useRef(true);

  const load = React.useCallback(async () => {
    // If store.js has a bulk/prefix read, replace this whole block
    // with a single call — 100+ gets per refresh is a lot on iPad.
    const entries = await Promise.all(
      traineeNames.map(async (name) => {
        try {
          return [name, await kvGet(traineeKey(name))];
        } catch {
          return [name, null];
        }
      })
    );
    if (!alive.current) return;
    setRecords(Object.fromEntries(entries));
    setLastSync(new Date());
    setStatus("ready");
  }, []);

  useEffect(() => {
    alive.current = true;
    load();
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", load);
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, REFRESH_MS);
    return () => {
      alive.current = false;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", load);
      clearInterval(id);
    };
  }, [load]);

  const rows = useMemo(() => {
    const list = traineeNames.map((name) => ({ name, ...personStats(records[name]) }));
    list.sort(
      sortBy === "name"
        ? (a, b) => a.name.localeCompare(b.name)
        : (a, b) => b.pct - a.pct || a.name.localeCompare(b.name)
    );
    return list;
  }, [records, sortBy]);

  const started = rows.filter((r) => r.done > 0).length;

  return (
    <div>
      <div style={{ ...eyebrowStyle, color: "#6B21A8" }}>Roster Progress · live</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, margin: "0 0 8px" }}>
        <p style={{ fontSize: 14, color: "#6B7280", margin: 0, lineHeight: 1.45, flex: "1 1 220px" }}>
          Every trainee across every station. Refreshes on its own —
          {status === "loading"
            ? " loading…"
            : lastSync
            ? ` synced ${lastSync.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
            : ""}
        </p>
        <div style={{ display: "flex", gap: 6 }}>
          {[["progress", "Progress"], ["name", "Name"]].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setSortBy(k)}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                border: `1px solid ${sortBy === k ? ACCENT : "#E5E7EB"}`,
                background: sortBy === k ? ACCENT : "#fff",
                color: sortBy === k ? "#fff" : "#6B7280",
                fontFamily: "inherit",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 12, color: "#9CA3AF", margin: "0 2px 12px" }}>
        {started} of {rows.length} started
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((r) => {
          const complete = r.total > 0 && r.done === r.total;
          const barColor = complete ? "#15803D" : r.done > 0 ? ACCENT : "#E5E7EB";
          return (
            <div
              key={r.name}
              style={{
                background: "#fff",
                border: "1px solid #E5E7EB",
                borderLeft: `3px solid ${barColor}`, borderTop: `3px solid ${barColor}`,
                borderRadius: 12,
                padding: "12px 14px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "#1F2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.name}
                  </span>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: r.done > 0 ? "#1F2937" : "#9CA3AF" }}>{r.pct}%</span>
                  {complete && (
                    <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1, color: "#fff", background: "#15803D", borderRadius: 999, padding: "2px 8px" }}>
                      COMPLETE
                    </span>
                  )}
                </span>
              </div>

              <ProgressBar pct={r.pct} color={barColor} />

              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                {STATION_ORDER.map((code) => {
                  const p = r.per[code];
                  return (
                    <span
                      key={code}
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: p.done > 0 ? STATIONS[code].color : "#9CA3AF",
                        background: "#F3F4F6",
                        borderRadius: 6,
                        padding: "3px 7px",
                      }}
                    >
                      {code} {p.pct}%
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   TILE ROOT
--------------------------------------------------------------- */



export default function TrainingSite({ tier }) {
  const [view, setView] = useState("videos");
  // When a Leader Training module is open, its key is held here and it renders
  // full-screen. Back returns to the "leader" tab.
  const [openModule, setOpenModule] = useState(null);

  const videos = decksFor(signedInRank(), tier);
  const leaderAccess = typeof tier !== "number" || tier >= 2;

  // Full-screen module takes over the whole tile when open.
  if (openModule) {
    const mod = LEADER_MODULES.find((m) => m.key === openModule);
    if (mod) {
      const ModuleComponent = mod.Component;
      return <ModuleComponent tier={tier} onBack={() => setOpenModule(null)} />;
    }
  }

  const TABS = [
    /* ⚠️ "Hub Training", NOT "Training Videos" (Matt, Aug 10 2026: "label hub
       training to eliminate ambiguity"). This tile holds TWO different kinds of
       training and they were both just called training: these decks teach the
       APP, while Station Checklists and Skills Checklists teach the JOB. A
       leader asking someone to "do your training" meant the job; the tab said
       videos. Every label below now says which one it is. */
    { key: "videos", label: "Hub Training", always: true },
    { key: "checklist", label: "Station Checklists", always: false },
    { key: "roster", label: "Roster Progress", always: false },
    { key: "leader", label: "Leader Training", always: false },
    /* ★ `always: true` — the students who need this are Team Members and Junior
       Trainers taking W2-4, i.e. BELOW leader access. Putting it behind
       `leaderAccess` would hide it from exactly the people it is for, which is
       the same mistake the recommendation banner made. */
    { key: "skills", label: "Skills Checklists", always: true },
  ].filter((t) => t.always || leaderAccess);

  return (
    <div
      style={{
        maxWidth: 1080,
        margin: "0 auto",
        padding: "0 20px 48px",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        color: "#1F2937",
        minHeight: "100vh",
        background: "#F7F5FA",
      }}
    >
      {/* Masthead — certification pathway */}
      <div style={{ margin: "0 -20px 20px", background: "linear-gradient(120deg,#7E22CE 0%,#6B21A8 55%)", color: "#fff", padding: "18px 20px 16px" }}>
        <div style={{ ...eyebrowStyle, color: "#E5CCF5", marginBottom: 6 }}>
          Team Training
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 6px", lineHeight: 1.15 }}>
          Certification Pathway
        </h1>
        <p style={{ fontSize: 14.5, color: "rgba(255,255,255,.72)", margin: 0, lineHeight: 1.45, maxWidth: 560 }}>
          Two kinds of training live here. <b style={{ color: "#fff" }}>Hub Training</b> teaches the
          app. <b style={{ color: "#fff" }}>Station</b> and <b style={{ color: "#fff" }}>Skills Checklists</b> teach
          the job. Watch the Hub video for your role first, then work your checklists.
        </p>

        {/* View switcher — only shows extra tabs for Leader+ */}
        {leaderAccess && (
          <div style={{ display: "flex", gap: 4, marginTop: 16, flexWrap: "wrap" }}>
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setView(t.key)}
                style={{
                  border: "none",
                  borderRadius: 9,
                  padding: "9px 15px",
                  background: view === t.key ? "#F7F5FA" : "rgba(255,255,255,.1)",
                  color: view === t.key ? "#6B21A8" : "#EDE3F7",
                  fontSize: 13.5,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ⚠️ NO `leaderAccess` GUARD — see the tab definition above. */}
      {view === "skills" ? (
        <SkillsChecklists name={signedInName()} />
      ) : view === "checklist" && leaderAccess ? (
        <StationChecklist />
      ) : view === "roster" && leaderAccess ? (
        <RosterProgress />
      ) : view === "leader" && leaderAccess ? (
        <LeaderTraining tier={tier} onOpen={setOpenModule} />
      ) : (
        <>
          {/* Hub Training Videos */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ ...eyebrowStyle, color: "#6B21A8" }}>
              Hub Training · how to use the app · watch first
            </div>
            <p style={{ fontSize: 12.5, color: "#6B7280", margin: "-4px 2px 10px", lineHeight: 1.45 }}>
              These teach the Hub itself, not the job. Watch the one with your
              level on it. Everything below your level is already covered inside it.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {videos.map((v) => (
                <a
                  key={v.href}
                  href={v.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    textDecoration: "none",
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "14px 16px",
                    minHeight: 104,          // every card the same height
                    background: "#fff",
                    border: "1px solid #E5E7EB",
                    borderLeft: `3px solid ${v.color}`, borderTop: `3px solid ${v.color}`,
                    borderRadius: 12,
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      flex: "0 0 auto",
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      background: v.color,
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 15,
                      paddingLeft: 3,
                    }}
                  >
                    ▶
                  </span>
                  {/* ⚠️ BADGE ABOVE THE TITLE, ON ITS OWN LINE — THIS IS THE
                      "consistent sizes" FIX (Matt, Aug 10 2026). It used to sit
                      INLINE with the title inside a `flexWrap: "wrap"` row, so
                      whether it wrapped to a second line depended on how long
                      the title was: "Leader Training" fit beside it, "Team
                      Member Training" did not. That alone made the cards
                      different heights, and "Executive Director Training" would
                      have wrapped every time. Own line = same height always,
                      and it reads better too: level, then name, then contents. */}
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: "inline-block",
                        fontSize: 9.5,
                        fontWeight: 800,
                        letterSpacing: 1,
                        color: "#fff",
                        background: v.color,
                        borderRadius: 999,
                        padding: "2px 8px",
                        marginBottom: 5,
                      }}
                    >
                      {v.badge}
                    </span>
                    <span style={{ display: "block", fontSize: 16, fontWeight: 700, color: "#1F2937", lineHeight: 1.25 }}>
                      {v.title}
                    </span>
                    {/* Clamped to two lines with a matching minHeight, so a
                        short list and a long one occupy the same box. The full
                        tool list is in the deck itself; this is the summary. */}
                    <span
                      style={{
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        fontSize: 13,
                        color: "#6B7280",
                        marginTop: 3,
                        lineHeight: 1.35,
                        minHeight: 35,
                      }}
                    >
                      {v.desc}
                    </span>
                  </span>
                  <span style={{ flex: "0 0 auto", fontSize: 22, color: "#9CA3AF", lineHeight: 1 }}>
                    ›
                  </span>
                </a>
              ))}
            </div>
            <p style={{ fontSize: 12, color: "#9CA3AF", margin: "8px 2px 0" }}>
              About 2 minutes each · tap anywhere in the video to start · sound on
            </p>
          </div>
        </>
      )}
    </div>
  );
}
