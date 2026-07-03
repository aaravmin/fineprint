import Link from "next/link";

import type { Metadata } from "next";

import { LegalLayout, type LegalSection } from "@/components/legal/legal-layout";

export const metadata: Metadata = {
  title: "Terms of service — Fineprint",
  description: "The terms that govern your use of Fineprint.",
};

const UPDATED = "July 3, 2026";
const CONTACT_EMAIL = "dkosukhintech@gmail.com";
const GOVERNING_STATE = "New York";
const VENUE = "New York County, New York";

const SECTIONS: LegalSection[] = [
  {
    id: "acceptance",
    heading: "Acceptance of these terms",
    body: (
      <p>
        These Terms of Service govern your access to and use of Fineprint, including the website, dashboard, and any
        related services (the &ldquo;Service&rdquo;). By creating an account or using the Service, you agree to these
        terms and to our <Link href="/privacy">Privacy policy</Link>. If you do not agree, do not use the Service. If
        you use the Service on behalf of an organization, you represent that you are authorized to bind that
        organization to these terms.
      </p>
    ),
  },
  {
    id: "the-service",
    heading: "The service",
    body: (
      <p>
        Fineprint estimates New York City building compliance obligations and potential penalties from public records
        and helps you plan responses. The Service provides informational estimates and workflow tools. It does not file
        anything with any agency on your behalf unless expressly stated, and it does not guarantee any regulatory
        outcome.
      </p>
    ),
  },
  {
    id: "estimates-not-advice",
    heading: "Estimates, not professional advice",
    body: (
      <>
        <p>
          <strong>
            Fineprint provides estimates for informational purposes only. It is not legal, engineering, financial, or
            professional advice, and it is not a substitute for a registered design professional.
          </strong>
        </p>
        <p>
          Estimates are derived from third-party public data that may be incomplete, delayed, or inaccurate, and from
          assumptions that may not fit your building. Official compliance determinations, filings, and penalties are set
          by the City of New York and its agencies. You are responsible for verifying any figure before relying on it
          and for engaging qualified professionals to meet your legal obligations.
        </p>
      </>
    ),
  },
  {
    id: "accounts",
    heading: "Eligibility and accounts",
    body: (
      <p>
        You must be at least 18 years old and able to form a binding contract to use the Service. You are responsible
        for the accuracy of your account information, for keeping your credentials secure, and for all activity under
        your account. Notify us promptly of any unauthorized use.
      </p>
    ),
  },
  {
    id: "acceptable-use",
    heading: "Acceptable use",
    body: (
      <>
        <p>You agree not to:</p>
        <ul>
          <li>Use the Service in violation of any law or the rights of others.</li>
          <li>Access the Service through automated means, scrape it, or exceed reasonable usage.</li>
          <li>Reverse engineer, resell, or create a competing product from the Service.</li>
          <li>Interfere with, disrupt, or attempt to gain unauthorized access to the Service or its systems.</li>
          <li>Upload unlawful, infringing, or malicious content.</li>
        </ul>
      </>
    ),
  },
  {
    id: "your-content",
    heading: "Your content",
    body: (
      <p>
        You retain ownership of the addresses, notes, and other content you submit. You grant us a limited license to
        host, process, and display that content solely to operate and improve the Service. You are responsible for your
        content and for having the rights to submit it.
      </p>
    ),
  },
  {
    id: "intellectual-property",
    heading: "Intellectual property",
    body: (
      <p>
        The Service, including its software, design, and content we provide, is owned by Fineprint and protected by
        intellectual property laws. Subject to these terms, we grant you a limited, non-exclusive, non-transferable,
        revocable license to use the Service for its intended purpose. All rights not expressly granted are reserved.
      </p>
    ),
  },
  {
    id: "third-party",
    heading: "Third-party data and services",
    body: (
      <p>
        The Service incorporates public data and relies on third-party providers for authentication, hosting, and
        similar functions. We do not control and are not responsible for third-party data or services, and your use of
        them may be subject to their own terms.
      </p>
    ),
  },
  {
    id: "disclaimers",
    heading: "Disclaimer of warranties",
    body: (
      <p>
        THE SERVICE AND ALL ESTIMATES ARE PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE,&rdquo; WITHOUT
        WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING ANY WARRANTIES OF MERCHANTABILITY,
        FITNESS FOR A PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, AND ACCURACY. We do not warrant that the Service will
        be uninterrupted, error-free, or that any estimate is accurate, complete, or current.
      </p>
    ),
  },
  {
    id: "limitation-of-liability",
    heading: "Limitation of liability",
    body: (
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, FINEPRINT AND ITS OWNERS, EMPLOYEES, AND SUPPLIERS WILL NOT BE LIABLE
        FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUES,
        DATA, OR GOODWILL, ARISING OUT OF OR RELATING TO THE SERVICE OR ANY ESTIMATE, EVEN IF ADVISED OF THE
        POSSIBILITY. OUR TOTAL LIABILITY FOR ANY CLAIM RELATING TO THE SERVICE WILL NOT EXCEED THE GREATER OF THE AMOUNT
        YOU PAID US IN THE TWELVE MONTHS BEFORE THE CLAIM OR ONE HUNDRED U.S. DOLLARS. Some jurisdictions do not allow
        certain limitations, so parts of this section may not apply to you.
      </p>
    ),
  },
  {
    id: "indemnification",
    heading: "Indemnification",
    body: (
      <p>
        You agree to indemnify and hold harmless Fineprint and its owners, employees, and suppliers from any claims,
        losses, liabilities, and expenses, including reasonable legal fees, arising out of your use of the Service, your
        content, or your violation of these terms or applicable law.
      </p>
    ),
  },
  {
    id: "termination",
    heading: "Termination",
    body: (
      <p>
        You may stop using the Service at any time. We may suspend or terminate your access if you violate these terms
        or if we discontinue the Service. Provisions that by their nature should survive termination, including
        ownership, disclaimers, limitations of liability, and indemnification, will survive.
      </p>
    ),
  },
  {
    id: "governing-law",
    heading: "Governing law and disputes",
    body: (
      <p>
        These terms are governed by the laws of the State of {GOVERNING_STATE}, without regard to its conflict-of-laws
        rules. You and Fineprint agree to the exclusive jurisdiction and venue of the state and federal courts located
        in {VENUE} for any dispute, and each party waives any right to a jury trial to the extent permitted by law. Any
        claim must be brought within one year after it arises.
      </p>
    ),
  },
  {
    id: "changes",
    heading: "Changes to these terms",
    body: (
      <p>
        We may update these terms as the Service evolves or as the law requires. When we make material changes, we will
        revise the date at the top of this page. Your continued use of the Service after changes take effect means you
        accept the updated terms.
      </p>
    ),
  },
  {
    id: "contact",
    heading: "Contact us",
    body: (
      <p>
        Questions about these terms? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalLayout
      title="Terms of service"
      updated={UPDATED}
      intro={
        <p>
          These terms are a binding agreement between you and Fineprint. Please read them carefully. They cover what the
          Service is, how you may use it, and the limits of our responsibility for the estimates it provides.
        </p>
      }
      sections={SECTIONS}
    />
  );
}
