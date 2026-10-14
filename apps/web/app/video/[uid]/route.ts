import { BookingRepository } from "@calcom/features/bookings/repositories/BookingRepository";
import { WEBAPP_URL } from "@calcom/lib/constants";
import prisma from "@calcom/prisma";
import { getLegacyVideoRedirectUrl } from "@lib/video/getLegacyVideoRedirectUrl";
import { type NextRequest, NextResponse } from "next/server";

// Cal Video meeting rooms were removed; links already sent in invitations still land here.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  const booking = await new BookingRepository(prisma).findByUidIncludeVideoReferences({ bookingUid: uid });
  if (!booking) {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.redirect(new URL(getLegacyVideoRedirectUrl(booking), WEBAPP_URL), 307);
}
