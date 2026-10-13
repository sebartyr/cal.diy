import { isAuthorizedCronRequest } from "@calcom/lib/cron-auth";
import { PostgresRateLimitStore } from "@calcom/lib/rateLimitStore";
import { defaultResponderForAppDir } from "@calcom/web/app/api/defaultResponderForAppDir";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Cron webhook
 * Drop spent rate-limit buckets.
 *
 * This only bounds table size: a bucket that is read after expiry refills to
 * full, so deleting it is equivalent to leaving it in place.
 */
async function getHandler(request: NextRequest) {
  const apiKey = request.headers.get("authorization") || request.nextUrl.searchParams.get("apiKey");

  if (!isAuthorizedCronRequest(apiKey)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const deleted = await PostgresRateLimitStore.deleteExpired();
    return NextResponse.json({ ok: true, deleted });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error(`[rate-limit-cleanup] ${message}:`, e);
    return NextResponse.json({ message }, { status: 500 });
  }
}

export const GET = defaultResponderForAppDir(getHandler);
