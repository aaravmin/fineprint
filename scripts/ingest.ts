// Ingests a real NYC building: resolves the address through the data package
// (GeoSearch -> LL84 -> covered buildings list) and writes the facts through
// the ingest_building reducer, which spawns the building's obligations.
//
// Usage: npx tsx scripts/ingest.ts "350 5th Avenue, Manhattan"
//        (server must be running and module published)
import { DbConnection } from "../agents/src/module_bindings/index.ts";
import { prepareIntake } from "../data/src/intake.ts";

const HOST = process.env.SPACETIME_URI ?? "ws://localhost:3011";
const DB_NAME = process.env.DB_NAME ?? "fineprint";

const address = process.argv[2];
if (!address) {
  console.error('Usage: npx tsx scripts/ingest.ts "<address, borough>"');
  process.exit(1);
}

console.log(`Looking up "${address}" across NYC datasets…`);

// Same shared intake the agent workers use, so the script can never drift from
// the live coverage mapping or the compliance plan again.
const { facts, ingestArgs } = await prepareIntake(address);
const coveredLawIds: string[] = JSON.parse(ingestArgs.coveredLawIdsJson);

console.log(`  BBL ${facts.bbl} — ${facts.address}`);
console.log(
  `  ${facts.grossFloorAreaSqft?.toLocaleString() ?? "unknown"} sqft, ${facts.annualEmissionsTco2e ?? "unknown"} tCO2e`,
);
console.log(`  covered: ${coveredLawIds.join(", ") || "(none on the DOB list)"}`);
console.log(
  `  LL97 fine (2024-2029, engine): ${ingestArgs.ll97AnnualFineUsd === undefined ? "no data" : `$${ingestArgs.ll97AnnualFineUsd.toLocaleString()}`}`,
);

const timeout = setTimeout(() => {
  console.error(`Could not reach ${HOST} within 10s. Is \`spacetime start\` running?`);
  process.exit(1);
}, 10_000);

DbConnection.builder()
  .withUri(HOST)
  .withDatabaseName(DB_NAME)
  .onConnect((connection, identity) => {
    clearTimeout(timeout);
    console.log(`Connected as ${identity.toHexString().slice(0, 8)}…`);

    connection
      .subscriptionBuilder()
      .onApplied(async ctx => {
        await connection.reducers.ingestBuilding(ingestArgs);

        const buildingRow = [...ctx.db.building.iter()].find(
          row => row.bbl === facts.bbl,
        );
        const obligations = buildingRow
          ? [...ctx.db.task.iter()].filter(task => task.buildingId === buildingRow.id)
          : [];

        console.log(
          `Ingested → building #${buildingRow?.id} with ${obligations.length} obligations:`,
        );
        for (const task of obligations) {
          console.log(`  - ${task.title} [${task.status}]`);
        }
        process.exit(0);
      })
      .subscribeToAllTables();
  })
  .onConnectError((_ctx, error) => {
    clearTimeout(timeout);
    console.error(`Connection failed: ${error}`);
    process.exit(1);
  })
  .build();
