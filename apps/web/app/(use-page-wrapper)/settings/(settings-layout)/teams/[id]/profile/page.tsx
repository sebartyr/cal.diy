import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { getServerSession } from "@calcom/features/auth/lib/getServerSession";

import { buildLegacyRequest } from "@lib/buildLegacyCtx";

import TeamProfileView from "./view";

export default async function TeamProfilePage() {
  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });
  if (!session?.user?.id) redirect("/auth/login");
  return <TeamProfileView />;
}
