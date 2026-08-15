import React from "react";
// The Aug 1 2026 HR Console crash, distilled: a plain render-body const whose
// initializer runs DURING render and reads a const declared BELOW it.
export default function BrokenTdzConst({ files }) {
  // BUG: `roster` is read here (flatMap runs now), declared 3 lines down.
  const rows = roster.flatMap((m) => files[m.id] || []);
  // LEGAL and MUST NOT be flagged: an arrow value is deferred, so naming
  // `save` (declared later) runs on click, long after render.
  const onSave = () => save(rows);
  const roster = Object.keys(files).map((id) => ({ id }));
  const save = (r) => console.log(r.length);
  return <div onClick={onSave}>{rows.length}</div>;
}
