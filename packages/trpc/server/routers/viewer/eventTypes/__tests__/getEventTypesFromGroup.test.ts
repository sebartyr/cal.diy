import type { PrismaClient } from "@calcom/prisma";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcSessionUser } from "../../../../types";
import { getEventTypesFromGroup } from "../getEventTypesFromGroup.handler";

vi.mock("@calcom/lib/checkRateLimitAndThrowError", () => ({
  checkRateLimitAndThrowError: vi.fn(),
}));

const { mockFindAllByUpId, mockFindTeamEventTypes, mockHostFindMany, mockMembershipFindFirst } = vi.hoisted(
  () => ({
    mockFindAllByUpId: vi.fn(),
    mockFindTeamEventTypes: vi.fn(),
    mockHostFindMany: vi.fn(),
    mockMembershipFindFirst: vi.fn(),
  })
);

vi.mock("@calcom/features/eventtypes/repositories/eventTypeRepository", () => ({
  EventTypeRepository: class {
    findAllByUpId = mockFindAllByUpId;
    findTeamEventTypes = mockFindTeamEventTypes;
  },
}));

vi.mock("@calcom/prisma", () => ({
  prisma: {
    host: { findMany: mockHostFindMany },
    membership: { findFirst: mockMembershipFindFirst },
  },
}));

vi.mock("../util", () => ({
  mapEventTypes: vi.fn(async (eventTypes: unknown[]) => eventTypes),
}));

const user = { id: 7, name: "Pro", profile: { upId: "usr-7" } } as unknown as NonNullable<TrpcSessionUser>;
const ctx = { user, prisma: {} as PrismaClient };

const eventType = (id: number) => ({
  id,
  position: 0,
  users: [{ id: 7 }],
  hosts: [{ user: { id: 7 } }],
  children: [{ id: 100 + id, users: [{ id: 8 }] }],
});

describe("getEventTypesFromGroup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHostFindMany.mockResolvedValue([]);
    mockMembershipFindFirst.mockResolvedValue(null);
  });

  it("loads personal event types with a single paginated query", async () => {
    mockFindAllByUpId.mockResolvedValue([eventType(3), eventType(2), eventType(1)]);

    const res = await getEventTypesFromGroup({
      ctx,
      input: { group: { teamId: null, parentId: null }, limit: 2, cursor: null },
    });

    expect(mockFindAllByUpId).toHaveBeenCalledTimes(1);
    expect(mockFindAllByUpId).toHaveBeenCalledWith(
      { upId: "usr-7", userId: 7 },
      expect.objectContaining({
        where: {
          teamId: null,
          schedulingType: null,
          AND: [{ OR: [{ parentId: null }, { parentId: { not: null }, userId: 7 }] }],
        },
        orderBy: [{ position: "desc" }, { id: "desc" }],
        limit: 2,
        cursor: null,
      })
    );
    expect(res.eventTypes.map((et) => et.id)).toEqual([3, 2]);
    expect(res.nextCursor).toBe(1);
  });

  it("keeps the search filter alongside the parent/child condition", async () => {
    mockFindAllByUpId.mockResolvedValue([]);

    await getEventTypesFromGroup({
      ctx,
      input: { group: { teamId: null, parentId: null }, limit: 10, cursor: 5, searchQuery: "intro" },
    });

    const [, options] = mockFindAllByUpId.mock.calls[0];
    expect(options.where.title).toEqual({ contains: "intro", mode: "insensitive" });
    expect(options.where.AND).toHaveLength(1);
    expect(options.where).not.toHaveProperty("OR");
    expect(options.cursor).toBe(5);
  });

  it("returns no next cursor when the page is not full", async () => {
    mockFindAllByUpId.mockResolvedValue([eventType(1)]);

    const res = await getEventTypesFromGroup({
      ctx,
      input: { group: { teamId: null, parentId: null }, limit: 2, cursor: null },
    });

    expect(res.eventTypes).toHaveLength(1);
    expect(res.nextCursor).toBeUndefined();
  });

  it("skips the membership lookup on the personal tab", async () => {
    mockFindAllByUpId.mockResolvedValue([eventType(1)]);

    await getEventTypesFromGroup({
      ctx,
      input: { group: { teamId: null, parentId: null }, limit: 10, cursor: null },
    });

    expect(mockMembershipFindFirst).not.toHaveBeenCalled();
  });

  it("flags event types where the current user is a host", async () => {
    mockFindAllByUpId.mockResolvedValue([eventType(2), eventType(1)]);
    mockHostFindMany.mockResolvedValue([{ eventTypeId: 2 }]);

    const res = await getEventTypesFromGroup({
      ctx,
      input: { group: { teamId: null, parentId: null }, limit: 10, cursor: null },
    });

    expect(mockHostFindMany).toHaveBeenCalledWith({
      where: { userId: 7, eventTypeId: { in: [2, 1] } },
      select: { eventTypeId: true },
    });
    expect(res.eventTypes.map((et) => [et.id, et.isCurrentUserHost])).toEqual([
      [2, true],
      [1, false],
    ]);
  });

  it("lists team event types without querying personal ones", async () => {
    mockFindTeamEventTypes.mockResolvedValue([eventType(9)]);

    const res = await getEventTypesFromGroup({
      ctx,
      input: { group: { teamId: 42, parentId: null }, limit: 10, cursor: null },
    });

    expect(mockFindAllByUpId).not.toHaveBeenCalled();
    expect(mockFindTeamEventTypes).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: 42, userId: 7, limit: 10, cursor: null })
    );
    expect(mockMembershipFindFirst).toHaveBeenCalledWith({
      where: { userId: 7, teamId: 42, accepted: true, role: "MEMBER" },
      select: { team: { select: { isPrivate: true } } },
    });
    expect(res.eventTypes[0].users).toEqual([{ id: 7 }]);
  });

  it("hides users, hosts and children from members of a private team", async () => {
    mockFindTeamEventTypes.mockResolvedValue([eventType(9)]);
    mockMembershipFindFirst.mockResolvedValue({ team: { isPrivate: true } });

    const res = await getEventTypesFromGroup({
      ctx,
      input: { group: { teamId: 42, parentId: null }, limit: 10, cursor: null },
    });

    expect(res.eventTypes[0]).toMatchObject({ users: [], hosts: [], children: [] });
  });

  it("keeps users visible for members of a public team", async () => {
    mockFindTeamEventTypes.mockResolvedValue([eventType(9)]);
    mockMembershipFindFirst.mockResolvedValue({ team: { isPrivate: false } });

    const res = await getEventTypesFromGroup({
      ctx,
      input: { group: { teamId: 42, parentId: null }, limit: 10, cursor: null },
    });

    expect(res.eventTypes[0].children).toEqual([{ id: 109, users: [{ id: 8 }] }]);
  });
});
