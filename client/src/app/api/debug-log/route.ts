// Temporary debugging endpoint for the Clerk sign-in investigation.
// Receives intercepted Clerk FAPI error payloads from the browser and
// appends them to /tmp/clerk-oauth-debug.log. Delete after the bug is fixed.
import { appendFileSync } from "node:fs";

export async function POST(request: Request) {
  const payload = await request.text();
  appendFileSync("/tmp/clerk-oauth-debug.log", payload + "\n---\n");
  return new Response("ok");
}
