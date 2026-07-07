"use client";

import { useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { MotionConfig, motion } from "framer-motion";
import { ArrowRight, Menu } from "lucide-react";

import { AddressAutocomplete } from "@/components/address-autocomplete";
import { DemoOpsRoom } from "@/components/demo-ops-room";
import { FineprintLogo } from "@/components/fineprint-logo";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import StickyTabs from "@/components/ui/sticky-tabs";
import { TextRotate } from "@/components/ui/text-rotate";

const DASH = "/dashboard/portfolio";

const EASE = [0.23, 1, 0.32, 1] as const;
const CTA_LETTERS = Array.from("See your building's number", (char, index) => ({
  char,
  key: `${char}-${index}`,
}));

const rise = {
  hidden: { opacity: 0, y: 14, filter: "blur(10px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.7, ease: EASE },
  },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09 } },
};

const inView = {
  initial: "hidden",
  whileInView: "show",
  viewport: { once: true, margin: "0px 0px -60px 0px" },
} as const;

const NAV_LINKS = [
  { label: "How it works", href: "#how" },
  { label: "Laws covered", href: "#laws" },
];

const STEPS = [
  {
    n: "01",
    t: "Type the address",
    d: "Any NYC building over 25,000 sq ft resolves to its tax lot. We pull the city's records.",
  },
  {
    n: "02",
    t: "Read your number",
    d: "Your fine, computed from LL84 benchmarking data against the verified LL97 limits.",
  },
  {
    n: "03",
    t: "Fund the fix",
    d: "Retrofits ranked by payback, matched to Con Ed, NYSERDA, and IRS rebates.",
  },
];

const LAWS = [
  {
    statute: "LL97 / 1 RCNY §103-14",
    obligation: "Carbon caps, buildings over 25,000 sq ft",
    computed: true,
    stakes: "$268 per ton over cap",
  },
  {
    statute: "LL97 Article 321",
    obligation: "Affordable housing pathway",
    computed: true,
    stakes: "$10,000 flat penalties",
  },
  {
    statute: "LL84",
    obligation: "Annual energy benchmarking",
    computed: false,
    stakes: "$500 per quarter late",
  },
  {
    statute: "FISP / LL11",
    obligation: "Facade inspection, 5-year cycle",
    computed: false,
    stakes: "$1,000 per month unfiled",
  },
  {
    statute: "LL152",
    obligation: "Gas piping inspection, 4-year cycle",
    computed: false,
    stakes: "$5,000 for a missed filing",
  },
  {
    statute: "LL33 / LL95",
    obligation: "Energy letter grade",
    computed: false,
    stakes: "Grade posted at your door",
  },
];

export default function Home() {
  const router = useRouter();
  const [address, setAddress] = useState("");

  // Hand the address to the portfolio, which queues a real city-data intake
  // (GeoSearch -> LL84 -> covered list -> engine). An agent resolves it and
  // the building lands in review. Signed-out visitors pass through Clerk
  // first; the address rides along and the intake fires once they land.
  const search = (value: string) => {
    const trimmedAddress = value.trim();
    router.push(trimmedAddress ? `${DASH}?address=${encodeURIComponent(trimmedAddress)}` : DASH);
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="fp-grain relative min-h-screen bg-background text-foreground">
        <div className="relative z-10">
          {/* ── NAV ── */}
          <header className="sticky top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur-md">
            <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
              <Link href="/" className="font-heading flex items-center text-xl font-bold tracking-tight">
                <span className="sr-only">Fineprint</span>
                <span aria-hidden="true" className="flex items-center">
                  <FineprintLogo className="mr-px h-[0.95em] w-auto" />
                  ineprint
                </span>
              </Link>
              <div className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
                {NAV_LINKS.map((link) => (
                  <Link key={link.label} href={link.href} className="transition-colors hover:text-foreground">
                    {link.label}
                  </Link>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={DASH}
                  className="fp-press hidden rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 md:inline-flex"
                >
                  Open dashboard
                </Link>
                <Sheet>
                  <SheetTrigger
                    className="fp-press inline-flex size-11 items-center justify-center rounded-full border border-border bg-card md:hidden"
                    aria-label="Open menu"
                  >
                    <Menu className="size-5" />
                  </SheetTrigger>
                  <SheetContent side="left" className="bg-background/95 backdrop-blur-lg">
                    <SheetHeader>
                      <SheetTitle className="font-heading flex items-center text-lg font-bold">
                        <span className="sr-only">Fineprint</span>
                        <span aria-hidden="true" className="flex items-center">
                          <FineprintLogo className="mr-px h-[0.95em] w-auto" />
                          ineprint
                        </span>
                      </SheetTitle>
                    </SheetHeader>
                    <div className="grid gap-1 px-4">
                      {NAV_LINKS.map((link) => (
                        <SheetClose key={link.label} asChild>
                          <Link
                            href={link.href}
                            className="rounded-lg px-3 py-2.5 text-base font-medium text-foreground/80 transition-colors hover:bg-secondary hover:text-foreground"
                          >
                            {link.label}
                          </Link>
                        </SheetClose>
                      ))}
                    </div>
                  </SheetContent>
                </Sheet>
              </div>
            </nav>
          </header>

          {/* ── HERO ── */}
          <section className="relative overflow-hidden">
            {/* Halftone ink dot grid — the document texture. */}
            <div
              aria-hidden="true"
              className="absolute inset-0 z-0 bg-[radial-gradient(circle,_#141414_1px,_transparent_1px)] opacity-[0.12] [background-size:22px_22px]"
            />
            <div
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 z-0 h-40 bg-gradient-to-t from-background to-transparent"
            />

            <motion.div
              variants={stagger}
              initial="hidden"
              animate="show"
              className="relative z-10 mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-6xl flex-col justify-center px-5 py-12 md:py-16"
            >
              {/* Row 1 */}
              <motion.div variants={rise}>
                <h1 className="font-heading text-[clamp(2.25rem,9vw,7.5rem)] font-bold leading-none tracking-tight">
                  READ THE
                </h1>
              </motion.div>

              {/* Row 2 — the mark IS the F in FINE */}
              <motion.div variants={rise} className="mt-1 md:mt-2">
                <p className="font-heading text-[clamp(2.25rem,9vw,7.5rem)] font-bold leading-none tracking-tight">
                  <span className="sr-only">Fine print.</span>
                  <span aria-hidden="true" className="flex items-center">
                    <FineprintLogo className="mr-[0.04em] inline-block h-[0.82em] w-auto text-destructive" />
                    INE&nbsp;PRINT.
                  </span>
                </p>
              </motion.div>

              {/* Value line — one rotating word, sized well below the wordmark */}
              <motion.div variants={rise} className="mt-6 md:mt-8">
                <p className="font-heading flex flex-wrap items-baseline gap-x-2 text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
                  Skip the
                  <span className="inline-grid">
                    {/* Invisible copies reserve the widest word so rotation never reflows. */}
                    {["fine.", "cliff.", "panic."].map((word) => (
                      <span key={word} aria-hidden="true" className="invisible [grid-area:1/1]">
                        {word}
                      </span>
                    ))}
                    <span className="[grid-area:1/1]">
                      <TextRotate
                        texts={["fine.", "cliff.", "panic."]}
                        mainClassName="inline-flex overflow-hidden text-destructive"
                        staggerDuration={0.02}
                        staggerFrom="first"
                        rotationInterval={2600}
                      />
                    </span>
                  </span>
                </p>
                <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
                  Type any NYC address — your LL97 fine and the 2030 cliff, computed from the city&apos;s own records in
                  about ten seconds.
                </p>
              </motion.div>

              {/* Address search — the primary CTA. */}
              <motion.form
                variants={rise}
                className="mt-8 w-full max-w-[52rem] md:mt-10"
                onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
                  e.preventDefault();
                  search(address);
                }}
              >
                <div className="flex flex-col gap-2.5 sm:flex-row">
                  <AddressAutocomplete
                    value={address}
                    onValueChange={setAddress}
                    onSelect={search}
                    className="flex-1 sm:max-w-xl"
                    inputClassName="w-full rounded-full border border-border bg-card px-6 py-4 text-base text-foreground shadow-[0_1px_2px_rgba(20,20,20,0.04),0_4px_14px_-6px_rgba(20,20,20,0.08)] outline-none transition-shadow placeholder:text-muted-foreground/60 focus:border-foreground/30"
                  />
                  <button
                    type="submit"
                    className="fp-press inline-flex items-center justify-center gap-2 rounded-full bg-primary px-7 py-4 text-base font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Check fine <ArrowRight className="size-4" />
                  </button>
                </div>
                <div className="mt-3.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>Try:</span>
                  {["1 Wall Street", "20 Exchange Place", "1870 Pelham Pkwy S"].map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => search(ex)}
                      className="fp-press rounded-full border border-border bg-card px-3 py-1.5 text-foreground/80 hover:border-foreground/25"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </motion.form>
            </motion.div>
          </section>

          {/* ── STAKES ── */}
          <section className="border-y border-border tabular-nums">
            <motion.div
              variants={stagger}
              {...inView}
              className="mx-auto grid max-w-6xl grid-cols-2 divide-border px-5 md:grid-cols-4 md:divide-x"
            >
              {[
                { n: "8", s: "NYC building laws tracked in one dashboard", red: false },
                {
                  n: "$595M+",
                  s: "modeled annual fine exposure across tracked laws",
                  red: true,
                },
                { n: "~28,000", s: "NYC buildings covered", red: false },
                { n: "40+", s: "cities passed the same standard", red: false },
              ].map((s) => (
                <motion.div variants={rise} key={s.n} className="px-5 py-8">
                  <p
                    className={`font-heading text-4xl font-bold tracking-tight ${s.red ? "text-destructive" : "text-foreground"}`}
                  >
                    {s.n}
                  </p>
                  <p className="mt-1.5 text-sm leading-snug text-muted-foreground">{s.s}</p>
                </motion.div>
              ))}
            </motion.div>
          </section>

          {/* ── DOSSIER SECTIONS — sticky headers stack like tabbed case files ── */}
          <StickyTabs>
            <StickyTabs.Item title="01 / How it works" id="how">
              <motion.div variants={stagger} {...inView} id="how">
                <motion.p variants={rise} className="max-w-lg text-lg text-muted-foreground">
                  Address to funded plan. No spreadsheet, no consultant.
                </motion.p>
                {/* Docket ledger — each step is a filing line, numeral inks up on hover. */}
                <div className="mt-10 border-y border-border">
                  {STEPS.map((step) => (
                    <motion.div
                      variants={rise}
                      key={step.n}
                      className="group grid grid-cols-[4.5rem_1fr] items-baseline gap-4 border-b border-border py-8 last:border-b-0 md:grid-cols-[10rem_1fr_1.4fr] md:gap-10 md:py-10"
                    >
                      <span
                        aria-hidden="true"
                        className="font-heading text-5xl font-bold tracking-tight text-border transition-colors duration-300 tabular-nums group-hover:text-destructive md:text-7xl"
                      >
                        {step.n}
                      </span>
                      <h3 className="font-heading text-xl font-semibold tracking-tight md:text-2xl">{step.t}</h3>
                      <p className="col-span-2 col-start-2 leading-relaxed text-muted-foreground md:col-span-1 md:col-start-3 md:text-lg">
                        {step.d}
                      </p>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            </StickyTabs.Item>

            <StickyTabs.Item title="02 / Laws covered" id="laws">
              <motion.div variants={stagger} {...inView} id="laws">
                <motion.h3
                  variants={rise}
                  className="font-heading max-w-2xl text-3xl font-bold leading-snug tracking-tight sm:text-4xl"
                >
                  Your LL97 fine, figured from real emissions. Every other deadline, dated to the day.{" "}
                  <span className="text-destructive">Never a made-up number.</span>
                </motion.h3>
                {/* The statute ledger: the product's subject matter IS the design.
                    Set like actual fine print: rule lines, citations, dollar stakes. */}
                <motion.div variants={rise} className="mt-12 overflow-x-auto">
                  <table className="w-full border-y border-border text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground/70">
                        <th className="py-3 pr-4 font-medium">Statute</th>
                        <th className="hidden py-3 pr-4 font-medium sm:table-cell">Obligation</th>
                        <th className="py-3 pr-4 font-medium">Handling</th>
                        <th className="py-3 text-right font-medium">Cost of a miss</th>
                      </tr>
                    </thead>
                    <tbody>
                      {LAWS.map((law) => (
                        <tr
                          key={law.statute}
                          className="group border-b border-border transition-colors last:border-b-0 hover:bg-card"
                        >
                          <td className="py-4 pr-4">
                            <span className="font-heading font-semibold tracking-tight">{law.statute}</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground sm:hidden">
                              {law.obligation}
                            </span>
                          </td>
                          <td className="hidden py-4 pr-4 text-muted-foreground sm:table-cell">{law.obligation}</td>
                          <td className="py-4 pr-4">
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                              <span
                                className={`inline-block size-1.5 rounded-full ${law.computed ? "bg-destructive" : "bg-[var(--success)]"}`}
                              />
                              {law.computed ? "Computed" : "Tracked"}
                            </span>
                          </td>
                          <td className="py-4 text-right font-medium text-destructive tabular-nums">{law.stakes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </motion.div>
                <motion.p variants={rise} className="mt-5 max-w-2xl text-sm text-muted-foreground">
                  Computed means we publish the math against the statute. Tracked means the public DOB deadline sits on
                  a live board with a timer.
                </motion.p>
              </motion.div>
            </StickyTabs.Item>

            <StickyTabs.Item title="03 / The ops room" id="ops">
              <motion.div variants={stagger} {...inView}>
                <motion.div variants={rise} className="max-w-2xl">
                  <h3 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
                    Every obligation becomes a ticket
                  </h3>
                  <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
                    Each covered law is a ticket on a timer. Dispatch an agent and watch the fleet and the activity log
                    move in unison — claim, draft, submit, approve.
                  </p>
                </motion.div>

                <motion.div variants={rise} className="mt-8">
                  <DemoOpsRoom />
                </motion.div>
              </motion.div>
            </StickyTabs.Item>
          </StickyTabs>

          {/* ── CTA + FOOTER ── */}
          <section className="border-t border-border bg-card">
            <motion.div variants={stagger} {...inView} className="mx-auto max-w-6xl px-5 py-20 text-center md:py-24">
              <motion.h2 variants={rise} className="font-heading text-4xl font-bold tracking-tight sm:text-5xl">
                <span className="sr-only">See your building&apos;s number</span>
                <span aria-hidden="true">
                  {CTA_LETTERS.map((letter) => (
                    <span key={letter.key} className="transition-colors duration-150 hover:text-destructive">
                      {letter.char}
                    </span>
                  ))}
                </span>
              </motion.h2>
              <motion.p variants={rise} className="mx-auto mt-4 max-w-md text-lg text-muted-foreground">
                One address. About ten seconds.
              </motion.p>
              <motion.form
                variants={rise}
                className="mx-auto mt-8 flex max-w-md flex-col gap-2.5 sm:flex-row"
                onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
                  e.preventDefault();
                  search(address);
                }}
              >
                <AddressAutocomplete
                  value={address}
                  onValueChange={setAddress}
                  onSelect={search}
                  className="flex-1"
                  inputClassName="w-full rounded-full border border-border bg-background px-6 py-4 text-base text-foreground outline-none transition-shadow placeholder:text-muted-foreground/60 focus:border-foreground/30"
                />
                <button
                  type="submit"
                  className="fp-press inline-flex items-center justify-center gap-2 rounded-full bg-primary px-7 py-4 text-base font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Check fine <ArrowRight className="size-4" />
                </button>
              </motion.form>
            </motion.div>
            <footer className="border-t border-border">
              <div className="mx-auto max-w-6xl px-5 py-12 md:py-16">
                <div className="grid gap-10 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
                  <div>
                    <div className="font-heading flex items-center text-base font-semibold text-foreground">
                      <span className="sr-only">Fineprint</span>
                      <span aria-hidden="true" className="flex items-center">
                        <FineprintLogo className="mr-px h-[0.95em] w-auto" />
                        ineprint
                      </span>
                    </div>
                    <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
                      Your building&apos;s LL97 fine and the 2030 cliff, computed from the city&apos;s own records in
                      about ten seconds.
                    </p>
                  </div>

                  <FooterColumn
                    title="Product"
                    links={[
                      { label: "How it works", href: "#how" },
                      { label: "Laws covered", href: "#laws" },
                      { label: "Open dashboard", href: DASH },
                    ]}
                  />
                  <FooterColumn
                    title="Legal"
                    links={[
                      { label: "Privacy policy", href: "/privacy" },
                      { label: "Terms of service", href: "/terms" },
                    ]}
                  />
                  <FooterColumn
                    title="Contact"
                    links={[
                      {
                        label: "dkosukhintech@gmail.com",
                        href: "mailto:dkosukhintech@gmail.com",
                      },
                    ]}
                  />
                </div>

                <div className="mt-12 flex flex-col gap-3 border-t border-border pt-6 md:flex-row md:items-baseline md:justify-between">
                  <p className="text-[11px] text-muted-foreground/60">© 2026 Fineprint. All rights reserved.</p>
                  {/* The disclaimer is set, on purpose, in actual fine print. */}
                  <p className="max-w-xl text-[11px] leading-relaxed text-muted-foreground/60 md:text-right">
                    Estimates from NYC LL84 benchmarking data and LL97 emission limits (1 RCNY §103-14). Not legal
                    advice. Official compliance requires a registered design professional.
                  </p>
                </div>
              </div>
            </footer>
          </section>
        </div>
      </div>
    </MotionConfig>
  );
}

function FooterColumn({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">{title}</p>
      <ul className="mt-3 space-y-2 text-sm">
        {links.map((link) =>
          link.href.includes(":") ? (
            <li key={link.label}>
              <a href={link.href} className="text-muted-foreground transition-colors hover:text-foreground">
                {link.label}
              </a>
            </li>
          ) : (
            <li key={link.label}>
              <Link href={link.href} className="text-muted-foreground transition-colors hover:text-foreground">
                {link.label}
              </Link>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
