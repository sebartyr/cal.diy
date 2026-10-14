import {
  createBookingScenario,
  getBooker,
  getDate,
  getOrganizer,
  getScenarioData,
  TestData,
} from "@calcom/testing/lib/bookingScenario/bookingScenario";
import { getMockRequestDataForBooking } from "@calcom/testing/lib/bookingScenario/getMockRequestDataForBooking";
import { setupAndTeardown } from "@calcom/testing/lib/bookingScenario/setupAndTeardown";
import { test } from "@calcom/testing/lib/fixtures/fixtures";
import { describe, expect, vi } from "vitest";
import { createBooking } from "../createBooking";
import { getNewBookingHandler } from "./getNewBookingHandler";

vi.mock("../createBooking", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../createBooking")>();
  return { ...actual, createBooking: vi.fn(actual.createBooking) };
});

const timeout = process.env.CI ? 5000 : 20000;

describe("handleNewBooking slot conflict re-check", () => {
  setupAndTeardown();

  test(
    "keeps the re-check for a regular booking that sends recurring counters in its body",
    async () => {
      const handleNewBooking = getNewBookingHandler();
      const booker = getBooker({ email: "booker@example.com", name: "Booker" });
      const organizer = getOrganizer({
        name: "Organizer",
        email: "organizer@example.com",
        id: 101,
        schedules: [TestData.schedules.IstWorkHours],
      });

      await createBookingScenario(
        getScenarioData({
          eventTypes: [
            {
              id: 1,
              slotInterval: 30,
              length: 30,
              locations: [{ type: "link", link: "https://example.com/meet" }],
              users: [{ id: 101 }],
            },
          ],
          organizer,
        })
      );

      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
      const mockBookingData = getMockRequestDataForBooking({
        data: {
          eventTypeId: 1,
          start: `${plus1DateString}T05:00:00.000Z`,
          end: `${plus1DateString}T05:30:00.000Z`,
          // Client-controlled fields of the public schema: they must not switch the re-check off.
          currentRecurringIndex: 1,
          numSlotsToCheckForAvailability: 1,
          responses: {
            email: booker.email,
            name: booker.name,
            location: { optionValue: "", value: "link" },
          },
        },
      });

      await handleNewBooking({ bookingData: mockBookingData });

      expect(vi.mocked(createBooking)).toHaveBeenCalledWith(
        expect.objectContaining({ skipSlotConflictCheck: false })
      );
    },
    timeout
  );
});
