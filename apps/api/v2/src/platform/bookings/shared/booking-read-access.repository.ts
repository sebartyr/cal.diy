import { PrismaReadService } from "@/modules/prisma/prisma-read.service";
import { Injectable } from "@nestjs/common";

@Injectable()
export class BookingReadAccessRepository {
  constructor(private readonly prismaReadService: PrismaReadService) {}

  async findUidByUid(uid: string): Promise<string | null> {
    const booking = await this.prismaReadService.prisma.booking.findUnique({
      where: { uid },
      select: { uid: true },
    });
    return booking?.uid ?? null;
  }

  async findFirstUidByRecurringEventId(recurringEventId: string): Promise<string | null> {
    const booking = await this.prismaReadService.prisma.booking.findFirst({
      where: { recurringEventId },
      select: { uid: true },
      orderBy: { startTime: "asc" },
    });
    return booking?.uid ?? null;
  }

  async findUidBySeatReferenceUid(referenceUid: string): Promise<string | null> {
    const seat = await this.prismaReadService.prisma.bookingSeat.findUnique({
      where: { referenceUid },
      select: { booking: { select: { uid: true } } },
    });
    return seat?.booking?.uid ?? null;
  }

  async isAttendee(bookingUid: string, email: string): Promise<boolean> {
    const attendee = await this.prismaReadService.prisma.attendee.findFirst({
      where: { booking: { uid: bookingUid }, email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });
    return attendee !== null;
  }
}
