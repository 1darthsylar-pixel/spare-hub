/* ══════════════════════════════════════════════════════════════════════════
   TeamDetails.jsx — EMAILS, PHONE NUMBERS AND HIRE DATES, imported into
   HR Console.

   ★ ITS OWN FILE WITH A ONE-LINE HOOK, same as PayRates.jsx. HRConsole is
   5,000 lines and more than one session edits it, so the smallest footprint
   there is the safest change available.

   ⚠️⚠️ IT WRITES INTO `gcfcr-hr-info`, WHICH IS LIVE FOR ~106 PEOPLE and
   already holds `email`, `hireDate` and `termDate`. Every write is per person
   and per field: only the fields the paste actually carried are touched, a
   blank cell never blanks something somebody typed, and a termination date is
   never in reach of an import of phone numbers. Rule 1.

   ⚠️ ONE PASTE BOX FOR BOTH EXPORTS. The columns are found by heading, so a
   leader pastes whichever sheet they have open and the screen says which one it
   recognised rather than asking them to classify it first.

   ⚠️⚠️ THE HIRE DATE IS A CHOICE AND THE SCREEN MAKES IT, NOT THE CODE. The
   export carries two — when somebody started at THIS STORE and when they
   started working FOR THE OPERATOR — and on the real file they differ for 6 of
   102 people, by up to six years. `hireDate` drives the evaluation clock, so a
   silent pick would quietly move six people's review dates. The chooser
   defaults to the operator date and the people affected are named before
   anything is saved.
   ══════════════════════════════════════════════════════════════════════════ */

import { useMemo, useState } from "react";
import { kvGet, kvSet } from "./store.js";
import {
  INFO_KEY, HIRE_SOURCES, parseTeamDetails, matchDetailsToRoster, mergeDetails,
} from "./teamDetails.js";

const INK = "#13293F", GRAY = "#6B7480", RED = "#B91C1C", GREEN = "#1F6F4A";

const KIND_LABEL = {
  contact: "emails and phone numbers",
  hire: "hire dates",
  both: "contact details and hire dates",
};

export default function TeamDetails({ roster, onImported, S }) {
  const [open, setOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const [hire, setHire] = useState("operator");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState(null);
  const [report, setReport] = useState(null);

  /* Parsing is free and changes nothing, so it happens on every keystroke and
     the leader sees what the Hub made of the paste BEFORE any save. */
  const parsed = useMemo(
    () => (paste.trim() ? parseTeamDetails(paste, { hire }) : null),
    [paste, hire],
  );

  async function run() {
    if (busy || !parsed) return;
    setBusy(true); setErr(""); setReport(null);
    try {
      const { matched, unmatched } = matchDetailsToRoster(parsed.rows, roster);
      if (!matched.length) {
        setErr("Nothing matched the roster, so nothing was saved.");
        setReport({ changed: 0, unmatched, problems: parsed.problems, skipped: parsed.skipped });
        return;
      }
      /* Re-read, merge, write. HR Console is open on more than one iPad. */
      const fresh = (await kvGet(INFO_KEY)) || {};
      const { info, changed } = mergeDetails(fresh, matched, {
        at: new Date().toISOString(), by: "HR Console import",
      });
      const ok = await kvSet(INFO_KEY, info);
      if (ok === false) throw new Error("refused");
      setPaste("");
      setPreview(null);
      setReport({ changed, unmatched, problems: parsed.problems, skipped: parsed.skipped, kind: parsed.kind });
      if (typeof onImported === "function") onImported(info);
    } catch {
      setErr("That did not save. Nothing was changed.");
    } finally { setBusy(false); }
  }

  const box = (S && S.card) || {
    background: "#fff", border: "1px solid #E3E7EC", borderRadius: 12, padding: 14, marginTop: 12,
  };
  const showHire = parsed && (parsed.kind === "hire" || parsed.kind === "both");

  return (
    <div style={box}>
      <div style={{ fontWeight: 700, color: "#14243D", fontSize: 15 }}>Emails, phones and hire dates</div>
      <div style={{ fontSize: 12, color: GRAY, marginTop: 2 }}>
        Paste either HotSchedules staff export. Columns are found by their heading, so it does not
        matter which one you have open or what else is in it.
      </div>

      {err ? (
        <div style={{ marginTop: 10, background: "#FEF2F2", border: "1px solid #FECACA", color: RED, borderRadius: 8, padding: "8px 10px", fontSize: 13 }}>
          {err}
        </div>
      ) : null}

      <button
        onClick={() => { setOpen((v) => !v); setReport(null); }}
        style={{ marginTop: 10, background: "transparent", border: "none", color: INK, fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0 }}
      >
        {open ? "Close import" : "Import team details"}
      </button>

      {open ? (
        <div style={{ marginTop: 8 }}>
          <textarea
            value={paste}
            onChange={(e) => { const v = e.target.value; setPaste(v); setReport(null); }}
            rows={6}
            placeholder={"Name\tPhone\tEmail\t…\n— or —\nEmployee Name\tLocation\tJob\tLocation Hire Date\tOperator Hire Date"}
            style={{ width: "100%", fontFamily: "ui-monospace, monospace", fontSize: 12, border: "1px solid #D1D5DB", borderRadius: 8, padding: 8 }}
          />

          {parsed ? (
            <div style={{ marginTop: 6, fontSize: 13, color: parsed.kind ? "#14243D" : RED }}>
              {parsed.kind
                ? `Reads as ${KIND_LABEL[parsed.kind]} · ${parsed.rows.length} ${parsed.rows.length === 1 ? "person" : "people"}`
                : "Could not tell what this is. Include the heading row."}
              {parsed.skipped && parsed.skipped.length ? (
                <span style={{ color: GRAY }}> · {parsed.skipped.length} line(s) with nothing in them were skipped</span>
              ) : null}
            </div>
          ) : null}

          {/* ⚠️ THE CHOICE IS OFFERED ONLY WHEN THE PASTE ACTUALLY HAS BOTH
              DATES, so it never appears as an unexplained option. */}
          {showHire ? (
            <div style={{ marginTop: 8, background: "#F8FAFC", border: "1px solid #E3E7EC", borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#14243D", marginBottom: 4 }}>
                Which one counts as the hire date?
              </div>
              {HIRE_SOURCES.map((h) => (
                <label key={h.key} style={{ display: "block", fontSize: 13, marginTop: 4, cursor: "pointer" }}>
                  <input
                    type="radio"
                    checked={hire === h.key}
                    onChange={() => setHire(h.key)}
                    style={{ marginRight: 6 }}
                  />
                  {h.label}
                  <span style={{ color: GRAY }}> — {h.hint}</span>
                </label>
              ))}
              {parsed.differing && parsed.differing.length ? (
                <div style={{ marginTop: 8, fontSize: 12, color: "#92400E", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 6, padding: "6px 8px" }}>
                  <b>{parsed.differing.length} {parsed.differing.length === 1 ? "person has" : "people have"} two different dates</b>,
                  so this choice changes {parsed.differing.length === 1 ? "their" : "their"} evaluation clock:
                  <ul style={{ margin: "4px 0 0 18px" }}>
                    {parsed.differing.slice(0, 8).map((d, i) => (
                      <li key={i}>{d.name} — store {d.location}, operator {d.operator}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div style={{ marginTop: 6, fontSize: 12, color: GRAY }}>
                  Both dates are the same for everybody in this paste, so it makes no difference here.
                </div>
              )}
            </div>
          ) : null}

          <button
            onClick={run}
            disabled={!parsed || !parsed.kind || !parsed.rows.length || busy}
            style={{
              marginTop: 8,
              background: parsed && parsed.kind && parsed.rows.length && !busy ? INK : "#CBD5E1",
              color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            {busy ? "Saving…" : "Save these details"}
          </button>
        </div>
      ) : null}

      {report ? (
        <div style={{ marginTop: 10, fontSize: 13 }}>
          <div style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", color: GREEN, borderRadius: 8, padding: "8px 10px" }}>
            Updated {report.changed} {report.changed === 1 ? "person" : "people"}.
            {report.changed === 0 ? " Everything already matched what was on file." : ""}
          </div>
          {report.unmatched.length ? (
            <div style={{ marginTop: 6, background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E", borderRadius: 8, padding: "8px 10px" }}>
              <b>{report.unmatched.length} not saved</b>, because the name did not match the roster:
              <ul style={{ margin: "4px 0 0 18px" }}>
                {report.unmatched.slice(0, 15).map((u, i) => <li key={i}>{u.name} ({u.reason})</li>)}
              </ul>
            </div>
          ) : null}
          {report.problems && report.problems.length ? (
            <div style={{ marginTop: 6, background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E", borderRadius: 8, padding: "8px 10px" }}>
              <b>{report.problems.length} row(s) had something the Hub would not store:</b>
              <ul style={{ margin: "4px 0 0 18px" }}>
                {report.problems.slice(0, 10).map((p, i) => <li key={i}>{p.line} — {p.why}</li>)}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
