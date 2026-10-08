import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { isSessionActingSystemAdmin } from "@calcom/features/auth/lib/isSessionActingSystemAdmin";
import handleCancelBooking from "@calcom/features/bookings/lib/handleCancelBooking";
import { UserRepository } from "@calcom/features/users/repositories/UserRepository";
import { checkRateLimitAndThrowError } from "@calcom/lib/checkRateLimitAndThrowError";
import getIP from "@calcom/lib/getIP";
import { piiHasher } from "@calcom/lib/server/PiiHasher";
import prisma from "@calcom/prisma";
import { bookingCancelWithCsrfSchema } from "@calcom/prisma/zod-utils";
import { validateCsrfToken } from "@calcom/web/lib/validateCsrfToken";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { defaultResponderForAppDir } from "app/api/defaultResponderForAppDir";
import { cookies, headers } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

async function handler(req: NextRequest) {
  let appDirRequestBody;
  try {
    appDirRequestBody = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON" }, { status: 400 });
  }
  const bookingData = bookingCancelWithCsrfSchema.parse(appDirRequestBody);

  // Integer IDs are sequential/guessable — only accept high-entropy UIDs on this route
  if (!bookingData.uid) {
    return NextResponse.json(
      { success: false, message: "uid is required for booking cancellation" },
      { status: 400 }
    );
  }

  const csrfError = await validateCsrfToken(bookingData.csrfToken);
  if (csrfError) {
    return csrfError;
  }

  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });

  // Rate limit: 10 booking cancellations per 60 seconds per user (or IP if not authenticated)
  const identifier = session?.user?.id
    ? `api:cancel-user:${session.user.id}`
    : `api:cancel-ip:${piiHasher.hash(getIP(req))}`;
  await checkRateLimitAndThrowError({
    rateLimitingType: "core",
    identifier,
  });

  // Strip integer id to ensure lookup is always by uid
  const { id: _id, ...safeBookingData } = bookingData;

  const result = await handleCancelBooking({
    bookingData: safeBookingData,
    userId: session?.user?.id || -1,
    // session.user.role is already capped by the database role (getServerSession); the account is
    // loaded to apply the rest of the admin policy (lock, 2FA).
    isSystemAdmin: await isSessionActingSystemAdmin(session, new UserRepository(prisma)),
    auditPath: "/api/cancel",
  });

  // const bookingCancelService = getBookingCancelService();
  // const result = await bookingCancelService.cancelBooking({
  //   bookingData: bookingData,
  //   bookingMeta: {
  //     userId: session?.user?.id || -1,
  //   },
  // });

  const statusCode = result.success ? 200 : 400;

  return NextResponse.json(result, { status: statusCode });
}

export const DELETE = defaultResponderForAppDir(handler);
export const POST = defaultResponderForAppDir(handler);
