import process from "node:process";
import { WEBAPP_URL } from "@calcom/lib/constants";
import { symmetricDecryptStrictV2 } from "@calcom/lib/crypto-clever";
import { distributedTracing } from "@calcom/lib/tracing/factory";
import prisma from "@calcom/prisma";
import { confirmHandler } from "@calcom/trpc/server/routers/viewer/bookings/confirm.handler";
import { TRPCError } from "@trpc/server";
import { defaultResponderForAppDir } from "app/api/defaultResponderForAppDir";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

enum DirectAction {
  ACCEPT = "accept",
  REJECT = "reject",
}

const querySchema = z.object({
  action: z.nativeEnum(DirectAction),
  token: z.string(),
  reason: z.string().optional(),
});

const decryptedSchema = z.object({
  bookingUid: z.string(),
  userId: z.number().int(),
  platformClientId: z.string().optional(),
  platformRescheduleUrl: z.string().optional(),
  platformCancelUrl: z.string().optional(),
  platformBookingUrl: z.string().optional(),
});

const INVALID_LINK_MESSAGE = "Invalid or expired link";

// This endpoint is unauthenticated: every way a token can fail (bad query,
// bad encoding, failed decryption, bad JSON, bad shape) must produce the same
// response so the route cannot be used as a decryption oracle.
function parseLinkRequest(searchParams: URLSearchParams) {
  try {
    const { action, token, reason } = querySchema.parse(Object.fromEntries(searchParams.entries()));
    const decrypted = symmetricDecryptStrictV2(
      decodeURIComponent(token),
      process.env.CALENDSO_ENCRYPTION_KEY || ""
    );
    return { action, reason, ...decryptedSchema.parse(JSON.parse(decrypted)) };
  } catch {
    return null;
  }
}

async function handler(request: NextRequest) {
  const parsed = parseLinkRequest(request.nextUrl.searchParams);
  if (!parsed) {
    return NextResponse.json({ message: INVALID_LINK_MESSAGE }, { status: 400 });
  }

  const {
    action,
    reason,
    bookingUid,
    userId,
    platformClientId,
    platformRescheduleUrl,
    platformCancelUrl,
    platformBookingUrl,
  } = parsed;

  const booking = await prisma.booking.findUniqueOrThrow({
    where: { uid: bookingUid },
  });

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      uuid: true,
      email: true,
      username: true,
      role: true,
      destinationCalendar: true,
    },
  });

  try {
    await confirmHandler({
      ctx: {
        user: {
          id: user.id,
          uuid: user.uuid,
          email: user.email,
          username: user.username ?? "",
          role: user.role,
          destinationCalendar: user.destinationCalendar ?? null,
        },
        traceContext: distributedTracing.createTrace("confirm_booking_magic_link"),
      },
      input: {
        bookingId: booking.id,
        recurringEventId: booking.recurringEventId || undefined,
        confirmed: action === DirectAction.ACCEPT,
        reason,
        emailsEnabled: true,
        platformClientParams: platformClientId
          ? {
              platformClientId,
              platformRescheduleUrl,
              platformCancelUrl,
              platformBookingUrl,
            }
          : undefined,
      },
    });
  } catch (e) {
    let message = "Error confirming booking";
    if (e instanceof TRPCError) message = (e as TRPCError).message;
    return NextResponse.redirect(
      new URL(`/booking/${bookingUid}?error=${encodeURIComponent(message)}`, WEBAPP_URL)
    );
  }

  return NextResponse.redirect(new URL(`/booking/${bookingUid}`, WEBAPP_URL));
}

export const GET = defaultResponderForAppDir(handler);
