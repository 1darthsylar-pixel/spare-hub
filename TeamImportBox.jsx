import React, { useState } from "react";
import { parseExport, planImport } from "./teamImport.js";
import { claimRecord } from "./claimCode.js";
import { HR_RANK_BY_TITLE } from "./hrRoster.js";
import { importCard, importZone, importOpenBtn } from "./cardStyle.js";

/* ══════════════════════════════════════════════════════════════════════════
   TeamImportBox.jsx — PASTE THE CFA HOME EMPLOYEE LIST, ADD WHOEVER IS MISSING.

   Matt, Aug 6 2026: "i just want the box and for future imports only add names
   not currently in", and "this is for the hub clone".

   ★ ITS OWN FILE ON PURPOSE. HRConsole.jsx is a multi-session file and is
   already 5,800 lines; this needs two lines there and nothing else. All of the
   parsing and matching lives one level down in teamImport.js, which imports
   nothing but nameMatch.js.

   ── WHAT IT WILL NOT DO ──
   ⚠️ ADD-ONLY. Anyone already on the roster is skipped before this component
   ever sees them. No role is rewritten, no PIN, status, evaluation, handbook
   signature, file, injury or leadership point is touched. Job titles out of CFA
   Home seed a NEW person only, so gcfcr-hr-roles overrides always win.
   ⚠️ NAME, TITLE AND PERSONAL EMAIL. The address is required for document
   notices and goes to gcfcr-hr-info, which is protected — never the roster row.
   The export ALSO carries home addresses, birth dates, phone numbers and
   emergency contacts. None of that is read or stored.
   ⚠️ NOTHING IS WRITTEN UNTIL THE LAST BUTTON. Check is a dry run.
   ══════════════════════════════════════════════════════════════════════════ */

/* Where a new person lands, stamped so a later question about how a record got
   here has an answer. Nothing reads it; provenance is the whole point. */
const IMPORT_TAG = "cfahome-hr";

const countLabel = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export default function TeamImportBox({ roster, titleOptions, S, onAdd }) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [plan, setPlan] = useState(null);
  const [picks, setPicks] = useState({});
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);
  // Who was added WITHOUT a claim code, so the confirmation can name them.
  // A leader who cannot claim and is never told is a person who simply cannot
  // sign in, with nothing on screen explaining it.
  const [doneByHand, setDoneByHand] = useState([]);
  const [busy, setBusy] = useState(false);   // hashing the claim codes takes a moment

  const reset = () => {
    setRaw(""); setPlan(null); setPicks({}); setErr(""); setOpen(false);
  };

  const check = () => {
    setDone(null);
    const parsed = parseExport(raw);
    if (!parsed.ok) { setErr(parsed.error); setPlan(null); return; }
    setErr(parsed.error || "");
    const p = planImport(parsed.rows, roster, titleOptions);
    /* ⚠️ A ROW STARTS UNTICKED WHEN ANYTHING IS UNCERTAIN. Two of the seven
       "new" people in the real Aug 6 export were already on the roster under a
       different spelling (Brianna Moore is Bri Moore; CFA Home misspells Paola
       Parra Gonzalez). Defaulting those ON would have created a duplicate for
       the person who runs this console. An unknown job title starts off for the
       same reason — the title sets the rank, and the rank opens HR files. */
    const next = {};
    p.candidates.forEach((c) => {
      next[c.key] = { on: c.roleKnown && c.near.length === 0, role: c.role };
    });
    setPicks(next);
    setPlan(p);
  };

  const setPick = (key, patch) =>
    setPicks((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const chosen = plan
    ? plan.candidates.filter((c) => picks[c.key] && picks[c.key].on)
    : [];
  const missingRole = chosen.filter((c) => !picks[c.key].role);

  /* ⚠️ ASYNC NOW, BECAUSE HASHING IS. Each person's phone becomes a salted
     hash here, in the browser, and the raw number is never passed on and never
     stored anywhere. See claimCode.js for why the last 4 is a one-time claim
     code and not the PIN itself.
     ⚠️ A ROW WITH NO USABLE NUMBER GETS NO CODE, and that is a real case, not
     an edge case — rows in the real export have a blank phone, including the
     Operator's own. Those people simply have their PIN set by hand. `claim`
     is left off entirely rather than set to null, so the stored record keeps
     the shape it would have had before this existed (rule 1). */
  /* ★★ LEADERS DO NOT GET A CLAIM CODE (NEW-STORE-SETUP.md, "What still has no
     answer", closed Aug 10 2026).

     🐛 THE WINDOW. A claim code is the last four of somebody's phone, and
     everyone on a team has everyone else's number. So between an import and a
     person's first sign-in, a colleague who knows the number can claim their
     account. The doc already names the cost and it is not symmetrical:
     "Impersonating a team member is small. Impersonating a director opens every
     personnel file and 86 CFA Home passwords." At a NEW store every one of
     ~100 people is unclaimed on day one, so the window is at its widest exactly
     when nobody is watching for it.

     ★ WHERE THE LINE IS, AND WHY HERE. Rank 4 is Assistant Director. Everyone
     at 4 and above has their PIN typed by a director; everyone below claims
     their own. That is a handful of people to type rather than a hundred, which
     is the whole reason claim codes exist, and it covers every person who can
     read a personnel file with a rank to spare.
     ⚠️ ONE CONSTANT, ON PURPOSE. Moving this line is a security/effort trade
     somebody will want to re-make later. Change the number, not the shape.

     ⚠️ FAILS CLOSED. A title this table has never heard of scores 0, which
     would read as "junior, let them claim". An unrecognised role is exactly
     when you do not want to hand out a credential, so unknown means no code.
     The picker above requires a role from the list, so this should never fire
     in practice — it is here for the day the list changes.
     ⚠️ NOT A SILENT DENIAL. A leader with no code cannot sign in at all, and
     nothing on screen would have said why. The confirmation names them.

     ⚠️⚠️ RANK ALONE IS NOT ENOUGH, AND hrRoster.js SAYS SO IN ITS OWN WORDS:
     "PAYROLL IS RANK 1 AND JOINS BY NAME, NOT BY RANK. Cindy Dunning reads
     every file but was never granted a single write power, and the ladder
     cannot express that." A rank test therefore hands a claim code to the one
     person who can read all 106 personnel files. Caught by running this against
     the real title table rather than by reading it. Named titles are excluded
     on top of the rank line, which is the same belt-and-braces shape
     HR_CONSOLE_PEOPLE already uses for the same person. */
  const CLAIM_MAX_RANK = 3;   // Team Leader / Senior Trainer and below may claim
  /* Reads files without the rank to show for it. "Accounts Payable" is already
     rank 7 and excluded twice over; it is named anyway so the two spellings of
     one job cannot drift apart. */
  const NEVER_CLAIM_TITLES = new Set(["Payroll", "Accounts Payable"]);
  const mayClaim = (role) => {
    const r = String(role || "").trim();
    if (!r || !Object.prototype.hasOwnProperty.call(HR_RANK_BY_TITLE, r)) return false;
    if (NEVER_CLAIM_TITLES.has(r)) return false;
    return (HR_RANK_BY_TITLE[r] || 0) <= CLAIM_MAX_RANK;
  };

  const add = async () => {
    if (!chosen.length || missingRole.length || busy) return;
    setBusy(true);
    const byHand = chosen.filter((c) => !mayClaim(picks[c.key].role)).map((c) => c.name);
    const rows = await Promise.all(chosen.map(async (c) => ({
      name: c.name,
      role: picks[c.key].role,
      /* ⚠️ WAS HARDCODED "". Matt, Aug 10 2026: documentation needs the address.
         Every document builder in worker.js reads `if (b.member?.email)`, so a
         person with none on file has their write-up filed and is told nothing.
         addMembers puts this in gcfcr-hr-info (protected), never on the roster
         row, so handing it over is all that was missing. */
      email: c.email || "",
      /* Computed ONCE. Calling claimRecord twice would mint two different
         salts and store a record that does not match the one just checked.
         ⚠️ AND ONLY FOR NON-LEADERS — see mayClaim above. A leader's phone is
         never reduced to a code at all, so there is nothing to guess and
         nothing stored to leak. */
      ...(await (async () => {
        if (!mayClaim(picks[c.key].role)) return {};
        const rec = await claimRecord(c.phone);
        return rec ? { claim: rec } : {};
      })()),
      importedFrom: IMPORT_TAG,
    })));
    const n = onAdd(rows);
    setBusy(false);
    /* 🐛 THE PANEL HAS TO CLOSE, caught in the browser Aug 6 2026. The green
       "✓ Added N" line only renders in the collapsed state, so clearing the
       form without closing left an empty paste box and no confirmation at all
       — the one moment the person needs to be told the write happened. */
    setDone(n);
    setDoneByHand(byHand);
    reset();
  };

  if (!open) {
    return (
      <>
        {done !== null && (
          <div style={{ ...S.self, background: "#ECFDF5", borderColor: "#A7F3D0", color: "#047857" }}>
            ✓ Added <b>{done}</b> to the roster. They show up in Team Training, the Team Directory
            and every other tile straight away. Open each one and set a PIN, or they cannot sign in.
            {/* ★ NAMED, NOT COUNTED. "2 leaders need a PIN" sends somebody hunting
                through the roster; the names are the actionable part. */}
            {doneByHand.length > 0 && (
              <div style={{ marginTop: 8, fontWeight: 700 }}>
                {doneByHand.length === 1 ? "This leader gets no claim code and needs a PIN typed by hand:" : "These leaders get no claim code and need a PIN typed by hand:"}
                {" "}{doneByHand.join(", ")}.
                <div style={{ fontWeight: 400, marginTop: 4 }}>
                  Deliberate. A claim code is the last four of a phone number, and anyone
                  who knows it could sign in as them before they ever do.
                </div>
              </div>
            )}
          </div>
        )}
        <button
          style={importOpenBtn()}
          onClick={() => { setErr(""); setDone(null); setOpen(true); }}
        >
          ⬆ Import team from CFA Home
        </button>
      </>
    );
  }

  return (
    <div style={importCard()}>
      <div style={{ fontWeight: 800, fontSize: 15, color: "#111827", marginBottom: 4 }}>
        Import team from CFA Home
      </div>
      <div style={{ fontSize: 12.5, color: "#6B7280", lineHeight: 1.5, marginBottom: 10 }}>
        Open the Employee List export, select the whole sheet including the header row, copy, and paste
        it below. Only people who are <b>not already on the roster</b> can be added. Nobody who is
        already here is changed in any way, and only names and job titles are read.
      </div>

      <textarea
        value={raw}
        onChange={(ev) => { const v = ev.target.value; setRaw(v); setErr(""); }}
        rows={7}
        placeholder={"Full Name\tBirth Date\tLocation\tJob\t…"}
        style={importZone()}
      />

      {err && <div style={S.err}>{err}</div>}

      <div style={{ display: "flex", gap: 10, marginTop: 10, justifyContent: "flex-end" }}>
        <button style={S.sec} onClick={reset}>Cancel</button>
        <button style={S.prim} onClick={check} disabled={!raw.trim()}>Check</button>
      </div>

      {plan && (
        <div style={{ marginTop: 14, borderTop: "1px solid #E5E7EB", paddingTop: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 8 }}>
            Read {countLabel(plan.total, "row", "rows")}. {plan.already} already on the roster and left alone.
          </div>

          {plan.candidates.length === 0 ? (
            <div style={S.empty}>Everybody in that export is already on the roster. Nothing to add.</div>
          ) : (
            <>
              <div style={{ fontSize: 12.5, color: "#6B7280", lineHeight: 1.5, marginBottom: 10 }}>
                {countLabel(plan.candidates.length, "person is", "people are")} not on the roster. Untick anyone who
                is really somebody you already have under a different spelling.
              </div>

              {plan.candidates.map((c) => {
                const pick = picks[c.key] || { on: false, role: "" };
                const flagged = c.near.length > 0;
                return (
                  <div
                    key={c.key}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 10px", marginBottom: 6,
                      borderRadius: 8, border: `1px solid ${flagged ? "#FDE68A" : "#E5E7EB"}`,
                      background: flagged ? "#FFFBEB" : "#fff",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={pick.on}
                      onChange={(ev) => { const on = ev.target.checked; setPick(c.key, { on }); }}
                      style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0, cursor: "pointer" }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: "#111827" }}>{c.name}</div>
                      <div style={{ fontSize: 11.5, color: "#9CA3AF", marginTop: 1 }}>
                        {c.source}{c.job ? ` · ${c.job}` : ""}
                      </div>
                      {flagged && (
                        <div style={{ fontSize: 12, color: "#92400E", marginTop: 5, lineHeight: 1.45 }}>
                          ⚠️ Looks like <b>{c.near.join(", ")}</b>, already on the roster. Leave this unticked
                          if it is the same person.
                        </div>
                      )}
                      {!c.roleKnown && (
                        <div style={{ fontSize: 12, color: "#92400E", marginTop: 5, lineHeight: 1.45 }}>
                          No Hub role matches “{c.job || "a blank job title"}”. Pick one before adding.
                        </div>
                      )}
                      <select
                        value={pick.role}
                        onChange={(ev) => { const role = ev.target.value; setPick(c.key, { role }); }}
                        style={{ ...S.in, marginTop: 6, marginBottom: 0, maxWidth: 260 }}
                      >
                        <option value="">Pick a role…</option>
                        {(titleOptions || []).map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                );
              })}

              {missingRole.length > 0 && (
                <div style={S.err}>
                  Pick a role for {missingRole.map((c) => c.name).join(", ")} before adding.
                </div>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 12, justifyContent: "flex-end" }}>
                <button style={S.sec} onClick={reset}>Cancel</button>
                {/* ⚠️ `busy` IS IN BOTH THE DISABLE TEST AND THE LABEL. Adding is
                    async now (the claim codes are hashed first), and without this
                    a second tap during that gap runs the whole add twice and
                    creates ~100 duplicate roster rows. */}
                <button
                  style={{ ...S.prim, opacity: (!chosen.length || missingRole.length || busy) ? 0.5 : 1 }}
                  onClick={add}
                  disabled={!chosen.length || missingRole.length > 0 || busy}
                >
                  {busy ? "Adding…" : `Add ${chosen.length} to the roster`}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
