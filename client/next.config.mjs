import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  compiler: {
    // Strip console noise from production, but keep errors — a dead database
    // connection must stay diagnosable in the field.
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error"] } : false,
  },
  // tsconfig.json paths handles the fineprint-engine alias for Turbopack automatically.
  // Root silences the multi-lockfile workspace warning.
  turbopack: {
    root: resolve(__dirname, ".."),
  },
  async redirects() {
    return [
      {
        source: "/dashboard",
        destination: "/dashboard/portfolio",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
