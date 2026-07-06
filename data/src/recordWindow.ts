// The date floor for high-volume record pulls. HPD violations and complaints
// run to thousands of rows over a building's life, so the fetchers ask Socrata
// for only the last ten years - recent heat and hot-water history is the
// signal, and the older tail just bloats the response.

export function isoYearsAgo(years: number, now: Date = new Date()): string {
  const floor = new Date(now);
  floor.setUTCFullYear(floor.getUTCFullYear() - years);
  return floor.toISOString().slice(0, 10);
}
