# fineprint homepage — design spec

Approved 2026-06-06. Direction: **light editorial** (extend the old prototype). Scope: **full single-scroll landing**. Output: single static `index.html` + Tailwind CDN, mobile-first. Theme inspiration: old site (https://fineprint-pi.vercel.app) + the dashboard template in `brand_assets/` (general theme, not exact-match).

## Brand system (tokens)

- **Canvas** warm off-white `#FAF9F6`; **paper** `#FFFFFF`; **ink** `#141414`; **muted** `#6B6862` / `#9A968E`.
- **Signal red** `#E5342B` — fines, over-cap, the cliff chart (danger only).
- **Green** `#16A34A`-ish — status dot, compliant, positive deltas.
- **Hairline** `#E7E4DD` borders; **shadows** layered + ink-tinted, low opacity (no flat `shadow-md`).
- **Type pairing** (guardrail: display ≠ body): display = a bold geometric grotesk (e.g. _Space Grotesk_ / _Archivo_), body = _Inter_. Tight tracking (`-0.03em`) on large headings; body line-height `1.7`. `tabular-nums` on every number.
- **Depth**: base canvas → elevated cards → floating verdict; layered radial gradients + SVG grain for texture.
- **Motion**: staggered reveal on scroll (fade+rise), `transform`/`opacity` only, spring easing, honor `prefers-reduced-motion`.

## Sections (single scroll)

1. **Top nav** — wordmark `Fineprint`, links (How it works · Laws covered · Dashboard), primary CTA "Check a building".
2. **Hero** — `● NYC · LOCAL LAW 97` pill, ultra-bold headline ("Know your building's carbon fine — and fund the fix."), subcopy, **address search + Check fine CTA**, example chips (1 Wall St, 20 Exchange Pl, 1870 Pelham Pkwy S). Floating **verdict-preview card**: address, "Over cap" red badge, big red `$/yr`, mini red cliff bars (2024–29 / 2030–34 / 2035–39).
3. **How it works** — 3 numbered cards: Enter address → See your real fine → Get a funded plan.
4. **Compute vs Track** — two columns. COMPUTE (hero): LL97 verified fine + funded fix-it plan, 40+ BPS cities. TRACK (breadth): FISP/LL11, LL84, LL33/95, LL152, boiler/elevator — deadlines & status. Principle line: "Compute what's computable, track what's trackable, never fake a number."
5. **Funded fix-it plan** — ranked retrofits w/ matched rebates, payback, a small MACC-style bar; "single best rebate, payback in years" framing. (Ties to the `advise` package.)
6. **Ops-room (real-time)** — live tickets per obligation, AI agents draft remediations, you approve; kill-a-worker recovery line. Restrained light treatment (not dark).
7. **Honesty footer + CTA** — repeat address CTA; "every number is a labeled estimate; official compliance needs a registered design professional"; data sources (LL84 `5zyy-y8am`, 1 RCNY §103-14).

## Build loop

Build `index.html` → `node serve.mjs` → `node screenshot.mjs http://localhost:3000 <label>` → Read PNGs (desktop+mobile) → fix mismatches → repeat ≥2 rounds. Stop when craft is clean at both breakpoints.
