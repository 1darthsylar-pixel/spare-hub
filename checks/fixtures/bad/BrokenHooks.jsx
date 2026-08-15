import React, { useState, useEffect } from "react";
export default function BrokenHooks({ activeTool }) {
  const [a, setA] = useState(0);
  if (activeTool) return (<div>tool</div>);
  const [pinned, setPinned] = useState([]);
  useEffect(() => { setPinned([]); }, []);
  return <div>{a}{pinned.length}</div>;
}
