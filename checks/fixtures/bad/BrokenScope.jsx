import React, { useState } from "react";
function StepCard({ title }) {
  return <button onClick={() => setInlineL101(true)}>{title}</button>;
}
export default function BrokenScope() {
  const [inlineL101, setInlineL101] = useState(false);
  return (
    <div>
      <div className="bar" style={{ width: progress.length }} />
      <StepCard title="Go" />
      {inlineL101 ? <span>open</span> : null}
    </div>
  );
}
