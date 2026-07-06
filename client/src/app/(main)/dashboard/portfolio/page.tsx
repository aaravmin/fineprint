import { currentUser } from "@clerk/nextjs/server";

import { PortfolioClient } from "./_components/portfolio-client";

export default async function PortfolioPage() {
  const user = await currentUser();
  return <PortfolioClient firstName={user?.firstName ?? null} />;
}
