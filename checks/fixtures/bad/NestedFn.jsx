import React, { useState, useMemo } from "react";

export default function Parent({ rows }) {
  const [a, setA] = useState(0);

  function ReceiptsScreen({ items }) {
    if (!items.length) return <div>none</div>;
    return <div>{items.length}</div>;
  }

  const totals = useMemo(() => rows.length + a, [rows, a]);

  return <div><ReceiptsScreen items={rows} />{totals}</div>;
}
