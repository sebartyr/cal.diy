import { recordAdminAction } from "@calcom/features/audit-log/adminAuditLog";
import { MembershipRepository } from "@calcom/features/membership/repositories/MembershipRepository";
import { UserRepository } from "@calcom/features/users/repositories/UserRepository";
import type { PrismaClient } from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BookingRepository } from "../repositories/BookingRepository";
import { BookingAccessService } from "./BookingAccessService";

vi.mock("../repositories/BookingRepository");
vi.mock("@calcom/features/audit-log/adminAuditLog", () => ({ recordAdminAction: vi.fn() }));
vi.mock("@calcom/features/users/repositories/UserRepository");
vi.mock("@calcom/features/membership/repositories/MembershipRepository");

vi.mock("@calcom/prisma", () => ({
  default: {},
  prisma: {},
}));

describe("BookingAccessService", () => {
  let service: BookingAccessService;
  let mockPrismaClient: PrismaClient;
  let mockBookingRepo: {
    findByUidIncludeEventType: ReturnType<typeof vi.fn>;
  };
  let mockUserRepo: {
    getUserOrganizationAndTeams: ReturnType<typeof vi.fn>;
  };
  let mockPermissionCheckService: {
    checkPermission: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockPrismaClient = {} as PrismaClient;

    mockBookingRepo = {
      findByUidIncludeEventType: vi.fn(),
    };

    mockUserRepo = {
      getUserOrganizationAndTeams: vi.fn(),
    };

    mockPermissionCheckService = {
      checkPermission: vi.fn(),
    };

    vi.mocked(BookingRepository).mockImplementation(function () {
      return mockBookingRepo as any;
    });
    vi.mocked(UserRepository).mockImplementation(function () {
      return mockUserRepo as any;
    });

    service = new BookingAccessService(mockPrismaClient);

    (service as any).permissionCheckService = mockPermissionCheckService;
  });

  describe("doesUserIdHaveAccessToBooking", () => {
    describe("Case 1: Booking Organizer", () => {
      it("should return true when user is the booking organizer", async () => {
        const mockBooking = {
          userId: 123,
          eventType: null,
          attendees: [],
        };

        mockBookingRepo.findByUidIncludeEventType.mockResolvedValue(mockBooking);

        const result = await service.doesUserIdHaveAccessToBooking({
          userId: 123,
          bookingUid: "test-booking-uid",
        });

        expect(result).toBe(true);
        expect(mockBookingRepo.findByUidIncludeEventType).toHaveBeenCalledWith({
          bookingUid: "test-booking-uid",
        });
      });

      it("should return false when user is not the organizer and booking has no team", async () => {
        const mockBooking = {
          userId: 456,
          eventType: null,
          attendees: [],
        };

        mockBookingRepo.findByUidIncludeEventType.mockResolvedValue(mockBooking);
        mockUserRepo.getUserOrganizationAndTeams.mockResolvedValue(null);

        const result = await service.doesUserIdHaveAccessToBooking({
          userId: 123,
          bookingUid: "test-booking-uid",
        });

        expect(result).toBe(false);
      });
    });

    describe("Case 2: Booking Host", () => {
      it("should return true when user is a host in eventType.hosts", async () => {
        const mockBooking = {
          userId: 456,
          user: { id: 456, email: "organizer@example.com" },
          eventType: {
            hosts: [
              { userId: 123, user: { email: "host@example.com" } },
              { userId: 789, user: { email: "other-host@example.com" } },
            ],
            users: [],
          },
          attendees: [{ email: "host@example.com" }],
        };

        mockBookingRepo.findByUidIncludeEventType.mockResolvedValue(mockBooking);

        const result = await service.doesUserIdHaveAccessToBooking({
          userId: 123,
          bookingUid: "test-booking-uid",
        });

        expect(result).toBe(true);
      });

      it("should return true when user is in eventType.users", async () => {
        const mockBooking = {
          userId: 456,
          user: { id: 456, email: "organizer@example.com" },
          eventType: {
            hosts: [],
            users: [
              { id: 123, email: "user@example.com" },
              { id: 789, email: "other-user@example.com" },
            ],
          },
          attendees: [{ email: "user@example.com" }],
        };

        mockBookingRepo.findByUidIncludeEventType.mockResolvedValue(mockBooking);

        const result = await service.doesUserIdHaveAccessToBooking({
          userId: 123,
          bookingUid: "test-booking-uid",
        });

        expect(result).toBe(true);
      });

      it("should return false when user is not a host", async () => {
        const mockBooking = {
          userId: 456,
          user: { id: 456, email: "organizer@example.com" },
          eventType: {
            hosts: [{ userId: 789, user: { email: "host@example.com" } }],
            users: [],
          },
          attendees: [{ email: "host@example.com" }],
        };

        mockBookingRepo.findByUidIncludeEventType.mockResolvedValue(mockBooking);
        mockUserRepo.getUserOrganizationAndTeams.mockResolvedValue(null);

        const result = await service.doesUserIdHaveAccessToBooking({
          userId: 123,
          bookingUid: "test-booking-uid",
        });

        expect(result).toBe(false);
      });
    });

    describe("Case 3: Team Event Access", () => {
      it("should return true when user has booking.readTeamBookings permission", async () => {
        const mockBooking = {
          userId: 456,
          eventType: {
            teamId: 100,
          },
          attendees: [],
        };

        mockBookingRepo.findByUidIncludeEventType.mockResolvedValue(mockBooking);
        mockPermissionCheckService.checkPermission.mockResolvedValue(true);

        const result = await service.doesUserIdHaveAccessToBooking({
          userId: 123,
          bookingUid: "test-booking-uid",
        });

        expect(result).toBe(true);
        expect(mockPermissionCheckService.checkPermission).toHaveBeenCalledWith({
          userId: 123,
          teamId: 100,
          permission: "booking.readTeamBookings",
          fallbackRoles: [MembershipRole.OWNER, MembershipRole.ADMIN],
        });
      });

      it("should return false when user lacks booking.readTeamBookings permission", async () => {
        const mockBooking = {
          userId: 456,
          eventType: {
            teamId: 100,
          },
          attendees: [],
        };

        mockBookingRepo.findByUidIncludeEventType.mockResolvedValue(mockBooking);
        mockPermissionCheckService.checkPermission.mockResolvedValue(false);

        const result = await service.doesUserIdHaveAccessToBooking({
          userId: 123,
          bookingUid: "test-booking-uid",
        });

        expect(result).toBe(false);
        expect(mockPermissionCheckService.checkPermission).toHaveBeenCalledWith({
          userId: 123,
          teamId: 100,
          permission: "booking.readTeamBookings",
          fallbackRoles: [MembershipRole.OWNER, MembershipRole.ADMIN],
        });
      });
    });

    describe("Case 4: Org Admin Access (Personal Bookings)", () => {
      it("should return true when user has booking.readOrgBookings permission", async () => {
        const mockBooking = {
          userId: 456,
          eventType: null,
          attendees: [],
        };

        const mockBookingOwner = {
          organizationId: 200,
          teams: [],
        };

        mockBookingRepo.findByUidIncludeEventType.mockResolvedValue(mockBooking);
        mockUserRepo.getUserOrganizationAndTeams.mockResolvedValue(mockBookingOwner);
        mockPermissionCheckService.checkPermission.mockResolvedValue(true);

        const result = await service.doesUserIdHaveAccessToBooking({
          userId: 123,
          bookingUid: "test-booking-uid",
        });

        expect(result).toBe(true);
        expect(mockPermissionCheckService.checkPermission).toHaveBeenCalledWith({
          userId: 123,
          teamId: 200,
          permission: "booking.readOrgBookings",
          fallbackRoles: [MembershipRole.OWNER, MembershipRole.ADMIN],
        });
      });

      it("should return false when user lacks booking.readOrgBookings permission", async () => {
        const mockBooking = {
          userId: 456,
          eventType: null,
          attendees: [],
        };

        const mockBookingOwner = {
          organizationId: 200,
          teams: [],
        };

        mockBookingRepo.findByUidIncludeEventType.mockResolvedValue(mockBooking);
        mockUserRepo.getUserOrganizationAndTeams.mockResolvedValue(mockBookingOwner);
        mockPermissionCheckService.checkPermission.mockResolvedValue(false);

        const result = await service.doesUserIdHaveAccessToBooking({
          userId: 123,
          bookingUid: "test-booking-uid",
        });

        expect(result).toBe(false);
      });
    });

    describe("Case 5: Team Admin Access (Personal Bookings)", () => {
      it("should return true when user has booking.readTeamBookings on ANY team", async () => {
        const mockBooking = {
          userId: 456,
          eventType: null,
          attendees: [],
        };

        const mockBookingOwner = {
          organizationId: null,
          teams: [{ teamId: 300 }, { teamId: 400 }],
        };

        mockBookingRepo.findByUidIncludeEventType.mockResolvedValue(mockBooking);
        mockUserRepo.getUserOrganizationAndTeams.mockResolvedValue(mockBookingOwner);
        mockPermissionCheckService.checkPermission
          .mockResolvedValueOnce(false) // Team 300 - no permission
          .mockResolvedValueOnce(true); // Team 400 - has permission

        const result = await service.doesUserIdHaveAccessToBooking({
          userId: 123,
          bookingUid: "test-booking-uid",
        });

        expect(result).toBe(true);
        expect(mockPermissionCheckService.checkPermission).toHaveBeenCalledTimes(2);
        expect(mockPermissionCheckService.checkPermission).toHaveBeenNthCalledWith(1, {
          userId: 123,
          teamId: 300,
          permission: "booking.readTeamBookings",
          fallbackRoles: [MembershipRole.OWNER, MembershipRole.ADMIN],
        });
        expect(mockPermissionCheckService.checkPermission).toHaveBeenNthCalledWith(2, {
          userId: 123,
          teamId: 400,
          permission: "booking.readTeamBookings",
          fallbackRoles: [MembershipRole.OWNER, MembershipRole.ADMIN],
        });
      });

      it("should return false when user lacks permission on all teams", async () => {
        const mockBooking = {
          userId: 456,
          eventType: null,
          attendees: [],
        };

        const mockBookingOwner = {
          organizationId: null,
          teams: [{ teamId: 300 }, { teamId: 400 }],
        };

        mockBookingRepo.findByUidIncludeEventType.mockResolvedValue(mockBooking);
        mockUserRepo.getUserOrganizationAndTeams.mockResolvedValue(mockBookingOwner);
        mockPermissionCheckService.checkPermission.mockResolvedValue(false);

        const result = await service.doesUserIdHaveAccessToBooking({
          userId: 123,
          bookingUid: "test-booking-uid",
        });

        expect(result).toBe(false);
        expect(mockPermissionCheckService.checkPermission).toHaveBeenCalledTimes(2);
      });
    });

    describe("Membership-based permission checks (no PBAC stub)", () => {
      let membershipService: BookingAccessService;
      let mockMembershipRepo: { hasAcceptedMembershipWithRoles: ReturnType<typeof vi.fn> };

      beforeEach(() => {
        mockMembershipRepo = { hasAcceptedMembershipWithRoles: vi.fn() };
        vi.mocked(MembershipRepository).mockImplementation(function () {
          return mockMembershipRepo as unknown as MembershipRepository;
        });
        membershipService = new BookingAccessService(mockPrismaClient);
      });

      it("denies access to a team booking when the user is not an accepted admin/owner of the team", async () => {
        mockBookingRepo.findByUidIncludeEventType.mockResolvedValue({
          userId: 456,
          eventType: { teamId: 100 },
          attendees: [],
        });
        mockMembershipRepo.hasAcceptedMembershipWithRoles.mockResolvedValue(false);

        const result = await membershipService.doesUserIdHaveAccessToBooking({
          userId: 123,
          bookingUid: "test-booking-uid",
        });

        expect(result).toBe(false);
        expect(mockMembershipRepo.hasAcceptedMembershipWithRoles).toHaveBeenCalledWith({
          userId: 123,
          teamId: 100,
          roles: [MembershipRole.OWNER, MembershipRole.ADMIN],
        });
      });

      it("grants access to a team booking when the user is an accepted admin/owner of the team", async () => {
        mockBookingRepo.findByUidIncludeEventType.mockResolvedValue({
          userId: 456,
          eventType: { teamId: 100 },
          attendees: [],
        });
        mockMembershipRepo.hasAcceptedMembershipWithRoles.mockResolvedValue(true);

        const result = await membershipService.doesUserIdHaveAccessToBooking({
          userId: 123,
          bookingUid: "test-booking-uid",
        });

        expect(result).toBe(true);
      });

      it("denies access to a personal booking when the user administers none of the organizer's teams", async () => {
        mockBookingRepo.findByUidIncludeEventType.mockResolvedValue({
          userId: 456,
          eventType: null,
          attendees: [],
        });
        mockUserRepo.getUserOrganizationAndTeams.mockResolvedValue({
          organizationId: 200,
          teams: [{ teamId: 300 }],
        });
        mockMembershipRepo.hasAcceptedMembershipWithRoles.mockResolvedValue(false);

        const result = await membershipService.doesUserIdHaveAccessToBooking({
          userId: 123,
          bookingUid: "test-booking-uid",
        });

        expect(result).toBe(false);
        expect(mockMembershipRepo.hasAcceptedMembershipWithRoles).toHaveBeenCalledTimes(2);
      });
    });
  });
});

describe("BookingAccessService.doesSystemAdminHaveAccessToBooking", () => {
  const bookingRepo = {
    findByUidIncludeEventType: vi.fn(),
    findByIdIncludeEventType: vi.fn(),
  };
  const userRepo = {
    findAuthIdentityById: vi.fn(),
  };

  const call = (
    overrides: Partial<Parameters<BookingAccessService["doesSystemAdminHaveAccessToBooking"]>[0]>
  ) =>
    new BookingAccessService({} as PrismaClient).doesSystemAdminHaveAccessToBooking({
      userId: 1,
      isSystemAdmin: true,
      bookingId: 10,
      path: "viewer.bookings.confirm",
      action: "confirm",
      ...overrides,
    });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(BookingRepository).mockImplementation(function () {
      return bookingRepo as unknown as BookingRepository;
    });
    vi.mocked(UserRepository).mockImplementation(function () {
      return userRepo as unknown as UserRepository;
    });
    bookingRepo.findByIdIncludeEventType.mockResolvedValue({ userId: 2, attendees: [] });
    bookingRepo.findByUidIncludeEventType.mockResolvedValue({ userId: 2, attendees: [] });
    userRepo.findAuthIdentityById.mockResolvedValue({ id: 1, email: "admin@example.com", role: "ADMIN" });
  });

  it("grants an acting admin access to any booking and records it", async () => {
    await expect(call({})).resolves.toBe(true);

    expect(recordAdminAction).toHaveBeenCalledWith({
      actorUserId: 1,
      actorEmail: "admin@example.com",
      path: "viewer.bookings.confirm",
      outcome: "granted",
      context: { bookingId: 10, bookingUid: undefined, action: "confirm" },
    });
  });

  it("looks the booking up by uid when one is given", async () => {
    await expect(call({ bookingId: undefined, bookingUid: "abc" })).resolves.toBe(true);
    expect(bookingRepo.findByUidIncludeEventType).toHaveBeenCalledWith({ bookingUid: "abc" });
  });

  it("refuses without an acting admin session, without touching the database", async () => {
    await expect(call({ isSystemAdmin: false })).resolves.toBe(false);
    expect(userRepo.findAuthIdentityById).not.toHaveBeenCalled();
    expect(recordAdminAction).not.toHaveBeenCalled();
  });

  it("refuses when the database role is no longer ADMIN", async () => {
    userRepo.findAuthIdentityById.mockResolvedValue({ id: 1, email: "admin@example.com", role: "USER" });
    await expect(call({})).resolves.toBe(false);
    expect(recordAdminAction).not.toHaveBeenCalled();
  });

  it("refuses a locked or missing account", async () => {
    userRepo.findAuthIdentityById.mockResolvedValue(null);
    await expect(call({})).resolves.toBe(false);
  });

  it("refuses when the booking does not exist", async () => {
    bookingRepo.findByIdIncludeEventType.mockResolvedValue(null);
    await expect(call({})).resolves.toBe(false);
    expect(recordAdminAction).not.toHaveBeenCalled();
  });
});
