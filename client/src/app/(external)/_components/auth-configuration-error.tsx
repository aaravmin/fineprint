import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function AuthConfigurationError() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Authentication is not configured</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Missing Clerk production keys</AlertTitle>
            <AlertDescription>
              Set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in Vercel to enable GitHub sign-in.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </main>
  );
}
