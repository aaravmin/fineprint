// Seeds 5 NYC buildings through the add_building reducer.
// Usage: npm run seed   (server must be running and module published)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DbConnection } from "../agents/src/module_bindings/index.ts";

const HOST = process.env.SPACETIME_URI ?? "ws://localhost:3011";
const DB_NAME = process.env.DB_NAME ?? "fineprint";

const here = dirname(fileURLToPath(import.meta.url));
const buildings: { address: string; sqft: number; isAffordable: boolean }[] = JSON.parse(
  readFileSync(join(here, "../data/seed-buildings.json"), "utf8"),
);

const timeout = setTimeout(() => {
  console.error(`Could not reach ${HOST} within 10s. Is \`spacetime start\` running?`);
  process.exit(1);
}, 10_000);

const conn = DbConnection.builder()
  .withUri(HOST)
  .withDatabaseName(DB_NAME)
  .onConnect((connection, identity) => {
    clearTimeout(timeout);
    console.log(`Connected as ${identity.toHexString().slice(0, 8)}…`);

    connection
      .subscriptionBuilder()
      .onApplied(async ctx => {
        const existingBuildings = [...ctx.db.building.iter()];
        if (existingBuildings.length > 0) {
          console.log(
            `Database already has ${existingBuildings.length} buildings — nothing to do.`,
          );
          process.exit(0);
        }

        for (const building of buildings) {
          await connection.reducers.addBuilding(building);
          console.log(`  + ${building.address} (${building.sqft.toLocaleString()} sqft)`);
        }

        const tasks = [...ctx.db.task.iter()];
        console.log(
          `Seeded ${buildings.length} buildings → ${tasks.length} obligations spawned.`,
        );
        process.exit(0);
      })
      .subscribeToAllTables();
  })
  .onConnectError((_ctx, error) => {
    console.error("Connection failed:", error.message);
    process.exit(1);
  })
  .build();

void conn;
