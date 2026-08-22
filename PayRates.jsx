/* ══════════════════════════════════════════════════════════════════════════
   PayRates.jsx — WAGES, INSIDE HR CONSOLE. The only screen that shows one.

   ⚠️⚠️ THREE PEOPLE. Hannah 21 · Matt 33 · Nick 37. Matt, Aug 13 2026: "only
   Nick hannah and myself can see wages".

   ⚠️⚠️ AND THE GATE BELOW IS THE SECOND LOCK, NOT THE ONLY ONE. A screen gate
   is a suggestion — anybody who can open dev tools can call the API directly.
   The real refusal is `HR_ID_LOCKED` in worker.js, which turns this key down on
   the server for everybody except those three, INCLUDING Bri and Cindy, who are
   full HR readers and can open every other personnel record in the building.
   If this component's gate were the whole story it would be worth very little.

   ★ ITS OWN FILE, HOOKED INTO HRConsole.jsx WITH ONE LINE. That file is 5,000
   lines and more than one session edits it; the smallest possible footprint
   there is the safest available change.

   ────────────────────────────────────────────────────────────────────────
   ⚠️ A MISSING RATE IS NEVER ZERO, ON SCREEN OR IN A TOTAL.
   ────────────────────────────────────────────────────────────────────────
   Two of the 102 people in the real export are salaried and have no hourly
   cell. Anything derived from a monthly salary, or from the store default, is
   labelled estimated. See payRates.js.
   ══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useState } from "react";
import { kvGet, kvSet } from "./store.js";
import { tileAllowsId } from "./storeConfig.js";
import {
  PAY_KEY, PAY_DEFAULT_KEY, readPay, hourlyFor, setRate,
  parsePayExport, matchPayToRoster, mergePay, SALARY_HOURS_PER_MONTH,
} from "./payRates.js";

const INK = "#13293F", GRAY = "#6B7480", RED = "#B91C1C", GREEN = "#1F6F4A";

const money = (n) =>
  Number.isFinite(n) ? `$${n.toFixed(2)}` : "—";

/* What one person's row says, and whether the Hub is sure of it. */
function rateLabel(rec, fallback) {
  if (!rec) {
    return fallback > 0
      ? { text: `${money(fallback)} (store default)`, sure: false }
      : { text: "not set", sure: false };
  }
  if (Number(rec.rate) > 0) return { text: money(Number(rec.rate)), sure: true };
  if (Number(rec.monthly) > 0) {
    return { text: `${money(hourlyFor(rec))} (from salary)`, sure: false };
  }
  return fallback > 0
    ? { text: `${money(fallback)} (store default)`, sure: false }
    : { text: "not set", sure: false };
}

/* ★★ ONE ROW, AND THE RATE IN IT IS A BOX.

   ⚠️⚠️ LOCAL TEXT WHILE TYPING, COMMITTED ON BLUR. Driving `value` straight off
   the stored map is the bug Availability.jsx already carries a long note about:
   the box can never BE empty, so clearing a wrong figure to type a new one is
   a fight. `txt` is what the person sees and is allowed to be empty or
   half-typed; nothing is written until they leave the box.

   ⚠️ THE EFFECT RESYNCS FROM OUTSIDE so an import, or somebody else's save,
   still moves the box. It compares against the committed value rather than
   overwriting blindly, or it would fight the person typing.

   ⚠️ IT SHOWS WHAT THE HUB IS SURE OF. An estimate — from a salary or from the
   store default — is placeholder text rather than a value, so it never looks
   like a figure somebody typed and confirmed. */
function RateRow({ person, rec, fallback, onSave }) {
  const committed = rec && Number(rec.rate) > 0 ? String(Number(rec.rate).toFixed(2)) : "";
  const [txt, setTxt] = useState(committed);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setTxt(committed); }, [committed]);

  const lab = rateLabel(rec, fallback);
  const commit = async () => {
    if (txt.trim() === committed.trim()) return;
    setSaving(true);
    const ok = await onSave(person.id, txt);
    /* ⚠️ A REFUSED SAVE PUTS THE BOX BACK, so the screen never shows a figure
       that is not stored. The error above the list says why. */
    if (!ok) setTxt(committed);
    setSaving(false);
  };

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 10px", borderBottom: "1px solid #F1F5F9" }}>
      <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: "#14243D" }}>{person.name}</div>
      {/* What the Hub currently believes, when it is not an exact typed rate. */}
      {!lab.sure ? (
        <div style={{ fontSize: 12, color: GRAY, whiteSpace: "nowrap" }}>{lab.text}</div>
      ) : null}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 13, color: GRAY }}>$</span>
        <input
          value={txt}
          onChange={(e) => { const v = e.target.value; setTxt(v); }}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          disabled={saving}
          inputMode="decimal"
          placeholder={lab.sure ? "" : "none"}
          aria-label={`Hourly rate for ${person.name}`}
          style={{
            width: 78, fontSize: 16, textAlign: "right",
            border: "1px solid #D1D5DB", borderRadius: 8, padding: "5px 7px",
            background: saving ? "#F1F5F9" : "#fff", color: "#14243D",
          }}
        />
      </div>
    </div>
  );
}

export default function PayRates({ actingId, roster, S }) {
  /* ⚠️ EVERY HOOK RUNS BEFORE ANY RETURN (check 2), so the gate below cannot
     change how many hooks this component calls. */
  const allowed = useMemo(() => tileAllowsId("payAccess", actingId), [actingId]);
  /* Closed on every visit. See the note at the early return below for why this
     is deliberately not remembered. */
  const [shown, setShown] = useState(false);

  const [pay, setPay] = useState({ v: 1, people: {} });
  const [fallback, setFallback] = useState(0);
  const [fallbackText, setFallbackText] = useState("");
  const [paste, setPaste] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [report, setReport] = useState(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!allowed) return undefined;
    let alive = true;
    (async () => {
      try {
        const [p, d] = await Promise.all([kvGet(PAY_KEY), kvGet(PAY_DEFAULT_KEY)]);
        if (!alive) return;
        setPay(readPay(p));
        const n = Number(d && d.rate);
        setFallback(Number.isFinite(n) && n > 0 ? n : 0);
        setFallbackText(Number.isFinite(n) && n > 0 ? String(n) : "");
      } catch {
        if (alive) setErr("Could not read wages.");
      }
    })();
    return () => { alive = false; };
  }, [allowed]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (Array.isArray(roster) ? roster : [])
      .filter((p) => p && p.name && (!q || p.name.toLowerCase().includes(q)))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [roster, query]);

  const counts = useMemo(() => {
    let exact = 0, derived = 0, none = 0;
    (Array.isArray(roster) ? roster : []).forEach((p) => {
      if (!p || !p.name) return;
      const rec = pay.people[String(p.id)];
      if (rec && Number(rec.rate) > 0) exact++;
      else if (rec && Number(rec.monthly) > 0) derived++;
      else none++;
    });
    return { exact, derived, none };
  }, [roster, pay]);

  async function runImport() {
    if (busy) return;
    setBusy(true); setErr(""); setReport(null);
    try {
      const parsed = parsePayExport(paste);
      const { matched, unmatched } = matchPayToRoster(parsed.rows, roster);
      if (!matched.length) {
        setErr("Nothing matched the roster, so nothing was saved.");
        setReport({ saved: 0, unmatched, problems: parsed.problems });
        return;
      }
      const fresh = readPay(await kvGet(PAY_KEY));
      const next = mergePay(fresh, matched, { at: new Date().toISOString(), by: "HR Console" });
      const ok = await kvSet(PAY_KEY, next);
      if (ok === false) throw new Error("refused");
      setPay(next);
      setPaste("");
      setReport({ saved: matched.length, unmatched, problems: parsed.problems });
    } catch {
      setErr("That did not save. Nothing was changed.");
    } finally { setBusy(false); }
  }

  /* ★★ ONE PERSON'S RATE. Matt, Aug 20 2026: "make the rates editable where
     they are shown."
     ⚠️⚠️ IT RE-READS BEFORE WRITING, same as the importer above. Three people
     can open this screen and a stale map in this tab would put back a rate
     somebody else changed a minute ago.
     ⚠️ THE RULE LIVES IN payRates.js, not here. A blank box means "no rate"
     and a zero is refused, because nobody is paid nothing and storing one
     would price their hours at zero in every total, silently. */
  async function saveOne(id, raw) {
    setErr("");
    const fresh = readPay(await kvGet(PAY_KEY));
    const next = setRate(fresh, id, raw, { at: new Date().toISOString(), by: "HR Console" });
    if (!next) { setErr("Type a rate like 12.50, or clear the box to say there is none."); return false; }
    const ok = await kvSet(PAY_KEY, next);
    if (ok === false) { setErr("That did not save. Nothing was changed."); return false; }
    setPay(next);
    return true;
  }

  async function saveDefault() {
    const n = Number(String(fallbackText).replace(/[$,\s]/g, ""));
    if (!(Number.isFinite(n) && n > 0)) { setErr("Type a rate like 12.50."); return; }
    setBusy(true); setErr("");
    try {
      const ok = await kvSet(PAY_DEFAULT_KEY, { rate: n, updatedAt: new Date().toISOString() });
      if (ok === false) throw new Error("refused");
      setFallback(n);
    } catch { setErr("That did not save."); }
    finally { setBusy(false); }
  }

  if (!allowed) return null;

  /* ★★ NOT ON SCREEN BY DEFAULT. Matt, Aug 20 2026: "remove it from the default
     HR Console view so it is not on screen by default."

     ⚠️⚠️ HIDDEN IS NOT THE SAME AS GATED, AND NEITHER ONE REPLACES THE OTHER.
     The access rules are unchanged: `allowed` above still returns null for
     everybody outside `payAccess`, and the real refusal is still HR_ID_LOCKED
     in worker.js, which turns this key down on the SERVER for everybody except
     those three — including full HR readers who can open every other personnel
     record in the building. This toggle is about a screen not putting wages in
     front of a shoulder-surfer while somebody does an unrelated job; it is not
     a security control and must never be described as one.

     ⚠️ IT DOES NOT REMEMBER BEING OPEN. Every visit starts closed, on purpose:
     a panel that stays open is one that is on screen by default again after
     the first tap, which is the thing being fixed. */
  if (!shown) {
    return (
      <div style={{ ...((S && S.card) || { background: "#fff", border: "1px solid #E3E7EC", borderRadius: 12, padding: 14, marginTop: 12 }), display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 700, color: "#14243D", fontSize: 15 }}>Pay rates</div>
          <div style={{ fontSize: 12, color: GRAY, marginTop: 2 }}>Hidden until you ask for it.</div>
        </div>
        <button
          onClick={() => setShown(true)}
          style={{ background: INK, color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          Show pay rates
        </button>
      </div>
    );
  }

  const box = (S && S.card) || {
    background: "#fff", border: "1px solid #E3E7EC", borderRadius: 12, padding: 14, marginTop: 12,
  };

  return (
    <div style={box}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div style={{ fontWeight: 700, color: "#14243D", fontSize: 15 }}>Pay rates</div>
          <div style={{ fontSize: 12, color: GRAY, marginTop: 2 }}>
            Hannah, Matt and Nick only. The schedule uses these to add money up and never shows anybody's rate.
          </div>
        </div>
        <button
          onClick={() => setShown(false)}
          style={{ background: "transparent", border: "1px solid #D1D5DB", borderRadius: 8, padding: "5px 11px", fontSize: 12.5, fontWeight: 600, color: INK, cursor: "pointer", whiteSpace: "nowrap" }}
        >
          Hide
        </button>
      </div>

      {err ? (
        <div style={{ marginTop: 10, background: "#FEF2F2", border: "1px solid #FECACA", color: RED, borderRadius: 8, padding: "8px 10px", fontSize: 13 }}>
          {err}
        </div>
      ) : null}

      <div style={{ marginTop: 10, fontSize: 13, color: GRAY }}>
        {counts.exact} on an hourly rate · {counts.derived} worked out from a salary · {counts.none} not set
      </div>

      {/* store default */}
      <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 13, color: "#14243D", fontWeight: 600 }}>Rate to assume when one is missing</span>
        <input
          value={fallbackText}
          onChange={(e) => { const v = e.target.value; setFallbackText(v); }}
          placeholder="12.50"
          style={{ width: 90, fontSize: 16, border: "1px solid #D1D5DB", borderRadius: 8, padding: "6px 8px" }}
        />
        <button onClick={saveDefault} disabled={busy}
          style={{ background: INK, color: "#fff", border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          Save
        </button>
        <span style={{ fontSize: 12, color: GRAY }}>
          {fallback > 0 ? `Totals using it are marked estimated.` : "Without one, people with no rate are left out of totals and counted."}
        </span>
      </div>

      {/* importer */}
      <button
        onClick={() => { setOpen((v) => !v); setReport(null); }}
        style={{ marginTop: 12, background: "transparent", border: "none", color: INK, fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0 }}
      >
        {open ? "Close import" : "Import from the Employee Salary sheet"}
      </button>

      {open ? (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, color: GRAY, marginBottom: 6 }}>
            Open the Employee Salary export, select everything including the heading row, and paste it here.
            Columns are found by their heading, so extra columns and a title line above them are fine.
          </div>
          <textarea
            value={paste}
            onChange={(e) => { const v = e.target.value; setPaste(v); }}
            rows={6}
            placeholder={"Employee Name\tLocation\tJob\tFLSA Code\tSalary Basis\tHourly Rate\t…"}
            style={{ width: "100%", fontFamily: "ui-monospace, monospace", fontSize: 12, border: "1px solid #D1D5DB", borderRadius: 8, padding: 8 }}
          />
          <button onClick={runImport} disabled={!paste.trim() || busy}
            style={{ marginTop: 6, background: paste.trim() && !busy ? INK : "#CBD5E1", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            {busy ? "Reading…" : "Read it and save"}
          </button>
        </div>
      ) : null}

      {report ? (
        <div style={{ marginTop: 10, fontSize: 13 }}>
          <div style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", color: GREEN, borderRadius: 8, padding: "8px 10px" }}>
            Saved {report.saved} {report.saved === 1 ? "rate" : "rates"}.
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
              <b>{report.problems.length} row(s) had no rate</b> and were left alone rather than saved as zero:
              <ul style={{ margin: "4px 0 0 18px" }}>
                {report.problems.slice(0, 10).map((p, i) => <li key={i}>{p.line} — {p.why}</li>)}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* the list */}
      <input
        value={query}
        onChange={(e) => { const v = e.target.value; setQuery(v); }}
        placeholder="Search the team"
        style={{ marginTop: 12, width: "100%", fontSize: 16, border: "1px solid #D1D5DB", borderRadius: 8, padding: "7px 9px" }}
      />
      <div style={{ marginTop: 8, maxHeight: 340, overflowY: "auto", border: "1px solid #E3E7EC", borderRadius: 8 }}>
        {rows.map((p) => (
          <RateRow key={p.id} person={p} rec={pay.people[String(p.id)]} fallback={fallback} onSave={saveOne} />
        ))}
        {rows.length === 0 ? <div style={{ padding: 12, fontSize: 13, color: GRAY }}>Nobody matches that search.</div> : null}
      </div>

      <div style={{ marginTop: 8, fontSize: 11, color: GRAY }}>
        A salary is turned into an hourly figure at {Math.round(SALARY_HOURS_PER_MONTH)} hours a month, which is a
        convention rather than a measurement, so any total containing one says it is an estimate.
      </div>
    </div>
  );
}
