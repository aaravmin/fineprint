# Clerk environments

## Now: development instance

The app runs on Clerk's development instance: keys `pk_test_`/`sk_test_` in
`client/.env.local` (gitignored, template in `client/.env.example`). Dev
instances work on localhost and any deployed URL, share Clerk's OAuth dev
credentials, cap at 100 users, and show a "Development mode" banner on the
auth components. Fine for the demo; not for real traffic.

Deploying a preview to Vercel with dev keys: add the same `pk_test_`/
`sk_test_` values as Vercel environment variables (Preview scope) — nothing
else changes.

## Later: switching to production

Production needs a real domain you control. One-time checklist, in order:

1. **Create the production instance.** Clerk Dashboard → instance switcher
   (top) → "Create production instance" → clone settings from development.
   User data does NOT transfer — dev users stay in dev.
2. **Set the domain.** Dashboard → Domains → enter `fineprint.<yourdomain>`
   (or apex). This generates the DNS records.
3. **Add DNS records** at the registrar: CNAME `clerk.<domain>` (Frontend
   API), CNAME `accounts.<domain>` (account portal), plus the email DKIM/
   return-path CNAMEs the dashboard lists. Verification can take hours.
4. **OAuth credentials.** Each social provider used in prod needs your own
   app credentials (e.g. a Google OAuth client) — the shared dev ones don't
   carry over. Dashboard → SSO connections → per provider.
5. **Keys into Vercel.** Dashboard (Production instance selected) → API
   keys → copy `pk_live_`/`sk_live_` → Vercel project → Settings →
   Environment Variables, **Production scope only**:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...`
   - `CLERK_SECRET_KEY=sk_live_...`
   - the four `NEXT_PUBLIC_CLERK_*_URL` values (same paths as dev)
   - `NEXT_PUBLIC_SPACETIMEDB_HOST=wss://<hosted-spacetimedb>` — production
     also needs a reachable SpacetimeDB; localhost won't exist there.
6. **Deploy and verify.** Sign-up/sign-in on the production URL, banner gone,
   certificate issued for `clerk.<domain>`.

Keys never live in committed files in either environment. Local dev keeps
using the development instance — the two coexist; the instance switcher in
the Clerk dashboard toggles which one you're configuring.
