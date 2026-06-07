// Forward reference that breaks the schema <-> reducers import cycle.
//
// The scheduled reaper_tick table must point at the reap reducer, but reap
// can only be defined after the schema exists. Instead of schema.ts importing
// reducers.ts (a circular import the bundler warns about), both sides meet
// here: schema.ts reads reaperRef.reap through a lazy arrow, and reducers.ts
// assigns it at definition time. The SDK resolves scheduled reducers after the
// whole module graph has evaluated, so the reference is always set in time.
export const reaperRef: { reap?: unknown } = {};
