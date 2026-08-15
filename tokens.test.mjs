/* ============================================================================
   tokens.test.mjs — the token ledger's arithmetic, actually run.

   ⚠️⚠️ WRITTEN BECAUSE THE CLAIM WAS ALREADY THERE AND WAS NOT TRUE.
   tokens.js's header says "every function here is pure and node-testable" and
   TokensTile.jsx says the rules live in a leaf that is "pure and node-tested".
   On Aug 13 2026, the day the feature was switched ON for the first time,
   nothing in this repo imported tokens.js except the tile and no test of it
   existed anywhere. "node-testABLE" had quietly been read as "node-tested".

   That matters more here than almost anywhere else in the Hub. This is the one
   file that decides what a person has earned. A wrong balance is not a blank
   screen somebody reports — it is a number a team member believes, and a
   dispute a year from now that the ledger exists specifically to settle.

   ⚠️ RUN IT:  node tokens.test.mjs
   It imports the real module. It does not restate the rules in its own words.

   ⚠️ EVERY REFUSAL TEST IS PAIRED WITH AN ACCEPTANCE TEST. `makeEntry` returns
   null for anything malformed, so a version of it that returned null for
   EVERYTHING would pass a file full of "it refuses X" and ship a feature where
   nobody can ever be granted anything. The accepts come first for that reason.
   ============================================================================ */
import { TYPES, makeEntry, makeReversal, balanceOf, historyFor, canAfford,
  makeRedemption, catalogList, shopFor, entriesFor, balanceIn, balances,
  append } from "./tokens.js";

let pass = 0, fail = 0;
const t = (label, cond) => { if (cond) { pass++; } else { fail++; console.log(`  FAIL  ${label}`); } };
const group = (name) => console.log(`\n── ${name}`);

const earn = (over = {}) => makeEntry({ personId: "p1", amount: 10, reason: "Great save", byId: "boss", type: TYPES.EARN, ...over });

/* ═══ MAKING A MOVEMENT ═══════════════════════════════════════════════════ */
group("makeEntry accepts a good movement");
{
  const e = earn();
  t("an earn is created", !!e);
  t("amount survives", e.amount === 10);
  t("reason survives", e.reason === "Great save");
  t("it carries an id", typeof e.id === "string" && e.id.length > 3);
  t("it carries a timestamp", !isNaN(new Date(e.at)));
  t("a redeem is created", !!makeEntry({ personId: "p1", amount: -5, reason: "Shirt", byId: "boss", type: TYPES.REDEEM }));
  t("a reversal with a pointer is created", !!makeEntry({ personId: "p1", amount: -10, reason: "Oops", byId: "boss", type: TYPES.REVERSAL, reversalOf: "tk_1" }));
  t("whitespace is trimmed off the reason", earn({ reason: "  spaced  " }).reason === "spaced");
}

group("makeEntry refuses anything malformed");
{
  t("no blank reason", earn({ reason: "   " }) === null);
  t("no missing reason", earn({ reason: null }) === null);
  t("no blank personId", earn({ personId: "  " }) === null);
  t("no blank byId", earn({ byId: "" }) === null);
  t("no zero amount", earn({ amount: 0 }) === null);
  t("no fractional amount", earn({ amount: 2.5 }) === null);
  t("no NaN amount", earn({ amount: "abc" }) === null);
  t("no Infinity", earn({ amount: Infinity }) === null);
  t("no unknown type", earn({ type: "gift" }) === null);
  t("an EARN cannot be negative", earn({ amount: -10 }) === null);
  t("a REDEEM cannot be positive", makeEntry({ personId: "p1", amount: 5, reason: "x", byId: "b", type: TYPES.REDEEM }) === null);
  t("a REVERSAL needs a pointer", makeEntry({ personId: "p1", amount: -10, reason: "x", byId: "b", type: TYPES.REVERSAL }) === null);
}

/* ═══ REVERSING ═══════════════════════════════════════════════════════════ */
group("makeReversal");
{
  const orig = earn();
  const before = JSON.stringify(orig);
  const rev = makeReversal(orig, "boss", "Wrong person");
  t("a reversal is produced", !!rev);
  t("it is the exact opposite", rev.amount === -orig.amount);
  t("it points at the original", rev.reversalOf === orig.id);
  t("it is typed as a reversal", rev.type === TYPES.REVERSAL);
  /* ⚠️ THE ORIGINAL IS THE WHOLE POINT. An append-only ledger that quietly
     edits the row it is cancelling has no property worth having. */
  t("THE ORIGINAL IS UNTOUCHED", JSON.stringify(orig) === before);
  t("a reversal of a reversal is refused", makeReversal(rev, "boss", "no") === null);
  t("reversing nothing is refused", makeReversal(null, "boss", "x") === null);
  t("a default reason is supplied when none given", makeReversal(earn(), "boss", "").reason.includes("Great save"));
  const redeem = makeEntry({ personId: "p1", amount: -5, reason: "Shirt", byId: "b", type: TYPES.REDEEM });
  t("a redemption can be reversed back to positive", makeReversal(redeem, "boss", "returned").amount === 5);
}

/* ═══ THE BALANCE ═════════════════════════════════════════════════════════ */
group("balanceOf");
{
  t("empty is zero", balanceOf([]) === 0);
  t("a non-array is zero, not a crash", balanceOf(null) === 0 && balanceOf("x") === 0);
  t("it sums", balanceOf([{ amount: 10 }, { amount: 5 }]) === 15);
  t("an earn and a redeem net off", balanceOf([{ amount: 10 }, { amount: -4 }]) === 6);
  /* ⚠️ ONE NaN MUST NOT ERASE A WHOLE BALANCE. `10 + NaN` is NaN, which renders
     on screen as no balance at all rather than as an error anybody reports. */
  t("a corrupt row is SKIPPED, not coerced", balanceOf([{ amount: 10 }, { amount: "oops" }, { amount: 5 }]) === 15);
  t("a fractional row is skipped", balanceOf([{ amount: 10 }, { amount: 0.5 }]) === 10);
  t("a null row does not throw", balanceOf([{ amount: 10 }, null]) === 10);
  t("a reversal brings it back to zero", (() => {
    const e = earn();
    return balanceOf([e, makeReversal(e, "boss", "undo")]) === 0;
  })());
}

/* ═══ HISTORY ORDER ═══════════════════════════════════════════════════════ */
group("historyFor — newest first, and the same-millisecond tie");
{
  const a = { id: "a", at: "2026-08-01T10:00:00.000Z", amount: 1 };
  const b = { id: "b", at: "2026-08-02T10:00:00.000Z", amount: 1 };
  const c = { id: "c", at: "2026-08-03T10:00:00.000Z", amount: 1 };
  const stored = [a, b, c];
  const copy = JSON.stringify(stored);
  const h = historyFor(stored);
  t("newest first", h.map((x) => x.id).join("") === "cba");
  t("IT SORTS A COPY, the stored array is untouched", JSON.stringify(stored) === copy);
  t("a non-array is empty, not a crash", historyFor(null).length === 0);
  t("nulls are dropped", historyFor([a, null, b]).length === 2);

  /* ⚠️ THIS IS THE ONE THE FILE'S OWN COMMENT SAYS WOULD SURVIVE TO BECOME
     SOMEBODY'S CONFUSING SCREENSHOT. Two entries written in the same
     millisecond compare equal on `at`; a stable sort then falls back to
     insertion order, which is oldest-first — the exact opposite of the
     promise. Grants at human typing speed never collide. A test always does. */
  const same = "2026-08-04T10:00:00.000Z";
  const first = { id: "first", at: same, amount: 1 };
  const second = { id: "second", at: same, amount: 1 };
  const tie = historyFor([first, second]);
  t("SAME-MILLISECOND TIE: the later append reads first", tie[0].id === "second");
}

/* ═══ SPENDING, AND NEVER INTO DEBT ═══════════════════════════════════════ */
group("canAfford / makeRedemption");
{
  const wallet = [{ amount: 10 }];
  t("can afford exactly the balance", canAfford(wallet, 10) === true);
  t("can afford less", canAfford(wallet, 3) === true);
  t("CANNOT afford one more than the balance", canAfford(wallet, 11) === false);
  t("an empty wallet affords nothing", canAfford([], 1) === false);
  t("a zero cost is refused", canAfford(wallet, 0) === false);
  t("a negative cost is refused", canAfford(wallet, -5) === false);
  t("a fractional cost is refused", canAfford(wallet, 2.5) === false);

  const r = makeRedemption({ entries: wallet, personId: "p1", item: "Free shirt", cost: 4, byId: "boss" });
  t("an affordable redemption is written", !!r);
  t("it is NEGATIVE", r.amount === -4);
  t("the item name becomes the reason", r.reason === "Free shirt");
  t("it is typed as a redeem", r.type === TYPES.REDEEM);
  /* ⚠️ NO DEBT, EVER. */
  t("AN UNAFFORDABLE REDEMPTION IS REFUSED", makeRedemption({ entries: wallet, personId: "p1", item: "Big", cost: 99, byId: "boss" }) === null);
  t("a blank item is refused", makeRedemption({ entries: wallet, personId: "p1", item: "  ", cost: 1, byId: "boss" }) === null);
  t("spending everything lands exactly on zero", balanceOf([...wallet, makeRedemption({ entries: wallet, personId: "p1", item: "All", cost: 10, byId: "boss" })]) === 0);
}

/* ═══ THE CATALOG ═════════════════════════════════════════════════════════ */
group("catalogList / shopFor");
{
  t("a non-array is empty", catalogList(null).length === 0);
  const raw = [
    { name: "Free drink", cost: 5 },
    { name: "  ", cost: 5 },              // no name
    { name: "Bad", cost: 0 },             // zero cost
    { name: "Frac", cost: 1.5 },          // fractional cost
    { name: "Neg", cost: -2 },            // negative cost
    { name: "Old shirt", cost: 20, active: false },
  ];
  const list = catalogList(raw);
  t("only the valid items survive", list.length === 2);
  /* ⚠️ `it_` UNDERSCORE, THEN A HYPHEN SLUG. Written as "it-free-drink" first
     time and the assertion was the thing that was wrong, not the code — the
     sixth time that has happened in this repo. Suspect the assertion first. */
  t("an id is generated from the name", list[0].id === "it_free-drink");
  t("active defaults to true when absent", list[0].active === true);
  t("an explicit false is respected", list[1].active === false);
  t("a supplied id wins", catalogList([{ id: "keep", name: "X", cost: 1 }])[0].id === "keep");

  const shop = shopFor(raw, 10);
  t("the shop drops switched-off items", shop.length === 1);
  t("what the balance reaches is marked affordable", shop[0].affordable === true);
  t("out of reach is marked not affordable", shopFor(raw, 2)[0].affordable === false);
  t("exactly the price is affordable", shopFor(raw, 5)[0].affordable === true);
}

/* ═══ THE STORED MAP ══════════════════════════════════════════════════════ */
group("entriesFor / balanceIn / balances / append");
{
  const e1 = earn();
  const e2 = earn({ personId: "p2", amount: 30 });
  let ledger = {};
  ledger = append(ledger, e1);
  ledger = append(ledger, e2);

  t("append files under the person", entriesFor(ledger, "p1").length === 1);
  t("a second person is separate", entriesFor(ledger, "p2").length === 1);
  t("an unknown person is empty, not a crash", entriesFor(ledger, "nobody").length === 0);
  t("a blank id is empty", entriesFor(ledger, "  ").length === 0);
  t("an array ledger is refused", entriesFor([], "p1").length === 0);
  t("balanceIn reads through the map", balanceIn(ledger, "p1") === 10);

  /* ⚠️ APPEND RETURNS A NEW MAP. React state and an append-only record want the
     same thing, and a mutation here would edit history in place. */
  const before = JSON.stringify(ledger);
  const grown = append(ledger, earn({ amount: 7 }));
  t("APPEND DOES NOT MUTATE the map it was given", JSON.stringify(ledger) === before);
  t("the new map has the extra entry", entriesFor(grown, "p1").length === 2);
  t("appending nothing is a no-op", append(ledger, null) === ledger);
  t("appending onto a non-map still produces a map", entriesFor(append(null, e1), "p1").length === 1);

  const rows = balances(grown);
  t("everyone with a movement is listed", rows.length === 2);
  t("sorted by balance, highest first", rows[0].personId === "p2");
  t("the count is carried", rows.find((r) => r.personId === "p1").count === 2);
  t("a non-map is an empty list", balances(null).length === 0);
  t("somebody whose entries net to zero still appears", (() => {
    const e = earn({ personId: "p3" });
    let l = append({}, e);
    l = append(l, makeReversal(e, "boss", "undo"));
    const r = balances(l).find((x) => x.personId === "p3");
    return !!r && r.balance === 0 && r.count === 2;
  })());
}

/* ═══ A WHOLE STORY, END TO END ═══════════════════════════════════════════ */
group("one person's month");
{
  let l = {};
  const g1 = makeEntry({ personId: "amy", amount: 20, reason: "Covered a shift", byId: "matt", type: TYPES.EARN });
  const g2 = makeEntry({ personId: "amy", amount: 15, reason: "Clean audit", byId: "matt", type: TYPES.EARN });
  l = append(append(l, g1), g2);
  t("she has 35", balanceIn(l, "amy") === 35);

  const buy = makeRedemption({ entries: entriesFor(l, "amy"), personId: "amy", item: "Free meal", cost: 25, byId: "matt" });
  l = append(l, buy);
  t("after spending 25 she has 10", balanceIn(l, "amy") === 10);

  t("she cannot buy a 20 with 10", makeRedemption({ entries: entriesFor(l, "amy"), personId: "amy", item: "Hoodie", cost: 20, byId: "matt" }) === null);

  l = append(l, makeReversal(g2, "matt", "Audit was the other store"));
  t("reversing a 15 grant leaves her with -5... no: it leaves 10 - 15", balanceIn(l, "amy") === -5);
  /* ⚠️ A REVERSAL *CAN* PUSH A BALANCE NEGATIVE and that is correct, not a bug:
     the money was already spent. The no-debt rule blocks SPENDING below zero,
     which is a different question from correcting a grant that should never
     have been made. Recorded here so nobody "fixes" it into a silent refusal
     that leaves a wrong grant standing forever. */
  t("she cannot spend while negative", canAfford(entriesFor(l, "amy"), 1) === false);
  t("the history reads newest first", historyFor(entriesFor(l, "amy"))[0].type === TYPES.REVERSAL);
  t("nothing was ever removed: four movements stand", entriesFor(l, "amy").length === 4);
}

console.log(`\n${fail ? `${fail} FAILED, ` : ""}${pass} passed`);
process.exit(fail ? 1 : 0);
