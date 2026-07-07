# Fineprint — end-to-end audit

_NYC Local Law compliance tool. Audit of the Supabase-migration working tree, held to a production-hardening bar (the tool began as a hackathon build)._

**Audited tree:** `feat/supabase-backend` worktree (the current direction — "we migrated to Supabase"), on top of `origin/main` `e9c8d42`.
**Method:** five parallel reviewers (backend/SQL, frontend + FE↔BE seam, config/deps/CI, data/engine numbers, security/privacy), plus first-hand runs of install / typecheck / test / build / lint / dev-server startup. Live DB paths (Supabase local, integration tests) could not run — **Docker was down**, so those are flagged as unverified, not passed.

## Top-line verdict

The migration is **coherent and unusually well-engineered for a hackathon-origin project** — but it is **not shippable as-is**, for four reasons, in order:

1. **A live Google API key is committed to a public repo.** Rotate now.
2. **A single Postgres bug (`fp_is_service()` uses `current_user`) breaks the entire human-approval workflow and opens a cross-tenant write.** The product's central promise ("a human signs off on everything") cannot currently execute.
3. **The whole Supabase backend is uncommitted** — 0 commits ahead of `main`; a fresh clone still gets SpacetimeDB. One `rm -rf` from gone.
4. **A compliance product surfaces fabricated dollar figures as real fine exposure** — directly against its own "compute, don't invent" rule.

None of these are visible from `npm run build`/`test` (all green) because no test exercises the SQL layer and the DB never ran. They are exactly the class of issue a hackathon build hides.

### Severity summary

| Sev      | Count | Headline items                                                                                                                                                                                  |
| -------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CRITICAL | 2     | Leaked Google key (public); `fp_is_service()` breaks human writes + cross-tenant injection                                                                                                      |
| HIGH     | 8     | Uncommitted backend; `kill_worker` cross-tenant griefing; fabricated fines; no error boundaries; binder success/failure inverted; missing audit-log writes; dead Enter-to-submit; keyboard a11y |
| MEDIUM   | ~14   | LL33 grade bug; engine crash on bad LL84 data; no row validation; missing input caps; no rate limit; dead ComplianceReport; stale lockfile; xlsx CVE; stale client/.env.example; port mismatch  |
| LOW      | ~15   | internal event log shown to customers; sub-cent "compliant"; dead code; bigint precision; doc drift; hygiene                                                                                    |

---

## 1. Project summary

Fineprint tracks NYC local-law compliance per building and runs the remediation as a live ticket queue. Add an address → every obligation becomes a deadline-tracked ticket → AI workers ("the fleet") draft the filing → **a human approves every draft**. The demo is crash-recovery: kill a worker mid-ticket and a 5s reaper returns the ticket to the queue.

- **Backend:** Supabase Postgres, _no API server_. Browser and Node workers talk to the DB directly — reads are RLS-scoped Realtime selects, writes are SQL functions ("reducers"). Whole schema is one 1,377-line migration (`supabase/migrations/20260706120000_init.sql`).
- **Frontend:** Next.js 16 (App Router, React 19, Tailwind v4, biome), `client/`. Editorial "ink on paper" brand (`PRODUCT.md`): the number is the story, one signal red for money owed.
- **Workers:** Node + supabase-js + Anthropic SDK (`agents/`). Scripted playbooks by default; Claude drafts with `USE_LLM=true`.
- **Fine engine:** pure-TypeScript LL97 math, golden-tested (`engine/`).
- **Data:** NYC GeoSearch → PLUTO/LL84 intake + canonical law registry (`data/src/laws.ts`), 10 laws (LL97, Art 321, LL84, LL87, LL11, LL88, LL33, LL152, LL96, LL55).
- **Auth:** Clerk (humans) + Supabase third-party JWT → RLS scopes every table to `auth.jwt()->>'sub'`. Fleet uses the service-role key.

**Data flow:** `request_building(address)` queues an intake → worker resolves via GeoSearch (a geocode "Atlantis guard" rejects wrong-street/borough) → submits a payload → **human approves** → `ingest_building` creates the building + per-law tasks in one transaction → workers `claim_task` (atomic) and draft → human approves → `mark_done`. `reap()` (pg_cron, 5s) reclaims dead workers.

---

## 2. Alignment with Aaravmin's Fine Print GitHub

The remote **is** the reference: `github.com/aaravmin/fineprint` (public). "This folder" is a working copy. Findings:

- **GitHub `origin/main` (`e9c8d42`) is 100% SpacetimeDB** — 7 files under `spacetimedb/`, **0** Supabase files. README, `CLAUDE.md`, tech-stack badges all describe SpacetimeDB/WebSocket/reducers consistently. A fresh clone builds the SpacetimeDB app.
- **The Supabase migration is 100% uncommitted** — `feat/supabase-backend` is **0 commits ahead of `origin/main`**; `git diff HEAD` = 205 tracked files changed (+2,362 / −9,745) plus 6 untracked dirs (`supabase/`, `laws/`, `client/src/lib/db/`, `agents/src/supabase.ts`, …). README + `CLAUDE.md` are rewritten for Supabase but _also_ uncommitted.
- **Internally, both states are coherent** — the migration is not half-done; code and docs move together. The gap is purely that the current direction is unshipped and divergent from what GitHub advertises.
- **The other local branch (`feat/address-intake-wiring`) is a _third_ line** — older SpacetimeDB base, carries uncommitted "PREVIEW DEPLOY ONLY — do not commit" auth-stripping hacks (Clerk stubbed, `ignoreBuildErrors`). Those hacks are **not** in the Supabase worktree (confirmed: `proxy.ts` fails closed there).

**Goals/features/behavior align** with the product vision in `PRODUCT.md`/`README.md`. **Structure and delivery do not**: three divergent branches, the real backend uncommitted, GitHub showing a superseded architecture. Consolidation is a prerequisite to "polished and reliable."

---

## 3. What works (verified)

- **Core LL97 fine engine is correct and honest.** `computeFine` matches DOB's only published worked example exactly (golden test: 45k sqft mixed-use → 302.41 tCO₂e limit; 100 t over × $268 = $26,800); **all 45 engine tests pass**; coefficients carry statute citations; money is integer-cents; `lookup.ts:resolveEmissions` recomputes emissions with DOB statutory coefficients rather than trusting ESPM, and falls back honestly with provenance. (`engine/`, `data/src/lookup.ts`)
- **`claim_task` is textbook-correct optimistic concurrency** — atomic `update task set status='claimed' … where id=? and status='open' returning` (migration:734); no TOCTOU. `reap()` re-checks `claimed_by` before releasing. (`supabase/migrations/…:716, 1059`)
- **Read-side tenant isolation is airtight.** All 11 tables have RLS enabled; exactly one owner-scoped `select` policy each (`owner = (select fp_owner())`); **zero** insert/update/delete policies, so every write goes through a function. No IDOR found on reads. (`…:289–322`)
- **Defense in depth on roles** — fleet-only vs human-only functions are each gated _twice_ (Postgres GRANT + in-function `fp_require_service()`/`fp_require_human()`). Every one of 22 `security definer` functions pins `set search_path = public` (no injection surface). No dynamic SQL anywhere.
- **The FE↔BE seam is clean.** Every `reducers` entry maps to a real SQL function with correct snake_case params; `mappers.ts` covers every column across all 11 tables with zero drift; Clerk JWT is correctly wired to Supabase via the `accessToken` callback (`persistSession:false`); Realtime publication matches `TABLE_NAMES`. Service-role key never appears in `client/`. (`client/src/lib/db/*`)
- **Gates:** `typecheck` clean (5 workspaces); `test` 229 pass / 6 skip; `next build` compiles (16 routes); homepage boots (HTTP 200); the two audit scripts pass (9/9, 19/19).
- **Migration hygiene** — no SpacetimeDB SDK in any `package.json`; no build-error suppression (`ignoreBuildErrors`/`@ts-nocheck`) anywhere; the geocode "Atlantis guard" (`data/src/geosearch.ts`) is a genuinely thoughtful wrong-address defense.

---

## 4. What is broken or incomplete

**CRITICAL — `fp_is_service()` `current_user` fallback breaks the human-approval workflow _and_ opens cross-tenant writes.** `supabase/migrations/…:38–44`, `:642–657`.

```sql
select coalesce(auth.jwt()->>'role','') = 'service_role'
    or current_user in ('postgres','supabase_admin','supabase_auth_admin');
```

Inside a `SECURITY DEFINER` function, `current_user` is the function **owner** (the migrator, `postgres` — no `alter function … owner to` exists), so this returns **true for every caller**. Therefore:

- `fp_require_human()` (`:47`) always raises `'workers cannot do this — a human signs off'` → `approve`/`reject`/`mark_done`/`set_review_mode`/`seed_obligations`/all binder writes **fail for real humans**. Nothing can move a task past `in_review`. The product's core loop is non-functional.
- `ingest_building` (granted to `authenticated`, `:1339`) takes the service branch → `caller := coalesce(p_owner,'cli')` → an authenticated attacker sets `p_owner='<victim>'` and writes/overwrites another tenant's building (unique `(owner,bbl)` means a guessed BBL overwrites the victim's real row).

Not caught by `npm test` (no test hits SQL) or `build` (DB never runs). **Fix:** detect JWT-absence, not `current_user` — e.g. `… or current_setting('request.jwt.claims', true) is null` (verify GUC for the Supabase PG version), and/or `alter function … owner to` a non-privileged role. Confirm live: as an authenticated user, `select fp_is_service()` must return **false**.

**HIGH — the entire Supabase backend is uncommitted.** See §2. 205-file working-tree diff, 0 commits. No history, no PR, no backup. **Fix:** commit in logical slices (schema migration · RLS/auth · client db layer · worker rewrite · data pipeline · doc rewrites) on `feat/supabase-backend`, open a draft PR.

**HIGH — fabricated fine numbers surfaced as real exposure** (violates the product's own rule; a compliance/liability problem). `data/src/laws.ts:179, 222, 240, 257`, `data/src/taskSpecs.ts:39–40`.

- LL87/LL11/LL88 penalties are reverse-engineered `$/sqft` formulas (`Math.max(3000, sqft*0.06)` etc.) — no statute imposes a floor-area-scaled civil penalty here. They feed `priorityScore`, so they **rank what the owner is told to fix first**.
- LL97: when emissions are unknown the _building_ row honestly stores `null`, but the spawned LL97 _task_ shows a conjured fine (`sqft*0.0005*268`) — a 500k sqft building fabricates ~$67k/yr from no data. **Fix:** return `null` for any penalty without a real schedule (as LL55 already does); pass `null` `fine_estimate_usd` on LL97/Art321 when the engine had no input.

**MEDIUM — engine can throw uncaught on real LL84 data → assessment crash.** `data/src/tools.ts:161–191` (no try/catch) calls `computeAllPeriods`; engine throws when summed occupancy sqft > gross floor area (`engine/src/index.ts:183`) or an LL84 use name isn't a known ESPM type (`:123`), and `ll84.ts:298` passes names through unvalidated. **Fix:** validate/clamp in `toEngineInput`, degrade to "data incomplete."

**MEDIUM — `ComplianceReport` is fully built but never rendered.** `client/src/components/dashboard/ComplianceReport.tsx` (+ 4 siblings) — zero usages; `building-client.tsx` renders only `ComplianceSection`/`InvestmentPlanner`/`ComplianceBinder`. Either wire it in or delete. Same for `/unauthorized` route, `demo-portfolio.ts`, `taskSpecsForProfile` (all grep-orphaned).

**MEDIUM — `fp_ingest` duplicate `(owner,bbl)` under concurrency** surfaces a raw constraint error instead of the promised merge. `…:579, 616–629`. **Fix:** `insert … on conflict (owner,bbl) where bbl is not null do update …`.

---

## 5. Frontend issues

- **HIGH — no error boundaries anywhere + unguarded `JSON.parse`.** `client/src/lib/engine.ts:24` — `JSON.parse(building.usesJson)` sits _outside_ every surrounding try/catch; no `error.tsx`/`global-error.tsx` exists under `client/src/app`. One corrupt `usesJson` white-screens the dashboard with Next's unbranded error page. (Observed live: `/dashboard/*` returns HTTP 500 with no env, and the error path itself throws `Objects are not valid as a React child` — the missing-boundary symptom.) **Fix:** wrap the parse (return null like its callers); add `app/(main)/dashboard/error.tsx` + a root `error.tsx`.
- **HIGH — `ComplianceBinder` inverts success/failure.** `client/src/components/compliance/ComplianceBinder.tsx:155–156, 228–242` — `call = (p) => withAck(p).catch(toast.error)` swallows the rejection, so every chained `.then(onSuccess)` runs even on failure. User sees "Adding vendor failed…" immediately followed by "Vendor added," and the form closes, discarding typed input. **Fix:** `.then(onSuccess).catch(onError)` on the raw promise (as `tasks-client.tsx` does correctly).
- **HIGH — the dashboard address bar (this branch's headline feature) has no `<form>`; Enter is a no-op.** `portfolio-client.tsx:322–333` wraps `AddressAutocomplete` in a bare `<div>` with `<Button onClick>` (not `type=submit`, no `onSelect`), while the homepage (`(external)/page.tsx:246`) uses `<form onSubmit>` + `onSelect={search}`. Users trained by the landing page press Enter and get nothing. **Fix:** wrap in `<form onSubmit>`, `type=submit`, `onSelect={submitAddress}`.
- **HIGH — keyboard/a11y dead ends.** Status filter chips (`tasks-client.tsx:162`, `<Card role="button" onClick>` on a `<div>`) and building rows (`portfolio-client.tsx:440`, `<TableRow onClick>`) have no `tabIndex`/`onKeyDown` — unreachable by keyboard/switch/SR. `address-autocomplete.tsx:224/236/239` — biome-confirmed a11y role errors (`role=listbox/option` on non-interactive `ul/li`, option not focusable), and its debounce effect never `abort()`s the in-flight fetch on unmount (setState-after-unmount). **Fix:** real `<button>`/`<Link>` or add `tabIndex`+`onKeyDown`; abort in cleanup.
- **MEDIUM — no runtime validation of DB rows.** `react.tsx:132` does `as T[]`; `mapRow` returns `unknown`. Migration drift or an unexpected NULL surfaces as a crash far from the cause. **Fix:** zod-validate at the `mapRow` boundary (at least in dev).
- **MEDIUM — missing form labels** across `ComplianceBinder` inputs/selects (placeholder-only). **MEDIUM — optimistic address intake** clears the field before the RPC settles and never restores it on failure (`portfolio-client.tsx:217–241`). **MEDIUM — `address-autocomplete` has no empty/loading state** (zero matches → list silently never opens).
- **LOW —** array-index keys + non-exhaustive `switch` in `compliance-section.tsx` (`:169, 173–209`); stale SpacetimeDB comment in `reducer-call.ts:1`; `event-toaster.tsx:28` `announced` Set grows unbounded; bigint ids typed as JS `number` (`db/types.ts`, precision > 2⁵³).

_Clean: `tsc --noEmit` zero errors; the `spacetime-provider.tsx` + all `module_bindings/` are already deleted with no leftover imports._

---

## 6. Backend issues

- **CRITICAL —** `fp_is_service()` / `current_user` (see §4). Root cause of both the broken review flow and the `ingest_building` injection.
- **HIGH — `kill_worker` has no ownership check + `worker` table is world-readable.** `…:305 (worker_fleet_read using(true))`, `:1011 (kill_worker)`, granted to `authenticated` (`:1343`). Any signed-in customer can `select * from worker` (all tenants, with `current_task_id`) and `kill_worker(id)` on **another tenant's** in-flight task → bounces it to `open`, can trip `sla_breached` in `reap()` → real missed-deadline exposure in a compliance product. `prune_dead_workers()` same pattern. **Fix:** restrict to `service_role` (drop the demo-chaos branch) or add an `owner` to `worker` and require `w.owner = fp_owner()`.
- **HIGH — audit-log invariant violated.** `add_vendor` (`:1142`) writes **no** event at all; `assign_vendor`/`set_obligation_status`/`add_evidence`/`set_evidence_verification`/`add_binder_note` write only `binder_event`, never `event` — so they never appear in the ops feed (contrast `seed_obligations:1137`, which writes both). CLAUDE.md states "every function writes an `event` row." **Fix:** add `fp_log_event(...)` to all six.
- **MEDIUM — `set_obligation_status`/`set_evidence_verification` don't validate `p_status`** before the update (`:1192, :1252`) — invalid values fail with a raw constraint error, not the project's human-readable style (`set_review_mode:453` does it right). **MEDIUM — `fp_ingest` concurrency** (§4).
- **LOW — `submit_work` closing updates aren't status-guarded** (`:805, 810`) — latent (no retry path today). **LOW — `mark_done` note has no length cap** (unlike `approve`/`reject`).

_Solid: `claim_task` atomicity, `reap()` race-safety, search_path pinning (22/22), the double-gated role model, careful GRANT/REVOKE of internal helpers._

---

## 7. Config / dependency issues

- **CRITICAL — leaked Google key** (see §8).
- **HIGH — stale `package-lock.json`** still pins the removed workspace `spacetimedb@^2.4.1` (`extraneous`, lock line ~13092). `npm ci` (CI's first step) validates lock↔manifest and can fail. **Fix:** `npm install` to regenerate, commit.
- **HIGH — `xlsx@0.18.5`** (`data/package.json:17`) has two HIGH advisories with no npm fix (Prototype Pollution, ReDoS); it's a `dependency`, so `npm audit --omit=dev --audit-level=high` (in `security.yml`) exits non-zero → CI red. Runtime risk is low (offline pipeline). **Fix:** move to `devDependencies` and/or repin to the patched SheetJS CDN build.
- **HIGH — `client/.env.example` is stale** — still documents `NEXT_PUBLIC_SPACETIMEDB_HOST`/`_DB_NAME`, omits the `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY` the client actually reads (`react.tsx:18`). A dev copying it gets a non-working client.
- **MEDIUM — dev-server port mismatch:** `client/package.json` `dev` = `-p 3000`, but `supabase/config.toml` `site_url` = `http://localhost:3001` and README/CLAUDE say 3001. Supabase `site_url` drives auth redirects → footgun. Pick one.
- **MEDIUM — phantom `@types/node` in `data`** (uses `process.env`, declares no node types; passes only via hoisting); **`laws/` workspace is redundant/broken** (client aliases `fineprint-laws`→`../data/src/laws.ts`, bypassing it; `laws/index.ts` reaches into `data/src` with no declared dep); **TS version drift** (client `^5.9.3` vs rest `~5.6.2`); **`prettier` is a CI gate but not a declared dep** (`npx prettier` fetches `@latest` at CI time).
- **LOW —** leftover `.gitignore`/`.prettierignore` SpacetimeDB rules; `@supabase/supabase-js` in root `devDependencies` but used at runtime by `scripts/ingest.ts`; three overlapping `.env.example` files with undocumented vars (`INGEST_OWNER`, `FINEPRINT_CACHE_DIR`, `GOOGLE_PLACES_API_KEY`, …); `homepage/`, `laws/`, root `scripts/` never typechecked.

_Good: no SpacetimeDB SDK in any manifest; no build-error suppression; CI gates integration tests behind `RUN_INTEGRATION` (no Docker needed for `npm test`); engine coverage gate is strict; `.env.example` correctly un-ignored (which is also how the key leaked)._

---

## 8. Security / privacy concerns

- **CRITICAL — live Google API key committed to a public repo.** `data/.env.example:14` held a real `GOOGLE_PLACES_API_KEY` (`AIzaSy…KprM`, redacted here). Confirmed committed on `origin/main` (entered in `4e720ef` by `aaravmin`, 2026-06-07); `.gitignore` un-ignores `.env.example` (`!*/.env.example`); consumed at `data/src/category.ts:265`. Repo visibility is **PUBLIC**. **Fix now:** rotate/restrict in GCP Console, replace with an empty placeholder, then scrub history (BFG/filter-repo) as secondary. Treat as burned regardless. Add a pre-commit secret scanner.
- **CRITICAL — cross-tenant write + broken auth via `fp_is_service()`** (see §4/§6).
- **HIGH — cross-tenant availability attack via `kill_worker`** (see §6).
- **MEDIUM — missing input-length caps** on `add_vendor`/`add_evidence` free-text (only `name`/`file_name` bounded) — self-inflicted storage bloat, amplified through Realtime. Contradicts the migration's own stated guard-rail intent (`:353`). **MEDIUM — no rate limit on `request_building`** (`:517`) — a customer can loop distinct addresses, burning the shared `SOCRATA_APP_TOKEN` quota + fleet capacity. Only guard is "same address twice."
- **LOW — internal `event` log surfaced to customers.** `activity-client.tsx:101`, `notifications-button.tsx:52`, `event-toaster.tsx:23` read the raw `event` table (worker*reaped/killed/heartbeat/auto-approved vocabulary). \_Not* a cross-tenant leak (owner-scoped), but the migration explicitly says the binder history is "deliberately separate from the internal event log." Decide product-side; filter internal kinds. **LOW — `evidence.file_url_or_key`** is unvalidated free text — no live XSS today (UI hardcodes it empty), but validate the URL scheme server-side before it's ever rendered as `<a href>`.

**Verdict:** read-confidentiality **airtight**; write-integrity, human-approval guarantee, and availability **broken** (two of them by the single `current_user` bug). Confirmed clean: no service-role key in `client/`, no auth-stripping preview hacks in this worktree (`proxy.ts` fails closed + `dashboard/layout.tsx` double-gates), no dynamic SQL, `dangerouslySetInnerHTML` only over static config.

---

## 9. UI/UX concerns

- **Broken affordances:** Enter doesn't submit the dashboard address bar (§5); binder actions show contradictory "failed"→"success" toasts and lose typed input (§5); zero-result address search silently shows nothing.
- **Accessibility (product targets WCAG 2.2 AA per `PRODUCT.md`):** status chips and building rows are mouse-only; suggestion list has role errors + unfocusable options; binder inputs/selects are placeholder-only with no labels. Real gaps against the stated bar.
- **Resilience:** any render error white-screens (no error boundary) with an unbranded page — jarring against the "editorial, exacting" brand.
- **Coherence:** a full print-ready `ComplianceReport` is built but unreachable; an `/unauthorized` page and demo modules ship in the bundle unused.
- **Strengths:** the homepage intake flow (form + autosubmit + reconnect toasts), the Realtime "no refresh button" board, and the draft-typography parser (`DraftBody`) are genuinely nice; the brand system is disciplined and specific.

---

## 10. Prioritized fixes

**P0 — before anything else (security + data integrity):**

1. **Rotate the Google API key** and restrict it; empty the placeholder. (§8)
2. **Fix `fp_is_service()`** — stop using `current_user`; use JWT-absence detection and/or reassign function ownership. Re-verify `select fp_is_service()` = false for an authenticated user, and that `approve`/`ingest_building` behave. (§4)
3. **Lock `kill_worker`/`prune_dead_workers` to `service_role`** (or add `worker.owner` scoping). (§6)
4. **Stop surfacing fabricated fines** — `null` for penalties with no statute; `null` `fine_estimate_usd` when the engine had no input. (§4)

**P1 — before a real deploy:** 5. Add `error.tsx` boundaries + guard `engine.ts` `JSON.parse`. (§5) 6. Fix `ComplianceBinder` success/failure ordering. (§5) 7. Add missing `fp_log_event` calls to the six binder functions. (§6) 8. Fix the LL33 grade thresholds (`F` = didn't file, `D` = <55). (`data/src/laws.ts:358`) 9. `try/catch` around the engine on LL84 data; validate ESPM use names. (§4) 10. Commit the migration; regenerate `package-lock.json`; fix `xlsx`; fix `client/.env.example`; align the port. (§2/§7)

**P2 — hardening / polish:** 11. Wrap the dashboard address bar in a form; fix keyboard a11y + labels; add empty/loading states. (§5/§9) 12. zod-validate DB rows at `mapRow`. (§5) 13. Input-length caps + `p_status` validation + `on conflict` in `fp_ingest`; rate-limit `request_building`. (§6/§8) 14. Resolve dead surfaces (`ComplianceReport`, `/unauthorized`, `demo-portfolio.ts`, `taskSpecsForProfile`); wire or delete. (§4/§5) 15. Decide the `event`-vs-`binder_event` customer surface; label per-single-family retrofit costs; fix sub-cent "compliant"; fix binder evidence first-word match. (§8/data LOWs)

**P3 — hygiene:** rewrite `docs/codebase-state.md` (still describes SpacetimeDB); dedupe `.env.example` files; `@types/node` in `data`; resolve `laws/` workspace; align TS versions; pin `prettier`; drop stale ignore rules; stale `reducer-call.ts` comment.

---

## 11. Concrete next steps

1. **Rotate the key** (GCP Console → Credentials → regenerate + restrict). 5 minutes, do it first.
2. **Stand up the DB locally** to actually exercise what tests can't: start Docker → `npm run db:start` → `npm run db:reset` → sign in as a Clerk user and run `select fp_is_service();` (expect the bug: returns `true`). Fix line 42, re-run, confirm `false`, then click Approve in the dashboard end-to-end.
3. **Turn on the SQL layer in CI** — the two CRITICALs and three of the HIGHs are invisible to `npm test` because nothing exercises Postgres. Add pgTAP or a `RUN_INTEGRATION` job (Supabase in CI) covering: human approve succeeds, worker approve fails, cross-tenant `ingest_building`/`kill_worker` are rejected, `claim_task` single-owner under contention.
4. **Commit and PR the migration** in logical slices; open a draft PR against `main`; decide the SpacetimeDB→Supabase cutover on GitHub (the public repo currently advertises the old backend).
5. **Work P0→P1** above. Re-run `audit:laws`, `audit:binder`, `lint`, `build`, and the new integration job before calling it done — and per the roadmap's own rule, _don't claim success unless they actually pass_.

---

_Evidence throughout is `file:line` against the `feat/supabase-backend` worktree. Two findings could not be executed live (Docker down): the `fp_is_service()` behavior (reasoned from Postgres `SECURITY DEFINER`/`current_user` semantics — confirm with the one-liner in step 2) and the skipped integration tests. Everything else was run or read directly._
