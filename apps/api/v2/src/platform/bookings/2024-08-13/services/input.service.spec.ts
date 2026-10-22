import type { BookingInputLocation_2024_08_13 } from "@calcom/platform-types";
import type { EventType } from "@calcom/prisma/client";

import { InputBookingsService_2024_08_13 } from "@/platform/bookings/2024-08-13/services/input.service";

type LocationCheck = (
  inputBookingLocation: BookingInputLocation_2024_08_13,
  dbEventType: Pick<EventType, "id" | "locations">
) => boolean;

describe("InputBookingsService_2024_08_13", () => {
  describe("isBookingLocationWithEventTypeLocations", () => {
    function createService(eventTypeIntegration: string) {
      // The check only needs the event type locations transformer, not the service's other dependencies.
      const service = Object.assign(Object.create(InputBookingsService_2024_08_13.prototype), {
        outputEventTypesService: {
          transformLocations: () => [{ type: "integration", integration: eventTypeIntegration }],
        },
      });
      const check: LocationCheck = service["isBookingLocationWithEventTypeLocations"].bind(service);
      return check;
    }
    const eventType = { id: 1, locations: [] };

    it("should accept cal-video on an event type stored as Jitsi", () => {
      const check = createService("jitsi");

      expect(check({ type: "integration", integration: "cal-video" }, eventType)).toBe(true);
    });

    it("should accept jitsi on an event type still stored as Cal Video", () => {
      const check = createService("cal-video");

      expect(check({ type: "integration", integration: "jitsi" }, eventType)).toBe(true);
    });

    it("should still reject an integration the event type does not have", () => {
      const check = createService("jitsi");

      expect(() => check({ type: "integration", integration: "google-meet" }, eventType)).toThrow(
        "Booking location with integration google-meet not valid for event type with id=1"
      );
    });
  });
});
