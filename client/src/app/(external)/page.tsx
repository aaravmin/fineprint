"use client";

import { useEffect, useRef, useState } from "react";

import Link from "next/link";
import { FineprintLogo } from "@/components/fineprint-logo";
import { useRouter } from "next/navigation";

const DASH = "/dashboard/portfolio";
const SHADOW_CARD =
  "shadow-[0_1px_2px_rgba(20,20,20,0.04),0_4px_14px_-6px_rgba(20,20,20,0.08)]";
const SHADOW_FLOAT =
  "shadow-[0_2px_4px_rgba(20,20,20,0.05),0_18px_44px_-16px_rgba(20,20,20,0.20)]";

export default function Home() {
  const router = useRouter();
  const [address, setAddress] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  // Scroll-reveal: add .fp-in when a .fp-rise element enters view.
  useEffect(() => {
    const els = rootRef.current?.querySelectorAll(".fp-rise");
    if (!els?.length) return;
    const io = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("fp-in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  // Backend not wired yet — searching just routes to the dashboard.
  const search = (value: string) => {
    const a = value.trim();
    router.push(a ? `${DASH}?address=${encodeURIComponent(a)}` : DASH);
  };

  return (
    <div
      ref={rootRef}
      className="fp-grain relative min-h-screen bg-background text-foreground"
    >
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

        <main className="fp-hero-bg mx-auto max-w-6xl px-5">
          {/* ── HERO ── */}
          <section className="grid items-center gap-12 pt-16 pb-20 md:grid-cols-[1.05fr_0.95fr] md:pt-24 md:pb-28">
            <div>
              <span className="fp-rise fp-in inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
                NYC · Local Law 97
              </span>
              <h1
                className="fp-rise fp-in font-heading mt-5 text-5xl font-bold leading-[0.98] tracking-tight sm:text-6xl"
                style={{ ["--i" as string]: 1 }}
              >
                Know your building&apos;s
                <br />
                carbon fine.
                <br />
                <span className="text-destructive">Fund the fix.</span>
              </h1>
              <p
                className="fp-rise fp-in mt-5 max-w-md text-lg leading-relaxed text-muted-foreground"
                style={{ ["--i" as string]: 2 }}
              >
                Type an address. Get the real Local Law 97 number from public data and the
                verified rule — then an AI-ranked, rebate-funded plan to get under the
                cap.
              </p>

              <form
                className="fp-rise fp-in mt-8"
                style={{ ["--i" as string]: 3 }}
                onSubmit={e => {
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
                      className={`w-full rounded-2xl border border-border bg-card px-5 py-4 text-base text-foreground outline-none transition-shadow placeholder:text-muted-foreground/60 focus:border-foreground/30 ${SHADOW_CARD}`}
                    />
                  </label>
                  <button
                    type="submit"
                    className="fp-press rounded-2xl bg-primary px-6 py-4 text-base font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Check fine&nbsp;→
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
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
              </form>
            </div>

            {/* verdict-preview card */}
            <Link
              href={DASH}
              className={`fp-rise fp-in relative block rounded-3xl border border-border bg-card p-6 tabular-nums sm:p-7 ${SHADOW_FLOAT}`}
              style={{ ["--i" as string]: 2 }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-heading text-lg font-semibold tracking-tight">
                    1870 Pelham Parkway South
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground/80">
                    52,941 sq ft · Multifamily Housing · BBL 2042500026
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-destructive-subtle px-2.5 py-1 text-xs font-semibold text-destructive">
                  Over cap
                </span>
              </div>
              <div className="mt-6">
                <div className="flex items-end gap-1">
                  <span className="font-heading text-5xl font-bold tracking-tight text-destructive">
                    $4,147
                  </span>
                  <span className="mb-1.5 text-lg text-muted-foreground">/yr</span>
                </div>
                <p className="mt-1 text-sm font-medium text-destructive">
                  Over your cap · 2024–2029
                </p>
              </div>
              <div className="mt-7">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                  Projection · annual fine as the cap tightens
                </p>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  {[
                    { label: "2024–29", h: "14%", cls: "bg-destructive/30", b: 0 },
                    { label: "2030–34", h: "92%", cls: "bg-destructive", b: 1 },
                    { label: "2035–39", h: "100%", cls: "bg-destructive", b: 2 },
                  ].map(bar => (
                    <div key={bar.label} className="flex flex-col items-center gap-2">
                      <div className="flex h-28 w-full items-end">
                        <div
                          className={`fp-bar w-full rounded-t-md ${bar.cls}`}
                          style={{ height: bar.h, ["--b" as string]: bar.b }}
                        />
                      </div>
                      <span className="text-[11px] text-muted-foreground/70">
                        {bar.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="mt-5 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground/70">
                Estimate from public LL84 disclosure; limits per 1 RCNY §103-14. The
                official figure requires a registered design professional.
              </p>
            </Link>
          </section>

          {/* ── STAKES ── */}
          <section className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-border bg-border/60 text-center tabular-nums md:grid-cols-4">
            {[
              { n: "$268", s: "per tCO₂e over the cap", red: false },
              { n: "2030", s: "the cliff — limits tighten", red: true },
              { n: "~28,000", s: "covered NYC buildings", red: false },
              { n: "40+", s: "cities with the same law", red: false },
            ].map((s, i) => (
              <div
                key={s.n}
                className="fp-rise bg-card px-4 py-7"
                style={{ ["--i" as string]: i }}
              >
                <p
                  className={`font-heading text-3xl font-bold tracking-tight ${s.red ? "text-destructive" : "text-foreground"}`}
                >
                  {s.n}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{s.s}</p>
              </div>
            ))}
          </section>

          {/* ── HOW IT WORKS ── */}
          <section id="how" className="py-24 md:py-28">
            <h2 className="fp-rise font-heading text-3xl font-bold tracking-tight sm:text-4xl">
              From address to funded plan
            </h2>
            <p
              className="fp-rise mt-3 max-w-lg text-lg text-muted-foreground"
              style={{ ["--i" as string]: 1 }}
            >
              Three steps. No spreadsheet, no consultant required to see where you stand.
            </p>
            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {[
                {
                  n: 1,
                  t: "Enter your address",
                  d: "Any NYC building over 25,000 sq ft. We resolve it to its tax lot and pull the city's own records.",
                },
                {
                  n: 2,
                  t: "See your real fine",
                  d: "Computed from LL84 benchmarking data against the verified LL97 limits — every number, all three periods.",
                },
                {
                  n: 3,
                  t: "Get a funded plan",
                  d: "Ranked retrofits matched to real Con Ed / NYSERDA / IRS rebates, with payback in years.",
                },
              ].map(step => (
                <div
                  key={step.n}
                  className={`fp-rise rounded-3xl border border-border bg-card p-7 ${SHADOW_CARD}`}
                  style={{ ["--i" as string]: step.n - 1 }}
                >
                  <span className="font-heading flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground tabular-nums">
                    {step.n}
                  </span>
                  <h3 className="font-heading mt-5 text-xl font-semibold tracking-tight">
                    {step.t}
                  </h3>
                  <p className="mt-2 leading-relaxed text-muted-foreground">{step.d}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── COMPUTE vs TRACK ── */}
          <section id="laws" className="py-8 md:py-12">
            <div
              className={`fp-rise rounded-[2rem] border border-border bg-card p-7 sm:p-10 ${SHADOW_CARD}`}
            >
              <p className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground/70">
                The principle
              </p>
              <h2 className="font-heading mt-2 max-w-2xl text-2xl font-bold leading-snug tracking-tight sm:text-3xl">
                Compute what&apos;s computable. Track what&apos;s trackable.{" "}
                <span className="text-destructive">Never fake a number.</span>
              </h2>
              <div className="mt-9 grid gap-px overflow-hidden rounded-3xl border border-border bg-border/60 md:grid-cols-2">
                <div className="bg-card p-7">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-full bg-destructive" />
                    <h3 className="font-heading text-lg font-semibold tracking-tight">
                      Compute
                    </h3>
                    <span className="text-xs text-muted-foreground/70">
                      fines that cost thousands to interpret
                    </span>
                  </div>
                  <ul className="mt-5 space-y-3 text-[15px] text-muted-foreground">
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
                </div>
                <div className="bg-card p-7">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-full bg-[var(--success)]" />
                    <h3 className="font-heading text-lg font-semibold tracking-tight">
                      Track
                    </h3>
                    <span className="text-xs text-muted-foreground/70">
                      deadlines that cost thousands to miss
                    </span>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
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
                        className="rounded-full border border-border bg-background px-3 py-1 text-sm text-foreground/80"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  <p className="mt-5 text-[15px] leading-relaxed text-muted-foreground">
                    Public DOB deadlines and status, on one real-time board — so you never
                    eat a late penalty.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* ── OPS ROOM ── */}
          <section className="py-24 md:py-28">
            <div
              className={`fp-rise overflow-hidden rounded-[2rem] border border-border bg-card ${SHADOW_CARD}`}
            >
              <div className="grid gap-px bg-border/60 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="bg-card p-8 sm:p-10">
                  <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
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
                </div>
                <div className="bg-background/50 p-8 sm:p-10">
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
                        className={`flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 ${SHADOW_CARD}`}
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
                </div>
              </div>
            </div>
          </section>
        </main>

        {/* ── CTA + FOOTER ── */}
        <section className="border-t border-border bg-card">
          <div className="mx-auto max-w-6xl px-5 py-20 text-center md:py-24">
            <h2 className="fp-rise font-heading text-4xl font-bold tracking-tight sm:text-5xl">
              See your building&apos;s number
            </h2>
            <p
              className="fp-rise mx-auto mt-4 max-w-md text-lg text-muted-foreground"
              style={{ ["--i" as string]: 1 }}
            >
              It takes one address and about ten seconds.
            </p>
            <form
              className="fp-rise mx-auto mt-8 flex max-w-md flex-col gap-2.5 sm:flex-row"
              style={{ ["--i" as string]: 2 }}
              onSubmit={e => {
                e.preventDefault();
                search(address);
              }}
            >
              <input
                value={address}
                onChange={e => setAddress(e.target.value)}
                type="text"
                placeholder="Enter a NYC building address"
                className="flex-1 rounded-2xl border border-border bg-background px-5 py-4 text-base text-foreground outline-none transition-shadow placeholder:text-muted-foreground/60 focus:border-foreground/30"
              />
              <button
                type="submit"
                className="fp-press rounded-2xl bg-primary px-6 py-4 text-base font-medium text-primary-foreground hover:bg-primary/90"
              >
                Check fine&nbsp;→
              </button>
            </form>
          </div>
          <footer className="border-t border-border">
            <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-sm text-muted-foreground/70 md:flex-row md:items-center md:justify-between">
              <div className="font-heading flex items-center gap-2 text-base font-semibold text-foreground">
                <FineprintLogo className="h-5 w-5" /> Fineprint
              </div>
              <p className="max-w-xl leading-relaxed">
                Estimates from NYC LL84 benchmarking data and LL97 emission limits (1 RCNY
                §103-14). Not legal advice — official compliance requires a registered
                design professional.
              </p>
            </div>
          </footer>
        </section>
      </div>
    </div>
  );
}
