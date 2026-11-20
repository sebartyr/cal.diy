import { ApiAuthGuardUser } from "@/modules/auth/strategies/api-auth/api-auth.strategy";
import { PrismaReadService } from "@/modules/prisma/prisma-read.service";
import { BookingReadAccessRepository } from "@/platform/bookings/shared/booking-read-access.repository";
import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Request } from "express";

import { BookingAccessService } from "@calcom/platform-libraries";

/**
 * Reading a booking used to need only its uid. Callers must now be related to it: organizer, host,
 * admin of its team or organization (BookingAccessService, as in the web app), or one of its
 * attendees. No system-admin bypass: `isSystemAdmin` here is the bare role, without the admin 2FA
 * policy. Unknown uids are let through so the route keeps its 404.
 */
@Injectable()
export class BookingReadAccessGuard implements CanActivate {
  private readonly bookingAccessService: BookingAccessService;

  constructor(
    private readonly bookingReadAccessRepository: BookingReadAccessRepository,
    prismaReadService: PrismaReadService
  ) {
    this.bookingAccessService = new BookingAccessService(prismaReadService.prisma);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request<{ bookingUid?: string; seatUid?: string }> & { user?: ApiAuthGuardUser }>();
    const user = request.user;
    if (!user) throw new UnauthorizedException();

    const bookingUid = await this.resolveBookingUid(request.params);
    if (!bookingUid) return true;

    if (await this.bookingAccessService.doesUserIdHaveAccessToBooking({ userId: user.id, bookingUid })) {
      return true;
    }
    if (user.email && (await this.bookingReadAccessRepository.isAttendee(bookingUid, user.email))) {
      return true;
    }

    throw new ForbiddenException(
      `BookingReadAccessGuard - user with id=${user.id} does not have access to this booking`
    );
  }

  private async resolveBookingUid(params: { bookingUid?: string; seatUid?: string }): Promise<string | null> {
    if (params.seatUid) {
      return this.bookingReadAccessRepository.findUidBySeatReferenceUid(params.seatUid);
    }
    if (!params.bookingUid) return null;
    // A recurring booking can be read by its recurringEventId: check access on one of its recurrences.
    return (
      (await this.bookingReadAccessRepository.findUidByUid(params.bookingUid)) ??
      (await this.bookingReadAccessRepository.findFirstUidByRecurringEventId(params.bookingUid))
    );
  }
}
