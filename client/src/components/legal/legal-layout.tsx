import type { ReactNode } from "react";

import Link from "next/link";

import { ArrowLeft } from "lucide-react";

import { FineprintLogo } from "@/components/fineprint-logo";

export interface LegalSection {
  id: string;
  heading: string;
  body: ReactNode;
}

function pad(index: number): string {
  return String(index + 1).padStart(2, "0");
}

// Shared chrome for the privacy and terms pages: sticky wordmark bar, an
// editorial title block, a sticky table of contents on desktop, and numbered
// sections. Both legal pages pass their own copy; the frame stays identical so
// the two read as one document set.
export function LegalLayout({
  title,
  updated,
  intro,
  sections,
}: {
  title: string;
  updated: string;
  intro: ReactNode;
  sections: LegalSection[];
}) {
  return (
    <div className="fp-grain min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
          <Link href="/" className="font-heading flex items-center text-lg font-bold tracking-tight">
            <span className="sr-only">Fineprint</span>
            <span aria-hidden="true" className="flex items-center">
              <FineprintLogo className="mr-px h-[0.95em] w-auto" />
              ineprint
            </span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Back to site
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-14 md:py-20">
        <div className="border-b border-border pb-8">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Legal</p>
          <h1 className="font-heading mt-3 text-4xl font-bold tracking-tight md:text-5xl">{title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">Last updated {updated}</p>
          <div className="mt-5 max-w-2xl text-sm leading-relaxed text-muted-foreground">{intro}</div>
        </div>

        <div className="mt-10 grid gap-12 md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
          <aside className="hidden md:block">
            <nav className="sticky top-24 space-y-0.5 text-sm">
              <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">Contents</p>
              {sections.map((section, index) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="flex gap-2 rounded-md py-1.5 leading-snug text-muted-foreground transition-colors hover:text-foreground"
                >
                  <span className="font-mono text-[11px] text-muted-foreground/50">{pad(index)}</span>
                  <span>{section.heading}</span>
                </a>
              ))}
            </nav>
          </aside>

          <article className="min-w-0 space-y-12">
            {sections.map((section, index) => (
              <section key={section.id} id={section.id} className="scroll-mt-24">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-xs text-muted-foreground/50">{pad(index)}</span>
                  <h2 className="font-heading text-xl font-bold tracking-tight">{section.heading}</h2>
                </div>
                <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground [&_a:hover]:text-foreground [&_a]:underline [&_a]:underline-offset-2 [&_li]:ml-1 [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
                  {section.body}
                </div>
              </section>
            ))}
          </article>
        </div>

        <p className="mt-16 border-t border-border pt-6 text-[11px] leading-relaxed text-muted-foreground/70">
          Fineprint provides fine estimates from public records. It is not legal advice, and using it does not create an
          attorney-client or professional-engineering relationship. Official compliance requires a registered design
          professional.
        </p>
      </div>
    </div>
  );
}
