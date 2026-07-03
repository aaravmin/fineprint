import Link from "next/link";

import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy policy — Fineprint",
  description: "How Fineprint collects, uses, and protects your data.",
};

const LAST_UPDATED = "July 3, 2026";

const CONTACT_EMAIL = "privacy@fineprint.nyc";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-heading text-base font-semibold text-foreground">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-5 py-16">
      <Link
        href="/"
        className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Home
      </Link>

      <h1 className="font-heading mt-8 text-3xl font-bold tracking-tight text-foreground">Privacy policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated {LAST_UPDATED}</p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-muted-foreground">
        <p>
          Fineprint helps New York City building owners estimate Local Law 97 fines and plan compliance. This policy
          explains what we collect, why, and the choices you have. It covers the Fineprint web application and marketing
          site.
        </p>

        <Section title="Information you give us">
          <p>
            When you create an account we collect your name, email address, and profile image through our authentication
            provider. When you look up or track a building you provide its address, and we store the resulting records
            and any notes or plans generated for it.
          </p>
        </Section>

        <Section title="Public records we use">
          <p>
            Fine estimates are built from public New York City data: LL84 energy and water benchmarking submissions,
            LL97 emission limits (1 RCNY 103-14), PLUTO, and DOB filing records. These sources describe buildings, not
            people, and are already public. We retrieve them by address and cache them against the buildings you track.
          </p>
        </Section>

        <Section title="How we use your information">
          <p>
            We use your account details to sign you in and keep your portfolio separate from other users. We use the
            building data you enter to compute fine projections, draft filings, and show your compliance status. We use
            aggregate, non-identifying usage information to keep the service running and improve it.
          </p>
        </Section>

        <Section title="How your data is stored">
          <p>
            Account and building records are held in our application database and transmitted over encrypted
            connections. Access is limited to your authenticated account. We retain your data for as long as your
            account is active.
          </p>
        </Section>

        <Section title="Service providers">
          <p>
            We rely on a small number of processors to operate Fineprint, including an authentication provider and a
            hosting provider. They process data only to deliver the service on our behalf. We do not sell your personal
            information or share it for advertising.
          </p>
        </Section>

        <Section title="Your choices">
          <p>
            You can review and update your account details at any time, and you can ask us to export or delete your
            account and its building records. To make a request, email us at the address below.
          </p>
        </Section>

        <Section title="Cookies">
          <p>
            We use cookies that are necessary to sign you in and keep your session secure. We do not use advertising or
            cross-site tracking cookies.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            We may update this policy as the service evolves. When we make material changes we will revise the date at
            the top of this page.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about this policy or your data? Email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-2 hover:text-foreground">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </Section>

        <p className="border-t border-border pt-6 text-[11px] leading-relaxed text-muted-foreground/70">
          Fineprint provides fine estimates from public records. It is not legal advice. Official compliance requires a
          registered design professional.
        </p>
      </div>
    </main>
  );
}
