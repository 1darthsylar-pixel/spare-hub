import React, { useState } from "react";
import { programLabel } from "./storeConfig.js";

// Small circular Peak Reachers badge for the header.
// Uses the real logo if it exists at `src` (default /peakReachers.png in
// the app's public folder); if that file isn't there, it falls back to a
// built-in SVG mark so the header never shows a broken image.
export default function PeakReachersBadge({ size = 46, src = "/peakReachers.png" }) {
  /* ⚠️ READ AT RENDER, NOT AT MODULE LEVEL. See the teamSite note in
     storeConfig.js. This badge is the masthead mark, so its label is the first
     thing a screen reader says about the page. */
  const programName = programLabel();
  const [imgOk, setImgOk] = useState(true);

  return (
    <span
      aria-label={programName}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "50%",
        background: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        boxShadow: "0 1px 5px rgba(0,0,0,0.28)",
      }}
    >
      {imgOk ? (
        <img
          src={src}
          alt={programName}
          onError={() => setImgOk(false)}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        <svg
          width={size * 0.72}
          height={size * 0.72}
          viewBox="0 0 100 100"
          role="img"
          aria-label={programName}
        >
          <path d="M12 80 L38 42 L50 58 L62 30 L88 80 Z" fill="#1B2A4A" />
          <rect x="60.7" y="14" width="2.8" height="18" fill="#1B2A4A" />
          <path d="M63.5 15 L77 19.5 L63.5 24 Z" fill="#1B2A4A" />
        </svg>
      )}
    </span>
  );
}
