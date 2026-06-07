// One-page board summary for an address, straight to stdout.
// Usage: npx tsx agents/scripts/advise.ts "350 5th Avenue, Manhattan"

import { adviseBoardSummary } from "../src/ai/advise.ts";

const address = process.argv.slice(2).join(" ").trim();

if (!address) {
  console.error('usage: npx tsx agents/scripts/advise.ts "350 5th Avenue, Manhattan"');
  process.exit(1);
}

console.log(await adviseBoardSummary(address));
