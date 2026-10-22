import { PrismaOrgMembershipRepository } from "@calcom/platform-libraries/bookings";

import { BookingsService_2024_08_13 } from "@/platform/bookings/2024-08-13/services/bookings.service";

describe("BookingsService_2024_08_13", () => {
  describe("isIndividualSeatOrOrgAdminReschedule", () => {
    // The method only reads its arguments, so the service's many dependencies are not needed.
    const service = Object.create(BookingsService_2024_08_13.prototype) as BookingsService_2024_08_13;
    let isOrgAdminSpy: jest.SpyInstance;

    beforeEach(() => {
      isOrgAdminSpy = jest
        .spyOn(PrismaOrgMembershipRepository, "isLoggedInUserOrgAdminOfBookingHost")
        .mockResolvedValue(true);
    });

    afterEach(() => {
      isOrgAdminSpy.mockRestore();
    });

    it("should be an individual seat reschedule when a seatUid is provided", async () => {
      await expect(service.isIndividualSeatOrOrgAdminReschedule(true, 1, undefined)).resolves.toBe(true);
    });

    // Used to throw a plain Error, answered as 500 instead of the 400 asking for a seatUid.
    it("should not be an org admin reschedule without an authenticated user", async () => {
      await expect(service.isIndividualSeatOrOrgAdminReschedule(false, 1, undefined)).resolves.toBe(false);
      expect(isOrgAdminSpy).not.toHaveBeenCalled();
    });

    it("should not be an org admin reschedule when the booking has no host", async () => {
      await expect(service.isIndividualSeatOrOrgAdminReschedule(false, null, 2)).resolves.toBe(false);
      expect(isOrgAdminSpy).not.toHaveBeenCalled();
    });

    it("should defer to the org admin check when both users are known", async () => {
      await expect(service.isIndividualSeatOrOrgAdminReschedule(false, 1, 2)).resolves.toBe(true);
      expect(isOrgAdminSpy).toHaveBeenCalledWith(2, 1);
    });
  });
});
