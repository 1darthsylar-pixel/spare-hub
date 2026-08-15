import React, { useState, useEffect, useMemo, useCallback } from "react";
import { normName } from "./nameMatch.mjs";

const keyOf = (r) => `${r.id}:${r.week}`;

export default function Clean({ user, rows = [] }) {
  const { mine: myInputs, open } = splitRows(rows);
  const [q, setQ] = useState("");
  const [people, setPeople] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const filtered = useMemo(
    () => people.filter((p) => normName(p.name).includes(normName(q))),
    [people, q]
  );

  const onPick = useCallback((p) => setPeople((list) => [...list, p]), []);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      if (alive) { setPeople(seed); setLoaded(true); }
    }, 10);
    return () => { alive = false; clearTimeout(t); };
  }, []);

  const seed = [{ id: 1, name: "Daisy", week: 1 }];

  function splitRows(list) {
    return { mine: list.filter((r) => r.owner === user?.id), open: list.filter((r) => !r.owner) };
  }

  return (
    <div className="wrap">
      <input
        value={q}
        onChange={(e) => { const v = e.target.value; setQ(v); }}
      />
      <ul>
        {filtered.map((p) => (
          <li key={keyOf({ id: p.id, week: p.week })} onClick={() => onPick(p)}>
            {p.name}
          </li>
        ))}
      </ul>
      <span>{myInputs.length} / {open.length} / {loaded ? "ready" : "..."}</span>
    </div>
  );
}
