import React, { useMemo, useEffect, useState } from "react";
export default function BrokenTdz({ rows }) {
  const [ready, setReady] = useState(false);
  const courseRows = useMemo(() => rows.map((r) => keyOf(r)), [rows]);
  useEffect(() => { setReady(true); }, [loaded]);
  const loaded = true;
  const keyOf = (r) => r.id + ":" + r.week;
  return <div>{courseRows.length}{ready ? "y" : "n"}{loaded ? "l" : ""}</div>;
}
