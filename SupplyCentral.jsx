import { useState, useEffect, useMemo, useRef } from "react";
/* The one raised look, shared with every tool — see cardStyle.js. Tailwind's
   shadow-sm is a flat blur; this is the same stack the tiles use. */
import { CARD_3D, cardSurface, accentEdge, ACCENT_NEUTRAL } from "./cardStyle.js";
import { hubToken } from "./store.js";
import CatalogImportBox from "./CatalogImportBox.jsx";
import { SUPPLY_SPEC } from "./catalogImport.js";
import { STORE } from "./storeConfig.js"; // store name on the masthead

const QTYS_KEY   = "gcfcr-qtys-v3";
const CUSTOM_KEY = "gcfcr-custom-v3";
const REMOVED_KEY = "gcfcr-removed-v3"; // hidden base catalog items (removable/restorable)
/* ★ CORP'S NEWER NUMBERS, LAID OVER THE BUILT-IN CATALOG. { [itemId]: {name?, sku?, par?} }
   Matt, Aug 6 2026: "the pars are set by corp. the file came from corp originally."
   That is what settled this. CATALOG below is corp's file frozen into the app
   the day it was pasted in; corp revises it. Without somewhere to put the new
   numbers, every revision was a manual re-type of 366 rows, so in practice the
   pars just went stale.
   ⚠️ AN OVERLAY, NEVER AN EDIT TO CATALOG. Same shape Equipment Log has used
   since it shipped (config.overrides). A missing key, an empty object, or a
   dropped read all mean "no overrides" and the built-in numbers stand.
   ⚠️ IT HOLDS REFERENCE DATA ONLY — name, sku, par. On-hand counts live in
   gcfcr-qtys-v3 and are keyed by the same item id, and nothing here writes
   there. That separation is the whole rule: an import replaces what corp
   decides, never what the store counted. */
const OVERRIDES_KEY = "gcfcr-overrides-v3";
const SIGNOUT_KEY = "gcfcr-signout-v1";  // supply sign-out log (locked storage accountability)
const SIGNOUT_CAP = 500;                 // keep the newest N entries so the KV row stays small
/* Order history. Added Jul 30 2026 — before this, submitting an order posted it
   to Slack and then emptied the cart, and that was the end of it. Nothing was
   ever written down, so the tool could not answer "what did we order last week"
   or "who placed this". Every order submitted before this date is gone and
   cannot be recovered; the only copies are the Slack messages, which do not
   carry a name either. */
const ORDERS_KEY = "gcfcr-orders-v1";
const ORDERS_CAP = 500;                  // same reason as SIGNOUT_CAP

/* WHERE THE ORDER GETS POSTED. A PURPOSE, NOT A CHANNEL — the Worker resolves
   it out of the store's `messaging` config on /api/slack-notify.

   🐛 THIS WAS `"operational-success"` AND IT HAD STOPPED WORKING. Matt, Aug 21
   2026: "we dont have ops success anymore. we only have the peak reachers and
   general channels." Once the store moved its channels into config, that
   literal matched nothing the route allows, so every submitted order came back
   403 while this page still said the order had been sent.

   ⚠️ A CHANNEL NAME IN A BROWSER FILE CANNOT BE FIXED FROM THE SETTINGS SCREEN,
   and a clone would carry Gate City's rooms into another store's Slack. Naming
   the purpose is what makes both of those go away.

   ⚠️ AND THE NAME WAS ON THE BUTTON. "Submit Order to #operational-success" is
   what a leader read every time, which is why this had to be four edits and
   not one — the constant was doing double duty as routing AND as copy, so the
   room the order went to and the room the page promised could never disagree
   until the routing moved and the copy did not. */
const ORDER_SLACK_PURPOSE = "inventory";

const CAT_ORDER = [
  "Boards Assembly","Breakfast Utensils","Catering","Coffee Brewers",
  "Cold Rail","Containers","Contingency Plan","Dishes","First Aid",
  "Floor Care","Food Safety","Front of House","Fry Fryers","Fryer Tools",
  "Garland Grills","Hobart Mixer","Hot Holding","Ice Cream","Ice Equipment",
  "Kitchen Utensils","Knives","Labels & Stickers","Mac & Cheese",
  "Merco/Holding","Office","Organization","Playground","PPE/Safety",
  "Prep Area","Raw Area","Restroom","Soup Station","Team","Toaster Station",
  "Trash & Cleaning","Misc"
];

const CAT_COLORS = {
  "Boards Assembly":   "bg-amber-100 text-amber-800",
  "Breakfast Utensils":"bg-yellow-100 text-yellow-700",
  "Catering":          "bg-violet-100 text-violet-700",
  "Coffee Brewers":    "bg-amber-100 text-amber-700",
  "Cold Rail":         "bg-sky-100 text-sky-700",
  "Containers":        "bg-cyan-100 text-cyan-700",
  "Contingency Plan":  "bg-red-100 text-red-600",
  "Dishes":            "bg-blue-100 text-blue-700",
  "First Aid":         "bg-red-100 text-red-700",
  "Floor Care":        "bg-lime-100 text-lime-700",
  "Food Safety":       "bg-emerald-100 text-emerald-700",
  "Front of House":    "bg-pink-100 text-pink-700",
  "Fry Fryers":        "bg-orange-100 text-orange-700",
  "Fryer Tools":       "bg-orange-100 text-orange-600",
  "Garland Grills":    "bg-red-100 text-red-700",
  "Hobart Mixer":      "bg-stone-200 text-stone-600",
  "Hot Holding":       "bg-rose-100 text-rose-700",
  "Ice Cream":         "bg-pink-100 text-pink-600",
  "Ice Equipment":     "bg-sky-100 text-sky-600",
  "Kitchen Utensils":  "bg-amber-100 text-amber-800",
  "Knives":            "bg-rose-100 text-rose-700",
  "Labels & Stickers": "bg-gray-100 text-gray-600",
  "Mac & Cheese":      "bg-orange-100 text-orange-600",
  "Merco/Holding":     "bg-purple-100 text-purple-700",
  "Office":            "bg-slate-100 text-slate-600",
  "Organization":      "bg-indigo-100 text-indigo-700",
  "Playground":        "bg-lime-100 text-lime-700",
  "PPE/Safety":        "bg-green-100 text-green-700",
  "Prep Area":         "bg-orange-100 text-orange-700",
  "Raw Area":          "bg-red-100 text-red-700",
  "Restroom":          "bg-teal-100 text-teal-700",
  "Soup Station":      "bg-blue-100 text-blue-700",
  "Team":              "bg-red-100 text-red-700",
  "Toaster Station":   "bg-yellow-100 text-yellow-700",
  "Trash & Cleaning":  "bg-zinc-200 text-zinc-600",
  "Misc":              "bg-gray-100 text-gray-500",
};

// id | cat | name | sku | par (reference quantity from spreadsheet)
const CATALOG = [
  // ── BOARDS ASSEMBLY ──────────────────────────────────────────────
  {id:"ba01",cat:"Boards Assembly",name:"1/4 Size Pan Lid, Stainless Steel",sku:"92275140",par:0},
  {id:"ba02",cat:"Boards Assembly",name:"1/4 Size Pan, 4\"D",sku:"92230442",par:0},
  {id:"ba03",cat:"Boards Assembly",name:"1/4 Size False Bottom, SS Perforated",sku:"92220400",par:0},
  {id:"ba04",cat:"Boards Assembly",name:"Chicken Slicer, Horizontal Cuts for Salads",sku:"59155975CFA",par:2},
  {id:"ba05",cat:"Boards Assembly",name:"Lid with Handle, 1/2 Size Stainless Steel Pan",sku:"92275120",par:1},
  // ── BREAKFAST UTENSILS ───────────────────────────────────────────
  {id:"bu01",cat:"Breakfast Utensils",name:"1/6 Size Pan, Stainless Steel, 6\"D",sku:"92230662",par:2},
  {id:"bu02",cat:"Breakfast Utensils",name:"2\" Butter Brush, Blue Bristles",sku:"2955002GB",par:2},
  {id:"bu03",cat:"Breakfast Utensils",name:"3\" Butter Brush, Blue Bristles",sku:"2955003GB",par:2},
  {id:"bu04",cat:"Breakfast Utensils",name:"Biscuit Hex Cutter, Individual",sku:"296F7089501N",par:1},
  {id:"bu05",cat:"Breakfast Utensils",name:"Biscuit Hex Roller",sku:"271BRP100",par:1},
  {id:"bu06",cat:"Breakfast Utensils",name:"Digital Timer, Small",sku:"913584721",par:1},
  {id:"bu07",cat:"Breakfast Utensils",name:"Butter Flavored Oil Spray Nozzle, Red and White",sku:"662110508",par:1},
  {id:"bu08",cat:"Breakfast Utensils",name:"Spray Bottle, Butter Flavored Oil, 32 OZ",sku:"641CFA32SPRY",par:1},
  {id:"bu09",cat:"Breakfast Utensils",name:"Carlisle 10511U13 StorPlus 1/6 Amber High Heat Lid w/ Spoon Notch",sku:"70160N",par:1},
  {id:"bu10",cat:"Breakfast Utensils",name:"Carlisle 3088413 StorPlus 1/6 Amber High Heat Pan, 4\" Deep",sku:"70164AM",par:1},
  {id:"bu11",cat:"Breakfast Utensils",name:"Dough Scraper, White Plastic, Biscuit",sku:"176DS53CLARK",par:2},
  {id:"bu12",cat:"Breakfast Utensils",name:"Hooks, Hex Cutter 2/PK",sku:"461DD9823BK3",par:1},
  {id:"bu13",cat:"Breakfast Utensils",name:"Ice Water Dispenser, Biscuit",sku:"27110856BKCL",par:1},
  {id:"bu14",cat:"Breakfast Utensils",name:"Measuring Cup, Biscuit Water, 2 Qt",sku:"282182553E",par:1},
  {id:"bu15",cat:"Breakfast Utensils",name:"Metal Spatula, White Handle",sku:"470M18730WH",par:3},
  {id:"bu16",cat:"Breakfast Utensils",name:"Rolling Pin, 1/2\" Guides",sku:"62822857",par:1},
  {id:"bu17",cat:"Breakfast Utensils",name:"Round Sifter, Stainless Steel, 5\"",sku:"80810345",par:1},
  {id:"bu18",cat:"Breakfast Utensils",name:"Antunes 7002011 Scraper/Spatula, Egg Station Kit, Blue",sku:"PARTS TOWN: 7002011",par:0},
  {id:"bu19",cat:"Breakfast Utensils",name:"Ladle, 2 OZ, Stainless Steel",sku:"407OPL2",par:2},
  {id:"bu20",cat:"Breakfast Utensils",name:"Breakfast Grill Scraper",sku:"06281611",par:0},
  {id:"bu21",cat:"Breakfast Utensils",name:"Egg Form Holder, Stainless Steel",sku:"28427801552",par:0},
  {id:"bu22",cat:"Breakfast Utensils",name:"Egg Form, Six Slot",sku:"28427801543",par:0},
  {id:"bu23",cat:"Breakfast Utensils",name:"Grill Tool and Liquid Egg Carton Organizer, SS",sku:"28427801535",par:0},
  // ── CATERING ─────────────────────────────────────────────────────
  {id:"ca01",cat:"Catering",name:"Catering Order Ticket Rack, 36\"",sku:"124TR36",par:1},
  {id:"ca02",cat:"Catering",name:"Chick-fil-A ID Tag, Catering TMS Bag",sku:"3133225",par:6},
  {id:"ca03",cat:"Catering",name:"Catering Cart",sku:"114832",par:2},
  {id:"ca04",cat:"Catering",name:"TMS 2.1 Large Kit (Bag, Magnetic Shelf, Heating Element & Ice Sheets)",sku:"114857",par:3},
  {id:"ca05",cat:"Catering",name:"TMS 2.0 Small Kit (Bag, Heating Element & Ice Sheet)",sku:"114729",par:3},
  // ── COFFEE BREWERS ───────────────────────────────────────────────
  {id:"cb01",cat:"Coffee Brewers",name:"Measuring Cup, 1 QT",sku:"690FG3216CLR",par:0},
  {id:"cb02",cat:"Coffee Brewers",name:"Brush, Coffee Brewer, White Bristles",sku:"29548030",par:0},
  {id:"cb03",cat:"Coffee Brewers",name:"Coffee Brewer Cleaning Tablets, 120/BTL",sku:"588Z61UX120",par:0},
  {id:"cb04",cat:"Coffee Brewers",name:"Universal Coffee Dispenser Stand",sku:"10037758",par:0},
  // ── COLD RAIL ────────────────────────────────────────────────────
  {id:"cr01",cat:"Cold Rail",name:"1/3 Size Stainless Steel Pan, 6\"D",sku:"99930362",par:0},
  {id:"cr02",cat:"Cold Rail",name:"1/3 Size False Bottom, SS Perforated",sku:"92220300",par:0},
  {id:"cr03",cat:"Cold Rail",name:"1/6 Size Pan, Stainless Steel, 6\"D",sku:"92230662",par:0},
  {id:"cr04",cat:"Cold Rail",name:"1/6 Size SS Drain Tray, 4 7/16\" x 4\"",sku:"92220600",par:0},
  {id:"cr05",cat:"Cold Rail",name:"2/3 Size Pan, Stainless Steel, 6\"D",sku:"92230162",par:0},
  {id:"cr06",cat:"Cold Rail",name:"2/3 Size False Bottom, SS Perforated",sku:"92270110",par:0},
  {id:"cr07",cat:"Cold Rail",name:"Full Size Pan, Stainless Steel, 6\"D",sku:"92230062",par:0},
  {id:"cr08",cat:"Cold Rail",name:"1/2 Size Pan, Stainless Steel, 4\"D",sku:"92230242",par:0},
  {id:"cr09",cat:"Cold Rail",name:"1/2 Size False Bottom, SS Perforated",sku:"92220200",par:0},
  // ── CONTAINERS ───────────────────────────────────────────────────
  {id:"co01",cat:"Containers",name:"12 Qt Container Lid, White Square",sku:"690FG6523",par:8},
  {id:"co02",cat:"Containers",name:"12 Qt Container, Clear Square",sku:"690FG6312",par:8},
  {id:"co03",cat:"Containers",name:"2 Qt Container, Clear Square",sku:"690FG6302",par:4},
  {id:"co04",cat:"Containers",name:"2,4,6,8 Qt Container Lid, White Square",sku:"690FG6509",par:12},
  {id:"co05",cat:"Containers",name:"22 Qt Container, Clear Square, Blue Lines",sku:"2711195607",par:0},
  {id:"co06",cat:"Containers",name:"22 Qt Lid, Royal Blue Square",sku:"2711197560",par:0},
  {id:"co07",cat:"Containers",name:"22 Qt Container, Clear Square, Red Lines",sku:"21422SFSCW",par:0},
  {id:"co08",cat:"Containers",name:"4 Qt Container, Clear Square",sku:"690FG6304",par:4},
  {id:"co09",cat:"Containers",name:"8 Qt Container, Clear Square",sku:"690FG6308",par:4},
  // ── CONTINGENCY PLAN ─────────────────────────────────────────────
  {id:"cp01",cat:"Contingency Plan",name:"Saber King Tomato Full Set, 3/16\", Red",sku:"62898010ACFA",par:1},
  {id:"cp02",cat:"Contingency Plan",name:"Tomato Corer",sku:"628950",par:1},
  // ── DISHES ───────────────────────────────────────────────────────
  {id:"di01",cat:"Dishes",name:"CFA Dishwashing Apron",sku:"TS226139OS",par:2},
  {id:"di02",cat:"Dishes",name:"Scrub Brush 2/PK",sku:"KIT27142395EC14",par:1},
  // ── FIRST AID ────────────────────────────────────────────────────
  {id:"fa01",cat:"First Aid",name:"Refill First Aid Kit (No Steel Box)",sku:"0591",par:1},
  {id:"fa02",cat:"First Aid",name:"Allergic Reactions Back of House Poster (US/PR)",sku:"114834",par:1},
  // ── FLOOR CARE ───────────────────────────────────────────────────
  {id:"fc01",cat:"Floor Care",name:"24\" Tool Holder System, DURA LOC",sku:"92682613",par:2},
  {id:"fc02",cat:"Floor Care",name:"54\" Handle, Lightweight, DURA LOC",sku:"92682612",par:9},
  {id:"fc03",cat:"Floor Care",name:"Angle Blue Broom Head, DURA LOC",sku:"92682551",par:1},
  {id:"fc04",cat:"Floor Care",name:"Blue Deck Brush Head, DURA LOC",sku:"92682587",par:1},
  {id:"fc05",cat:"Floor Care",name:"Blue Rubber Squeegee Head, DURA LOC",sku:"92682602",par:1},
  {id:"fc06",cat:"Floor Care",name:"Looped End Blue Mop Head, DURA LOC",sku:"92682561",par:1},
  {id:"fc07",cat:"Floor Care",name:"Blue Mop Bucket, Dual Cavity, DURA LOC",sku:"92682567",par:1},
  {id:"fc08",cat:"Floor Care",name:"Angle Red Broom Head, DURA LOC",sku:"92682553",par:0},
  {id:"fc09",cat:"Floor Care",name:"Red Deck Brush Head, DURA LOC",sku:"92682589",par:0},
  {id:"fc10",cat:"Floor Care",name:"Red Rubber Squeegee Head, DURA LOC",sku:"92682604",par:0},
  {id:"fc11",cat:"Floor Care",name:"Looped End Red Mop Head, DURA LOC",sku:"92682563",par:0},
  {id:"fc12",cat:"Floor Care",name:"Red Mop Bucket, Dual Cavity, DURA LOC",sku:"92682574",par:0},
  {id:"fc13",cat:"Floor Care",name:"Angle Yellow Broom Head, DURA LOC",sku:"92682552",par:1},
  {id:"fc14",cat:"Floor Care",name:"Yellow Deck Brush Head, DURA LOC",sku:"92682588",par:1},
  {id:"fc15",cat:"Floor Care",name:"Yellow Rubber Squeegee Head, DURA LOC",sku:"92682603",par:1},
  {id:"fc16",cat:"Floor Care",name:"Looped End Yellow Mop Head, DURA LOC",sku:"92682562",par:1},
  {id:"fc17",cat:"Floor Care",name:"Yellow Mop Bucket, Dual Cavity, DURA LOC",sku:"92682568",par:1},
  {id:"fc18",cat:"Floor Care",name:"Broom Head, Green Push Broom, Dura Loc",sku:"92682595",par:1},
  {id:"fc19",cat:"Floor Care",name:"Dust Pan Only, Dura Loc",sku:"90060951",par:2},
  {id:"fc20",cat:"Floor Care",name:"Lobby Broom Dust Pan Combo, Dura Loc",sku:"90060952",par:2},
  {id:"fc21",cat:"Floor Care",name:"Universal Insert Holder, DURA LOC",sku:"92682616",par:9},
  // ── FOOD SAFETY ──────────────────────────────────────────────────
  {id:"fs01",cat:"Food Safety",name:"2 1/2\" Dial Thermometer, Oven",sku:"913DOT2K",par:0},
  {id:"fs02",cat:"Food Safety",name:"3\" Dial Thermometer, Refrigerator or Freezer",sku:"6085924",par:0},
  {id:"fs03",cat:"Food Safety",name:"Antimicrobial Fruit and Vegetable Test Strips (100/Btl)",sku:"114065",par:2},
  {id:"fs04",cat:"Food Safety",name:"Atkins Thermometer Kit, Black & Yellow Micro Needle Probes",sku:"27393983K",par:1},
  {id:"fs05",cat:"Food Safety",name:"Cling, Sanitizer \"Give Health a Hand\"",sku:"114197CFA",par:2},
  {id:"fs06",cat:"Food Safety",name:"Digital Pocket Thermometer, Blue",sku:"6089847FDA",par:6},
  {id:"fs07",cat:"Food Safety",name:"Digital Pocket Thermometer, Yellow",sku:"6089878E",par:2},
  {id:"fs08",cat:"Food Safety",name:"Test Strips, Chlorine, 100/BTL",sku:"373S5148Q",par:2},
  {id:"fs09",cat:"Food Safety",name:"Test Strips, Quat 100/BTL",sku:"373S5152Q",par:2},
  {id:"fs10",cat:"Food Safety",name:"Thermometer, Dishwasher",sku:"279TX5100",par:0},
  {id:"fs11",cat:"Food Safety",name:"Sign, Hand Washing",sku:"341HNDWSHPLQ",par:0},
  // ── FRONT OF HOUSE ───────────────────────────────────────────────
  {id:"fh01",cat:"Front of House",name:"2 Compartment Mini Dome Chill Container",sku:"712BD2003",par:1},
  {id:"fh02",cat:"Front of House",name:"27 Gallon White Ingredient Storage Bin w/ Sliding Lid & Scoop",sku:"176BIN27GL",par:1},
  {id:"fh03",cat:"Front of House",name:"Coffee Cup & Lid Organizer",sku:"167C8504WF",par:1},
  {id:"fh04",cat:"Front of House",name:"Container, Diet Lemonade, Blue",sku:"28427802613",par:2},
  {id:"fh05",cat:"Front of House",name:"Container, Lemonade, White",sku:"28427802612",par:12},
  {id:"fh06",cat:"Front of House",name:"Lid, Lemonade Container, White",sku:"28427022835",par:14},
  {id:"fh07",cat:"Front of House",name:"Crathco 231-00010T Bowl, 18 L, Agitator, BPA Free",sku:"GM231-00010T",par:0},
  {id:"fh08",cat:"Front of House",name:"Crathco 210-00126T Bowl Cover, 18 L, Agitator",sku:"GM210-00126T",par:0},
  {id:"fh09",cat:"Front of House",name:"Crathco 231-00009T Bowl Assembly, 9 L, BPA-Free",sku:"GM231-00009T",par:0},
  {id:"fh10",cat:"Front of House",name:"Crathco 210-00125T Bowl Cover, 9 L, Agitator, BPA-Free",sku:"GM210-00125T",par:0},
  {id:"fh11",cat:"Front of House",name:"Crathco 210-00130 Impeller, Mixing",sku:"GM210-00130",par:0},
  {id:"fh12",cat:"Front of House",name:"Measuring Sugar Scoop, Tea & Lemonade",sku:"282222316BCFA",par:1},
  {id:"fh13",cat:"Front of House",name:"Delivery Sticker Dispenser",sku:"786MDL25",par:1},
  {id:"fh14",cat:"Front of House",name:"Informational Table Tag, Set of 40 (Mobile Dine-In)",sku:"114742",par:1},
  {id:"fh15",cat:"Front of House",name:"Flower Vase, Black, 12/CS",sku:"214BV6CWBK",par:3},
  {id:"fh16",cat:"Front of House",name:"Green Table Marker Set, English 10 PK",sku:"511TM200GREN",par:0},
  {id:"fh17",cat:"Front of House",name:"Light Blue Table Marker Set, English 10 PK",sku:"511TM200BLEN",par:0},
  {id:"fh18",cat:"Front of House",name:"Orange Table Marker Set, English 10 PK",sku:"511TM200OREN",par:0},
  {id:"fh19",cat:"Front of House",name:"Purple Table Marker Set, English 10 PK",sku:"511TM200PREN",par:0},
  {id:"fh20",cat:"Front of House",name:"Red Table Marker Set, English 10 PK",sku:"511TM200RDEN",par:0},
  {id:"fh21",cat:"Front of House",name:"High Chair, Black, with Wheels",sku:"6907805BK",par:4},
  {id:"fh22",cat:"Front of House",name:"Mini Dome Chill Container w/ Caddy, Cherries, Lemons",sku:"712BD2002CAR",par:2},
  {id:"fh23",cat:"Front of House",name:"1-gallon pitcher/container, Iced Coffee Base",sku:"9992122590",par:2},
  {id:"fh24",cat:"Front of House",name:"Pepper Mill, 21\", Brown",sku:"176PM21ACBRN",par:1},
  {id:"fh25",cat:"Front of House",name:"Plastic Tong, 6\" Clear",sku:"214TG6CL",par:2},
  {id:"fh26",cat:"Front of House",name:"Plastic Tong, 6\" White",sku:"214TG6WH",par:2},
  {id:"fh27",cat:"Front of House",name:"Tiered Flavored Syrup Holder",sku:"544P585",par:1},
  {id:"fh28",cat:"Front of House",name:"Tray, Black, Customer, 24/CS",sku:"176FT1216BK",par:0},
  {id:"fh29",cat:"Front of House",name:"Wet Floor Sign, English/Spanish, Yellow",sku:"690FG6112YEL",par:6},
  // ── FRY FRYERS ───────────────────────────────────────────────────
  {id:"ff01",cat:"Fry Fryers",name:"Crumb Skimmer Holder",sku:"28427802594",par:0},
  {id:"ff02",cat:"Fry Fryers",name:"Fry Salt Dispenser, Green Trigger",sku:"71887298",par:0},
  {id:"ff03",cat:"Fry Fryers",name:"Mesh Skimmer, Rectangular",sku:"8082677",par:0},
  {id:"ff04",cat:"Fry Fryers",name:"Pan Divider for Fry Warmer",sku:"135WB3124410",par:0},
  {id:"ff05",cat:"Fry Fryers",name:"Waffle Fry Basket (Ergo or Regular)",sku:"482140644",par:0},
  {id:"ff06",cat:"Fry Fryers",name:"Basket Support Rack, Potato Fryer",sku:"482158888",par:0},
  {id:"ff07",cat:"Fry Fryers",name:"Waffle Fry Scoop, Stainless Steel",sku:"2843FRA086",par:1},
  // ── FRYER TOOLS ──────────────────────────────────────────────────
  {id:"ft01",cat:"Fryer Tools",name:"30\" Filter Rinse Hose",sku:"482110424",par:1},
  {id:"ft02",cat:"Fryer Tools",name:"Brush, L Shape, Fryer",sku:"2714011105",par:1},
  {id:"ft03",cat:"Fryer Tools",name:"Crumb Line Scraper Tool",sku:"832NXG1",par:3},
  {id:"ft04",cat:"Fryer Tools",name:"Fat Vat Oil Waste Container",sku:"614FATVAT",par:1},
  {id:"ft05",cat:"Fryer Tools",name:"Fryer Basket, Full Size Tiered (Electric, Hybrid Fryer)",sku:"628112570B",par:0},
  {id:"ft06",cat:"Fryer Tools",name:"Fryer Basket, Nugget, Electric or Hybrid Fryer",sku:"482180457",par:0},
  {id:"ft07",cat:"Fryer Tools",name:"Fryer Basket, Full Size Tiered, Right Hinge, Open Narrow Fryer CFE-415",sku:"112140642",par:0},
  {id:"ft08",cat:"Fryer Tools",name:"Fryer Oil Test Kit",sku:"62450104028",par:1},
  {id:"ft09",cat:"Fryer Tools",name:"Gong Brush, Fryer, 20\"",sku:"2714011305",par:0},
  {id:"ft10",cat:"Fryer Tools",name:"Poker Brush, Fryer, 28\"",sku:"2714011005",par:0},
  {id:"ft11",cat:"Fryer Tools",name:"Spicy Fryer Label, Red Metal",sku:"31363668SPCY",par:1},
  {id:"ft12",cat:"Fryer Tools",name:"Tong, 19\" Stainless Steel, Black Handle",sku:"9224781620",par:2},
  // ── GARLAND GRILLS ───────────────────────────────────────────────
  {id:"gg01",cat:"Garland Grills",name:"Grill 2.0 Complete Brush Assembly w/Wiper",sku:"1124603353",par:0},
  {id:"gg02",cat:"Garland Grills",name:"Grill 2.0 Detailing Tool",sku:"1124603247",par:0},
  {id:"gg03",cat:"Garland Grills",name:"Grill 2.0 Oil Tray Insert (2/Pkg)",sku:"3724603194",par:0},
  {id:"gg04",cat:"Garland Grills",name:"Grill Oil Roller 5/PK",sku:"628685005",par:0},
  {id:"gg05",cat:"Garland Grills",name:"Oil Roller Handle",sku:"628685003",par:0},
  // ── HOBART MIXER ─────────────────────────────────────────────────
  {id:"hm01",cat:"Hobart Mixer",name:"BBEATER-HL20, 20 QT Aluminum Flat Beater",sku:"10068508",par:0},
  {id:"hm02",cat:"Hobart Mixer",name:"BOWL-HL20, 20 QT SS Mixer Bowl",sku:"10068507",par:0},
  {id:"hm03",cat:"Hobart Mixer",name:"TRAY-HL2012 Legacy Mixer Shelf Attachment (New Style, 16.5\"D)",sku:"10071962",par:0},
  {id:"hm04",cat:"Hobart Mixer",name:"VS9PLT-ASP12 Adjustable Slicer Plate",sku:"PARTS TOWN-10031992",par:0},
  // ── HOT HOLDING (AHA Pans) ───────────────────────────────────────
  {id:"hh01",cat:"Hot Holding",name:"1/2 Size Crumb Screen, Stainless Steel",sku:"296SCRNCRM11",par:18},
  {id:"hh02",cat:"Hot Holding",name:"Bfast 1 AHA Pan",sku:"3193LTM045",par:1},
  {id:"hh03",cat:"Hot Holding",name:"Bfast 2 AHA Pan",sku:"3193LTM046",par:1},
  {id:"hh04",cat:"Hot Holding",name:"Bfast 3 AHA Pan",sku:"3193LTM052",par:1},
  {id:"hh05",cat:"Hot Holding",name:"Filets 1 AHA Pan",sku:"3193LTM035",par:1},
  {id:"hh06",cat:"Hot Holding",name:"Filets 2 AHA Pan",sku:"3193LTM036",par:1},
  {id:"hh07",cat:"Hot Holding",name:"Filets 3 AHA Pan",sku:"3193LTM037",par:1},
  {id:"hh08",cat:"Hot Holding",name:"Filets 4 AHA Pan",sku:"3193LTM054",par:1},
  {id:"hh09",cat:"Hot Holding",name:"Nuggets 1 AHA Pan",sku:"3193LTM040",par:1},
  {id:"hh10",cat:"Hot Holding",name:"Nuggets 2 AHA Pan",sku:"3193LTM041",par:1},
  {id:"hh11",cat:"Hot Holding",name:"Nuggets 3 AHA Pan",sku:"3193LTM042",par:1},
  {id:"hh12",cat:"Hot Holding",name:"Nuggets 4 AHA Pan",sku:"3193LTM056",par:1},
  {id:"hh13",cat:"Hot Holding",name:"Spicy 1 AHA Pan",sku:"3193LTM038",par:1},
  {id:"hh14",cat:"Hot Holding",name:"Spicy 2 AHA Pan",sku:"3193LTM039",par:1},
  {id:"hh15",cat:"Hot Holding",name:"Spicy 3 AHA Pan",sku:"3193LTM049",par:1},
  {id:"hh16",cat:"Hot Holding",name:"Spicy 4 AHA Pan",sku:"3193LTM053",par:1},
  {id:"hh17",cat:"Hot Holding",name:"Spicy Bfast 1 AHA Pan",sku:"3193LTM051",par:1},
  {id:"hh18",cat:"Hot Holding",name:"Spicy Bfast 2 AHA Pan",sku:"3193LTM050",par:1},
  {id:"hh19",cat:"Hot Holding",name:"Strips 1 AHA Pan",sku:"3193LTM043",par:1},
  {id:"hh20",cat:"Hot Holding",name:"Strips 2 AHA Pan",sku:"3193LTM044",par:1},
  {id:"hh21",cat:"Hot Holding",name:"Strips 3 AHA Pan",sku:"3193LTM055",par:1},
  // ── ICE CREAM (Machines) ─────────────────────────────────────────
  {id:"ic1",cat:"Ice Cream",name:"Scissors, Black Handle, Magnetic",sku:"470M14806",par:0},
  {id:"ic2",cat:"Ice Cream",name:"Server Slimline Dispenser",sku:"10040603",par:0},
  {id:"ic3",cat:"Ice Cream",name:"Taylor X69492 Tune Up Kit, 3 Spout, CFA",sku:"PARTSTOWN-X69492",par:0},
  {id:"ic4",cat:"Ice Cream",name:"#100 Scoop, Squeeze Handle (peppermint)",sku:"93647161",par:0},
  {id:"ic5",cat:"Ice Cream",name:"Cone Dispenser",sku:"679BCDSBFL",par:0},
  {id:"ic6",cat:"Ice Cream",name:"Taylor X44127 Brush Kit",sku:"PARTSTOWN-X44127",par:0},
  {id:"ic7",cat:"Ice Cream",name:"Double Barrel Parts Tray (Search \"25468\")",sku:"PARTSTOWN-25468",par:0},
  {id:"ic8",cat:"Ice Cream",name:"Ice Bag Clip",sku:"29140800",par:0},
  {id:"ic9",cat:"Ice Cream",name:"Lubricant, IceDream Machine, Petrol-Gel",sku:"401PETROLGEL",par:0},
  {id:"ic10",cat:"Ice Cream",name:"Milkshake Topping Dispenser Green Anti-Leak Insert 2/pack",sku:"28427811055",par:0},
  {id:"ic11",cat:"Ice Cream",name:"Milkshake Topping Dispenser Cylinder Cap",sku:"28427809096",par:0},
  {id:"ic12",cat:"Ice Cream",name:"Milkshake Topping Dispenser Handle",sku:"28427809092",par:0},
  {id:"ic13",cat:"Ice Cream",name:"Milkshake Topping Dispenser Loading Insert",sku:"28427809095",par:0},
  {id:"ic14",cat:"Ice Cream",name:"Milkshake Topping Dispenser Outer Cylinder",sku:"28427809094",par:0},
  {id:"ic15",cat:"Ice Cream",name:"Milkshake Topping Dispenser Red Dispenser Seal 6/PK",sku:"28427808080",par:0},
  {id:"ic16",cat:"Ice Cream",name:"Pump, Chocolate Syrup (plastic)",sku:"3168350248",par:0},
  {id:"ic17",cat:"Ice Cream",name:"Pump, Chocolate Syrup (metal)",sku:"718100963CFA",par:1},
  {id:"ic18",cat:"Ice Cream",name:"Milkshake Cup, Stainless Steel",sku:"93646793",par:1},
  // ── ICE EQUIPMENT ────────────────────────────────────────────────
  {id:"i01",cat:"Ice Equipment",name:"6 Gallon Ice Tote",sku:"511SI6000",par:2},
  {id:"i02",cat:"Ice Equipment",name:"Ice Paddle with Mounting Bracket",sku:"230ICEPADDLCFA",par:0},
  {id:"i03",cat:"Ice Equipment",name:"Large Ice Scoop Holder",sku:"511SI9000",par:0},
  {id:"i04",cat:"Ice Equipment",name:"Small Ice Scoop Holder",sku:"511SI5000",par:0},
  {id:"r01",cat:"Raw Area",name:"Measuring Cup, Raw Nugget",sku:"282132394CFA",par:2},
  {id:"r02",cat:"Raw Area",name:"Nugget Transfer Basket",sku:"28427800303",par:2},
  {id:"r03",cat:"Raw Area",name:"Raw Only Pan, Filet Roller",sku:"3193LTM063",par:3},
  {id:"r04",cat:"Raw Area",name:"Scissors, Yellow, Raw Chicken",sku:"470M14807YL",par:2},
  {id:"r05",cat:"Raw Area",name:"Use First Clip, Yellow, Chicken Thawing",sku:"2921500401",par:8},
  {id:"r06",cat:"Raw Area",name:"Yellow Breading Paddle",sku:"27140350CYL",par:2},
  {id:"r07",cat:"Raw Area",name:"Bag Opener, Yellow",sku:"5637YELLOW",par:2},
  {id:"r08",cat:"Raw Area",name:"1/2 Size Pan Nugget Strainer Basket, 6\"D",sku:"28427807218",par:2},
  {id:"r09",cat:"Raw Area",name:"1/2 Size Pan, SS Perforated, 2 1/2\"D",sku:"92230223",par:2},
  {id:"r10",cat:"Raw Area",name:"1/2 Size Stainless Steel Pan, 6\"D",sku:"92230262",par:6},
  {id:"r11",cat:"Raw Area",name:"1/3 Size Pan, Chicken Brick Thawing",sku:"326114244",par:0},
  {id:"r12",cat:"Raw Area",name:"1/3 Stainless Steel Pan, 6\"D",sku:"99930362",par:2},
  {id:"r13",cat:"Raw Area",name:"1/4 Size Pan, Stainless Steel, 6\"D",sku:"92230462",par:0},
  {id:"r14",cat:"Raw Area",name:"2/3 Size Transfer Pan, SS, 2 1/2\"D",sku:"92230122",par:4},
  {id:"r15",cat:"Raw Area",name:"Brush, Filet Roller, Yellow",sku:"29594332Y",par:2},
  {id:"r16",cat:"Raw Area",name:"Brush, Yellow Bristle, Coater Sifter Basket",sku:"628986000006",par:1},
  {id:"r17",cat:"Raw Area",name:"Coater Sifter Basket",sku:"628112669",par:3},
  {id:"r18",cat:"Raw Area",name:"Filet Roller Assembly, Complete",sku:"114CFA100",par:2},
  {id:"r19",cat:"Raw Area",name:"Filet Roller Shield",sku:"114CFA021",par:2},
  {id:"r20",cat:"Raw Area",name:"Full Size Pan, Stainless Steel, 4\"D",sku:"92230042",par:13},
  {id:"r21",cat:"Raw Area",name:"Full Size Pan, Stainless Steel, 6\"D",sku:"92230062",par:4},
  // ── PREP AREA ────────────────────────────────────────────────────
  {id:"p01",cat:"Prep Area",name:"Full Size 4 Side Perf Only Pan",sku:"29660093",par:6},
  {id:"p02",cat:"Prep Area",name:"Kanban, Black Storage",sku:"318113586RTE",par:6},
  {id:"p03",cat:"Prep Area",name:"Spatula, White Rubber, 9 1/2\"",sku:"690FG19010WH",par:2},
  {id:"p04",cat:"Prep Area",name:"Tray, Red Kanban",sku:"999915010",par:12},
  {id:"p05",cat:"Prep Area",name:"#12 Scoop, Green Handle",sku:"92247142",par:2},
  {id:"p06",cat:"Prep Area",name:"#20 Scoop, Black Handle",sku:"2984714420BK",par:2},
  {id:"p07",cat:"Prep Area",name:"#40 Scoop, Squeeze Handle",sku:"93647157",par:6},
  {id:"p08",cat:"Prep Area",name:"#6 Scoop, Squeeze Handle",sku:"407E1256",par:2},
  {id:"p09",cat:"Prep Area",name:"#8 Scoop, Squeeze Handle",sku:"407E1258",par:3},
  {id:"p10",cat:"Prep Area",name:"1/3 Size False Bottom, SS Perforated",sku:"92220300",par:2},
  {id:"p11",cat:"Prep Area",name:"1/3 Size Pan Lid, Translucent",sku:"21430SCWH",par:2},
  {id:"p12",cat:"Prep Area",name:"1/3 Stainless Steel Pan, 6\"D",sku:"99930362",par:4},
  {id:"p13",cat:"Prep Area",name:"1/6 Size Pan, Stainless Steel, 6\"D",sku:"92230662",par:10},
  {id:"p14",cat:"Prep Area",name:"1/6 Size SS Drain Tray, 4 7/16\" x 4\"",sku:"92220600",par:3},
  {id:"p15",cat:"Prep Area",name:"3/4\" Spacer, Food Pan Separator Bar",sku:"92275012",par:10},
  {id:"p16",cat:"Prep Area",name:"Can Opener",sku:"29711314800",par:1},
  {id:"p17",cat:"Prep Area",name:"Egg Slicer, Black",sku:"59155400CFA",par:2},
  {id:"p18",cat:"Prep Area",name:"Full Size Lid, Stainless Steel Pan",sku:"92277250",par:9},
  {id:"p19",cat:"Prep Area",name:"Full Size Pan, Stainless Steel, 6\"D",sku:"92230062",par:4},
  {id:"p20",cat:"Prep Area",name:"Full Size False Bottom, SS Perforated",sku:"92220000",par:4},
  // ── KITCHEN UTENSILS ─────────────────────────────────────────────
  {id:"k01",cat:"Kitchen Utensils",name:"Cookie Cooling Rack",sku:"10037275",par:1},
  {id:"k02",cat:"Kitchen Utensils",name:"Cutting Board Safety Mat, White",sku:"511CBM1318",par:2},
  {id:"k03",cat:"Kitchen Utensils",name:"Cutting Board, Green Flexible, 15\" x 20\"",sku:"808FCB1520GN",par:4},
  {id:"k04",cat:"Kitchen Utensils",name:"Cutting Board, White, 23 3/4\" x 18\"",sku:"3181824WH",par:2},
  {id:"k05",cat:"Kitchen Utensils",name:"Cutting Board, White, 8\" x 8\" x 1/2\"",sku:"31868WH",par:2},
  {id:"k06",cat:"Kitchen Utensils",name:"Cutting Board, Yellow, 8\" x 8\" x 5/8\"",sku:"31868YW",par:1},
  {id:"k07",cat:"Kitchen Utensils",name:"Digital Scale, 10 LB",sku:"333EDL10CFA",par:2},
  {id:"k08",cat:"Kitchen Utensils",name:"Digital Scale, Round, 11 LB",sku:"511SCDGP11M",par:2},
  {id:"k09",cat:"Kitchen Utensils",name:"Food Tray, Red Plastic, 14\" x 18\", 12/PK",sku:"176FT1418RD",par:2},
  {id:"k10",cat:"Kitchen Utensils",name:"Knife, Deboning, White Handle",sku:"21010473",par:2},
  {id:"k11",cat:"Kitchen Utensils",name:"Ladle, 6 OZ, Stainless Steel",sku:"93646816",par:2},
  {id:"k12",cat:"Kitchen Utensils",name:"Pickle Bucket Opener",sku:"832PPO",par:1},
  {id:"k13",cat:"Kitchen Utensils",name:"Scoop, Stainless Steel, Perforated, 13\"",sku:"93646975",par:2},
  {id:"k14",cat:"Kitchen Utensils",name:"Scoop, Stainless Steel Slotted, 22\"",sku:"93660175",par:0},
  {id:"k15",cat:"Kitchen Utensils",name:"Teflon Sheets, VCT-2 Toaster, 2/PK",sku:"4067000969",par:1},
  {id:"k16",cat:"Kitchen Utensils",name:"Tong, 9 1/2\" Stainless Steel",sku:"93647110",par:4},
  {id:"k17",cat:"Kitchen Utensils",name:"Wall Clock, 12 1/2\" Digital",sku:"328UNV10431",par:1},
  {id:"k18",cat:"Kitchen Utensils",name:"Chicken Slicer, Rotary",sku:"59155200ANCF",par:1},
  {id:"k19",cat:"Kitchen Utensils",name:"Server Sauce Dispenser",sku:"718101975",par:1},
  {id:"k20",cat:"Kitchen Utensils",name:"Salad Spinner, Manual, 5 Gallon",sku:"68360045D02S",par:1},
  {id:"k21",cat:"Kitchen Utensils",name:"Saber King Frame Assembly",sku:"628980000CFA",par:1},
  {id:"k22",cat:"Kitchen Utensils",name:"Saber King Rubber Feet Kit, 4/KT",sku:"628998EP8CFA",par:0},
  {id:"k23",cat:"Kitchen Utensils",name:"Saber King Lettuce Full Set, Green",sku:"628998032ACFA",par:1},
  {id:"k24",cat:"Kitchen Utensils",name:"Saber King Brush Kit, White",sku:"628980004CFA",par:1},
  {id:"k25",cat:"Kitchen Utensils",name:"Saber King Cleaning Brush, Green Bristles",sku:"628980005CFA",par:1},
  {id:"k26",cat:"Kitchen Utensils",name:"Sheet Pan, 1/2 Size (Cookies/Biscuit/M&C)",sku:"9995303",par:119},
  {id:"k27",cat:"Kitchen Utensils",name:"12\" Whisk",sku:"92247281",par:2},
  {id:"k28",cat:"Kitchen Utensils",name:"3' Convenience Hose",sku:"737110109",par:1},
  {id:"k29",cat:"Kitchen Utensils",name:"Calibration Weight, 4 OZ",sku:"333W7001",par:1},
  {id:"k30",cat:"Kitchen Utensils",name:"Chicken Fork",sku:"470M23800",par:4},
  {id:"k31",cat:"Kitchen Utensils",name:"Colander, 13 QT",sku:"40313CDRSS",par:2},
  // ── KNIVES ───────────────────────────────────────────────────────
  {id:"kn1",cat:"Knives",name:"Knife Holder, Magnetic, 18\"",sku:"21082113",par:2},
  {id:"kn2",cat:"Knives",name:"Knife, 10\" Chef, Black Handle",sku:"470M22E10",par:2},
  {id:"kn3",cat:"Knives",name:"Knife, 4\" Paring, Black Handle",sku:"470M22004",par:2},
  {id:"kn4",cat:"Knives",name:"Knife, 6\" Serrated Edge, Black Handle",sku:"470M23408",par:2},
  {id:"kn5",cat:"Knives",name:"Knife, 7\" White Offset Handle",sku:"21013623",par:2},
  // ── TOASTER STATION ──────────────────────────────────────────────
  {id:"t01",cat:"Toaster Station",name:"Bun Oil Roller",sku:"5918150RS",par:2},
  {id:"t02",cat:"Toaster Station",name:"Pickle Container, Stainless Steel, 4.25 QT",sku:"922V78740",par:2},
  {id:"t03",cat:"Toaster Station",name:"Pickle Strainer, Stainless Steel",sku:"28417012849",par:1},
  {id:"t04",cat:"Toaster Station",name:"Vertical Toaster Cleaning Tool",sku:"4407001084",par:0},
  // ── SOUP STATION ─────────────────────────────────────────────────
  {id:"s01",cat:"Soup Station",name:"1/2 Size Pan Lid, SS Notched (Centerline Well)",sku:"92275220",par:0},
  {id:"s02",cat:"Soup Station",name:"1/2 Stainless Steel Pan, 6\"D (Centerline Well)",sku:"92230262",par:0},
  {id:"s03",cat:"Soup Station",name:"Lid with Handle, 1/2 Size SS Pan (Centerline)",sku:"92275120",par:0},
  {id:"s04",cat:"Soup Station",name:"1/4 Size Pan Lid, Slotted, SS (CW-100)",sku:"92275240",par:0},
  {id:"s05",cat:"Soup Station",name:"1/4 Size Pan, Stainless Steel, 6\"D (CW-100)",sku:"92230462",par:0},
  {id:"s06",cat:"Soup Station",name:"Food Pan Separator Bar, 12\" (CW-100)",sku:"92275012",par:0},
  {id:"s07",cat:"Soup Station",name:"Brush, Pitco Rethermalizer Poker",sku:"614PP10730",par:0},
  {id:"s08",cat:"Soup Station",name:"Drain Hose Assembly (Pitco)",sku:"61414308001",par:0},
  {id:"s09",cat:"Soup Station",name:"Rethermalizer Rack (Pitco)",sku:"614B4518001",par:0},
  {id:"s10",cat:"Soup Station",name:"Rethermalizer Rack Holder (Pitco)",sku:"614B4519901",par:0},
  // ── MAC & CHEESE ─────────────────────────────────────────────────
  {id:"m01",cat:"Mac & Cheese",name:"Bag Dragon - Bag Cutter/Squeezer, 6-Pack",sku:"561",par:1},
  {id:"m02",cat:"Mac & Cheese",name:"Label, Mac & Cheese Pan Spray",sku:"341DT303863",par:1},
  {id:"m03",cat:"Mac & Cheese",name:"Pan Spray Racket",sku:"460EC14578SK",par:1},
  {id:"m04",cat:"Mac & Cheese",name:"1/2 Size Amber Lid, Mac & Cheese",sku:"21420HPCHAM",par:20},
  {id:"m05",cat:"Mac & Cheese",name:"1/2 Size Amber Pan, 2 1/2\"D, Mac & Cheese",sku:"21422HPAM",par:20},
  {id:"m06",cat:"Mac & Cheese",name:"1/3 Size Amber Lid, Mac & Cheese",sku:"21430HPCHAM",par:3},
  {id:"m07",cat:"Mac & Cheese",name:"1/3 Size Amber Pan, 2 1/2\"D, Mac & Cheese",sku:"21432HPAM",par:3},
  {id:"m08",cat:"Mac & Cheese",name:"Gen 2 Orange RFID Collar, Mac & Cheese",sku:"7658122570",par:4},
  {id:"m09",cat:"Mac & Cheese",name:"Spatula, White Rubber, 13 1/2\"",sku:"690FG19050WH",par:2},
  {id:"m10",cat:"Mac & Cheese",name:"Spoon, Silicone, Mac & Cheese, Gray, 11 1/2\"",sku:"868H3902GY",par:2},
  // ── MERCO/HOLDING ────────────────────────────────────────────────
  {id:"mh01",cat:"Merco/Holding",name:"Full Size Lid, Merco Tray Seal, Vented (MHC-62)",sku:"7658105009",par:8},
  {id:"mh02",cat:"Merco/Holding",name:"Full Size Lid, Merco Tray Seal, Vented (MHC-54)",sku:"7658105009",par:0},
  {id:"mh03",cat:"Merco/Holding",name:"Gen 3 RFID Collar, Black (Sausages)",sku:"765130021718",par:2},
  {id:"mh04",cat:"Merco/Holding",name:"Gen 3 RFID Collar, Blue (Scrambled Yellow)",sku:"765130021728",par:2},
  {id:"mh05",cat:"Merco/Holding",name:"Gen 3 RFID Collar, Brown (Cookies)",sku:"765130021748",par:2},
  {id:"mh06",cat:"Merco/Holding",name:"Gen 3 RFID Collar, Dark Blue (Folded Yellow)",sku:"765130021733",par:2},
  {id:"mh07",cat:"Merco/Holding",name:"Gen 3 RFID Collar, Dark Tan (Grilled Breakfast)",sku:"765130021713",par:2},
  {id:"mh08",cat:"Merco/Holding",name:"Gen 3 RFID Collar, Gray (Grilled Nuggets)",sku:"765130021743",par:2},
  {id:"mh09",cat:"Merco/Holding",name:"Gen 3 RFID Collar, Light Tan (Grilled Filets)",sku:"765130021738",par:2},
  {id:"mh10",cat:"Merco/Holding",name:"Gen 3 RFID Collar, White (Folded White)",sku:"765130021723",par:2},
  {id:"mh11",cat:"Merco/Holding",name:"1/2 Size Lid, Tray Seal Vented",sku:"7658105029",par:5},
  {id:"mh12",cat:"Merco/Holding",name:"1/3 Amber False Bottom, High Heat",sku:"28230HPDCFA",par:8},
  {id:"mh13",cat:"Merco/Holding",name:"1/3 Size Amber Pan, Dual Handle, Merco",sku:"21432HP2HAM",par:16},
  {id:"mh14",cat:"Merco/Holding",name:"1/3 Size Lid, Merco Tray Seal, Solid (2x2 CT)",sku:"7658105028",par:0},
  {id:"mh15",cat:"Merco/Holding",name:"1/3 Size Lid, Merco Tray Seal, Solid (4x2 CT)",sku:"7658105028",par:0},
  // ── LABELS & STICKERS ────────────────────────────────────────────
  {id:"l01",cat:"Labels & Stickers",name:"Sidekicks Complete Kit",sku:"SKRUS0000018",par:1},
  {id:"l02",cat:"Labels & Stickers",name:"Sweet Tea Urn Decal (Cling)",sku:"29014",par:1},
  {id:"l03",cat:"Labels & Stickers",name:"Unsweet Tea Urn Decal (Cling)",sku:"29015",par:1},
  {id:"l04",cat:"Labels & Stickers",name:"ZVZ DuraLabel Day of Week, Green Stripe, 2 RL",sku:"90062243",par:0},
  {id:"l05",cat:"Labels & Stickers",name:"ZVZ DuraLabel Day of Week, Yellow Stripe, 2 RL",sku:"90060962",par:1},
  {id:"l06",cat:"Labels & Stickers",name:"Coffee Urn Wrap, Regular (THRIVE)",sku:"29128",par:0},
  {id:"l07",cat:"Labels & Stickers",name:"Regular Lemonade Bubbler Cling",sku:"29016",par:0},
  {id:"l08",cat:"Labels & Stickers",name:"Diet Lemonade Bubbler Cling",sku:"29248",par:0},
  {id:"l09",cat:"Labels & Stickers",name:"Keep Cold Stickers (250/Roll)",sku:"113363",par:1},
  {id:"l10",cat:"Labels & Stickers",name:"Label, Diet Lemonade Gallon Jug, 250/RL",sku:"114675",par:1},
  {id:"l11",cat:"Labels & Stickers",name:"Label, Lemonade Gallon Jug, 250/RL",sku:"114674",par:1},
  {id:"l12",cat:"Labels & Stickers",name:"Label, Sunjoy Gallon Jug, 250/RL",sku:"114632",par:1},
  {id:"l13",cat:"Labels & Stickers",name:"Label, Sweet Tea Gallon Jug, 500/RL",sku:"113271",par:1},
  {id:"l14",cat:"Labels & Stickers",name:"Label, Unsweet Tea Gallon Jug, 250/RL",sku:"114673",par:1},
  {id:"l15",cat:"Labels & Stickers",name:"New Keep Hot Stickers, 250/Roll (Catering)",sku:"114254",par:1},
  {id:"l16",cat:"Labels & Stickers",name:"Waterproof Quality Tracking Cards, 250/RL",sku:"114723",par:1},
  {id:"l17",cat:"Labels & Stickers",name:"Reheatable Catering Labels (125/Roll)",sku:"114113",par:1},
  // ── PPE/SAFETY ───────────────────────────────────────────────────
  {id:"ppe1",cat:"PPE/Safety",name:"The Gator Oven Mitt",sku:"1619",par:2},
  {id:"ppe2",cat:"PPE/Safety",name:"Burn Resistant Gloves 21\", Blue",sku:"693",par:1},
  {id:"ppe3",cat:"PPE/Safety",name:"Burn Resistant Gloves 21\", Black",sku:"87",par:1},
  {id:"ppe4",cat:"PPE/Safety",name:"Eye Wash Station",sku:"5235",par:1},
  {id:"ppe5",cat:"PPE/Safety",name:"Burn Prevention Full Face Shield",sku:"5472KIT",par:1},
  {id:"ppe6",cat:"PPE/Safety",name:"Burn Prevention Safety Kit",sku:"0208",par:1},
  {id:"ppe7",cat:"PPE/Safety",name:"Cut Prevention Safety Kit",sku:"0204",par:1},
  {id:"ppe8",cat:"PPE/Safety",name:"Super Slip Resistant Mat (3' x 5')",sku:"9419",par:2},
  // ── ORGANIZATION ─────────────────────────────────────────────────
  {id:"o01",cat:"Organization",name:"Condiment Bin Dividers, 12/PK",sku:"712104979GY",par:1},
  {id:"o02",cat:"Organization",name:"Condiment Bin, Large",sku:"712104976GY",par:22},
  {id:"o03",cat:"Organization",name:"Condiment Bin, Medium",sku:"712104977GY",par:30},
  {id:"o04",cat:"Organization",name:"Condiment Bin, Small",sku:"712104978GY",par:44},
  {id:"o05",cat:"Organization",name:"Custom Kan-Ban Condiment Bin Labels",sku:"114642",par:1},
  {id:"o06",cat:"Organization",name:"Gray Bin Marker, Plastic, 3\" x 1 1/4\"",sku:"460LABLG3IN",par:250},
  {id:"o07",cat:"Organization",name:"Inventory Item Labels, 3\" x 1.25\"",sku:"156869151",par:1},
  {id:"o08",cat:"Organization",name:"Snap On Shelving Hook",sku:"461HKZ3K4",par:20},
  // ── TRASH & CLEANING ─────────────────────────────────────────────
  {id:"tc1",cat:"Trash & Cleaning",name:"Trash Cart, Black",sku:"6906b1011bk",par:1},
  {id:"tc2",cat:"Trash & Cleaning",name:"Trash Can Dolly or Stand",sku:"10002905",par:1},
  {id:"tc3",cat:"Trash & Cleaning",name:"Trash Can, 32 Gallon, Gray",sku:"690FG2632GY",par:2},
  {id:"tc4",cat:"Trash & Cleaning",name:"Trash Can, Slim Jim, Gray",sku:"690354099GY",par:8},
  {id:"tc5",cat:"Trash & Cleaning",name:"Trash Can, Slim Jim, Gray, 19 Gallon",sku:"6903541GY",par:2},
  // ── RESTROOM ─────────────────────────────────────────────────────
  {id:"rs1",cat:"Restroom",name:"Toilet Bowl Brush",sku:"9058BWHR",par:0},
  {id:"rs2",cat:"Restroom",name:"20\" Plastic Toilet Plunger",sku:"69782101",par:0},
  // ── OFFICE ───────────────────────────────────────────────────────
  {id:"of01",cat:"Office",name:"Labeling Tape, Black on White, 3/4\" Wide",sku:"114520",par:1},
  {id:"of02",cat:"Office",name:"Nametag Plate with CFA Label, 10/PK",sku:"114946",par:1},
  {id:"of03",cat:"Office",name:"Nametag Printer",sku:"113182",par:1},
  {id:"of04",cat:"Office",name:"Office Chair, Black, Mesh Back",sku:"19786456BK",par:1},
  {id:"of05",cat:"Office",name:"Trash Can, 13.6 Qt, Beige (Office)",sku:"479WC136G",par:1},
  {id:"of06",cat:"Office",name:"9V Batteries, Alkaline, 2/PK",sku:"199160421TFUS",par:1},
  {id:"of07",cat:"Office",name:"C Batteries, Alkaline, 4/PK",sku:"199ALC12J",par:1},
  {id:"of08",cat:"Office",name:"D Batteries, Alkaline, 4/PK",sku:"1998134TFUS",par:3},
  {id:"of09",cat:"Office",name:"File Cabinet, 2 Box/1 File Drawer, Mobile",sku:"42018574CFA",par:2},
  {id:"of10",cat:"Office",name:"Key Cabinet, Stainless Steel",sku:"242CB13364",par:1},
  {id:"of11",cat:"Office",name:"MICR Printer",sku:"",par:1},
  {id:"of12",cat:"Office",name:"Labeling Tape, Black on Clear, 1/4\" Wide",sku:"112369",par:1},
  // ── TEAM ─────────────────────────────────────────────────────────
  {id:"tm1",cat:"Team",name:"Red Together Nametag Magnet Set",sku:"114478",par:1},
  // ── MISC ─────────────────────────────────────────────────────────
  {id:"mi1",cat:"Misc",name:"Coat Rack, 5 Hooks",sku:"5474161S",par:4},
  {id:"mi2",cat:"Misc",name:"Grabber, Long Reaching Tool",sku:"905NN600",par:2},
  {id:"mi3",cat:"Misc",name:"Hand Truck",sku:"546MGXLAP",par:1},
  // ── PLAYGROUND ───────────────────────────────────────────────────
  {id:"pl1",cat:"Playground",name:"Playground Sanitizer Window Cling",sku:"114198CFA",par:0},
];

/* ─── Storage helpers ─────────────────────────────────────────────────────────
   ★★ EVERY READ AND WRITE IS SHARED NOW (Jul 28 2026). It was not, and that was
   the bug behind this whole tile.
   `window.storage.get(k)` / `.set(k, v)` default to PERSONAL — one bucket per
   person. All four keys here omitted the flag while every other tile in the Hub
   (CashAudit passes it on all six of its keys, App.jsx for IPO, all four
   cleaning calls) passes `true`. So:
     • the sign-out log — the thing whose stated job is "item, count, and who
       took it" — was only ever visible to the person who wrote the entry;
     • two leaders building the same order were looking at different quantities;
     • a custom item one person added did not exist for anybody else.
   A locked-storage accountability log nobody else can read is not a log.

   ── THE MIGRATION, and why the two halves differ ──
   ⚠️ Flipping the flag alone would make everything already saved LOOK deleted:
   it is in a different bucket, not gone. So every key is read from BOTH and
   merged once, then written back shared — the next time each person opens the
   tile, whatever was stranded on their device is lifted into the shared copy.
     • **SIGN-OUT LOG MERGES** (union by entry id, newest first). It is
       append-only HISTORY, and every entry is somebody's record of taking
       something out of locked storage. Losing any of it is the whole problem
       repeating.
     • **THE OTHER THREE DO NOT MERGE — SHARED WINS, personal is adopted only
       when shared is empty.** Quantities, custom items and hidden items are a
       working DRAFT of one order, not history. Merging two people's drafts
       would silently add quantities nobody typed. A draft has one right answer;
       a log has all of them. */
const readBoth = async (key) => {
  /* getResult, not get — get returns null for BOTH "nothing stored" and "read
     failed", so a dropped connection loaded every draft and log here as empty,
     and the next save wrote that emptiness over the shared copy. ok:false
     travels up and freezes every write until a clean reload. (get/getResult
     never throw; the old .catch here could not run.) */
  const [shared, mine] = await Promise.all([
    window.storage.getResult(key, true),
    window.storage.getResult(key),
  ]);
  const parse = (r) => { try { return r?.value ? JSON.parse(r.value) : null; } catch { return null; } };
  return { ok: shared.ok && mine.ok, shared: parse(shared), mine: parse(mine) };
};

/* Shared wins; a personal copy is only lifted in when shared holds nothing. */
const pickDraft = (b, empty) => {
  const has = (v) => v && (Array.isArray(v) ? v.length > 0 : Object.keys(v).length > 0);
  if (has(b.shared)) return b.shared;
  if (has(b.mine)) return b.mine;
  return empty;
};

/* Union by id, newest first. Never drops an entry from either side. */
const mergeLog = (b) => {
  const out = [];
  const seen = new Set();
  for (const e of [...(Array.isArray(b.shared) ? b.shared : []), ...(Array.isArray(b.mine) ? b.mine : [])]) {
    if (!e || !e.id || seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out.sort((a, z) => String(z.at || "").localeCompare(String(a.at || "")));
};

async function loadStorage() {
  const [q, c, r, s, o, v] = await Promise.all([
    readBoth(QTYS_KEY), readBoth(CUSTOM_KEY), readBoth(REMOVED_KEY), readBoth(SIGNOUT_KEY),
    readBoth(ORDERS_KEY), readBoth(OVERRIDES_KEY),
  ]);
  return {
    // ok:false on ANY key freezes every write in the tile — the sign-out log
    // and order history are append-only records; one save off a failed read
    // would replace the whole shared log with this device's slice.
    /* ⚠️ OVERRIDES JOINS THE GATE, AND THAT IS SAFE ONLY BECAUSE A KEY THAT
       WAS NEVER WRITTEN READS ok:true. Checked before adding it: kvReadDirect
       uses maybeSingle(), so a missing row comes back {ok:true, value:null},
       not an error. Had it been ok:false, adding a brand-new key here would
       have frozen every write in this tile for all 106 people on first load. */
    ok: q.ok && c.ok && r.ok && s.ok && o.ok && v.ok,
    qtys:    pickDraft(q, {}),
    custom:  pickDraft(c, []),
    removed: pickDraft(r, []),
    overrides: pickDraft(v, {}),
    signout: mergeLog(s).slice(0, SIGNOUT_CAP),
    // mergeLog, not pickDraft — orders are a LOG. Two leaders ordering from
    // two devices must union, never have one side win and drop the other.
    orders:  mergeLog(o).slice(0, ORDERS_CAP),
  };
}

/* Every saver returns whether the write landed. window.storage.set reports a
   refused write by RETURNING FALSE, never by throwing — the old try/catch
   versions swallowed nothing (there was nothing to catch) and told every
   caller silence meant saved. */
async function saveQtys(qtys) {
  return (await window.storage.set(QTYS_KEY, JSON.stringify(qtys), true)) !== false;
}
async function saveCustom(items) {
  return (await window.storage.set(CUSTOM_KEY, JSON.stringify(items), true)) !== false;
}
async function saveRemoved(ids) {
  return (await window.storage.set(REMOVED_KEY, JSON.stringify(ids), true)) !== false;
}
async function saveOverrides(map) {
  return (await window.storage.set(OVERRIDES_KEY, JSON.stringify(map), true)) !== false;
}
async function saveSignout(log) {
  return (await window.storage.set(SIGNOUT_KEY, JSON.stringify(log), true)) !== false;
}
async function saveOrders(log) {
  return (await window.storage.set(ORDERS_KEY, JSON.stringify(log), true)) !== false;
}

// Who is signed in — same accessor the rest of the Hub uses. Falls back to "".
function signedInName() {
  try {
    const raw = localStorage.getItem("gcfcr-access-user");
    if (!raw) return "";
    const u = JSON.parse(raw);
    return (u && (u.name || u.first || "")) || "";
  } catch { return ""; }
}

const shortDate = iso => {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " · " +
           d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  } catch { return ""; }
};
const dayKey = iso => {
  try { return new Date(iso).toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric" }); }
  catch { return "—"; }
};

// Post the current order to Slack via the Worker's channel-name resolver.
// Returns { ok, error }.
async function postOrderToSlack(items, getQty, who) {
  const lines = [];
  for (const cat of CAT_ORDER) {
    const catItems = items.filter(i => i.cat === cat && getQty(i.id) > 0);
    if (!catItems.length) continue;
    lines.push(`*${cat}*`);
    catItems.forEach(i => {
      lines.push(`• ${i.name}${i.sku ? ` (SKU ${i.sku})` : ""} — ×${getQty(i.id)}`);
    });
  }
  const custom = items.filter(i => i.custom && !CAT_ORDER.includes(i.cat) && getQty(i.id) > 0);
  if (custom.length) {
    lines.push("*Custom*");
    custom.forEach(i => lines.push(`• ${i.name}${i.sku ? ` (SKU ${i.sku})` : ""} — ×${getQty(i.id)}`));
  }
  const totalUnits = items.reduce((s, i) => s + getQty(i.id), 0);
  const totalSkus = items.filter(i => getQty(i.id) > 0).length;

  // The name goes in the Slack post too, not just the Hub log. Every order ever
  // posted to this channel was anonymous, so nobody could ask the person who
  // placed it what they meant.
  const by = String(who || "").trim();
  const text =
    `*Supply Central order submitted* — ${totalSkus} SKUs, ${totalUnits} units` +
    (by ? `\nPlaced by ${by}` : "") + `\n\n` +
    lines.join("\n") +
    `\n\n<!channel>`;

  try {
    const res = await fetch("/api/slack-notify", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hub-token": hubToken() },
      /* ⚠️ THE HUB COPY IS THE DELIVERY, THE SLACK POST IS THE COPY. With the
         Inventory channel switched off this order used to reach nobody at all;
         the announcement is what makes it exist outside this tile. */
      body: JSON.stringify({ into: ORDER_SLACK_PURPOSE, text, announce: { title: "Supply order placed" } }),
    });
    const data = await res.json();
    /* ⚠️ `sent: false` IS A SUCCESS. The store switched its Inventory channel
       off, so the route declined on purpose and says so. Carrying that flag up
       is what lets the confirmation stop claiming a Slack post that the store
       has asked not to happen. */
    return { ok: res.ok && data.ok, sent: data.sent !== false, announced: data.announced === true, error: data.error };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ─── ItemRow ─────────────────────────────────────────────────────────────────
function ItemRow({ item, qty, onQty, manage, onRemove }) {
  const active = qty > 0;
  return (
    <div className={`px-3 py-2.5 flex items-center gap-2 ${active && !manage ? "bg-red-50" : ""}`}>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-semibold leading-snug ${active && !manage ? "text-red-900" : "text-gray-800"}`}>
          {item.name}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {item.sku && <span className="text-xs text-gray-400">SKU {item.sku}</span>}
          {item.par > 0 && <span className="text-xs text-gray-300">· par {item.par}</span>}
          {item.custom && <span className="text-xs bg-purple-100 text-purple-600 px-1 rounded">custom</span>}
        </div>
      </div>
      {manage ? (
        <button onClick={() => onRemove(item)}
          className="shrink-0 text-xs font-bold text-red-600 border border-red-200 bg-red-50 rounded-full px-3 py-1.5 hover:bg-red-100">
          ✕ Remove
        </button>
      ) : (
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => onQty(item.id, qty - 1)}
            className={`w-8 h-8 rounded-full font-bold text-xl flex items-center justify-center transition-colors ${
              active ? "bg-red-100 text-red-700 hover:bg-red-200" : "bg-gray-100 text-gray-400 hover:bg-gray-200"
            }`}>−</button>
          <span className={`w-8 text-center text-sm font-bold tabular-nums ${active ? "text-red-700" : "text-gray-400"}`}>
            {qty}
          </span>
          <button onClick={() => onQty(item.id, qty + 1)}
            className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 font-bold text-xl flex items-center justify-center hover:bg-gray-200">+</button>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
/* ⚠️ `user` was being passed by App.jsx all along and thrown away — this
   component took no props at all. That is why no order could say who placed it.
   Prefer the prop over signedInName(): on a shared store iPad the localStorage
   snapshot can be whoever signed in last, while the prop is the live session. */
export default function SupplyCentral({ user = {} }) {
  const [tab, setTab]           = useState("browse");
  const [qtys, setQtys]         = useState({});
  const [custom, setCustom]     = useState([]);
  const [removed, setRemoved]   = useState([]);
  const [overrides, setOverrides] = useState({});
  const [manage, setManage]     = useState(false);
  const [loading, setLoading]   = useState(true);
  const [saved, setSaved]       = useState(false);
  // A hydrate read failed → every write here refuses until a clean reload
  // (the logs are append-only records; a save now would replace the shared
  // copy with this device's slice). saveWarn = a write after a clean load
  // came back false; it clears on the next write that lands.
  const [loadFailed, setLoadFailed] = useState(false);
  const loadFailedRef = useRef(false);
  const [saveWarn, setSaveWarn] = useState(false);
  const [search, setSearch]     = useState("");
  const [activeCat, setActiveCat] = useState("All");
  const [showAdd, setShowAdd]   = useState(false);
  const [newItem, setNewItem]   = useState({ name:"", sku:"", cat:"Raw Area", par:"" });

  // Sign-out log state
  const [signout, setSignout]   = useState([]);
  const [soItem, setSoItem]     = useState("");
  const [soQty, setSoQty]       = useState(1);
  const [soWho, setSoWho]       = useState("");
  const [soNote, setSoNote]     = useState("");
  const [soSearch, setSoSearch] = useState("");
  const [soMsg, setSoMsg]       = useState(null);

  // Order submission state
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg]   = useState(null); // { ok, text }

  // Order history
  const [orders, setOrders]     = useState([]);

  useEffect(() => {
    loadStorage().then(({ ok, qtys: q, custom: c, removed: r, signout: s, orders: o, overrides: v }) => {
      loadFailedRef.current = !ok;
      setLoadFailed(!ok);
      setQtys(q);
      setCustom(c);
      setRemoved(r);
      setOverrides(v && typeof v === "object" ? v : {});
      setSignout(Array.isArray(s) ? s : []);
      setOrders(Array.isArray(o) ? o : []);
      setLoading(false);
    });
    setSoWho(signedInName());
  }, []);

  // Who is placing this. Prop first, cached snapshot only as a fallback.
  const orderedBy = String((user && user.name) || signedInName() || "").trim();

  /* ⚠️ THE OVERRIDE SPREADS ON TOP, so a field corp did not restate keeps its
     built-in value instead of blanking. The id is spread back LAST and can
     never be overwritten — every on-hand count, sign-out and order line is
     keyed to it. */
  const allItems = useMemo(() => [
    ...CATALOG
      .filter(i => !removed.includes(i.id))
      .map(i => (overrides[i.id] ? { ...i, ...overrides[i.id], id: i.id } : i)),
    ...custom.map(c => ({ ...c, custom: true })),
  ], [custom, removed, overrides]);

  const removedCatalog = useMemo(() => CATALOG.filter(i => removed.includes(i.id)), [removed]);

  const getQty = id => qtys[id] ?? 0;

  /* Every handler below refuses after a failed load, applies optimistically,
     then checks the saver's boolean — rolling back and warning on false
     instead of leaving an unsaved change on screen dressed as saved. */
  const removeItem = async (item) => {
    if (loadFailedRef.current) return; // banner explains
    if (item.custom) {
      const next = custom.filter(c => c.id !== item.id);
      setCustom(next);
      if (!(await saveCustom(next))) { setCustom(custom); setSaveWarn(true); return; }
    } else {
      const next = [...removed, item.id];
      setRemoved(next);
      if (!(await saveRemoved(next))) { setRemoved(removed); setSaveWarn(true); return; }
    }
    setSaveWarn(false);
    if (qtys[item.id]) {
      const nq = { ...qtys }; delete nq[item.id];
      setQtys(nq);
      if (!(await saveQtys(nq))) { setQtys(qtys); setSaveWarn(true); }
    }
  };

  const restoreItem = async (id) => {
    if (loadFailedRef.current) return; // banner explains
    const next = removed.filter(x => x !== id);
    setRemoved(next);
    if (!(await saveRemoved(next))) { setRemoved(removed); setSaveWarn(true); return; }
    setSaveWarn(false);
  };

  /* ── Bulk import from a pasted sheet. See CatalogImportBox.jsx. ──────────
     ⚠️⚠️ THIS DELIBERATELY DOES NOT REUSE removeItem(). That one DELETES the
     on-hand count as it hides the row, which is right for a person tapping ✕
     on one thing they do not carry. It is wrong for a bulk sweep: an import
     writes the LIST, never the PROGRESS, and a sheet that happens to omit a
     section would silently zero every count in it. Here the row is hidden and
     the count is left exactly where it is, so restoring brings the real
     number back.
     ⚠️ ONE STAMP PLUS AN INDEX FOR THE IDS. addCustomItem uses `cu_${Date.now()}`,
     which is unique for one tap and NOT unique for fifty rows written in the
     same millisecond — every one of them would collide onto a single id and
     share one on-hand count. */
  const applyImport = async ({ add = [], update = [], discontinue = [] }) => {
    if (loadFailedRef.current) return 0;
    const stamp = Date.now();
    const fresh = add.map((r, i) => ({
      id: `cu_${stamp}_${i}`,
      cat: r.cat,
      name: String(r.name || "").trim(),
      sku: String(r.sku || "").trim(),
      par: Number(r.par) || 0,
      custom: true,
    })).filter(x => x.name);
    const gone = discontinue.map(d => d.id).filter(id => !removed.includes(id));

    if (fresh.length) {
      const next = [...custom, ...fresh];
      setCustom(next);
      if (!(await saveCustom(next))) { setCustom(custom); setSaveWarn(true); return 0; }
    }
    if (gone.length) {
      const next = [...removed, ...gone];
      setRemoved(next);
      if (!(await saveRemoved(next))) { setRemoved(removed); setSaveWarn(true); return fresh.length; }
    }

    /* Corp's revised numbers, laid over the built-in catalog.
       ⚠️ A CUSTOM ITEM IS EDITED IN PLACE, NOT OVERRIDDEN. It has no built-in
       row underneath, so an entry in the overrides map would sit over nothing
       and the change would never render.
       ⚠️ PARTIAL, AND KEYED BY THE ITEM'S EXISTING ID. Only the fields corp
       restated are written; the id never moves, so every on-hand count,
       sign-out and order line still points at the same item. */
    const changed = update.filter(u => u && u.id && u.changes && Object.keys(u.changes).length);
    const baseUpd = changed.filter(u => !String(u.id).startsWith("cu_"));
    const custUpd = changed.filter(u => String(u.id).startsWith("cu_"));

    if (baseUpd.length) {
      const next = { ...overrides };
      baseUpd.forEach((u) => {
        const fields = {};
        Object.keys(u.changes).forEach((f) => { fields[f] = u.changes[f].to; });
        next[u.id] = { ...(next[u.id] || {}), ...fields };
      });
      setOverrides(next);
      if (!(await saveOverrides(next))) {
        setOverrides(overrides); setSaveWarn(true);
        return fresh.length + gone.length;
      }
    }
    if (custUpd.length) {
      const next = custom.map((c) => {
        const hit = custUpd.find((u) => u.id === c.id);
        if (!hit) return c;
        const fields = {};
        Object.keys(hit.changes).forEach((f) => { fields[f] = hit.changes[f].to; });
        return { ...c, ...fields, id: c.id };
      });
      setCustom(next);
      if (!(await saveCustom(next))) {
        setCustom(custom); setSaveWarn(true);
        return fresh.length + gone.length + baseUpd.length;
      }
    }

    setSaveWarn(false);
    return fresh.length + gone.length + changed.length;
  };

  const updateQty = async (id, val) => {
    if (loadFailedRef.current) return; // banner explains
    const qty = Math.max(0, parseInt(val) || 0);
    const next = { ...qtys, [id]: qty };
    // No rollback — this fires per keystroke and yanking the box back fights
    // the keyboard. The red line carries the truth; the next keystroke retries.
    setQtys(next);
    const ok = await saveQtys(next);
    setSaveWarn(!ok);
    if (ok) { setSaved(true); setTimeout(() => setSaved(false), 1200); }
  };

  const clearOrder = async () => {
    if (loadFailedRef.current) return; // banner explains
    const prev = qtys;
    setQtys({});
    if (!(await saveQtys({}))) { setQtys(prev); setSaveWarn(true); return; }
    setSaveWarn(false);
  };

  const addCustomItem = async () => {
    if (loadFailedRef.current) return; // banner explains
    if (!newItem.name.trim()) return;
    const item = {
      id: `cu_${Date.now()}`,
      cat: newItem.cat,
      name: newItem.name.trim(),
      sku: newItem.sku.trim(),
      par: parseInt(newItem.par) || 0,
      custom: true,
    };
    const next = [...custom, item];
    setCustom(next);
    // Keep the form filled on a failed save so nothing has to be retyped.
    if (!(await saveCustom(next))) { setCustom(custom); setSaveWarn(true); return; }
    setSaveWarn(false);
    setNewItem({ name:"", sku:"", cat:"Raw Area", par:"" });
    setShowAdd(false);
  };

  // ── Sign-out log ────────────────────────────────────────────────
  const soMatches = useMemo(() => {
    const q = soSearch.trim().toLowerCase();
    if (!q) return [];
    return allItems
      .filter(i => i.name.toLowerCase().includes(q) || (i.sku || "").toLowerCase().includes(q))
      .slice(0, 8);
  }, [allItems, soSearch]);

  const soPicked = useMemo(() => allItems.find(i => i.id === soItem) || null, [allItems, soItem]);

  const addSignout = async () => {
    if (loadFailedRef.current) { setSoMsg("This page didn't load fully — refresh, then log it"); setTimeout(() => setSoMsg(null), 4000); return; }
    if (!soPicked || !soWho.trim()) return;
    const entry = {
      id: `so_${Date.now()}`,
      itemId: soPicked.id,
      name: soPicked.name,
      sku: soPicked.sku || "",
      cat: soPicked.cat,
      qty: Math.max(1, parseInt(soQty) || 1),
      who: soWho.trim(),
      note: soNote.trim(),
      at: new Date().toISOString(),
    };
    const next = [entry, ...signout].slice(0, SIGNOUT_CAP);
    setSignout(next);
    // The form only clears once the entry is really in the log — a failed
    // write rolls back and leaves everything typed for the retry.
    if (!(await saveSignout(next))) {
      setSignout(signout);
      setSoMsg("Did not save — check the wifi and tap Log again");
      setTimeout(() => setSoMsg(null), 4000);
      return;
    }
    setSoItem(""); setSoSearch(""); setSoQty(1); setSoNote("");
    setSoMsg(`Logged ${entry.qty} × ${entry.name}`);
    setTimeout(() => setSoMsg(null), 2500);
  };

  const removeSignout = async (id) => {
    if (loadFailedRef.current) return; // banner explains
    const next = signout.filter(e => e.id !== id);
    setSignout(next);
    if (!(await saveSignout(next))) {
      setSignout(signout);
      setSoMsg("Did not save — check the wifi and try again");
      setTimeout(() => setSoMsg(null), 4000);
    }
  };

  // Grouped by day for the log view, newest first.
  const signoutByDay = useMemo(() => {
    const g = [];
    for (const e of signout) {
      const k = dayKey(e.at);
      const last = g[g.length - 1];
      if (last && last.day === k) last.entries.push(e);
      else g.push({ day: k, entries: [e] });
    }
    return g;
  }, [signout]);

  // Same grouping for order history. `orders` is state declared above, so this
  // memo is safe to run during render.
  const ordersByDay = useMemo(() => {
    const g = [];
    for (const o of orders) {
      const k = dayKey(o.at);
      const last = g[g.length - 1];
      if (last && last.day === k) last.orders.push(o);
      else g.push({ day: k, orders: [o] });
    }
    return g;
  }, [orders]);

  // Last 30 days, ranked by units pulled — this is the shrinkage read.
  const soTop30 = useMemo(() => {
    const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const tally = {};
    for (const e of signout) {
      if (new Date(e.at).getTime() < since) continue;
      const k = e.itemId || e.name;
      if (!tally[k]) tally[k] = { name: e.name, cat: e.cat, units: 0, pulls: 0 };
      tally[k].units += e.qty;
      tally[k].pulls += 1;
    }
    return Object.values(tally).sort((a, b) => b.units - a.units).slice(0, 6);
  }, [signout]);

  const so30Units = useMemo(() => soTop30.reduce((n, t) => n + t.units, 0), [soTop30]);

  // ── Filtered items ──────────────────────────────────────────────
  const filtered = useMemo(() => {
    let items = allItems;
    if (activeCat !== "All") items = items.filter(i => i.cat === activeCat);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(i =>
        i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q)
      );
    }
    return items;
  }, [allItems, activeCat, search]);

  const grouped = useMemo(() => {
    const g = {};
    const order = [...CAT_ORDER, ...custom.map(c => c.cat).filter(c => !CAT_ORDER.includes(c))];
    const seen = new Set();
    for (const cat of order) {
      if (seen.has(cat)) continue;
      seen.add(cat);
      const items = filtered.filter(i => i.cat === cat);
      if (items.length) g[cat] = items;
    }
    return g;
  }, [filtered, custom]);

  const orderItems = allItems.filter(i => getQty(i.id) > 0);
  const orderCount = orderItems.length;

  const submitOrder = async () => {
    if (orderCount === 0 || submitting) return;
    if (loadFailedRef.current) {
      // Order history never loaded — filing this order would replace the whole
      // shared History log with just this one entry. Hold the order (the cart
      // is untouched) until a clean reload.
      setSubmitMsg({ ok: false, text: "This page didn't load fully — refresh, then submit. Your order is still in the cart." });
      setTimeout(() => setSubmitMsg(null), 6000);
      return;
    }
    setSubmitting(true);
    setSubmitMsg(null);

    /* ⚠️ SNAPSHOT THE ORDER BEFORE ANYTHING ELSE. clearOrder() below wipes the
       quantities, and getQty reads them. Building this after the clear would
       record an order of nothing, which is the bug this whole change exists to
       stop happening. */
    const snapshot = orderItems.map(i => ({
      id: i.id, name: i.name, sku: i.sku || "", cat: i.cat, qty: getQty(i.id),
    }));
    const units = snapshot.reduce((n, i) => n + i.qty, 0);

    const { ok, sent, announced, error } = await postOrderToSlack(allItems, getQty, orderedBy);
    setSubmitting(false);

    if (!ok) {
      /* Nothing is logged on a failure ON PURPOSE. The cart is left alone, so
         the order is not lost and the leader retries. Logging here as well
         would file a second copy of the same order on every retry. */
      setSubmitMsg({ ok: false, text: `Couldn't send to Slack${error ? ` — ${error}` : ""}. Order is still saved — try again.` });
      return;
    }

    const entry = {
      id: `or_${Date.now()}`,
      at: new Date().toISOString(),
      who: orderedBy,
      items: snapshot,
      skus: snapshot.length,
      units,
    };
    const next = [entry, ...orders].slice(0, ORDERS_CAP);
    setOrders(next);
    const wrote = await saveOrders(next);
    // Roll the on-screen History back too — showing the entry filed while the
    // message says it is not would contradict itself.
    if (!wrote) setOrders(orders);

    clearOrder();
    setSubmitMsg(
      wrote
        /* ⚠️ NO CHANNEL NAME HERE ANY MORE. This page no longer knows which
           room the order lands in, and guessing one back at the leader is how
           "Order sent to #operational-success" kept being shown for a channel
           that had not existed for weeks. */
        /* ⚠️ WHAT ACTUALLY HAPPENED, NOT WHAT USUALLY HAPPENS. A store that
           has switched its Inventory channel off gets an order filed and no
           Slack post, and saying "sent to Slack" there is the same class of
           lie as the old "#operational-success" line — a page telling a leader
           about a room it did not reach. */
        ? sent
          ? { ok: true, text: "Order sent to Slack and filed under History" }
          : { ok: true, text: announced
              ? "Order posted to the Hub and filed under History. Slack is switched off for Inventory."
              : "Order filed under History. Slack is switched off for Inventory, and the Hub copy did not save." }
        /* Say it plainly rather than showing a tick. The order DID go out, so
           "failed" would be wrong, but it is not in History and re-sending it
           would order everything twice. */
        : { ok: false, text: "Order sent to Slack, but it could not be saved to History. Check Slack for the details." }
    );
    setTimeout(() => setSubmitMsg(null), 5000);
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-400 text-sm">Loading order guide…</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 font-sans">

      {/* ── Sticky Header ─────────────────────────────────────────── */}
      <div className="text-white px-4 pt-4 pb-3 sticky top-0 z-20 shadow-lg" style={{ background: "linear-gradient(120deg,#C62828 0%,#7F1D1D 55%)" }}>
        <div className="flex items-center justify-between mb-2.5">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest opacity-60">Chick-fil-A Supply Central</div>
            <div className="text-lg font-bold leading-tight">{STORE.name} FSR</div>
          </div>
          <div className="text-right">
            <div className={`text-xs font-medium transition-all duration-300 ${saved ? "opacity-100" : "opacity-0"}`}>✓ Saved</div>
            <div className="text-xs opacity-60 mt-0.5">{CATALOG.length + custom.length} items · {CAT_ORDER.length} categories</div>
          </div>
        </div>
        {/* Tabs */}
        <div className="flex gap-1.5">
          <button onClick={() => setTab("browse")}
            className={`flex-1 py-1.5 rounded-xl text-sm font-bold transition-all ${tab === "browse" ? "bg-white text-red-700" : "bg-white/20 text-white"}`}>
            Browse All
          </button>
          <button onClick={() => setTab("order")}
            className={`flex-1 py-1.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${tab === "order" ? "bg-white text-red-700" : "bg-white/20 text-white"}`}>
            My Order
            {orderCount > 0 && (
              <span className={`px-1.5 py-0.5 text-xs rounded-full font-bold ${tab === "order" ? "bg-red-700 text-white" : "bg-white text-red-700"}`}>
                {orderCount}
              </span>
            )}
          </button>
          <button onClick={() => setTab("signout")}
            className={`flex-1 py-1.5 rounded-xl text-sm font-bold transition-all ${tab === "signout" ? "bg-white text-red-700" : "bg-white/20 text-white"}`}>
            Sign-Out
          </button>
          <button onClick={() => setTab("history")}
            className={`flex-1 py-1.5 rounded-xl text-sm font-bold transition-all ${tab === "history" ? "bg-white text-red-700" : "bg-white/20 text-white"}`}>
            History
          </button>
        </div>
      </div>

      {loadFailed && (
        <div className="mx-3 mt-3 rounded-xl border px-3.5 py-2.5 text-[13px] font-semibold" style={{ background:"#FFFBEB", borderColor:"#F59E0B", color:"#92400E" }}>
          Part of this page did not load, so saving, ordering and logging are off —
          a save now could replace the shared logs with just this device's copy.
          Check the wifi and refresh the page.
        </div>
      )}
      {!loadFailed && saveWarn && (
        <div className="mx-3 mt-3 rounded-xl border px-3.5 py-2.5 text-[13px] font-semibold" style={{ background:"#FEF2F2", borderColor:"#DC2626", color:"#991B1B" }}>
          A change just now did not save — check the wifi and make it again.
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          BROWSE TAB
      ══════════════════════════════════════════════════════════════ */}
      {tab === "browse" && (
        <>
          {/* ── Search + Category Filter (sticky below header) ─────── */}
          <div className="bg-white border-b border-gray-100 px-3 pt-2.5 pb-2 sticky top-[88px] z-10 shadow-sm">
            <input
              type="text" value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or SKU…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mb-2 focus:outline-none focus:border-red-400 bg-gray-50"
            />
            <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{scrollbarWidth:"none"}}>
              {["All", ...CAT_ORDER].map(cat => (
                <button key={cat} onClick={() => setActiveCat(cat)}
                  className={`shrink-0 text-xs px-2.5 py-1 rounded-full font-semibold transition-all whitespace-nowrap ${
                    activeCat === cat
                      ? "bg-red-700 text-white shadow-sm"
                      : `${CAT_COLORS[cat] || "bg-gray-100 text-gray-500"} opacity-80`
                  }`}>
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* ── Item Groups ────────────────────────────────────────── */}
          <div className="px-3 pt-3 pb-28">
            <div className="flex justify-end mb-2">
              <button onClick={() => setManage(m => !m)}
                className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors ${manage ? "bg-red-700 text-white border-red-700" : "bg-white text-red-700 border-red-300"}`}>
                {manage ? "✓ Done editing" : "✎ Manage list"}
              </button>
            </div>
            {manage && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold rounded-xl px-3 py-2 mb-3">
                Editing the list — remove items you don't carry, or scroll down to restore removed ones. Custom items are deleted; catalog items can be restored. Changes sync to the team.
              </div>
            )}
            {manage && (
              <CatalogImportBox
                current={allItems}
                spec={SUPPLY_SPEC}
                want={["name", "sku", "cat", "par"]}
                allowedCats={CAT_ORDER}
                /* Was false until Aug 6 2026: there was nowhere to store a
                   changed par. Matt settled it — "the pars are set by corp. the
                   file came from corp originally" — so taking corp's newer
                   numbers is the whole point of the import, not a risk to guard
                   against. gcfcr-overrides-v3 is that place. */
                canUpdate
                onApply={applyImport}
                title="Import your order guide"
                /* ⚠️ THE WORDS ON THE SCREEN LIVE HERE, next to the data they
                   describe, so correcting them is a one-line edit in the tile
                   that owns them rather than a hunt through a shared component.
                   Matt, Aug 10 2026: the boxes must say exactly what to do so
                   nobody has to ask. */
                steps={[
                  "Sign in to Chick-fil-A Supply and open your order guide.",
                  "Download or export it. Pick CSV if it offers one. A PDF works too, it just needs a closer look at the preview.",
                  "Drop that file on the box below, or press Choose a file. You can also paste the rows straight in.",
                ]}
                hint="Items you already carry are matched by SKU and left alone. Pars come from corp, so importing a newer guide is how they get updated."
              />
            )}
            {Object.entries(grouped).map(([cat, items]) => (
              <div key={cat} className="mb-5">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${CAT_COLORS[cat] || "bg-gray-100 text-gray-500"}`}>
                    {cat}
                  </span>
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs text-gray-300 shrink-0">{items.length}</span>
                </div>
                <div className="rounded-2xl overflow-hidden divide-y divide-gray-50" style={{ background: cardSurface(), ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }}>
                  {items.map(item => (
                    <ItemRow key={item.id} item={item} qty={getQty(item.id)} onQty={updateQty} manage={manage} onRemove={removeItem} />
                  ))}
                </div>
              </div>
            ))}

            {Object.keys(grouped).length === 0 && (
              <div className="text-center py-16 text-gray-400">
                <div className="text-3xl mb-2">🔍</div>
                <div className="text-sm">No items match your search.</div>
              </div>
            )}

            {/* ── Add Custom Item ───────────────────────────────────── */}
            {showAdd ? (
              <div className="bg-white rounded-2xl shadow-sm p-4 mt-1 border border-gray-100">
                <div className="text-sm font-bold text-gray-700 mb-3">Add Custom Item</div>
                <div className="space-y-2 mb-3">
                  <input placeholder="Item name *" value={newItem.name}
                    onChange={e => setNewItem({...newItem, name: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-red-300" />
                  <input placeholder="SKU (optional)" value={newItem.sku}
                    onChange={e => setNewItem({...newItem, sku: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-red-300" />
                  <select value={newItem.cat} onChange={e => setNewItem({...newItem, cat: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-red-300 bg-white">
                    {CAT_ORDER.map(c => <option key={c}>{c}</option>)}
                  </select>
                  <input placeholder="Par qty (optional)" type="number" value={newItem.par}
                    onChange={e => setNewItem({...newItem, par: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-red-300" />
                </div>
                <div className="flex gap-2">
                  <button onClick={addCustomItem}
                    className="flex-1 bg-red-700 text-white rounded-xl py-2 text-sm font-bold active:bg-red-800">
                    Add Item
                  </button>
                  <button onClick={() => { setShowAdd(false); setNewItem({name:"",sku:"",cat:"Raw Area",par:""}); }}
                    className="flex-1 bg-gray-100 text-gray-600 rounded-xl py-2 text-sm font-bold">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowAdd(true)}
                className="w-full border-2 border-dashed border-gray-200 rounded-2xl py-3 text-sm text-gray-400 font-semibold hover:border-red-300 hover:text-red-400 transition-colors mt-1">
                + Add Custom Item
              </button>
            )}

            {manage && removedCatalog.length > 0 && (
              <div className="mt-4 bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
                <div className="text-sm font-bold text-gray-700 mb-1">Removed items ({removedCatalog.length})</div>
                <div className="text-xs text-gray-400 mb-3">Tap Restore to put a catalog item back on the list.</div>
                <div className="divide-y divide-gray-50">
                  {removedCatalog.map(item => (
                    <div key={item.id} className="py-2 flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-500 leading-snug">{item.name}</div>
                        <div className="text-xs text-gray-300">{item.cat}{item.sku ? ` · SKU ${item.sku}` : ""}</div>
                      </div>
                      <button onClick={() => restoreItem(item.id)}
                        className="shrink-0 text-xs font-bold text-green-700 border border-green-200 bg-green-50 rounded-full px-3 py-1.5 hover:bg-green-100">
                        ↩ Restore
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════
          ORDER TAB
      ══════════════════════════════════════════════════════════════ */}
      {tab === "order" && (
        <div className="px-3 pt-3 pb-28">
          {orderCount === 0 ? (
            <div className="text-center py-20">
              <div className="text-5xl mb-3">📋</div>
              <div className="text-gray-600 font-semibold text-sm">No items in your order yet</div>
              <div className="text-gray-400 text-xs mt-1 mb-5">
                Browse items and tap + to add them to your order.
              </div>
              <button onClick={() => setTab("browse")}
                className="bg-red-700 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-sm">
                Browse Items →
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-bold text-gray-700">{orderCount} items ready to order</div>
                <button onClick={clearOrder}
                  className="text-xs text-gray-400 border border-gray-200 px-3 py-1 rounded-full hover:border-red-300 hover:text-red-500 transition-colors">
                  Clear All
                </button>
              </div>

              {CAT_ORDER.map(cat => {
                const items = orderItems.filter(i => i.cat === cat);
                if (!items.length) return null;
                return (
                  <div key={cat} className="mb-4">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${CAT_COLORS[cat] || "bg-gray-100"}`}>
                        {cat}
                      </span>
                      <div className="flex-1 h-px bg-gray-100" />
                    </div>
                    <div className="rounded-2xl overflow-hidden divide-y divide-gray-50" style={{ background: cardSurface(), ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }}>
                      {items.map(item => (
                        <div key={item.id} className="px-3 py-2.5 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-gray-900 leading-snug">{item.name}</div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              {item.sku ? `SKU ${item.sku}` : "No SKU"}
                              {item.par > 0 && ` · par ${item.par}`}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-xl font-bold text-red-700 leading-none">×{getQty(item.id)}</div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => updateQty(item.id, getQty(item.id) - 1)}
                              className="w-8 h-8 rounded-full bg-red-100 text-red-700 font-bold text-xl flex items-center justify-center hover:bg-red-200">−</button>
                            <button onClick={() => updateQty(item.id, getQty(item.id) + 1)}
                              className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 font-bold text-xl flex items-center justify-center hover:bg-gray-200">+</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Custom items in order */}
              {(() => {
                const items = orderItems.filter(i => i.custom && !CAT_ORDER.includes(i.cat));
                if (!items.length) return null;
                return (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">Custom</span>
                      <div className="flex-1 h-px bg-gray-100" />
                    </div>
                    <div className="rounded-2xl overflow-hidden divide-y divide-gray-50" style={{ background: cardSurface(), ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }}>
                      {items.map(item => (
                        <div key={item.id} className="px-3 py-2.5 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-gray-900">{item.name}</div>
                            <div className="text-xs text-gray-400">{item.sku || "No SKU"}</div>
                          </div>
                          <div className="text-xl font-bold text-red-700 shrink-0">×{getQty(item.id)}</div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => updateQty(item.id, getQty(item.id) - 1)}
                              className="w-8 h-8 rounded-full bg-red-100 text-red-700 font-bold text-xl flex items-center justify-center">−</button>
                            <button onClick={() => updateQty(item.id, getQty(item.id) + 1)}
                              className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 font-bold text-xl flex items-center justify-center">+</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div className="mt-4 bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
                <div className="text-xs text-gray-400 mb-1">Total SKUs to order</div>
                <div className="text-4xl font-bold text-red-700">{orderCount}</div>
                <div className="text-xs text-gray-400 mt-1">
                  {orderItems.reduce((sum, i) => sum + getQty(i.id), 0)} total units
                </div>
              </div>

              {/* Submit order → Slack, room chosen by the Worker from config */}
              {submitMsg && (
                <div className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold text-center ${submitMsg.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                  {submitMsg.text}
                </div>
              )}
              <button onClick={submitOrder} disabled={submitting}
                className={`w-full mt-4 rounded-2xl py-3.5 text-sm font-bold shadow-sm transition-colors ${
                  submitting ? "bg-gray-200 text-gray-500" : "bg-red-700 text-white active:bg-red-800"
                }`}>
                {submitting ? "Sending…" : "Submit Order"}
              </button>
              <div className="text-xs text-gray-400 text-center mt-2">
                Posts the full order list to Slack, then clears your cart.
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          SIGN-OUT TAB — who pulled what from locked supply storage
      ══════════════════════════════════════════════════════════════ */}
      {tab === "signout" && (
        <div className="px-3 pt-3 pb-28">

          {/* ── Log an item out ─────────────────────────────────────── */}
          <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
            <div className="text-sm font-bold text-gray-700 mb-1">Sign an item out</div>
            <div className="text-xs text-gray-400 mb-3">
              Anything pulled from locked storage gets logged here — item, count, and who took it.
            </div>

            {soPicked ? (
              <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-900 leading-snug">{soPicked.name}</div>
                  <div className="text-xs text-gray-400">{soPicked.cat}{soPicked.sku ? ` · SKU ${soPicked.sku}` : ""}</div>
                </div>
                <button onClick={() => { setSoItem(""); setSoSearch(""); }}
                  className="shrink-0 text-xs font-bold text-gray-400 border border-gray-200 rounded-full px-2.5 py-1">
                  Change
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text" value={soSearch}
                  onChange={e => setSoSearch(e.target.value)}
                  placeholder="Find the item by name or SKU…"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mb-2 focus:outline-none focus:border-red-400 bg-gray-50"
                />
                {soMatches.length > 0 && (
                  <div className="border border-gray-100 rounded-xl overflow-hidden divide-y divide-gray-50 mb-2">
                    {soMatches.map(i => (
                      <button key={i.id} onClick={() => { setSoItem(i.id); setSoSearch(""); }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50">
                        <div className="text-sm font-semibold text-gray-800 leading-snug">{i.name}</div>
                        <div className="text-xs text-gray-400">{i.cat}{i.sku ? ` · SKU ${i.sku}` : ""}</div>
                      </button>
                    ))}
                  </div>
                )}
                {soSearch.trim() && soMatches.length === 0 && (
                  <div className="text-xs text-gray-400 mb-2 px-1">No item matches that.</div>
                )}
              </>
            )}

            <div className="flex gap-2 mb-2">
              <div className="w-24 shrink-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Qty</div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setSoQty(q => Math.max(1, (parseInt(q) || 1) - 1))}
                    className="w-8 h-9 rounded-l-xl bg-gray-100 text-gray-600 font-bold text-lg">−</button>
                  <input type="number" inputMode="numeric" value={soQty}
                    onChange={e => setSoQty(e.target.value)}
                    className="w-10 h-9 border-y border-gray-200 text-center text-sm font-bold focus:outline-none" />
                  <button onClick={() => setSoQty(q => (parseInt(q) || 1) + 1)}
                    className="w-8 h-9 rounded-r-xl bg-gray-100 text-gray-600 font-bold text-lg">+</button>
                </div>
              </div>
              <div className="flex-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Taken by</div>
                <input type="text" value={soWho}
                  onChange={e => setSoWho(e.target.value)}
                  placeholder="Name"
                  className="w-full h-9 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:border-red-400" />
              </div>
            </div>

            <input type="text" value={soNote}
              onChange={e => setSoNote(e.target.value)}
              placeholder="Reason or station (optional)"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mb-3 focus:outline-none focus:border-red-400" />

            {soMsg && (
              <div className="rounded-xl px-3 py-2 mb-2 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 text-center">
                ✓ {soMsg}
              </div>
            )}

            <button onClick={addSignout} disabled={!soPicked || !soWho.trim()}
              className={`w-full rounded-xl py-2.5 text-sm font-bold transition-colors ${
                !soPicked || !soWho.trim() ? "bg-gray-200 text-gray-400" : "bg-red-700 text-white active:bg-red-800"
              }`}>
              Log sign-out
            </button>
          </div>

          {/* ── 30-day pull summary ─────────────────────────────────── */}
          {soTop30.length > 0 && (
            <div className="mt-4 bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
              <div className="flex items-baseline justify-between mb-3">
                <div className="text-sm font-bold text-gray-700">Most pulled · last 30 days</div>
                <div className="text-xs text-gray-400">{so30Units} units</div>
              </div>
              <div className="space-y-2">
                {soTop30.map((t, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-gray-700 truncate">{t.name}</div>
                      <div className="h-1.5 rounded-full bg-gray-100 mt-1 overflow-hidden">
                        <div className="h-full rounded-full"
                          style={{ width: `${soTop30[0].units ? (t.units / soTop30[0].units) * 100 : 0}%`,
                                   background: "linear-gradient(90deg,#C62828,#7F1D1D)" }} />
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-bold text-red-700 leading-none">{t.units}</div>
                      <div className="text-[10px] text-gray-400">{t.pulls} pull{t.pulls === 1 ? "" : "s"}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── The log ─────────────────────────────────────────────── */}
          <div className="mt-4">
            <div className="text-sm font-bold text-gray-700 mb-2">Sign-out log</div>
            {signout.length === 0 ? (
              <div className="text-center py-14 bg-white rounded-2xl border border-gray-100">
                <div className="text-4xl mb-2">🔐</div>
                <div className="text-gray-600 font-semibold text-sm">Nothing signed out yet</div>
                <div className="text-gray-400 text-xs mt-1">The first entry shows up here.</div>
              </div>
            ) : (
              signoutByDay.map(group => (
                <div key={group.day} className="mb-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 whitespace-nowrap">
                      {group.day}
                    </span>
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-xs text-gray-300 shrink-0">
                      {group.entries.reduce((n, e) => n + e.qty, 0)} units
                    </span>
                  </div>
                  <div className="rounded-2xl overflow-hidden divide-y divide-gray-50" style={{ background: cardSurface(), ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D }}>
                    {group.entries.map(e => (
                      <div key={e.id} className="px-3 py-2.5 flex items-center gap-3">
                        <div className="shrink-0 w-9 text-center">
                          <div className="text-lg font-bold text-red-700 leading-none">{e.qty}</div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-gray-900 leading-snug">{e.name}</div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {e.who} · {shortDate(e.at)}{e.note ? ` · ${e.note}` : ""}
                          </div>
                        </div>
                        <button onClick={() => removeSignout(e.id)}
                          className="shrink-0 text-xs text-gray-300 hover:text-red-500 px-2 py-1"
                          aria-label="Remove entry">
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          HISTORY TAB — every order that has actually been submitted.
          Read-only on purpose. The sign-out log has a delete button because a
          mis-typed pull is a data-entry slip; a submitted order is a thing that
          happened and already went to Slack, so it is not ours to erase.
      ══════════════════════════════════════════════════════════════ */}
      {tab === "history" && (
        <div className="px-3 py-3">
          <div className="bg-white rounded-2xl shadow-sm p-3 mb-3">
            <div className="text-sm font-bold text-gray-900">Order history</div>
            <div className="text-xs text-gray-400 mt-0.5">
              {orders.length === 0
                ? "Nothing submitted yet."
                : `${orders.length} order${orders.length === 1 ? "" : "s"} · newest first`}
            </div>
          </div>

          {orders.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm px-4 py-8 text-center">
              <div className="text-sm text-gray-400">No orders here yet.</div>
              <div className="text-xs text-gray-300 mt-1.5 leading-relaxed">
                Orders submitted before July 30 2026 were never recorded and cannot
                be shown. Everything submitted from now on lands here.
              </div>
            </div>
          ) : (
            ordersByDay.map(group => (
              <div key={group.day} className="mb-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 whitespace-nowrap">
                    {group.day}
                  </span>
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs text-gray-300 shrink-0">
                    {group.orders.reduce((n, o) => n + (o.units || 0), 0)} units
                  </span>
                </div>

                {group.orders.map(o => (
                  <div key={o.id} className="bg-white rounded-2xl shadow-sm overflow-hidden mb-2">
                    <div className="px-3 py-2.5 border-b border-gray-50">
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="text-sm font-semibold text-gray-900">
                          {o.who ? o.who : "Name not recorded"}
                        </div>
                        <div className="text-xs text-gray-400 shrink-0">{shortDate(o.at)}</div>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {o.skus} SKU{o.skus === 1 ? "" : "s"} · {o.units} unit{o.units === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {(o.items || []).map(it => (
                        <div key={it.id} className="px-3 py-2 flex items-center gap-3">
                          <div className="shrink-0 w-9 text-center">
                            <div className="text-base font-bold text-red-700 leading-none">{it.qty}</div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-gray-900 leading-snug">{it.name}</div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              {it.cat}{it.sku ? ` · SKU ${it.sku}` : ""}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
