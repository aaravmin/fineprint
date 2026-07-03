import type { Metadata } from "next";

import { LegalLayout, type LegalSection } from "@/components/legal/legal-layout";

export const metadata: Metadata = {
  title: "Privacy policy — Fineprint",
  description: "How Fineprint collects, uses, and protects your data.",
};

const UPDATED = "July 3, 2026";
const CONTACT_EMAIL = "dkosukhintech@gmail.com";

const SECTIONS: LegalSection[] = [
  {
    id: "information-you-provide",
    heading: "Information you provide",
    body: (
      <>
        <p>When you use Fineprint, we collect information you give us directly:</p>
        <ul>
          <li>
            <strong>Account details.</strong> Your name, email address, and profile image, handled through our
            authentication provider when you sign up or sign in.
          </li>
          <li>
            <strong>Building information.</strong> The addresses you look up and track, along with any notes, plans, or
            settings you create for them.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "public-records",
    heading: "Public records we use",
    body: (
      <p>
        Fine estimates are built from public New York City data, including LL84 energy and water benchmarking
        submissions, LL97 emission limits (1 RCNY 103-14), PLUTO, and Department of Buildings filing records. These
        sources describe buildings rather than people and are already public. We retrieve them by address and cache them
        against the buildings you track.
      </p>
    ),
  },
  {
    id: "how-we-use",
    heading: "How we use your information",
    body: (
      <>
        <p>We use the information above to:</p>
        <ul>
          <li>Sign you in and keep your portfolio separate from other users.</li>
          <li>Compute fine projections, draft filings, and show your compliance status.</li>
          <li>Operate, secure, maintain, and improve the service.</li>
          <li>Respond to your requests and send service-related messages.</li>
        </ul>
        <p>
          We use aggregate, non-identifying usage information to understand how the service is used. We do not use your
          information for advertising, and we do not sell it.
        </p>
      </>
    ),
  },
  {
    id: "storage-security",
    heading: "How your data is stored",
    body: (
      <p>
        Account and building records are held in our application database and transmitted over encrypted connections.
        Access is limited to your authenticated account and to personnel who need it to run the service. We retain your
        data for as long as your account is active, and we delete or anonymize it within a reasonable period after you
        close your account, unless we are required to keep it to meet a legal obligation.
      </p>
    ),
  },
  {
    id: "service-providers",
    heading: "Service providers",
    body: (
      <p>
        We rely on a small number of processors to run Fineprint, including an authentication provider and a hosting
        provider. They process data only to deliver the service on our behalf and are bound to protect it. We may also
        disclose information if required by law, to enforce our terms, or to protect the rights, safety, and property of
        Fineprint or others.
      </p>
    ),
  },
  {
    id: "your-rights",
    heading: "Your choices and rights",
    body: (
      <p>
        You can review and update your account details at any time. Depending on where you live, you may have the right
        to access, correct, export, or delete your personal information, and to object to or restrict certain
        processing. To make a request, email us at the address below. We will respond within the time required by
        applicable law, and we will not discriminate against you for exercising these rights.
      </p>
    ),
  },
  {
    id: "cookies",
    heading: "Cookies",
    body: (
      <p>
        We use cookies and similar technologies that are necessary to sign you in and keep your session secure. We do
        not use advertising or cross-site tracking cookies. You can control cookies through your browser settings,
        though disabling essential cookies may prevent you from signing in.
      </p>
    ),
  },
  {
    id: "children",
    heading: "Children",
    body: (
      <p>
        Fineprint is a tool for building owners and professionals and is not directed to children. We do not knowingly
        collect personal information from anyone under 18. If you believe a minor has provided us information, contact
        us and we will delete it.
      </p>
    ),
  },
  {
    id: "changes",
    heading: "Changes to this policy",
    body: (
      <p>
        We may update this policy as the service evolves or as the law requires. When we make material changes, we will
        revise the date at the top of this page and, where appropriate, provide additional notice.
      </p>
    ),
  },
  {
    id: "contact",
    heading: "Contact us",
    body: (
      <p>
        Questions about this policy or your data? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy policy"
      updated={UPDATED}
      intro={
        <p>
          Fineprint helps New York City building owners estimate Local Law 97 fines and plan compliance. This policy
          explains what we collect, why we collect it, and the choices you have. It covers the Fineprint web application
          and marketing site.
        </p>
      }
      sections={SECTIONS}
    />
  );
}
