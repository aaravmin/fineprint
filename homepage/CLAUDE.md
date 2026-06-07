# CLAUDE.md — Frontend Website Rules (fineprint homepage)

> Adapted from the team frontend rules for **macOS + this repo**. Original Windows
> puppeteer paths replaced with the local Playwright + Google Chrome setup. Project
> root for this workspace = `homepage/`.

## Always Do First
- **Invoke the `emil-design-eng` + `ui-ux-pro-max` design skills** (the local equivalent of the team's `frontend-design` skill) before writing any frontend code, every session, no exceptions. Also pull in `superpowers` / `ui-styling` where helpful.

## Reference Images
- If a reference image is provided: match layout, spacing, typography, and color exactly. Swap in placeholder content (images via `https://placehold.co/`, generic copy). Do not improve or add to the design.
- **For the fineprint homepage:** the dashboard template (`brand_assets/`, Image #1) and the old site are **theme inspiration, not exact-match** — carry the general theme, design with high craft.
- Reference the old prototype for inspiration: **https://fineprint-pi.vercel.app** (screenshots in `/tmp/shots/oldsite/`).
- Screenshot your output, compare against reference, fix mismatches, re-screenshot. Do at least 2 comparison rounds. Stop only when no visible differences remain or the user says so.

## Local Server
- **Always serve on localhost** — never screenshot a `file:///` URL.
- Start the dev server: `node serve.mjs` (serves `homepage/` at `http://localhost:3000`).
- `serve.mjs` lives in this folder. Start it in the background before screenshots.
- If the server is already running, do not start a second instance.

## Screenshot Workflow (macOS)
- Playwright (chromium) is installed at `/tmp/shots/node_modules`; `screenshot.mjs` loads it from there via `createRequire`. (If missing: `cd /tmp/shots && npx playwright install chromium`.)
- **Always screenshot from localhost:** `node screenshot.mjs http://localhost:3000`
- Screenshots save to `./temporary screenshots/screenshot-N.png` (auto-incremented, never overwritten).
- Optional label suffix: `node screenshot.mjs http://localhost:3000 hero` → `screenshot-N-hero.png`
- After screenshotting, read the PNG from `temporary screenshots/` with the Read tool — analyze the image directly.
- When comparing, be specific: "heading is 32px but reference shows ~24px", "card gap is 16px but should be 24px".
- Check: spacing/padding, font size/weight/line-height, colors (exact hex), alignment, border-radius, shadows, image sizing.

## Output Defaults
- Single `index.html`, all styles inline, unless the user says otherwise.
- Tailwind CSS via CDN: `<script src="https://cdn.tailwindcss.com"></script>`.
- Placeholder images: `https://placehold.co/WIDTHxHEIGHT`.
- Mobile-first responsive.

## Brand Assets
- Always check `brand_assets/` before designing. It may hold logos, color/style guides, images.
- If assets exist there, use them. Don't use placeholders where real assets exist.
- If a logo is present, use it. If a palette is defined, use those exact values — don't invent brand colors.

## Anti-Generic Guardrails
- **Colors:** Never the default Tailwind palette (indigo-500, blue-600). Pick a custom brand color and derive from it.
- **Shadows:** Never flat `shadow-md`. Layered, color-tinted, low-opacity shadows.
- **Typography:** Never the same font for headings and body. Pair a display/serif with a clean sans. Tight tracking (`-0.03em`) on large headings, generous line-height (`1.7`) on body.
- **Gradients:** Layer multiple radial gradients. Add grain/texture via an SVG noise filter for depth.
- **Animations:** Only animate `transform` and `opacity`. Never `transition-all`. Spring-style easing.
- **Interactive states:** Every clickable element needs hover, focus-visible, and active states. No exceptions.
- **Images:** Gradient overlay (`bg-gradient-to-t from-black/60`) + a color treatment layer with `mix-blend-multiply`.
- **Spacing:** Intentional, consistent spacing tokens — not random Tailwind steps.
- **Depth:** A layering system (base → elevated → floating), not all on one z-plane.

## Hard Rules
- Don't add sections, features, or content not in the reference.
- Don't "improve" a reference design — match it.
- Don't stop after one screenshot pass.
- Don't use `transition-all`.
- Don't use default Tailwind blue/indigo as the primary color.
