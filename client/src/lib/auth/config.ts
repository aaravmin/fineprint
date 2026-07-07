const EXAMPLE_CLERK_PUBLISHABLE_KEY = "pk_test_Y2xlcmsuZXhhbXBsZS5jb20k";

function isUsableValue(value: string | undefined): value is string {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 && !normalized.includes("placeholder") && !normalized.includes("example.com");
}

function isUsablePublishableKey(value: string | undefined): boolean {
  return isUsableValue(value) && value !== EXAMPLE_CLERK_PUBLISHABLE_KEY && /^pk_(test|live)_/.test(value);
}

function isUsableSecretKey(value: string | undefined): boolean {
  return isUsableValue(value) && /^sk_(test|live)_/.test(value);
}

export function isClerkConfigured(): boolean {
  return (
    isUsablePublishableKey(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) &&
    isUsableSecretKey(process.env.CLERK_SECRET_KEY)
  );
}
