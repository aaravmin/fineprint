# Clerk authentication for the dashboard

Date: 2026-06-06
Status: approved

## Goal

Finish the authentication system for the Next.js client. Every dashboard
route requires sign-in, and the UI shows the real signed-in user (name,
email, avatar) pulled from Clerk instead of mock data.

## Decisions made

- Keep Next.js App Router file-based routing. No react-router — it would
  conflict with the built-in router, server components, and middleware auth.
- Dedicated `/sign-in` and `/sign-up` pages using Clerk's full-page
  components. No modals, no Clerk-hosted pages.
- Everything requires sign-in except the auth pages themselves.
- Keep the existing custom user UI (AccountSwitcher in the header, NavUser
  in the sidebar footer) and feed it real Clerk data. No prebuilt UserButton.

## 1. Route protection — `client/src/proxy.ts`

Middleware-level guard so protection is server-side with no content flash:

```ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});
```

The existing `config.matcher` (including `/__clerk/:path*`) stays unchanged.
A signed-out user hitting any URL is redirected to `/sign-in`.

## 2. Auth pages

- `client/src/app/(external)/sign-in/[[...sign-in]]/page.tsx` renders
  Clerk `<SignIn />` in a centered, full-height container.
- `client/src/app/(external)/sign-up/[[...sign-up]]/page.tsx` renders
  Clerk `<SignUp />` the same way.

Required env vars in `client/.env.local`:

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/dashboard
```

## 3. Root layout cleanup — `client/src/app/layout.tsx`

Remove the temporary `<header>` with `<Show>` / `<SignInButton>` /
`<SignUpButton>` / `<UserButton>` added during initial Clerk setup. The
dashboard has its own header, and the sign-in page now handles the
signed-out state. `<ClerkProvider>` stays wrapping the app inside `<body>`.

## 4. Real user data

The dashboard layout (`client/src/app/(main)/dashboard/layout.tsx`) is a
server component. It calls `await currentUser()` from
`@clerk/nextjs/server` and maps the Clerk user to the shape the UI already
uses:

| UI field | Clerk source                                 |
| -------- | -------------------------------------------- |
| name     | `fullName`, falling back to email local part |
| email    | `primaryEmailAddress.emailAddress`           |
| avatar   | `imageUrl`                                   |

That object is passed as a prop to `AccountSwitcher` (header) and to
`AppSidebar`, which forwards it to `NavUser` (sidebar footer). `AppSidebar`
currently imports the mock `rootUser` directly; it gains a `user` prop
instead.

Component changes:

- `AccountSwitcher` drops the fake multi-user list and renders the single
  current user. "Account" calls `openUserProfile()` from `useClerk()`
  (Clerk profile modal: avatar upload, name, email, security). "Log out"
  calls `signOut()` which lands back on `/sign-in`.
- `NavUser` gets the same wiring for its "Account" and "Log out" items.
- Dead "Billing" and "Notifications" stub items are removed from both menus.
- `client/src/data/users.ts` (mock users) is deleted.

## 5. Bug fixes en route

- `client/src/app/(external)/page.tsx` redirects to `/dashboard/default`,
  which does not exist. Fix to `/dashboard`.
- The sidebar logo link in `app-sidebar.tsx` has the same wrong URL. Fix
  to `/dashboard`.

## 6. Out of scope

The SpacetimeDB connection still uses an anonymous identity. Wiring Clerk
JWTs into SpacetimeDB OIDC auth (so reducers know the real user) is a
separate future spec.

## Testing

Manual flow on the dev server (`npm run dashboard`, port 3001):

1. Visit `/dashboard/tasks` signed out — redirected to `/sign-in`.
2. Sign up as a new user — land on `/dashboard`.
3. Real name, email, and avatar appear in the header AccountSwitcher and
   the sidebar NavUser.
4. "Account" opens the Clerk profile modal; uploading an avatar updates
   both spots after refresh.
5. "Log out" returns to `/sign-in`; dashboard URLs are blocked again.

Plus `npx tsc --noEmit` in `client/` introduces no new errors beyond the
pre-existing stale-bindings ones.
