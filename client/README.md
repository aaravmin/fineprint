# Fineprint dashboard

The owner-facing face of Fineprint: type an address, see what NYC building
law will cost you, and what to do about it. This README is the working brief
for the dashboard — humans and AI agents building UI read this first.

## Who it's for

Primary: the small landlord (1-5 buildings, no compliance staff) who finds
out about laws when a violation arrives in the mail. Secondary, same rails:
property managers with portfolios (more buildings, same views) and
due-diligence buyers (one report, per-use). Design for the first; don't
paint the others into a corner.

## The core moment

Everything serves one beat: **"here's your number."** An address turns into
a dollar exposure per law per year — big, specific, unflinching — followed
by the path down from it. The number sells; the plan retains. If a screen
doesn't either sharpen the number or advance the plan, it doesn't ship.

## What the dashboard shows

- **Address lookup** — address to BBL to building facts, no signup, no upload.
- **Exposure summary** — total annual dollars at risk now, at the 2030 cliff,
  and at 2035. LL97 numbers come from the engine and are exact; stub numbers
  say so (every estimate renders its `notes[]` as an honesty footnote).
- **Per-law cards** — the six laws below: applies / doesn't apply, deadline,
  dollar exposure, one-line "what this is."
- **Deadline horizon** — every obligation on one timeline, nearest first.
- **The plan** — what to do, in order, and what each step saves versus the
  fine. (Powered by the agent fleet; UI renders task state live from Supabase.)

## The laws

| Law       | What it is                                     | The hook                                                      |
| --------- | ---------------------------------------------- | ------------------------------------------------------------- |
| LL97      | Carbon cap, >25k sqft; $268/tCO2e over, yearly | The wedge: caps tighten ~40% in 2030, again in 2035           |
| Art. 321  | Affordable-housing pathway                     | Checklist + flat $10k penalties, not $/ton — different advice |
| LL84      | Annual energy benchmarking                     | $500/quarter late; also our data feed                         |
| LL87      | Energy audit every 10 years, >50k sqft         | Owners forget the cycle; audit itself costs $15-50k           |
| LL11/FISP | Facade inspection every 5 years, >6 stories    | Escalating penalties, shed costs, liability                   |
| LL88      | Lighting upgrades + submetering                | Bundles with LL97 retrofit work                               |

Registry: `data/src/laws.ts` (canonical), re-exported by `data/laws.ts`.
LL97 fine math: `engine/` (pure, tested, frozen interface —
`computeFine` / `computeAllPeriods`).

## Architecture

No API server. The browser talks straight to Supabase Postgres: reads are
RLS-scoped Realtime subscriptions, writes are `security definer` SQL functions
("reducers"). Clerk issues the JWT; Supabase RLS scopes every row to its owner.
Building/task/worker state is live; the engine runs client-side for what-if math.
The typed data layer lives in `src/lib/db/` — no generated bindings.

Data wiring (see `data/nyc-apis.md`): GeoSearch for address→BBL, LL84 Socrata
dataset for sqft/emissions, DOB covered-buildings list for LL97 applicability,
HPD datasets for the Article 321 flag. BBL joins everything.

## Design bar

Forbes-top-10 tier, not free-Tailwind-kit tier. Editorial, specific,
honest. The aesthetic should feel like a sharp financial document, not a
SaaS landing page: numbers carry the drama, type does the talking. Light +
dark intentional from day one. Every estimate labeled as one. No emoji
decor, no gradient soup, no bento-for-bento's-sake.

Stack: Next.js 16 (App Router) + React 19, Tailwind v4 (CSS-based config),
framer-motion, lucide-react, shadcn-style components in `src/components/ui/`.

## Status

Live. The dashboard runs the full loop: address intake, per-law exposure, the
compliance board (tasks, agents, activity), and the compliance binder — all
reading Supabase in real time.

```bash
npm run dashboard    # Next.js dev server, port 3001 (npm run db:start first)
npm run typecheck --workspace client
npm run build --workspace client
```
