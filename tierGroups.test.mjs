/* ============================================================================
   tierGroups.test.mjs — which tier does a job title land in?

       node tierGroups.test.mjs

   ⚠️ IT IMPORTS AND RUNS `hrTierOfTitle`. That is the point, and this one earned
   it immediately: the Lineup's top group was first written with the heading
   "Directors", and a person titled **Director** is rank 5, which is tier TWO.
   The heading was taken from App.jsx's own comment ("3 = Director"), which is
   wrong about its own ladder. A group headed "Directors" that contains no
   Directors is worse than no grouping at all, and nothing but running the
   function catches it.

   ⚠️ THE LADDER IS THE THING THAT DECIDES WHAT PEOPLE SEE. `hrTierOfTitle` reads
   the same HR_RANK_BY_TITLE that HR access, pay visibility and six other
   `roleTier` copies read. A wrong rung here is not a cosmetic grouping bug in
   one list — it is the number every one of those gates is derived from.
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hrRankOfTitle, hrTierOfTitle, HR_RANK_BY_TITLE } from "./hrRoster.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));

let pass = 0, fail = 0;
const t = (label, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}`); if (cond) pass++; else fail++; };
const group = (n) => console.log(`\n── ${n}`);

group("0. the module really loaded (controls)");
{
  t("hrTierOfTitle is a function", typeof hrTierOfTitle === "function");
  t("hrRankOfTitle is a function", typeof hrRankOfTitle === "function");
  t(`the rank ladder has rungs (${Object.keys(HR_RANK_BY_TITLE).length})`,
    Object.keys(HR_RANK_BY_TITLE).length > 10);
}

group("1. every title in the ladder, run rather than reasoned about");
{
  /* ⚠️ THE EXPECTED TIER IS WRITTEN OUT PER TITLE, not computed from the rank.
     Deriving the expectation from the same rank the code reads would assert
     nothing at all — it would be the implementation checking itself. */
  const WANT = {
    /* ★ `Support` is the HOST, not one of the store's people. Tier 3 because a
       host who cannot open HR Console cannot support anything — the same
       reasoning as Owner, graded separately here on purpose so the tier is a
       decision and not a side effect of its rank.
       ⚠️ TIER 3 IS THE ACCESS HALF ONLY. Being left OUT of headcount, turnover,
       the accountability chart and the team directory is a different pass and
       is NOT built. See the host-role spec in CLAUDE.md. */
    Support: 3,
    Owner: 3, "Human Resources": 3, "Accounts Payable": 3, Executive: 3,
    "Executive Director": 3, "Leadership Director": 3, "Leadership Development Director": 3,
    Director: 2, "Assistant Director": 2, Manager: 2,
    "Team Leader": 2, "Junior Team Leader": 2, "Senior Team Leader": 2, "Senior Trainer": 2,
    Trainer: 1, "Team Member": 1, "Junior Trainer": 1, Employee: 1, Payroll: 1, Limited: 1,
  };
  for (const [title, want] of Object.entries(WANT)) {
    const got = hrTierOfTitle(title);
    t(`${title} (rank ${hrRankOfTitle(title)}) → tier ${want}`, got === want);
  }

  /* ⚠️ NO RUNG MAY GO UNGRADED. If a title is added to the ladder and nobody
     adds it here, this fails rather than quietly leaving it untested — which is
     how a new senior title ends up filed with the team members. */
  const ungraded = Object.keys(HR_RANK_BY_TITLE).filter((k) => !(k in WANT));
  if (ungraded.length) console.log(`        ungraded: ${ungraded.join(", ")}`);
  t(`every ladder title is graded here${ungraded.length ? ` — ${ungraded.length} missing` : ""}`,
    ungraded.length === 0);
}

group("2. THE BUG THIS FILE WAS WRITTEN FOR");
{
  /* Kept as its own section so a future reader sees the trap rather than one
     assertion buried in twenty. */
  t("a DIRECTOR is tier 2, not tier 3", hrTierOfTitle("Director") === 2);
  t("tier 3 starts at rank 6", hrTierOfTitle("Leadership Development Director") === 3);
  t("and rank 5 does not reach it", hrRankOfTitle("Director") === 5 && hrTierOfTitle("Director") !== 3);
}

group("3. an unknown or empty title is a team member, never a leader");
{
  /* ⚠️ FAILING OPEN HERE WOULD BE A PERMISSION BUG. An unrecognised title must
     land at the BOTTOM, so a typo in somebody's role cannot promote them. */
  for (const junk of ["", null, undefined, "Nonsense Title", "  ", "OWNER"]) {
    t(`${JSON.stringify(junk)} → tier 1`, hrTierOfTitle(junk) === 1);
  }
}

group("4. the Lineup's rank BANDS, and every rung landing in exactly one");
{
  /* ⚠️ THIS SECTION USED TO READ PROSE and said so: "the weaker half of the
     test". Aug 14 2026 the Lineup replaced TIER_GROUPS with RANK_BANDS, after
     Matt asked for "leaders a seperate color, ads, ond and directors one" —
     tier 2 held Director, Assistant Director, Team Leader and Senior Trainer
     together and those are two different jobs.

     ⇒ The bands carry an explicit `min`, so this half is EXECUTED now rather
     than matched: the same first-match rule the component uses is run here over
     every rung of the real ladder. The heading checks are kept underneath,
     because a correct band under a wrong word is still a wrong screen. */
  const src = fs.readFileSync(path.join(DIR, "Availability.jsx"), "utf8");
  const block = src.match(/const RANK_BANDS = \[([\s\S]*?)\n\];/);
  t("RANK_BANDS was found in Availability.jsx (control)", !!block);

  if (block) {
    const bands = [...block[1].matchAll(/min:\s*(\d+)\s*,\s*key:\s*"([^"]+)"\s*,\s*label:\s*"([^"]+)"/g)]
      .map((m) => ({ min: Number(m[1]), key: m[2], label: m[3] }));
    console.log(`        ${bands.map((b) => `${b.min}+ ${b.label}`).join("  ·  ")}`);
    t(`four bands were parsed (${bands.length})`, bands.length === 4);

    /* ⚠️ ORDERED HIGH TO LOW, because the component takes the FIRST band whose
       min a rank clears. Out of order, every rank lands in the first entry. */
    t("they are listed top-down",
      bands.every((b, i) => i === 0 || b.min < bands[i - 1].min));
    t("the lowest band catches everything left", bands[bands.length - 1].min === 0);
    t("the headings are distinct",
      new Set(bands.map((b) => b.label.toLowerCase())).size === bands.length);
    /* The exact word that was wrong once: "Directors" over the rank-6+ group. */
    t(`the top band is not headed "Directors" (it is "${bands[0]?.label}")`,
      !!bands[0] && !/^directors$/i.test(bands[0].label));
    t("the top band still starts at rank 6, the tier-3 boundary", bands[0].min === 6);

    /* ★★ THE EXECUTED HALF. Every title on the real ladder, through the real
       rule, landing in exactly one band — and the two Matt named landing apart. */
    const bandOf = (role) => bands.find((b) => hrRankOfTitle(role) >= b.min);
    const every = Object.keys(HR_RANK_BY_TITLE);
    t(`every rung lands in a band (${every.length} titles)`, every.every((r) => !!bandOf(r)));

    t("★ a Director and a Team Leader are NOT in the same band",
      bandOf("Director").key !== bandOf("Team Leader").key);
    t("★ Director and Assistant Director ARE together",
      bandOf("Director").key === bandOf("Assistant Director").key);
    t("★ Team Leader and Senior Trainer are together",
      bandOf("Team Leader").key === bandOf("Senior Trainer").key);
    t("a Team Member is below both", bandOf("Team Member").min === 0);
    t("the Owner is in the top band", bandOf("Owner").key === bands[0].key);
    t("HR is in the top band too", bandOf("Human Resources").key === bands[0].key);

    /* ⚠️ FAILING OPEN HERE WOULD BE THE SAME PERMISSION BUG section 3 guards.
       An unreadable title must land at the BOTTOM, never in a leader band. */
    for (const junk of ["", null, undefined, "Nonsense Title", "  "]) {
      t(`${JSON.stringify(junk)} lands in the bottom band`, bandOf(junk).min === 0);
    }
  }
}

console.log(`\n${fail ? `${fail} FAILED, ` : ""}${pass} passed`);
process.exit(fail ? 1 : 0);
