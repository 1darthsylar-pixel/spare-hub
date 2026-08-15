import React from "react";

// Peak Reachers watermark. Sits behind the home content and fills the
// empty space below the cards. Default is absolute (scrolls with the
// page inside a position:relative container). Pass fixed to pin it.
export default function MountainBackdrop({
  opacity = 0.06,
  height = 360,
  color = "#1B2A4A",
  fixed = false,
}) {
  const positionStyle = fixed
    ? { position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 0 }
    : { position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 0 };

  return (
    <div
      aria-hidden="true"
      style={{
        ...positionStyle,
        height: height + "px",
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <svg
        viewBox="0 0 1200 360"
        preserveAspectRatio="xMidYMax slice"
        width="100%"
        height="100%"
        style={{ display: "block", opacity }}
      >
        <path
          d="M0 360 L0 250 L150 175 L300 245 L470 150 L640 235 L820 130 L1000 240 L1140 190 L1200 235 L1200 360 Z"
          fill={color}
          opacity="0.45"
        />
        <path
          d="M0 360 L0 300 L250 205 L430 70 L560 175 L640 130 L740 235 L900 205 L1050 260 L1200 215 L1200 360 Z"
          fill={color}
        />
        <g fill={color}>
          <rect x="428" y="40" width="4" height="34" />
          <path d="M432 42 L470 52 L432 62 Z" />
        </g>
        <g fill={color} opacity="0.85">
          <path d="M300 300 l14 -34 l14 34 z" />
          <path d="M340 300 l16 -40 l16 40 z" />
          <path d="M386 300 l14 -34 l14 34 z" />
          <path d="M690 300 l14 -32 l14 32 z" />
          <path d="M730 300 l16 -40 l16 40 z" />
          <path d="M776 300 l14 -32 l14 32 z" />
        </g>
      </svg>
    </div>
  );
}
