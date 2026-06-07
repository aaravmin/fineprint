"use client";

import { useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { MotionConfig, motion } from "framer-motion";
import { ArrowRight, BadgeCheck, Menu, ScrollText, TriangleAlert } from "lucide-react";

import { AddressAutocomplete } from "@/components/address-autocomplete";
import { FineprintLogo } from "@/components/fineprint-logo";
import DisplayCards from "@/components/ui/display-cards";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import StickyTabs from "@/components/ui/sticky-tabs";
import { TextRotate } from "@/components/ui/text-rotate";

const DASH = "/dashboard/portfolio";

const EASE = [0.23, 1, 0.32, 1] as const;

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
  { label: "Dashboard", href: DASH },
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

// Non-breaking spaces keep each exposure on a single line — TextRotate splits
// on regular spaces and lets the resulting words reflow.
const HERO_FINE_EXPOSURES = [
  "LL97: ~$200M/yr",
  "LL84: ~$56M/yr",
  "LL87: ~$70M/yr",
  "LL11: ~$192M/yr",
  "LL88: ~$42M+/yr",
  "LL152: ~$35M/yr",
  "LL55: ~$24M/yr",
];

const TICKET_CARDS = [
  {
    icon: <BadgeCheck className="size-4 text-[var(--success)]" />,
    iconClassName: "bg-[var(--success)]/10",
    title: "LL84 benchmarking",
    titleClassName: "text-foreground",
    description: "Submitted before the May 1 deadline",
    date: "approved",
    className:
      "[grid-area:stack] hover:-translate-y-10 before:absolute before:w-[100%] before:outline-1 before:rounded-xl before:outline-border before:h-[100%] before:content-[''] before:bg-blend-overlay before:bg-background/50 grayscale-[100%] hover:before:opacity-0 before:transition-opacity before:duration-700 hover:grayscale-0 before:left-0 before:top-0",
  },
  {
    icon: <ScrollText className="size-4 text-foreground" />,
    iconClassName: "bg-secondary",
    title: "FISP cycle 9 filing",
    titleClassName: "text-foreground",
    description: "Facade report drafted, awaiting review",
    date: "drafting / nyx",
    className:
      "[grid-area:stack] translate-x-8 translate-y-6 sm:translate-x-12 sm:translate-y-8 hover:-translate-y-1 before:absolute before:w-[100%] before:outline-1 before:rounded-xl before:outline-border before:h-[100%] before:content-[''] before:bg-blend-overlay before:bg-background/50 grayscale-[100%] hover:before:opacity-0 before:transition-opacity before:duration-700 hover:grayscale-0 before:left-0 before:top-0",
  },
  {
    icon: <TriangleAlert className="size-4 text-destructive" />,
    iconClassName: "bg-destructive-subtle",
    title: "LL97 over-cap exposure",
    titleClassName: "text-destructive",
    description: "$214,000/yr fine — retrofit plan in progress",
    date: "claimed / atlas",
    className:
      "[grid-area:stack] translate-x-16 translate-y-12 sm:translate-x-24 sm:translate-y-16 hover:translate-y-6",
  },
];

export default function Home() {
  const router = useRouter();
  const [address, setAddress] = useState("");

  // Backend not wired yet — searching just routes to the dashboard.
  const search = (value: string) => {
    const a = value.trim();
    router.push(a ? `${DASH}?address=${encodeURIComponent(a)}` : DASH);
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
                      <SheetClose asChild>
                        <Link
                          href={DASH}
                          className="fp-press mt-3 inline-flex justify-center rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                        >
                          Open dashboard
                        </Link>
                      </SheetClose>
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

            {/* Vertical statute stamp on the right edge. */}
            <div aria-hidden="true" className="absolute right-0 top-1/2 z-10 hidden -translate-y-1/2 lg:flex">
              <div className="bg-foreground px-3 py-6 text-sm font-bold text-background">
                <span className="rotate-180 [writing-mode:vertical-rl]">1 RCNY §103-14</span>
              </div>
            </div>

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

              {/* Row 3 — SKIP THE [rotating word], width locked to the longest word */}
              <motion.div variants={rise} className="mt-1 md:mt-2">
                <p className="font-heading flex items-baseline whitespace-nowrap text-[clamp(2.25rem,9vw,7.5rem)] font-bold leading-none tracking-tight">
                  SKIP&nbsp;THE&nbsp;
                  <span className="inline-grid">
                    {/* Invisible copies reserve the widest word so rotation never reflows the page. */}
                    {["FINE.", "CLIFF.", "PANIC."].map((word) => (
                      <span key={word} aria-hidden="true" className="invisible [grid-area:1/1]">
                        {word}
                      </span>
                    ))}
                    <span className="[grid-area:1/1]">
                      <TextRotate
                        texts={["FINE.", "CLIFF.", "PANIC."]}
                        mainClassName="inline-flex text-destructive overflow-hidden"
                        staggerDuration={0.02}
                        staggerFrom="first"
                        rotationInterval={2600}
                      />
                    </span>
                  </span>
                </p>
              </motion.div>

              {/* Ledger rule — jurisdiction stamp + rotating statutory exposure. */}
              <motion.div variants={rise} className="mt-8 w-full max-w-[52rem] md:mt-12">
                <Separator />
                <div className="mt-4 grid gap-2 text-muted-foreground sm:grid-cols-[minmax(0,36rem)_minmax(0,1fr)] sm:items-baseline">
                  <span className="text-xs tracking-wide md:text-sm md:whitespace-nowrap">
                    NEW YORK CITY, NY / 28,000 COVERED BUILDINGS
                  </span>
                  <span className="flex flex-col gap-1 text-left sm:flex-row sm:items-baseline sm:gap-3 md:text-right">
                    <span className="whitespace-nowrap text-lg font-thin tracking-wide text-foreground md:text-2xl">
                      ANNUAL RISK
                    </span>
                    <span className="inline-grid font-heading text-2xl font-bold italic text-destructive tabular-nums md:text-3xl lg:text-4xl">
                      {HERO_FINE_EXPOSURES.map((exposure) => (
                        <span key={exposure} aria-hidden="true" className="invisible whitespace-nowrap [grid-area:1/1]">
                          {exposure}
                        </span>
                      ))}
                      <span className="[grid-area:1/1]">
                        <TextRotate
                          texts={HERO_FINE_EXPOSURES}
                          mainClassName="inline-flex overflow-hidden whitespace-nowrap"
                          staggerDuration={0.01}
                          staggerFrom="first"
                          rotationInterval={2600}
                        />
                      </span>
                    </span>
                  </span>
                </div>
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
                { n: "$595M+", s: "modeled annual fine exposure across tracked laws", red: true },
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
                  Compute what&apos;s computable. Track what&apos;s trackable.{" "}
                  <span className="text-destructive">Never fake a number.</span>
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
              <motion.div variants={stagger} {...inView} className="grid items-center gap-16 lg:grid-cols-[1fr_1fr]">
                <motion.div variants={rise}>
                  <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--success)]" /> Real-time
                  </span>
                  <h3 className="font-heading mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
                    Every obligation becomes a ticket
                  </h3>
                  <p className="mt-4 max-w-md text-lg leading-relaxed text-muted-foreground">
                    Each one carries its statutory deadline on a timer. AI workers claim tickets, draft the remediation,
                    and submit. You approve every one.
                  </p>
                  <Link
                    href={DASH}
                    className="fp-press mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Open the dashboard <ArrowRight className="size-4" />
                  </Link>
                </motion.div>
                <motion.div variants={rise} className="flex justify-center pb-12 sm:pb-16 sm:pr-8">
                  <DisplayCards cards={TICKET_CARDS} />
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
                  {"See your building's number".split("").map((ch, i) => (
                    <span key={`${ch}-${i}`} className="transition-colors duration-150 hover:text-destructive">
                      {ch}
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
              <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 md:flex-row md:items-center md:justify-between">
                <div className="font-heading flex items-center text-base font-semibold text-foreground">
                  <span className="sr-only">Fineprint</span>
                  <span aria-hidden="true" className="flex items-center">
                    <FineprintLogo className="mr-px h-[0.95em] w-auto" />
                    ineprint
                  </span>
                </div>
                {/* The footer is set, on purpose, in actual fine print. */}
                <p className="max-w-xl text-[11px] leading-relaxed text-muted-foreground/70">
                  Estimates from NYC LL84 benchmarking data and LL97 emission limits (1 RCNY §103-14). Not legal advice.
                  Official compliance requires a registered design professional.
                </p>
              </div>
            </footer>
          </section>
        </div>
      </div>
    </MotionConfig>
  );
}
