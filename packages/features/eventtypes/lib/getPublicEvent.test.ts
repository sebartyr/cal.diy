import type { PrismaClient } from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPublicEvent } from "./getPublicEvent";

const { mockBuildProfileEnricher, mockFindUsersByUsername } = vi.hoisted(() => ({
  mockBuildProfileEnricher: vi.fn(),
  mockFindUsersByUsername: vi.fn(),
}));

vi.mock("@calcom/features/users/repositories/UserRepository", () => ({
  UserRepository: class {
    buildProfileEnricher = mockBuildProfileEnricher;
    findUsersByUsername = mockFindUsersByUsername;
  },
}));

const prismaMock = {
  eventType: { findFirst: vi.fn(), findUniqueOrThrow: vi.fn() },
  schedule: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
  team: { findFirst: vi.fn(), findFirstOrThrow: vi.fn() },
  membership: { findFirst: vi.fn(), findUnique: vi.fn() },
};
const prisma = prismaMock as unknown as PrismaClient;

const buildUser = (id: number, username: string) => ({
  id,
  username,
  name: username,
  avatarUrl: null,
  weekStart: "Monday",
  brandColor: null,
  darkBrandColor: null,
  theme: null,
  metadata: null,
  organization: null,
  defaultScheduleId: 77,
});

const buildEvent = (overrides: Record<string, unknown> = {}) => ({
  id: 10,
  title: "Intro",
  description: null,
  slug: "intro",
  isInstantEvent: false,
  instantMeetingParameters: [],
  length: 30,
  locations: [],
  customInputs: [],
  disableGuests: false,
  metadata: null,
  bookingFields: [],
  recurringEvent: null,
  teamId: null,
  team: null,
  hosts: [],
  owner: buildUser(1, "alice"),
  schedule: null,
  instantMeetingSchedule: null,
  parent: null,
  ...overrides,
});

const personalProfile = (userId: number) => ({
  id: null,
  upId: `usr-${userId}`,
  username: null,
  organizationId: null,
  organization: null,
});

const callGetPublicEvent = (username: string, currentUserId?: number) =>
  getPublicEvent(username, "intro", false, null, prisma, false, currentUserId);

describe("getPublicEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildProfileEnricher.mockImplementation(
      async () =>
        <T extends { id: number; username: string | null }>(user: T) => ({
          ...user,
          nonProfileUsername: user.username,
          profile: personalProfile(user.id),
        })
    );
  });

  it("returns null for a dynamic group whose members do not exist", async () => {
    mockFindUsersByUsername.mockResolvedValue([]);

    await expect(callGetPublicEvent("ghost+phantom")).resolves.toBeNull();
  });

  it("enriches the hosts and the owner with a single profile lookup", async () => {
    const host = buildUser(2, "bob");
    prismaMock.eventType.findFirst.mockResolvedValue(buildEvent({ hosts: [{ user: host }] }));
    prismaMock.schedule.findUnique.mockResolvedValue({ id: 77, timeZone: "Europe/Paris" });

    const result = await callGetPublicEvent("alice");

    expect(mockBuildProfileEnricher).toHaveBeenCalledTimes(1);
    expect(mockBuildProfileEnricher).toHaveBeenCalledWith([2, 1]);
    expect(result?.owner).toEqual(expect.objectContaining({ id: 1, profile: personalProfile(1) }));
    expect(result?.subsetOfHosts[0].user).toEqual(
      expect.objectContaining({ id: 2, profile: personalProfile(2) })
    );
  });

  it("falls back to the owner's default schedule when the event has none", async () => {
    prismaMock.eventType.findFirst.mockResolvedValue(buildEvent());
    prismaMock.schedule.findUnique.mockResolvedValue({ id: 77, timeZone: "Europe/Paris" });

    const result = await callGetPublicEvent("alice");

    expect(prismaMock.schedule.findUnique).toHaveBeenCalledWith({
      where: { id: 77 },
      select: { id: true, timeZone: true },
    });
    expect(result?.schedule).toEqual({ id: 77, timeZone: "Europe/Paris" });
    expect(result?.subsetOfUsers).toEqual([expect.objectContaining({ username: "alice" })]);
    expect(result?.showInstantEventConnectNowModal).toBe(false);
  });

  it("keeps the event schedule and skips the default schedule lookup when one is set", async () => {
    prismaMock.eventType.findFirst.mockResolvedValue(buildEvent({ schedule: { id: 5, timeZone: "UTC" } }));

    const result = await callGetPublicEvent("alice");

    expect(prismaMock.schedule.findUnique).not.toHaveBeenCalled();
    expect(result?.schedule).toEqual({ id: 5, timeZone: "UTC" });
  });

  it("starts the default schedule and membership lookups together", async () => {
    const host = buildUser(2, "bob");
    prismaMock.eventType.findFirst.mockResolvedValue(
      buildEvent({
        teamId: 3,
        team: { parentId: 4, isPrivate: true, slug: "team", name: "Team", metadata: null, parent: null },
        hosts: [{ user: host }],
      })
    );
    let resolveSchedule: (value: unknown) => void = () => {};
    prismaMock.schedule.findUnique.mockReturnValue(
      new Promise((resolve) => {
        resolveSchedule = resolve;
      })
    );
    prismaMock.membership.findFirst.mockResolvedValue({ teamId: 4 });

    const pending = callGetPublicEvent("team", 9);
    await vi.waitFor(() => expect(prismaMock.schedule.findUnique).toHaveBeenCalled());

    expect(prismaMock.membership.findFirst).toHaveBeenCalledTimes(1);
    expect(prismaMock.membership.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 9,
        teamId: { in: [3, 4] },
        accepted: true,
        role: { in: [MembershipRole.ADMIN, MembershipRole.OWNER] },
      },
      select: { teamId: true },
    });
    expect(prismaMock.membership.findUnique).not.toHaveBeenCalled();

    resolveSchedule({ id: 77, timeZone: "UTC" });
    const result = await pending;
    expect(result?.subsetOfUsers).toEqual([expect.objectContaining({ username: "bob" })]);
  });

  it("hides the members of a private team from visitors who are not admins", async () => {
    prismaMock.eventType.findFirst.mockResolvedValue(
      buildEvent({
        teamId: 3,
        team: { parentId: null, isPrivate: true, slug: "team", name: "Team", metadata: null, parent: null },
        hosts: [{ user: buildUser(2, "bob") }],
        owner: null,
      })
    );
    prismaMock.membership.findFirst.mockResolvedValue(null);

    const result = await callGetPublicEvent("team", 9);

    expect(prismaMock.membership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ teamId: { in: [3] } }) })
    );
    expect(result?.subsetOfUsers).toEqual([]);
  });

  it("does not look up memberships for anonymous visitors", async () => {
    prismaMock.eventType.findFirst.mockResolvedValue(
      buildEvent({
        teamId: 3,
        team: { parentId: null, isPrivate: true, slug: "team", name: "Team", metadata: null, parent: null },
        hosts: [{ user: buildUser(2, "bob") }],
        owner: null,
      })
    );

    const result = await callGetPublicEvent("team");

    expect(prismaMock.membership.findFirst).not.toHaveBeenCalled();
    expect(result?.subsetOfUsers).toEqual([]);
  });

  it("reports instant availability from the instant meeting schedule", async () => {
    prismaMock.eventType.findFirst.mockResolvedValue(
      buildEvent({
        isInstantEvent: true,
        instantMeetingSchedule: { id: 8, timeZone: null },
        schedule: { id: 5, timeZone: "UTC" },
      })
    );
    prismaMock.schedule.findUniqueOrThrow.mockResolvedValue({ availability: [] });

    const result = await callGetPublicEvent("alice");

    expect(prismaMock.schedule.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 8 },
      select: { availability: true },
    });
    expect(result?.showInstantEventConnectNowModal).toBe(false);
  });

  it("keeps the instant event flag when there is no instant meeting schedule", async () => {
    prismaMock.eventType.findFirst.mockResolvedValue(
      buildEvent({ isInstantEvent: true, schedule: { id: 5, timeZone: "UTC" } })
    );

    const result = await callGetPublicEvent("alice");

    expect(prismaMock.schedule.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(result?.showInstantEventConnectNowModal).toBe(true);
  });
});
