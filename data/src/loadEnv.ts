// Zero-dependency .env loader. The repo has no dotenv and the data scripts run
// under tsx, where .env.local is not loaded automatically. This reads the root
// .env.local (then .env) and fills process.env for any key not already set, so
// an exported variable or a CI secret still wins over the file. Values may be
// quoted; comments and blank lines are ignored. A missing file is not an error.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function loadEnvLocal(): void {
  for (const file of [".env.local", ".env"]) {
    const path = join(repoRoot, file);
    if (!existsSync(path)) {
      continue;
    }

    for (const line of readFileSync(path, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("#")) {
        continue;
      }

      const eq = trimmed.indexOf("=");
      if (eq === -1) {
        continue;
      }

      const key = trimmed.slice(0, eq).trim();
      if (key in process.env) {
        continue;
      }

      let value = trimmed.slice(eq + 1).trim();
      const quoted =
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"));
      if (quoted) {
        value = value.slice(1, -1);
      }

      process.env[key] = value;
    }
  }
}
