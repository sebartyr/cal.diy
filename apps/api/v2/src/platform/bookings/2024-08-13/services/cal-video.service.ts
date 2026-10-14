import type { CalMeetingSession, RecordingItem } from "@calcom/platform-types";
import { Injectable, NotFoundException } from "@nestjs/common";
import { BookingsRepository_2024_08_13 } from "@/platform/bookings/2024-08-13/repositories/bookings.repository";

/**
 * Cal Video (Daily) was removed from this deployment, and with it the recordings, transcripts and
 * meeting sessions it produced. The endpoints backed by this service are kept, deprecated, so that
 * existing API clients keep working: they still 404 on an unknown booking, and otherwise answer
 * with an empty list.
 */
@Injectable()
export class CalVideoService {
  constructor(private readonly bookingsRepository: BookingsRepository_2024_08_13) {}

  private async assertBookingExists(bookingUid: string) {
    const booking = await this.bookingsRepository.getByUidWithBookingReference(bookingUid);
    if (!booking) {
      throw new NotFoundException(`Booking with uid=${bookingUid} was not found in the database`);
    }
  }

  async getRecordings(bookingUid: string): Promise<RecordingItem[]> {
    await this.assertBookingExists(bookingUid);
    return [];
  }

  async getTranscripts(bookingUid: string): Promise<string[]> {
    await this.assertBookingExists(bookingUid);
    return [];
  }

  async getVideoSessions(bookingUid: string): Promise<CalMeetingSession[]> {
    await this.assertBookingExists(bookingUid);
    return [];
  }
}
