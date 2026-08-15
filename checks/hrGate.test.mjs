/* HR full-read gate — the UI and the Worker must answer identically.
 *
 * 🐛 Jul 31 2026: HRConsole.jsx got the named-list rule on Jul 29 and the
 * Worker never did. `hrIsFullReader` compared rank alone, so anyone titled
 * Director (rank 5) failed the UI gate but PASSED the server gate and could
 * read every person's HR record through /api/hr-store. These asserts exist so
 * that cannot come back: every case below is a real person or a real title
 * somebody at Gate City holds or is about to hold.
 *
 * Run: node checks/hrGate.test.mjs
 */
import {
  hrIsFullReader, hrInConsole, hrPrimaryName, hrTitleFor, HR_SEED_ROLES,
} from "../hrRoster.js";

let pass = 0, fail = 0;
const ok = (cond, label) => {
  if (cond) { pass++; console.log("ok      " + label); }
  else { fail++; console.log("FAIL    " + label); }
};

/* Roster ids: Bri 17, Hannah 21, Matt 33, Nick 37, Cindy 90.
   `roles` stands in for gcfcr-hr-roles (title overrides), `added` for
   gcfcr-hr-added-v1 (anyone hired since the seed). */
const NO_ROLES = {};
const NO_ADDED = [];

// ── The five who SHOULD read everything ────────────────────────────────
ok(hrIsFullReader("21", NO_ROLES, NO_ADDED), "Hannah (21, Human Resources) passes");
ok(hrIsFullReader("33", NO_ROLES, NO_ADDED), "Matt (33, Executive Director) passes");
ok(hrIsFullReader("17", NO_ROLES, NO_ADDED), "Bri (17, Leadership Development Director) passes");
ok(hrIsFullReader("37", NO_ROLES, NO_ADDED), "Nick (37, Owner) passes");

/* Cindy is on the list by name and reaches full read two ways. Her seed title
   is Team Member; her live title is Human Resources (set Jul 30). Both the
   Payroll carve-out and the HR title must work, because which one applies has
   changed once already. */
ok(hrIsFullReader("90", { 90: "Payroll" }, NO_ADDED), "Cindy (90) passes via the Payroll carve-out");
ok(hrIsFullReader("90", { 90: "Human Resources" }, NO_ADDED), "Cindy (90) passes on her live Human Resources title");
ok(!hrIsFullReader("90", NO_ROLES, NO_ADDED), "Cindy on her raw SEED title (Team Member) does NOT pass — rank still applies");
/* Hannah, Jul 30: move Cindy to "Accounts Payable" but keep "the same functions
   as me". An unknown title scores 0, so without the rank entry this title
   change silently demotes her — the exact thing Hannah reported the day before. */
ok(hrIsFullReader("90", { 90: "Accounts Payable" }, NO_ADDED), "Cindy titled Accounts Payable keeps full HR access");
ok(!hrIsFullReader("20", { 20: "Accounts Payable" }, NO_ADDED), "Accounts Payable does NOT let a non-listed person in — the named list still rules");

// ── THE BUG: rank 5 without list membership ────────────────────────────
ok(!hrIsFullReader("20", { 20: "Director" }, NO_ADDED), "Daisy (20) titled Director FAILS — rank 5 is not membership");
ok(!hrIsFullReader("16", { 16: "Director" }, NO_ADDED), "Brandon (16) titled Director FAILS");
ok(!hrIsFullReader("23", NO_ROLES, NO_ADDED), "Kyleeka (23, Executive Director, rank 7) FAILS — no threshold can remove her, the list does");
ok(!hrIsFullReader("n_9999", NO_ROLES, [{ id: "n_9999", name: "Future Person", role: "Director" }]),
   "a future unknown Director hired after the seed FAILS");
ok(!hrIsFullReader("999", { 999: "Owner" }, NO_ADDED), "an unknown id titled Owner (rank 8) FAILS");

// ── Overrides only ever lower access ───────────────────────────────────
ok(!hrIsFullReader("21", NO_ROLES, NO_ADDED, "Team Member"),
   "Hannah with an override title of Team Member FAILS — an override closes the server gate too");
ok(hrIsFullReader("21", NO_ROLES, NO_ADDED, ""),
   "an empty override falls back to the stored title (Hannah still passes)");

// ── Null / junk is safe ────────────────────────────────────────────────
ok(!hrIsFullReader(null, NO_ROLES, NO_ADDED), "null id is safe");
ok(!hrIsFullReader(undefined, null, null), "undefined id with null KV maps is safe");
ok(!hrIsFullReader("", NO_ROLES, NO_ADDED), "empty-string id is safe");
ok(!hrInConsole(null) && !hrInConsole("") && !hrInConsole("nobody at all"), "hrInConsole rejects null, empty and unknown");

// ── The two keyings must name the same five ────────────────────────────
ok(hrInConsole("Hannah Jackson") && hrInConsole("  hannah   jackson  "),
   "name lookup is case- and whitespace-insensitive");
ok(hrInConsole("bri moore") && hrInConsole("brianna moore"), "both of Bri's spellings match");
ok(hrInConsole("21") && hrInConsole("90"), "id lookup matches the same people");
ok(!hrInConsole("Daisy Hernandez Espitia") && !hrInConsole("Kyleeka Gonzalez"), "non-members fail by name too");
["17", "21", "33", "37", "90"].forEach((id) => {
  ok(hrInConsole(hrPrimaryName(id)), `hrPrimaryName(${id}) round-trips back into the list`);
});
ok(hrPrimaryName("20") === "" && hrPrimaryName(null) === "", "hrPrimaryName is empty for non-members");

/* The seed must still answer for the five, or the Worker would deny the people
   who most need access — the failure mode hrRoster's own header warns about. */
["17", "21", "33", "37"].forEach((id) => {
  ok(!!HR_SEED_ROLES[id] && hrTitleFor(id, NO_ROLES, NO_ADDED) !== "", `seed title resolves for id ${id}`);
});

console.log("\n" + (fail ? `${fail} FAILED, ${pass} passed` : `all ${pass} HR gate asserts pass.`));
process.exit(fail ? 1 : 0);
