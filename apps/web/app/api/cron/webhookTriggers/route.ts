import { handleWebhookScheduledTriggers } from "@calcom/features/webhooks/lib/handleWebhookScheduledTriggers";
import { isAuthorizedCronApiKey } from "@calcom/lib/cron-auth";
import prisma from "@calcom/prisma";
import { defaultResponderForAppDir } from "app/api/defaultResponderForAppDir";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

async function postHandler(req: NextRequest) {
  const apiKey = req.headers.get("authorization") || req.nextUrl.searchParams.get("apiKey");

  if (!isAuthorizedCronApiKey(apiKey)) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  await handleWebhookScheduledTriggers(prisma);

  return NextResponse.json({ ok: true });
}

export const POST = defaultResponderForAppDir(postHandler);
