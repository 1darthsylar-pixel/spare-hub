import React, { useState } from "react";
import { programLabel, storeCfg } from "./storeConfig.js";

// Small circular badge for the header.
// Uses the store's own logo if it has one; otherwise it draws a built-in SVG
// mark, so the header never shows a broken image.
//
/* ⛔⛔ THE DEFAULT USED TO BE THE LITERAL `/peakReachers.png`, AND THAT IS THIS
   STORE'S ARTWORK WRITTEN INTO SOURCE — rule 18, in the place it costs most.
   Corrected Aug 21 2026 off issue #850.

   🐛 What it did: every clone is a scrubbed snapshot, so `branding.logo` is
   blanked there and this hardcoded default was the only thing left deciding the
   masthead mark. Measured in `spare-hub` and `guilford-hub` the same day: both
   carried `public/peakReachers.png` and both drew THIS restaurant's programme
   emblem in another operator's header, on every screen, with `branding.logo`
   sitting empty a few lines away in their own config.

   ⇒ IT READS THE STORE'S OWN SETTING NOW, which is what that layer is for.
   ⚠️ NOTHING CHANGES HERE. `branding.logo` at Gate City IS "/peakReachers.png",
   so this store renders the identical image from the identical file. What moves
   is WHERE the answer comes from: a setting a store can edit, instead of a
   string only a developer can.
   ⚠️ NO src GOES STRAIGHT TO THE MARK, rather than rendering an <img src="">
   and waiting for onError. An empty src is not a reliable error in every
   browser, and a store with no logo is the NORMAL state on day one — the
   fallback has to be the plain path, not the exception path.
   ★ The Village already solved this in its own `StoreBadge.jsx` on Aug 12 and
   the fix never came home. That direction is the one nobody watches. */
export default function PeakReachersBadge({ size = 46, src = storeCfg("branding.logo", "") }) {
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
      {imgOk && src ? (
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
