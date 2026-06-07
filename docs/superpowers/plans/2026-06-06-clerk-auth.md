# Clerk authentication implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Protect every dashboard route behind Clerk sign-in and show the real signed-in user (name, email, avatar) in the existing custom UI.

**Architecture:** Middleware-level protection via `clerkMiddleware` + `createRouteMatcher` in `proxy.ts`. Dedicated `/sign-in` and `/sign-up` pages render Clerk components. The dashboard layout (server component) fetches `currentUser()` and passes a `{ name, email, avatar }` object down to `AccountSwitcher` and `AppSidebar`/`NavUser`. Client menus call `useClerk()` for `openUserProfile()` and `signOut()`.

**Tech Stack:** Next.js 16 App Router, @clerk/nextjs 7.4.3, Tailwind v4, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-06-06-clerk-auth-design.md`

**Testing note:** The client workspace has no unit-test runner; verification per task is `npx tsc --noEmit` (only pre-existing stale-bindings errors allowed) plus a manual browser pass at the end. Commit steps assume the user has approved committing on this branch; if not, skip them and commit once at the end.

---

### Task 1: Route protection in proxy.ts

**Files:**

- Modify: `client/src/proxy.ts`

- [ ] **Step 1: Replace the middleware with a public-route matcher + protect**

Full new content of `client/src/proxy.ts`:

```typescript
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for Clerk's auto-proxy path
    "/__clerk/:path*",
    "/(api|trpc)(.*)",
  ],
};
```

- [ ] **Step 2: Typecheck**

Run: `cd client && npx tsc --noEmit`
Expected: only the pre-existing errors about `annualEmissionsTco2E` / `usesJson` / `ll97Covered` / `input-otp` / `engine/src/index.ts`. No errors mentioning `proxy.ts`.

- [ ] **Step 3: Commit**

```bash
git add client/src/proxy.ts
git commit -m "protect all routes behind Clerk sign-in except the auth pages"
```

---

### Task 2: Sign-in and sign-up pages

**Files:**

- Create: `client/src/app/(external)/sign-in/[[...sign-in]]/page.tsx`
- Create: `client/src/app/(external)/sign-up/[[...sign-up]]/page.tsx`

- [ ] **Step 1: Create the sign-in page**

`client/src/app/(external)/sign-in/[[...sign-in]]/page.tsx`:

```tsx
import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <SignIn />
    </main>
  );
}
```

- [ ] **Step 2: Create the sign-up page**

`client/src/app/(external)/sign-up/[[...sign-up]]/page.tsx`:

```tsx
import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <SignUp />
    </main>
  );
}
```

- [ ] **Step 3: Add the route env vars to `client/.env.local`**

Append (create the file if missing — it is gitignored; the user supplies the two keys from https://dashboard.clerk.com):

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/dashboard
```

If real keys already exist in the file, keep them and add only the four URL vars.

- [ ] **Step 4: Typecheck**

Run: `cd client && npx tsc --noEmit`
Expected: pre-existing errors only.

- [ ] **Step 5: Commit**

```bash
git add "client/src/app/(external)/sign-in" "client/src/app/(external)/sign-up"
git commit -m "add dedicated sign-in and sign-up pages with Clerk components"
```

---

### Task 3: Remove the temporary auth header from the root layout

**Files:**

- Modify: `client/src/app/layout.tsx`

- [ ] **Step 1: Drop the header and trim imports**

In `client/src/app/layout.tsx`, change the Clerk import to only:

```typescript
import { ClerkProvider } from "@clerk/nextjs";
```

and replace the `<body>` content so the temporary `<header>` is gone:

```tsx
<body className={`${fontVars} min-h-screen antialiased`}>
  <ClerkProvider>
    <TooltipProvider>
      <PreferencesStoreProvider
        themeMode={theme_mode}
        themePreset={theme_preset}
        contentLayout={content_layout}
        navbarStyle={navbar_style}
        font={font}
      >
        <SpacetimeProvider>{children}</SpacetimeProvider>
        <Toaster />
      </PreferencesStoreProvider>
    </TooltipProvider>
  </ClerkProvider>
</body>
```

Everything else in the file (metadata, html attributes, ThemeBootScript) stays unchanged.

- [ ] **Step 2: Typecheck**

Run: `cd client && npx tsc --noEmit`
Expected: pre-existing errors only.

- [ ] **Step 3: Commit**

```bash
git add client/src/app/layout.tsx
git commit -m "drop the temporary auth header now that sign-in has its own page"
```

---

### Task 4: Dashboard layout fetches the real Clerk user

**Files:**

- Modify: `client/src/app/(main)/dashboard/layout.tsx`

- [ ] **Step 1: Fetch and map the Clerk user, pass it down**

Add imports at the top of `client/src/app/(main)/dashboard/layout.tsx`:

```typescript
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
```

Remove the mock import:

```typescript
import { users } from "@/data/users"; // DELETE this line
```

Inside the `Layout` function, before the `return`, add:

```typescript
const clerkUser = await currentUser();

if (!clerkUser) {
  redirect("/sign-in");
}

const email = clerkUser.primaryEmailAddress?.emailAddress ?? "";
const user = {
  name: clerkUser.fullName ?? email.split("@")[0] ?? "Account",
  email,
  avatar: clerkUser.imageUrl,
};
```

Change the two component usages in the JSX:

```tsx
<AppSidebar variant={variant} collapsible={collapsible} user={user} />
```

```tsx
<AccountSwitcher user={user} />
```

- [ ] **Step 2: Typecheck**

Run: `cd client && npx tsc --noEmit`
Expected: NEW errors in `app-sidebar.tsx` and `account-switcher.tsx` about the changed props — fixed in Tasks 5 and 6. No other new errors.

(No commit yet — Tasks 4–6 land together because the prop change spans them.)

---

### Task 5: AccountSwitcher shows the current user with real actions

**Files:**

- Modify: `client/src/app/(main)/dashboard/_components/sidebar/account-switcher.tsx`

- [ ] **Step 1: Rewrite the component**

Full new content of `account-switcher.tsx`:

```tsx
"use client";

import { useClerk } from "@clerk/nextjs";
import { BadgeCheck, LogOut } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getInitials } from "@/lib/utils";

export function AccountSwitcher({
  user,
}: {
  readonly user: {
    readonly name: string;
    readonly email: string;
    readonly avatar: string;
  };
}) {
  const { openUserProfile, signOut } = useClerk();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Avatar className="size-8 rounded-lg">
          <AvatarImage src={user.avatar || undefined} alt={user.name} />
          <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="min-w-56 space-y-1 rounded-lg"
        side="bottom"
        align="end"
        sideOffset={4}
      >
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex w-full items-center gap-2 px-1 py-1.5">
            <Avatar className="size-9 rounded-lg">
              <AvatarImage src={user.avatar || undefined} alt={user.name} />
              <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
            </Avatar>
            <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">{user.name}</span>
              <span className="truncate text-muted-foreground text-xs">{user.email}</span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => openUserProfile()}>
            <BadgeCheck />
            Account
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut({ redirectUrl: "/sign-in" })}>
          <LogOut />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd client && npx tsc --noEmit`
Expected: remaining new errors only in `app-sidebar.tsx` (fixed in Task 6).

---

### Task 6: AppSidebar and NavUser take the real user

**Files:**

- Modify: `client/src/app/(main)/dashboard/_components/sidebar/app-sidebar.tsx`
- Modify: `client/src/app/(main)/dashboard/_components/sidebar/nav-user.tsx`

- [ ] **Step 1: AppSidebar accepts a `user` prop**

In `app-sidebar.tsx`, remove:

```typescript
import { rootUser } from "@/data/users"; // DELETE this line
```

Change the component signature:

```tsx
export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  readonly user: { readonly name: string; readonly email: string; readonly avatar: string };
}) {
```

Change the footer usage:

```tsx
<NavUser user={user} />
```

Also fix the logo link in the header (`/dashboard/default` does not exist):

```tsx
<Link prefetch={false} href="/dashboard">
```

- [ ] **Step 2: NavUser gets real menu actions**

In `nav-user.tsx`:

Add import:

```typescript
import { useClerk } from "@clerk/nextjs";
```

Change the lucide import to drop the dead icons:

```typescript
import { CircleUser, EllipsisVertical, LogOut } from "lucide-react";
```

Inside the component, next to `useSidebar()`:

```typescript
const { openUserProfile, signOut } = useClerk();
```

Replace the menu group (Account / Billing / Notifications) and log-out item with:

```tsx
<DropdownMenuGroup>
  <DropdownMenuItem onClick={() => openUserProfile()}>
    <CircleUser />
    Account
  </DropdownMenuItem>
</DropdownMenuGroup>
<DropdownMenuSeparator />
<DropdownMenuItem onClick={() => signOut({ redirectUrl: "/sign-in" })}>
  <LogOut />
  Log out
</DropdownMenuItem>
```

The user-info trigger and label markup stay unchanged (the `user` prop shape is the same).

- [ ] **Step 3: Typecheck**

Run: `cd client && npx tsc --noEmit`
Expected: back to pre-existing errors only.

- [ ] **Step 4: Commit Tasks 4–6 together**

```bash
git add "client/src/app/(main)/dashboard/layout.tsx" "client/src/app/(main)/dashboard/_components/sidebar/account-switcher.tsx" "client/src/app/(main)/dashboard/_components/sidebar/app-sidebar.tsx" "client/src/app/(main)/dashboard/_components/sidebar/nav-user.tsx"
git commit -m "show the signed-in Clerk user in the header and sidebar menus"
```

---

### Task 7: Delete mock users and fix the landing redirect

**Files:**

- Delete: `client/src/data/users.ts`
- Modify: `client/src/app/(external)/page.tsx`

- [ ] **Step 1: Confirm nothing else imports the mock data**

Run: `cd client && grep -rn "data/users" src/`
Expected: no matches (Tasks 4–6 removed both imports). If anything matches, fix it before deleting.

- [ ] **Step 2: Delete the file**

```bash
rm client/src/data/users.ts
```

- [ ] **Step 3: Fix the landing redirect**

In `client/src/app/(external)/page.tsx`, change:

```typescript
redirect("/dashboard/default");
```

to:

```typescript
redirect("/dashboard");
```

- [ ] **Step 4: Sweep for any other `/dashboard/default` references**

Run: `cd client && grep -rn "dashboard/default" src/`
Expected: no matches. Fix any stragglers to `/dashboard`.

- [ ] **Step 5: Typecheck**

Run: `cd client && npx tsc --noEmit`
Expected: pre-existing errors only.

- [ ] **Step 6: Commit**

```bash
git add -A client/src/data client/src/app
git commit -m "delete mock users and point the landing redirect at the real dashboard route"
```

---

### Task 8: End-to-end verification in the browser

**Files:** none (manual pass)

- [ ] **Step 1: Lint the touched files**

Run: `cd client && npx biome check src/proxy.ts "src/app/(external)" src/app/layout.tsx "src/app/(main)/dashboard/layout.tsx" "src/app/(main)/dashboard/_components/sidebar"`
Expected: no errors (formatting auto-fixed by the pre-commit hook if any).

- [ ] **Step 2: Start the dev server**

Run: `npm run dashboard` (root) — Next.js on port 3001. Requires real `pk_test_`/`sk_test_` keys in `client/.env.local`.

- [ ] **Step 3: Walk the auth flow**

In the browser:

1. Open `http://localhost:3001/dashboard/tasks` signed out → redirected to `/sign-in`.
2. Sign up as a new user → land on `/dashboard`.
3. Header avatar (AccountSwitcher) and sidebar footer (NavUser) show the real name, email, and avatar from Clerk.
4. "Account" in either menu opens the Clerk profile modal.
5. "Log out" → back on `/sign-in`; `/dashboard` is blocked again.

Expected: every step behaves as written; no console errors from Clerk.

- [ ] **Step 4: Report results**

Summarize the flow results to the user, including anything that did not match.
