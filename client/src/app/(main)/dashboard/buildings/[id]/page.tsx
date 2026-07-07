import { BuildingClient } from "./_components/building-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function BuildingPage({ params }: Props) {
  const { id } = await params;
  return <BuildingClient buildingId={Number(id)} />;
}
