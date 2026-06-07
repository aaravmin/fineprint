import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// The landing page is the marketing front door — signed-out visitors must
// reach it. Only the dashboard lives behind the gate.
// "/api/debug-log" is temporary, for the Clerk sign-in investigation — remove with it.
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/debug-log",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/__clerk/:path*",
    "/(api|trpc)(.*)",
  ],
};
