// Ingests a real NYC building: resolves the address through the data package
// (GeoSearch -> LL84 -> covered buildings list) and writes the facts through
// the ingest_building reducer, which spawns the building's obligations.
//
// Usage: npx tsx scripts/ingest.ts "350 5th Avenue, Manhattan"
//        (server must be running and module published)
import { DbConnection } from "../agents/src/module_bindings/index.ts";
import { getCblEntry } from "../data/src/coveredBuildings.ts";
import { toEngineInput } from "../data/src/engineBridge.ts";
import { lookupBuilding } from "../data/src/lookup.ts";
import { computeFine } from "../engine/src/index.ts";

const HOST = process.env.SPACETIME_URI ?? "ws://localhost:3011";
const DB_NAME = process.env.DB_NAME ?? "fineprint";

const address = process.argv[2];
if (!address) {
  console.error('Usage: npx tsx scripts/ingest.ts "<address, borough>"');
  process.exit(1);
}

console.log(`Looking up "${address}" across NYC datasets…`);
const facts = await lookupBuilding(address);

const cbl = getCblEntry(facts.bbl);
const coveredLawIds = cbl
  ? [
      cbl.ll97 && !cbl.article321 ? "ll97" : null,
      cbl.article321 ? "art321" : null,
      cbl.ll84 ? "ll84" : null,
      cbl.ll87 ? "ll87" : null,
      cbl.ll88 ? "ll88" : null,
    ].filter((id): id is string => id !== null)
  : [];

// The current-period LL97 fine, in whole dollars, computed by the engine.
// The module cannot import the engine, so the number rides in with the facts.
const { input: engineInput } = toEngineInput(facts);
const ll97AnnualFineUsd = engineInput
  ? Math.round(computeFine(engineInput, "2024-2029").annualFineUsd)
  : undefined;

console.log(`  BBL ${facts.bbl} — ${facts.address}`);
console.log(
  `  ${facts.grossFloorAreaSqft?.toLocaleString() ?? "unknown"} sqft, ${facts.annualEmissionsTco2e ?? "unknown"} tCO2e`,
);
console.log(
  `  covered: ${coveredLawIds.join(", ") || "(falling back to sqft heuristic)"}`,
);
console.log(
  `  LL97 fine (2024-2029, engine): ${ll97AnnualFineUsd === undefined ? "no data" : `$${ll97AnnualFineUsd.toLocaleString()}`}`,
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
        await connection.reducers.ingestBuilding({
          address: facts.address,
          bbl: facts.bbl,
          sqft: facts.grossFloorAreaSqft ?? 0,
          isArticle321: facts.isArticle321 ?? false,
          // The codegen renders the column's trailing "e" uppercase.
          annualEmissionsTco2E: facts.annualEmissionsTco2e ?? undefined,
          usesJson: JSON.stringify(facts.occupancyGroups),
          coveredLawIdsJson: JSON.stringify(coveredLawIds),
          provenanceJson: JSON.stringify(facts.provenance),
          ll97AnnualFineUsd,
        });

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
