import { fileURLToPath } from "url";
import { resolve, dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
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
