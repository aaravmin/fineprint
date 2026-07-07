import { type NextRequest, NextResponse } from "next/server";

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

import { isClerkConfigured } from "@/lib/auth/config";

// The landing page and legal pages are the marketing front door — signed-out
// visitors must reach them. Only the dashboard lives behind the gate.
const isPublicRoute = createRouteMatcher(["/", "/sign-in(.*)", "/sign-up(.*)", "/privacy", "/terms"]);

function authUnavailableMiddleware(req: NextRequest) {
  if (isPublicRoute(req)) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/sign-in", req.url));
}

const middleware = isClerkConfigured()
  ? clerkMiddleware(async (auth, req) => {
      if (!isPublicRoute(req)) {
        await auth.protect();
      }
    })
  : authUnavailableMiddleware;

export default middleware;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/__clerk/:path*",
    "/(api|trpc)(.*)",
  ],
};
