"use client";

import { useState } from "react";

import Link from "next/link";
import { MotionConfig, motion } from "framer-motion";
import { FineprintLogo } from "@/components/fineprint-logo";
import FallingSymbolsBackground from "@/components/ui/falling-symbols-background";
import { useRouter } from "next/navigation";

const DASH = "/dashboard/portfolio";

const PAPER = "#faf9f6";
const INK_RAIN = [
  "rgba(20,20,20,0.16)",
  "rgba(20,20,20,0.10)",
  "rgba(20,20,20,0.07)",
  "rgba(20,20,20,0.10)",
  "rgba(20,20,20,0.05)",
  "rgba(229,52,43,0.14)",
];

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
              <Link
                href="/"
                className="font-heading flex items-center gap-2 text-xl font-bold tracking-tight"
              >
                <FineprintLogo className="h-6 w-6" />
                Fineprint
              </Link>
              <div className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
                <a href="#how" className="transition-colors hover:text-foreground">
                  How it works
                </a>
                <a href="#laws" className="transition-colors hover:text-foreground">
                  Laws covered
                </a>
                <Link href={DASH} className="transition-colors hover:text-foreground">
                  Dashboard
                </Link>
              </div>
              <Link
                href={DASH}
                className="fp-press rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Open dashboard
              </Link>
            </nav>
          </header>

          {/* ── HERO ── */}
          <section className="relative flex min-h-[92svh] flex-col items-center justify-center overflow-hidden px-5">
            <div className="absolute inset-0">
              <FallingSymbolsBackground
                symbols="§$¢%§$.,0123456789"
                symbolColors={INK_RAIN}
                fontSize={13}
                backgroundColor={PAPER}
                glitchSpeed={140}
                glitchIntensity={0.012}
                fallSpeed={0.3}
                outerVignette={false}
              />
              {/* Paper pools in the middle so the headline sits on calm ground. */}
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_55%_50%_at_50%_45%,#faf9f6_30%,transparent_100%)]" />
              <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background to-transparent" />
            </div>

            <motion.div
              variants={stagger}
              initial="hidden"
              animate="show"
              className="relative z-10 flex w-full max-w-5xl flex-col items-center text-center"
            >
              <motion.h1
                variants={rise}
                className="font-heading text-[clamp(2.4rem,9.5vw,8.5rem)] font-bold leading-none tracking-tight"
              >
                <span className="sr-only">The fine print.</span>
                <span aria-hidden="true">
                  {"THE FINE PRINT.".split("").map((ch, i) => (
                    <span
                      key={`${ch}-${i}`}
                      className="transition-colors duration-150 hover:text-destructive"
                    >
                      {ch === " " ? " " : ch}
                    </span>
                  ))}
                </span>
              </motion.h1>

              <motion.p
                variants={rise}
                className="mt-5 max-w-xl text-balance text-lg leading-relaxed text-muted-foreground"
              >
                Local Law 97 fines NYC buildings $268 for every ton of carbon over the
                cap. Fineprint computes your exact number from the city&apos;s own
                records, then builds the rebate-funded plan that gets you under.
              </motion.p>

              <motion.form
                variants={rise}
                className="mt-9 w-full max-w-xl"
                onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
                  e.preventDefault();
                  search(address);
                }}
              >
                <div className="flex flex-col gap-2.5 sm:flex-row">
                  <label className="flex-1">
                    <span className="sr-only">NYC building address</span>
                    <input
                      value={address}
                      onChange={e => setAddress(e.target.value)}
                      type="text"
                      placeholder="Enter a NYC building address"
                      className="w-full rounded-full border border-border bg-card px-6 py-4 text-base text-foreground shadow-[0_1px_2px_rgba(20,20,20,0.04),0_4px_14px_-6px_rgba(20,20,20,0.08)] outline-none transition-shadow placeholder:text-muted-foreground/60 focus:border-foreground/30"
                    />
                  </label>
                  <button
                    type="submit"
                    className="fp-press rounded-full bg-primary px-7 py-4 text-base font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Check fine&nbsp;→
                  </button>
                </div>
                <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
                  <span>Try:</span>
                  {["1 Wall Street", "20 Exchange Place", "1870 Pelham Pkwy S"].map(
                    ex => (
                      <button
                        key={ex}
                        type="button"
                        onClick={() => search(ex)}
                        className="fp-press rounded-full border border-border bg-card px-3 py-1 text-foreground/80 hover:border-foreground/25"
                      >
                        {ex}
                      </button>
                    ),
                  )}
                </div>
              </motion.form>
            </motion.div>
          </section>

          <main className="mx-auto max-w-6xl px-5">
            {/* ── STAKES ── */}
            <section className="border-y border-border tabular-nums">
              <motion.div
                variants={stagger}
                {...inView}
                className="grid grid-cols-2 divide-border md:grid-cols-4 md:divide-x"
              >
                {[
                  { n: "$268", s: "fine per ton of CO₂e over your cap", red: false },
                  { n: "2030", s: "the year limits tighten hard", red: true },
                  { n: "~28,000", s: "NYC buildings covered", red: false },
                  { n: "40+", s: "cities passed the same standard", red: false },
                ].map(s => (
                  <motion.div variants={rise} key={s.n} className="px-5 py-8">
                    <p
                      className={`font-heading text-4xl font-bold tracking-tight ${s.red ? "text-destructive" : "text-foreground"}`}
                    >
                      {s.n}
                    </p>
                    <p className="mt-1.5 text-sm leading-snug text-muted-foreground">
                      {s.s}
                    </p>
                  </motion.div>
                ))}
              </motion.div>
            </section>

            {/* ── HOW IT WORKS ── */}
            <section id="how" className="py-24 md:py-28">
              <motion.div variants={stagger} {...inView}>
                <motion.h2
                  variants={rise}
                  className="font-heading text-3xl font-bold tracking-tight sm:text-4xl"
                >
                  From address to funded plan
                </motion.h2>
                <motion.p
                  variants={rise}
                  className="mt-3 max-w-lg text-lg text-muted-foreground"
                >
                  Three steps. No spreadsheet, no consultant.
                </motion.p>
                <div className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
                  {[
                    {
                      n: "01",
                      t: "Type the address",
                      d: "We resolve any NYC building over 25,000 sq ft to its tax lot and pull the city's records.",
                    },
                    {
                      n: "02",
                      t: "Read your number",
                      d: "We compute the fine from LL84 benchmarking data against the verified LL97 limits, across all three compliance periods.",
                    },
                    {
                      n: "03",
                      t: "Fund the fix",
                      d: "Ranked retrofits matched to Con Ed, NYSERDA, and IRS rebates, with payback measured in years.",
                    },
                  ].map(step => (
                    <motion.div
                      variants={rise}
                      key={step.n}
                      className="border-t-2 border-foreground pt-5"
                    >
                      <span className="font-heading text-sm font-semibold text-muted-foreground/70 tabular-nums">
                        {step.n}
                      </span>
                      <h3 className="font-heading mt-2 text-xl font-semibold tracking-tight">
                        {step.t}
                      </h3>
                      <p className="mt-2 leading-relaxed text-muted-foreground">
                        {step.d}
                      </p>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            </section>

            {/* ── COMPUTE vs TRACK ── */}
            <section id="laws" className="border-t border-border py-24 md:py-28">
              <motion.div variants={stagger} {...inView}>
                <motion.p
                  variants={rise}
                  className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground/70"
                >
                  The principle
                </motion.p>
                <motion.h2
                  variants={rise}
                  className="font-heading mt-3 max-w-2xl text-3xl font-bold leading-snug tracking-tight sm:text-4xl"
                >
                  Compute what&apos;s computable. Track what&apos;s trackable.{" "}
                  <span className="text-destructive">Never fake a number.</span>
                </motion.h2>
                <div className="mt-14 grid gap-12 md:grid-cols-2 md:gap-16">
                  <motion.div variants={rise}>
                    <div className="flex items-baseline gap-3">
                      <span className="inline-block h-2 w-2 rounded-full bg-destructive" />
                      <h3 className="font-heading text-lg font-semibold tracking-tight">
                        Compute
                      </h3>
                      <span className="text-xs text-muted-foreground/70">
                        fines that cost thousands to interpret
                      </span>
                    </div>
                    <ul className="mt-6 space-y-3.5 text-[15px] text-muted-foreground">
                      {[
                        "Local Law 97 carbon fines, verified against 1 RCNY §103-14",
                        "A rebate-funded retrofit plan with real payback math",
                        "The affordable-housing (Article 321) pathway",
                        "Expanding to the 40+ cities with the same standard",
                      ].map(li => (
                        <li key={li} className="flex gap-2.5">
                          <span className="text-foreground">—</span> {li}
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                  <motion.div variants={rise}>
                    <div className="flex items-baseline gap-3">
                      <span className="inline-block h-2 w-2 rounded-full bg-[var(--success)]" />
                      <h3 className="font-heading text-lg font-semibold tracking-tight">
                        Track
                      </h3>
                      <span className="text-xs text-muted-foreground/70">
                        deadlines that cost thousands to miss
                      </span>
                    </div>
                    <div className="mt-6 flex flex-wrap gap-2">
                      {[
                        "FISP / LL11 facade",
                        "LL84 benchmarking",
                        "LL33/95 grade",
                        "LL152 gas",
                        "Boiler",
                        "Elevator",
                      ].map(t => (
                        <span
                          key={t}
                          className="rounded-full border border-border bg-card px-3 py-1 text-sm text-foreground/80"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                    <p className="mt-6 text-[15px] leading-relaxed text-muted-foreground">
                      Public DOB deadlines and status on one real-time board, so you never
                      eat a late penalty.
                    </p>
                  </motion.div>
                </div>
              </motion.div>
            </section>

            {/* ── OPS ROOM ── */}
            <section className="border-t border-border py-24 md:py-28">
              <motion.div
                variants={stagger}
                {...inView}
                className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16"
              >
                <motion.div variants={rise}>
                  <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--success)]" />{" "}
                    Real-time
                  </span>
                  <h2 className="font-heading mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
                    A live compliance ops room
                  </h2>
                  <p className="mt-4 max-w-md text-lg leading-relaxed text-muted-foreground">
                    Every obligation becomes a ticket with its statutory deadline on a
                    timer. AI workers claim tickets, draft the remediation, and submit.
                    You approve every one.
                  </p>
                  <Link
                    href={DASH}
                    className="fp-press mt-6 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Open the dashboard&nbsp;→
                  </Link>
                </motion.div>
                <motion.div variants={rise}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                    Open tickets
                  </p>
                  <div className="mt-4 space-y-2.5">
                    {[
                      {
                        t: "LL97 over-cap exposure",
                        s: "claimed · atlas",
                        dot: "bg-destructive",
                        muted: false,
                      },
                      {
                        t: "FISP cycle 9 filing",
                        s: "drafting · nyx",
                        dot: "bg-destructive/60",
                        muted: false,
                      },
                      {
                        t: "LL84 benchmarking",
                        s: "approved",
                        dot: "bg-[var(--success)]",
                        muted: true,
                      },
                    ].map(row => (
                      <div
                        key={row.t}
                        className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 shadow-[0_1px_2px_rgba(20,20,20,0.04),0_4px_14px_-6px_rgba(20,20,20,0.08)]"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`inline-block h-2 w-2 rounded-full ${row.dot}`}
                          />
                          <span className="font-medium">{row.t}</span>
                        </div>
                        <span
                          className={`text-xs ${row.muted ? "font-medium text-[var(--success)]" : "text-muted-foreground/70"}`}
                        >
                          {row.s}
                        </span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              </motion.div>
            </section>
          </main>

          {/* ── CTA + FOOTER ── */}
          <section className="border-t border-border bg-card">
            <motion.div
              variants={stagger}
              {...inView}
              className="mx-auto max-w-6xl px-5 py-20 text-center md:py-24"
            >
              <motion.h2
                variants={rise}
                className="font-heading text-4xl font-bold tracking-tight sm:text-5xl"
              >
                See your building&apos;s number
              </motion.h2>
              <motion.p
                variants={rise}
                className="mx-auto mt-4 max-w-md text-lg text-muted-foreground"
              >
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
                <input
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  type="text"
                  placeholder="Enter a NYC building address"
                  className="flex-1 rounded-full border border-border bg-background px-6 py-4 text-base text-foreground outline-none transition-shadow placeholder:text-muted-foreground/60 focus:border-foreground/30"
                />
                <button
                  type="submit"
                  className="fp-press rounded-full bg-primary px-7 py-4 text-base font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Check fine&nbsp;→
                </button>
              </motion.form>
            </motion.div>
            <footer className="border-t border-border">
              <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 md:flex-row md:items-center md:justify-between">
                <div className="font-heading flex items-center gap-2 text-base font-semibold text-foreground">
                  <FineprintLogo className="h-5 w-5" /> Fineprint
                </div>
                {/* The footer is set, on purpose, in actual fine print. */}
                <p className="max-w-xl text-[11px] leading-relaxed text-muted-foreground/70">
                  Estimates from NYC LL84 benchmarking data and LL97 emission limits (1
                  RCNY §103-14). Not legal advice. Official compliance requires a
                  registered design professional.
                </p>
              </div>
            </footer>
          </section>
        </div>
      </div>
    </MotionConfig>
  );
}
