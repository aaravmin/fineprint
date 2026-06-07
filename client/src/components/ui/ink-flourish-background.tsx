"use client";

import { memo } from "react";

// Calligraphic bezier strokes — drawn via stroke-dashoffset + SMIL pen-nib motion.
// No canvas, no rAF loop, no jank.
const STROKES = [
  {
    id: "s1",
    d: "M -20 760 C 200 700 420 580 620 535 C 820 490 1040 415 1240 360 C 1360 322 1450 295 1540 268",
    color: "#1a1a1a",
    width: 1.1,
    opacity: 0.13,
    dur: "3.4s",
    delay: "0s",
    penNib: true,
  },
  {
    id: "s2",
    d: "M -20 790 C 200 730 420 612 620 567 C 820 522 1040 447 1240 392 C 1360 354 1450 327 1540 300",
    color: "#1a1a1a",
    width: 0.45,
    opacity: 0.055,
    dur: "3.4s",
    delay: "0.12s",
    penNib: false,
  },
  {
    id: "s3",
    d: "M 120 170 C 290 132 500 188 680 155 C 860 122 1060 168 1240 130",
    color: "#1a1a1a",
    width: 0.55,
    opacity: 0.09,
    dur: "2.1s",
    delay: "0.5s",
    penNib: false,
  },
  {
    id: "s4",
    d: "M 580 425 C 615 388 670 403 675 432 C 680 461 644 474 618 462 C 592 450 584 425 606 410",
    color: "#e5342b",
    width: 1.3,
    opacity: 0.52,
    dur: "1.3s",
    delay: "1.9s",
    penNib: true,
  },
  {
    id: "s5",
    d: "M 260 882 C 500 868 800 885 1080 872",
    color: "#1a1a1a",
    width: 0.4,
    opacity: 0.07,
    dur: "2.0s",
    delay: "0.25s",
    penNib: false,
  },
] as const;

const LEGALESE = [
  { t: "WHEREAS", x: 55, y: 230, r: -4, s: 11 },
  { t: "INDEMNIFICATION", x: 860, y: 142, r: 6, s: 8 },
  { t: "FORCE MAJEURE", x: 260, y: 862, r: -2, s: 9 },
  { t: "NOTWITHSTANDING", x: 1020, y: 828, r: 5, s: 8 },
  { t: "EXHIBIT A", x: 1330, y: 395, r: -8, s: 13 },
  { t: "LOCAL LAW 97", x: 140, y: 648, r: 3, s: 9 },
  { t: "§268 PER TON CO₂e", x: 1200, y: 655, r: -5, s: 9 },
  { t: "1 RCNY §103-14", x: 670, y: 878, r: 2, s: 8 },
  { t: "BENCHMARKING", x: 48, y: 428, r: -6, s: 9 },
  { t: "IN WITNESS WHEREOF", x: 920, y: 895, r: 3, s: 8 },
  { t: "EMISSION LIMIT", x: 1400, y: 168, r: -3, s: 9 },
  { t: "COMPLIANCE PERIOD", x: 360, y: 118, r: 7, s: 8 },
  { t: "ARTICLE 321", x: 810, y: 828, r: -4, s: 10 },
  { t: "HEREINAFTER", x: 460, y: 896, r: 3, s: 9 },
  { t: "PURSUANT TO §28-320", x: 1080, y: 198, r: -5, s: 8 },
  { t: "RETROACTIVE LIABILITY", x: 48, y: 350, r: 4, s: 8 },
  { t: "LL84 BENCHMARKING", x: 1280, y: 798, r: -3, s: 9 },
  { t: "APPROVED", x: 680, y: 148, r: -14, s: 15 },
] as const;

function InkFlourishBackground({
  className = "absolute inset-0",
}: {
  className?: string;
}) {
  return (
    <div aria-hidden="true" className={className}>
      <svg
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
        role="presentation"
      >
        {/* Faint legalese typography texture */}
        <g fill="#1a1a1a" fontFamily="Georgia, 'Times New Roman', serif" fontWeight="400">
          {LEGALESE.map(({ t, x, y, r, s }) => (
            <text
              key={t}
              x={x}
              y={y}
              fontSize={s}
              opacity={0.042}
              letterSpacing="0.07em"
              transform={`rotate(${r}, ${x}, ${y})`}
            >
              {t}
            </text>
          ))}
        </g>

        {/* Ink flourish strokes — drawn by CSS stroke-dashoffset, pen nib via SMIL */}
        {STROKES.map(stroke => (
          <g key={stroke.id}>
            <path
              id={`stroke-${stroke.id}`}
              className="ink-stroke"
              d={stroke.d}
              fill="none"
              stroke={stroke.color}
              strokeWidth={stroke.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={stroke.opacity}
              style={{
                strokeDasharray: 3600,
                strokeDashoffset: 3600,
                animation: `ink-draw ${stroke.dur} cubic-bezier(0.4, 0, 0.2, 1) ${stroke.delay} forwards`,
              }}
            />
            {stroke.penNib && (
              <circle r="2.5" fill={stroke.color} className="ink-nib">
                <animateMotion
                  dur={stroke.dur}
                  begin={stroke.delay}
                  fill="freeze"
                  calcMode="linear"
                >
                  <mpath href={`#stroke-${stroke.id}`} />
                </animateMotion>
                <animate
                  attributeName="opacity"
                  values="0;0.7;0.7;0"
                  keyTimes="0;0.05;0.88;1"
                  dur={stroke.dur}
                  begin={stroke.delay}
                  fill="freeze"
                />
              </circle>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

export default memo(InkFlourishBackground);
