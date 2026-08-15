/* ============================================================================
   wasteMenu.js — Gate City Hub

   THE WASTE MENU. One list, for the WasteTracker tile and for the Worker's
   weekly waste report.

   🐛 WHY THIS FILE EXISTS (Aug 4 2026). The Worker kept its own hand-copied
   WASTE_MENU and it had fallen two items behind the tile: "Fruit Cup (Small)"
   and "IceDream (Gal/Qt)", both added Jul 28. An item the Worker does not know
   prices at $0, so every small fruit cup logged counted as $0.00 in the Sunday
   post to the whole inventory channel while the daily post from the tile
   counted the same cup at $4.09. Two reports on the same waste, disagreeing,
   and the cheaper one going to the widest audience.
   ⚠️ Setting a price in Manage Prices did not fix it either: the Worker's
   priceOf falls back to the menu row, and there was no row to fall back to.

   ⚠️ A LEAF ON PURPOSE — THIS FILE IMPORTS NOTHING. The tile is a React
   component and the report runs in the Worker; a module depending on neither is
   the only safe way for both to hold one list. Same rule nameMatch.js and
   slScorecardDefs.js exist under.

   ⚠️ ADD OR REPRICE AN ITEM HERE, NEVER IN A CALLER. Custom items and per-item
   price overrides still live in KV and still layer on top of this; what must
   not exist again is a second hardcoded copy.
   ============================================================================ */

export const WASTE_MENU = [
  // BREAKFAST (sellable)
  {id:"bf04",name:"Sausage",                  cat:"Breakfast",  price:0.00, bulk:true},
  {id:"bf11",name:"Sausage Biscuit",          cat:"Breakfast",  price:0.00},
  {id:"bf12",name:"Burritos",                 cat:"Breakfast",  price:4.99},
  {id:"bf13",name:"Bowls",                    cat:"Breakfast",  price:4.99},
  {id:"bf14",name:"Chicken Biscuit",          cat:"Breakfast",  price:3.69},
  {id:"bf23",name:"Spicy Chicken Biscuit",    cat:"Breakfast",  price:0.00},
  {id:"bf24",name:"Spicy Chicken Muffin",     cat:"Breakfast",  price:0.00},
  {id:"bf15",name:"Chicken Muffin",           cat:"Breakfast",  price:0.00},
  {id:"bf16",name:"Bacon, Egg & Cheese Biscuit",   cat:"Breakfast", price:3.99},
  {id:"bf17",name:"Sausage, Egg & Cheese Biscuit", cat:"Breakfast", price:3.99},
  {id:"bf18",name:"Bacon, Egg & Cheese Muffin",    cat:"Breakfast", price:4.19},
  {id:"bf19",name:"Sausage, Egg & Cheese Muffin",  cat:"Breakfast", price:4.19},
  {id:"bf20",name:"Egg White Grill",          cat:"Breakfast",  price:4.99},
  {id:"bf21",name:"Minis (4 ct)",             cat:"Breakfast",  price:4.69},
  {id:"bf22",name:"Minis (10 ct)",            cat:"Breakfast",  price:0.00},
  // SANDWICHES (assembled)
  {id:"sw01",name:"Chicken Sandwich",         cat:"Sandwiches", price:4.99},
  {id:"sw02",name:"Deluxe Sandwich",          cat:"Sandwiches", price:5.79},
  {id:"sw03",name:"Spicy Chicken Sandwich",   cat:"Sandwiches", price:5.39},
  {id:"sw04",name:"Spicy Deluxe Sandwich",    cat:"Sandwiches", price:6.19},
  {id:"sw05",name:"Grilled Chicken Sandwich", cat:"Sandwiches", price:6.55},
  {id:"sw06",name:"Grilled Chicken Club",     cat:"Sandwiches", price:8.39},
  // ENTREES
  {id:"en01",name:"Filets",                   cat:"Entrees",    price:0.00, bulk:true},
  {id:"en02",name:"Spicy Filet",              cat:"Entrees",    price:0.00, bulk:true},
  {id:"en03",name:"Grilled Filet",            cat:"Entrees",    price:0.00, bulk:true},
  {id:"en04",name:"Nuggets (5 ct)",           cat:"Entrees",    price:0.00, bulk:true},
  {id:"en08",name:"Nuggets (8 ct)",           cat:"Entrees",    price:5.09, bulk:true},
  {id:"en09",name:"Nuggets (12 ct)",          cat:"Entrees",    price:6.95, bulk:true},
  {id:"en10",name:"Nuggets (30 ct)",          cat:"Entrees",    price:0.00, bulk:true},
  {id:"en05",name:"Grilled Nuggets (5 ct)",   cat:"Entrees",    price:0.00, bulk:true},
  {id:"en14",name:"Grilled Nuggets (8 ct)",   cat:"Entrees",    price:5.89, bulk:true},
  {id:"en15",name:"Grilled Nuggets (12 ct)",  cat:"Entrees",    price:8.39, bulk:true},
  {id:"en16",name:"Grilled Nuggets (30 ct)",  cat:"Entrees",    price:0.00, bulk:true},
  {id:"en11",name:"Strips (3 ct)",            cat:"Entrees",    price:5.39, bulk:true},
  {id:"en12",name:"Strips (4 ct)",            cat:"Entrees",    price:6.75, bulk:true},
  {id:"en13",name:"Strips (10 ct)",           cat:"Entrees",    price:0.00, bulk:true},
  {id:"en17",name:"Nuggets (single)",         cat:"Entrees",    price:0.00, bulk:true},
  {id:"en18",name:"Grilled Nuggets (single)", cat:"Entrees",    price:0.00, bulk:true},
  {id:"en19",name:"Strips (single)",          cat:"Entrees",    price:0.00, bulk:true},
  {id:"en07",name:"Veggie Wrap",              cat:"Entrees",    price:0.00},
  // SALADS
  {id:"sa01",name:"Cobb Salad",               cat:"Salads",     price:9.49},
  {id:"sa02",name:"Spicy Southwest Salad",    cat:"Salads",     price:9.69},
  {id:"sa03",name:"Market Salad",             cat:"Salads",     price:9.69},
  {id:"sa04",name:"Side Salad",               cat:"Salads",     price:4.19},
  // SIDES
  // Mac & Cheese and Noodle Soup are bulk:true — Yasmin and Karis weigh them,
  // so they open on LB/OZ instead of EACH. (Added 7/15/2026.)
  {id:"sd01",name:"Fries",                    cat:"Sides",      price:2.45},
  {id:"sd02",name:"Hashbrowns",               cat:"Sides",      price:1.65},
  {id:"sd03",name:"Large Hashbrowns",         cat:"Sides",      price:0.00},
  {id:"sd04",name:"Mac & Cheese",             cat:"Sides",      price:4.09, bulk:true},
  {id:"sd05",name:"Noodle Soup",              cat:"Sides",      price:3.95, bulk:true},
  {id:"sd06",name:"Side of Bacon",            cat:"Sides",      price:0.00},
  {id:"sd07",name:"Side of Sausage",          cat:"Sides",      price:0.00},
  /* ⚠️ TWO SIZES SINCE Jul 28 2026 (Karis: "we waisted a small fruit cup but
     there is no option I'm on the hub"). `sd08` KEEPS ITS ID and becomes the
     LARGE — every entry already logged against it was a large, and re-pointing
     an existing id at a new meaning would silently rewrite history. The small
     gets a fresh id.
     ⚠️ PRICE IS A GUESS AND IS MARKED AS ONE: 4.09 is the large. If the small
     is cheaper, the waste dollar figure runs high until somebody corrects it in
     Manage prices. Better slightly wrong and visible than absent. */
  {id:"sd08",name:"Fruit Cup (Large)",        cat:"Sides",      price:4.09},
  {id:"sd08s",name:"Fruit Cup (Small)",       cat:"Sides",      price:4.09},
  {id:"sd09",name:"Kale Crunch",              cat:"Sides",      price:4.09},
  {id:"sd10",name:"Waffle Chips (Original)",  cat:"Sides",      price:2.09},
  {id:"sd11",name:"Waffle Chips (CFA Sauce)", cat:"Sides",      price:2.09},
  {id:"sd12",name:"Applesauce",               cat:"Sides",      price:0.00},
  // A LA CARTE (odd items / components)
  {id:"bf01",name:"Breakfast Filet",          cat:"A La Carte", price:0.00, bulk:true},
  {id:"bf02",name:"Spicy Breakfast Filet",    cat:"A La Carte", price:0.00, bulk:true},
  {id:"bf03",name:"Grilled Breakfast Filet",  cat:"A La Carte", price:0.00, bulk:true},
  {id:"bf05",name:"White Egg",                cat:"A La Carte", price:0.00},
  {id:"bf06",name:"Yellow Egg",               cat:"A La Carte", price:0.00},
  {id:"bf07",name:"Scrambled Egg",            cat:"A La Carte", price:0.00, bulk:true},
  {id:"bf08",name:"Minis",                    cat:"A La Carte", price:0.00},
  {id:"bf09",name:"Biscuits",                 cat:"A La Carte", price:0.00},
  {id:"bf10",name:"Muffins",                  cat:"A La Carte", price:0.00},
  {id:"ac01",name:"White Bun",                cat:"A La Carte", price:0.00},
  {id:"ac02",name:"Brioche Bun",              cat:"A La Carte", price:0.00},
  {id:"ac03",name:"A La Carte Buns",          cat:"A La Carte", price:0.00},
  {id:"ac04",name:"American Cheese",          cat:"A La Carte", price:0.00},
  {id:"ac05",name:"Pepperjack Cheese",        cat:"A La Carte", price:0.00},
  {id:"ac06",name:"Colbyjack Cheese",         cat:"A La Carte", price:0.00},
  {id:"ac07",name:"Bacon Strips",             cat:"A La Carte", price:0.00},
  {id:"ac08",name:"Lettuce & Tomato",         cat:"A La Carte", price:0.00},
  // TREATS
  {id:"tr01",name:"IceDream",                 cat:"Treats",     price:1.79},
  // Bulk IceDream mix waste (tossed before serving — spoiled/expired mix,
  // not a single wasted cone/cup, which stays on the each-item above).
  // volWaste:true swaps this card's stepper for GAL/QT fields right in the
  // regular Waste tab (see EntryView). Under the hood it's still a plain
  // qty stored in quarts (gal folds in as ×4), so every existing $ total,
  // dashboard, CSV, and Slack summary works unmodified — price here is
  // read as "cost per quart." Starts at $0.00; tap to set the real cost.
  {id:"tr01g",name:"IceDream (Gal/Qt)",       cat:"Treats",     price:0.00, volWaste:true},
  {id:"tr10",name:"Ice Cream Mix",            cat:"Treats",     price:0.00, bulk:true, vol:true},
  // tr11 kept for history only (hidden from entry) so past "Quart" entries
  // still resolve to their old name in dashboards/reports after the merge.
  {id:"tr11",name:"Ice Cream Mix (Quart)",    cat:"Treats",     price:0.00, bulk:true, hidden:true},
  {id:"tr02",name:"Brownies",                 cat:"Treats",     price:2.25},
  {id:"tr03",name:"Chocolate Chunk Cookie",   cat:"Treats",     price:1.75},
  {id:"tr09",name:"Chocolate Chunk Cookie (6 ct)", cat:"Treats", price:9.75},
  {id:"tr04",name:"Berry Parfait",            cat:"Treats",     price:4.79},
  {id:"tr05",name:"Milkshake",                cat:"Treats",     price:4.75},
  {id:"tr06",name:"Frosted Lemonade",         cat:"Treats",     price:4.55},
  {id:"tr07",name:"Frosted Coffee",           cat:"Treats",     price:4.55},
  {id:"tr08",name:"Frosted Soda / Float",     cat:"Treats",     price:4.19},
  // DRINKS
  {id:"dr01",name:"Iced Tea (M)",             cat:"Drinks",     price:2.25},
  {id:"dr02",name:"Iced Tea (L)",             cat:"Drinks",     price:2.69},
  {id:"dr03",name:"Lemonade (M)",             cat:"Drinks",     price:2.59},
  {id:"dr04",name:"Lemonade (L)",             cat:"Drinks",     price:2.99},
  {id:"dr05",name:"Sunjoy (M)",               cat:"Drinks",     price:2.59},
  {id:"dr06",name:"Sunjoy (L)",               cat:"Drinks",     price:2.99},
  {id:"dr07",name:"Soft Drink (M)",           cat:"Drinks",     price:2.25},
  {id:"dr08",name:"Soft Drink (L)",           cat:"Drinks",     price:2.69},
  {id:"dr09",name:"Dasani Water",             cat:"Drinks",     price:2.25},
  {id:"dr10",name:"Cold Brew Iced Coffee",    cat:"Drinks",     price:4.09},
  {id:"dr11",name:"Simply Orange",            cat:"Drinks",     price:2.99},
  {id:"dr12",name:"Hot Coffee",               cat:"Drinks",     price:2.25},
];
