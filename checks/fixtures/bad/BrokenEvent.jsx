import React, { useState } from "react";
export default function BrokenEvent({ id }) {
  const [newPrep, setNewPrep] = useState({});
  return (
    <input
      value={newPrep[id] || ""}
      onChange={(e) => setNewPrep((d) => ({ ...d, [id]: e.target.value }))}
    />
  );
}
