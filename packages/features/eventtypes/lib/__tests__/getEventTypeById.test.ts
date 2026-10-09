import { ProfileRepository } from "@calcom/features/profile/repositories/ProfileRepository";
import type { PrismaClient } from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";
import type { UserProfile } from "@calcom/types/UserProfile";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEventTypeById } from "../getEventTypeById";

const { findById } = vi.hoisted(() => ({ findById: vi.fn() }));

vi.mock("@calcom/features/eventtypes/repositories/eventTypeRepository", () => ({
  EventTypeRepository: vi.fn().mockImplementation(function () {
    return { findById, findByIdForOrgAdmin: vi.fn() };
  }),
}));

vi.mock("@calcom/app-store/server", () => ({
  getLocationGroupedOptions: vi.fn().mockResolvedValue([]),
}));

vi.mock("@calcom/i18n/server", () => ({
  getTranslation: vi.fn().mockResolvedValue((key: string) => key),
}));

vi.mock("@calcom/features/bookings/lib/getBookingFields", () => ({
  getBookingFieldsWithSystemFields: vi.fn().mockReturnValue([]),
}));

vi.mock("@calcom/features/profile/repositories/ProfileRepository", () => ({
  ProfileRepository: {
    findManyForUsers: vi.fn(),
    findManyForUser: vi.fn(),
    buildPersonalProfileFromUser: ({ user }: { user: { id: number; username: string | null } }) => ({
      id: null,
      upId: `usr-${user.id}`,
      username: user.username,
      organizationId: null,
      organization: null,
    }),
  },
}));

const baseUser = (id: number) => ({
  id,
  name: `User ${id}`,
  username: `user${id}`,
  avatarUrl: null,
  email: `user${id}@example.com`,
  locale: "en",
  defaultScheduleId: null,
  isPlatformManaged: false,
  timeZone: "UTC",
});

const member = (id: number, role: MembershipRole, accepted = true) => ({
  role,
  accepted,
  user: { ...baseUser(id), eventTypes: [{ slug: `event-${id}` }] },
});

const buildRawEventType = () => ({
  id: 10,
  teamId: 5,
  locations: [],
  metadata: {},
  customInputs: [],
  schedule: null,
  restrictionScheduleId: null,
  restrictionSchedule: null,
  useBookerTimezone: false,
  instantMeetingSchedule: null,
  recurringEvent: null,
  bookingLimits: null,
  durationLimits: null,
  eventTypeColor: null,
  periodStartDate: null,
  periodEndDate: null,
  schedulingType: "MANAGED",
  destinationCalendar: { id: 1 },
  owner: null,
  team: {
    id: 5,
    parentId: null,
    members: [
      member(1, MembershipRole.OWNER),
      member(2, MembershipRole.ADMIN),
      member(3, MembershipRole.MEMBER, false),
    ],
  },
  users: [baseUser(1)],
  children: [
    { id: 11, owner: baseUser(2) },
    { id: 12, owner: null },
    { id: 13, owner: baseUser(4) },
  ],
});

describe("getEventTypeById", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enriches members, child owners and users with a single profile query", async () => {
    const orgProfile = {
      id: 20,
      upId: "20",
      userId: 2,
      username: "user2-org",
      organizationId: 100,
      organization: { id: 100, isPlatform: false },
    } as unknown as UserProfile;
    vi.mocked(ProfileRepository.findManyForUsers).mockResolvedValue([orgProfile]);
    findById.mockResolvedValue(buildRawEventType());

    const result = await getEventTypeById({
      eventTypeId: 10,
      userId: 1,
      prisma: {} as PrismaClient,
      isTrpcCall: true,
      isUserOrganizationAdmin: false,
      currentOrganizationId: null,
    });

    expect(ProfileRepository.findManyForUsers).toHaveBeenCalledTimes(1);
    expect(ProfileRepository.findManyForUsers).toHaveBeenCalledWith([1, 2, 3, 4]);
    expect(ProfileRepository.findManyForUser).not.toHaveBeenCalled();

    expect(result.teamMembers.map((tm) => [tm.id, tm.username, tm.membership, tm.eventTypes])).toEqual([
      [1, "user1", MembershipRole.OWNER, ["event-1"]],
      [2, "user2-org", MembershipRole.ADMIN, ["event-2"]],
    ]);
    expect(result.teamMembers[1].profileId).toBe(20);

    expect(
      result.eventType.children.map((child) => [child.id, child.owner.username, child.owner.membership])
    ).toEqual([
      [11, "user2-org", MembershipRole.ADMIN],
      [13, "user4", MembershipRole.MEMBER],
    ]);
    expect(result.eventType.children[0].owner).not.toHaveProperty("eventTypes");

    expect(result.eventType.users).toEqual([
      expect.objectContaining({
        id: 1,
        username: "user1",
        nonProfileUsername: "user1",
        avatar: expect.any(String),
      }),
    ]);
    expect(result.currentUserMembership?.role).toBe(MembershipRole.OWNER);
  });
});
