import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "Fineprint",
  version: packageJson.version,
  copyright: `© ${currentYear}, Fineprint.`,
  meta: {
    title: "Fineprint — NYC Local Law Compliance Intelligence",
    description:
      "Fineprint computes LL97 carbon fines for every compliance period, shows the 2030 cliff, and generates cost-optimal retrofit plans for NYC buildings.",
  },
};
