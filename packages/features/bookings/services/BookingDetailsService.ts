import { ErrorWithCode } from "@calcom/lib/errors";
import type { PrismaClient } from "@calcom/prisma";
import type { RescheduleHistoryEntry } from "../lib/rescheduleHistory";
import { buildRescheduleHistory, collectRescheduleChain } from "../lib/rescheduleHistory";
import { BookingRepository } from "../repositories/BookingRepository";
import { BookingAccessService } from "./BookingAccessService";

export class BookingDetailsService {
  private bookingRepo: BookingRepository;
  private bookingAccessService: BookingAccessService;

  constructor(prismaClient: PrismaClient) {
    this.bookingRepo = new BookingRepository(prismaClient);
    this.bookingAccessService = new BookingAccessService(prismaClient);
  }

  async getBookingDetails({
    userId,
    bookingUid,
    isSystemAdmin = false,
  }: {
    userId: number;
    bookingUid: string;
    isSystemAdmin?: boolean;
  }) {
    const hasUserAccess = await this.bookingAccessService.doesUserIdHaveAccessToBooking({
      userId,
      bookingUid,
    });
    const hasAdminAccess =
      !hasUserAccess &&
      (await this.bookingAccessService.doesSystemAdminHaveAccessToBooking({
        userId,
        isSystemAdmin,
        bookingUid,
        path: "viewer.bookings.getBookingDetails",
        action: "getBookingDetails",
      }));

    if (!hasUserAccess && !hasAdminAccess) {
      throw ErrorWithCode.Factory.Forbidden("You do not have permission to view this booking");
    }

    const booking = await this.bookingRepo.findByUidForDetails({ bookingUid });

    if (!booking) {
      throw ErrorWithCode.Factory.BookingNotFound("Booking not found");
    }

    // Reaching one booking must not reveal the others of its chain: each one is checked like the requested
    // one, except for a system admin, whose access does not depend on the booking.
    const canViewBooking = async (uid: string) =>
      hasAdminAccess ||
      (await this.bookingAccessService.doesUserIdHaveAccessToBooking({ userId, bookingUid: uid }));

    const rescheduleHistory = await this.getRescheduleHistory(booking, canViewBooking);

    return {
      ...rescheduleHistory,
      tracking: booking.tracking,
    };
  }

  private async getRescheduleHistory(
    booking: {
      uid: string;
      rescheduled: boolean | null;
      fromReschedule: string | null;
    },
    canViewBooking: (uid: string) => Promise<boolean>
  ): Promise<{
    rescheduledToBooking: { uid: string } | null;
    previousBooking: { uid: string; startTime: Date; endTime: Date } | null;
    rescheduleHistory: RescheduleHistoryEntry[];
  }> {
    if (!booking.rescheduled && !booking.fromReschedule) {
      return { rescheduledToBooking: null, previousBooking: null, rescheduleHistory: [] };
    }

    const start = await this.bookingRepo.findRescheduleNodeByUid({ uid: booking.uid });
    if (!start) {
      return { rescheduledToBooking: null, previousBooking: null, rescheduleHistory: [] };
    }

    const chain = await collectRescheduleChain({
      start,
      findByUid: (uid) => this.bookingRepo.findRescheduleNodeByUid({ uid }),
      findByFromReschedule: (fromReschedule) =>
        this.bookingRepo.findRescheduleNodeByFromReschedule({ fromReschedule }),
      canInclude: (node) => canViewBooking(node.uid),
    });

    const position = chain.findIndex((node) => node.uid === booking.uid);
    const previous = position > 0 ? chain[position - 1] : null;
    const next = chain[position + 1] ?? null;

    return {
      rescheduledToBooking: booking.rescheduled && next ? { uid: next.uid } : null,
      previousBooking: previous
        ? { uid: previous.uid, startTime: previous.startTime, endTime: previous.endTime }
        : null,
      rescheduleHistory: buildRescheduleHistory(chain),
    };
  }
}
