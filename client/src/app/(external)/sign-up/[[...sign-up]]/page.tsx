import { SignUp } from "@clerk/nextjs";

import { AuthConfigurationError } from "@/app/(external)/_components/auth-configuration-error";
import { isClerkConfigured } from "@/lib/auth/config";

export default function SignUpPage() {
  if (!isClerkConfigured()) {
    return <AuthConfigurationError />;
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <SignUp />
    </main>
  );
}
