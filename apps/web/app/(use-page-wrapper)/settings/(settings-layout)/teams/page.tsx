import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { getServerSession } from "@calcom/features/auth/lib/getServerSession";

import { buildLegacyRequest } from "@lib/buildLegacyCtx";

import TeamsSettingsView from "./view";

export default async function TeamsSettingsPage() {
  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });
  if (!session?.user?.id) redirect("/auth/login");
  return <TeamsSettingsView />;
}
