import { recordAdminAction } from "@calcom/features/audit-log/adminAuditLog";
import getAllUserBookings from "@calcom/features/bookings/lib/getAllUserBookings";
import type { DB } from "@calcom/kysely";
import type { PrismaClient } from "@calcom/prisma";
import type { CompiledQuery, DatabaseConnection } from "kysely";
import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from "kysely";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBookings, getHandler } from "./get.handler";

const { mockGetTeamIdsWithPermission } = vi.hoisted(() => ({ mockGetTeamIdsWithPermission: vi.fn() }));

vi.mock("@calcom/features/bookings/lib/getAllUserBookings");
vi.mock("@calcom/features/audit-log/adminAuditLog", () => ({ recordAdminAction: vi.fn() }));
vi.mock("@calcom/features/membership/di/TeamRolePermissionService.container", () => ({
  getTeamRolePermissionService: () => ({ getTeamIdsWithPermission: mockGetTeamIdsWithPermission }),
}));
vi.mock("@calcom/kysely", () => ({
  default: {
    selectFrom: vi.fn(),
    executeQuery: vi.fn(),
  },
}));
vi.mock("@calcom/lib/logger", () => ({
  default: {
    getSubLogger: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

describe("getHandler", () => {
  const mockUser = {
    id: 1,
    email: "user@example.com",
    name: "Test User",
    profile: {
      organizationId: null,
    },
  };

  const mockPrisma = {} as unknown as PrismaClient;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return bookings successfully", async () => {
    const mockBookings = [
      {
        id: 1,
        uid: "booking-1",
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        rescheduler: null,
        eventType: {
          recurringEvent: null,
          eventTypeColor: null,
          price: 0,
          currency: "usd",
          metadata: {},
        },
      },
    ] as any;

    vi.mocked(getAllUserBookings).mockResolvedValue({
      bookings: mockBookings,
      recurringInfo: [],
      totalCount: 1,
    });

    const result = await getHandler({
      ctx: {
        user: mockUser as any,
        prisma: mockPrisma,
      },
      input: {
        filters: {},
        limit: 10,
        offset: 0,
      },
    });

    expect(result.bookings).toEqual(mockBookings);
    expect(result.totalCount).toBe(1);
    expect(getAllUserBookings).toHaveBeenCalledWith(
      expect.objectContaining({
        ctx: expect.objectContaining({
          user: expect.objectContaining({
            id: mockUser.id,
            email: mockUser.email,
            orgId: null,
          }),
        }),
        filters: {},
        take: 10,
        skip: 0,
        bookingListingByStatus: ["upcoming"],
      })
    );
  });
});

describe("getBookings - team booking permissions", () => {
  const mockUser = {
    id: 1,
    email: "user@example.com",
    orgId: null,
  };

  const mockPrisma = {
    membership: {
      findMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
    eventType: {
      findMany: vi.fn(),
    },
    booking: {
      findUnique: vi.fn(),
      groupBy: vi.fn(),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  } as unknown as PrismaClient;

  const createMockKysely = () => {
    const mockQueryBuilder = {
      select: vi.fn((arg?: unknown) => {
        if (typeof arg === "function") {
          return mockQueryBuilder;
        }
        return mockQueryBuilder;
      }),
      selectAll: vi.fn(() => mockQueryBuilder),
      where: vi.fn(() => mockQueryBuilder),
      innerJoin: vi.fn(() => mockQueryBuilder),
      union: vi.fn(() => mockQueryBuilder),
      unionAll: vi.fn(() => mockQueryBuilder),
      distinct: vi.fn(() => mockQueryBuilder),
      as: vi.fn(() => mockQueryBuilder),
      $if: vi.fn(() => mockQueryBuilder),
      orderBy: vi.fn(() => mockQueryBuilder),
      limit: vi.fn(() => mockQueryBuilder),
      offset: vi.fn(() => mockQueryBuilder),
      compile: vi.fn(() => ({ sql: "SELECT * FROM bookings" })),
      executeTakeFirst: vi.fn().mockResolvedValue({ bookingCount: 0 }),
      execute: vi.fn().mockResolvedValue([]),
    };

    return {
      selectFrom: vi.fn(() => mockQueryBuilder),
      executeQuery: vi.fn().mockResolvedValue({ rows: [] }),
      _mockQueryBuilder: mockQueryBuilder,
    } as unknown as Kysely<DB> & { _mockQueryBuilder: typeof mockQueryBuilder };
  };

  let mockKysely: ReturnType<typeof createMockKysely>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockKysely = createMockKysely();
    mockGetTeamIdsWithPermission.mockResolvedValue([]);
  });

  it("looks up the teams where the user is ADMIN or OWNER", async () => {
    mockPrisma.booking.groupBy = vi.fn().mockResolvedValue([]);

    await getBookings({
      user: mockUser,
      prisma: mockPrisma,
      kysely: mockKysely as unknown as Kysely<DB>,
      bookingListingByStatus: ["upcoming"],
      filters: {},
      take: 10,
      skip: 0,
    });

    expect(mockGetTeamIdsWithPermission).toHaveBeenCalledWith({
      userId: 1,
      permission: "booking.read",
      fallbackRoles: ["ADMIN", "OWNER"],
    });
  });

  it("adds team-scoped booking queries only for team admins and owners", async () => {
    mockPrisma.booking.groupBy = vi.fn().mockResolvedValue([]);
    const run = async () =>
      getBookings({
        user: mockUser,
        prisma: mockPrisma,
        kysely: mockKysely as unknown as Kysely<DB>,
        bookingListingByStatus: ["upcoming"],
        filters: {},
        take: 10,
        skip: 0,
      });

    await run();
    const queriesWithoutTeams = mockKysely.selectFrom.mock.calls.length;

    vi.clearAllMocks();
    mockKysely = createMockKysely();
    mockGetTeamIdsWithPermission.mockResolvedValue([10]);
    await run();

    expect(mockKysely.selectFrom.mock.calls.length).toBeGreaterThan(queriesWithoutTeams);
  });

  it("allows a team admin to filter by members of their teams", async () => {
    mockGetTeamIdsWithPermission.mockResolvedValue([10]);
    mockPrisma.user.findMany = vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]);
    mockPrisma.booking.groupBy = vi.fn().mockResolvedValue([]);

    await expect(
      getBookings({
        user: mockUser,
        prisma: mockPrisma,
        kysely: mockKysely as unknown as Kysely<DB>,
        bookingListingByStatus: ["upcoming"],
        filters: { userIds: [2] },
        take: 10,
        skip: 0,
      })
    ).resolves.toBeDefined();
  });

  it("forbids filtering by another user when the caller administers no team", async () => {
    mockPrisma.user.findMany = vi.fn().mockResolvedValue([{ id: 2, email: "other@example.com" }]);

    await expect(
      getBookings({
        user: mockUser,
        prisma: mockPrisma,
        kysely: mockKysely as unknown as Kysely<DB>,
        bookingListingByStatus: ["upcoming"],
        filters: { userIds: [2] },
        take: 10,
        skip: 0,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("should allow access when filtering by own userId", async () => {
    mockPrisma.user.findMany = vi.fn((args: { where?: { id?: { in?: number[] } } }) => {
      if (args?.where?.id?.in?.includes(1)) {
        return Promise.resolve([{ id: 1, email: "user@example.com" }]) as ReturnType<
          typeof mockPrisma.user.findMany
        >;
      }
      return Promise.resolve([]) as ReturnType<typeof mockPrisma.user.findMany>;
    });
    mockPrisma.eventType.findMany = vi.fn().mockResolvedValue([]);
    mockPrisma.booking.groupBy = vi.fn().mockResolvedValue([]);

    await expect(
      getBookings({
        user: mockUser,
        prisma: mockPrisma,
        kysely: mockKysely as unknown as Kysely<DB>,
        bookingListingByStatus: ["upcoming"],
        filters: {
          userIds: [1],
        },
        take: 10,
        skip: 0,
      })
    ).resolves.not.toThrow();
  });

  it("should throw BAD_REQUEST when filtering by non-existent userIds", async () => {
    mockPrisma.user.findMany = vi.fn().mockResolvedValue([]);
    mockPrisma.eventType.findMany = vi.fn().mockResolvedValue([]);
    mockPrisma.booking.groupBy = vi.fn().mockResolvedValue([]);

    await expect(
      getBookings({
        user: mockUser,
        prisma: mockPrisma,
        kysely: mockKysely as unknown as Kysely<DB>,
        bookingListingByStatus: ["upcoming"],
        filters: {
          userIds: [4],
        },
        take: 10,
        skip: 0,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "The requested users do not exist.",
    });
  });

  it("should execute query via kysely when no userIds filter is provided", async () => {
    mockPrisma.user.findMany = vi.fn().mockResolvedValue([]);
    mockPrisma.eventType.findMany = vi.fn().mockResolvedValue([]);
    mockPrisma.booking.groupBy = vi.fn().mockResolvedValue([]);

    await getBookings({
      user: mockUser,
      prisma: mockPrisma,
      kysely: mockKysely as unknown as Kysely<DB>,
      bookingListingByStatus: ["upcoming"],
      filters: {},
      take: 10,
      skip: 0,
    });

    expect(
      (mockKysely as unknown as { executeQuery: ReturnType<typeof vi.fn> }).executeQuery
    ).toHaveBeenCalled();
  });

  it("should NOT fetch user IDs when no userIds filter is provided", async () => {
    mockPrisma.user.findMany = vi.fn().mockResolvedValue([]);
    mockPrisma.eventType.findMany = vi.fn().mockResolvedValue([]);
    mockPrisma.booking.groupBy = vi.fn().mockResolvedValue([]);

    await getBookings({
      user: mockUser,
      prisma: mockPrisma,
      kysely: mockKysely as unknown as Kysely<DB>,
      bookingListingByStatus: ["upcoming"],
      filters: {},
      take: 10,
      skip: 0,
    });

    expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
  });

  it("should use unionAll for combining booking queries", async () => {
    mockPrisma.user.findMany = vi.fn().mockResolvedValue([]);
    mockPrisma.booking.groupBy = vi.fn().mockResolvedValue([]);

    await getBookings({
      user: mockUser,
      prisma: mockPrisma,
      kysely: mockKysely as unknown as Kysely<DB>,
      bookingListingByStatus: ["upcoming"],
      filters: {},
      take: 10,
      skip: 0,
    });

    expect(mockKysely._mockQueryBuilder.unionAll).toHaveBeenCalled();
  });

  it("should apply DISTINCT on the outer select", async () => {
    mockPrisma.user.findMany = vi.fn().mockResolvedValue([]);
    mockPrisma.booking.groupBy = vi.fn().mockResolvedValue([]);

    await getBookings({
      user: mockUser,
      prisma: mockPrisma,
      kysely: mockKysely as unknown as Kysely<DB>,
      bookingListingByStatus: ["upcoming"],
      filters: {},
      take: 10,
      skip: 0,
    });

    expect(mockKysely._mockQueryBuilder.distinct).toHaveBeenCalled();
  });

  describe("pending team invitations", () => {
    const adminTeamId = 10;
    const victimId = 2;
    const memberships = [
      { userId: 1, teamId: adminTeamId, accepted: true },
      { userId: 3, teamId: adminTeamId, accepted: true },
      // An ADMIN can create this row for any existing account without the invitee's consent.
      { userId: victimId, teamId: adminTeamId, accepted: false },
    ];

    type UserFindManyArgs = {
      where?: {
        id?: { in?: number[] };
        teams?: { some?: { teamId?: { in?: number[] }; accepted?: boolean } };
      };
    };

    const fakeUserFindMany = (args: UserFindManyArgs) => {
      const teamsFilter = args?.where?.teams?.some;
      if (teamsFilter) {
        const ids = memberships
          .filter((m) => teamsFilter.teamId?.in?.includes(m.teamId))
          .filter((m) => teamsFilter.accepted === undefined || m.accepted === teamsFilter.accepted)
          .map((m) => ({ id: m.userId }));
        return Promise.resolve(ids);
      }
      const ids = args?.where?.id?.in ?? [];
      return Promise.resolve(ids.map((id) => ({ id, email: `user${id}@example.com` })));
    };

    const createCompilingKysely = () => {
      const queries: CompiledQuery[] = [];
      const db = new Kysely<DB>({
        dialect: {
          createAdapter: () => new PostgresAdapter(),
          createDriver: () => new DummyDriver(),
          createIntrospector: (k) => new PostgresIntrospector(k),
          createQueryCompiler: () => new PostgresQueryCompiler(),
        },
        log: (event) => {
          queries.push(event.query);
        },
      });
      return { db, queries };
    };

    beforeEach(() => {
      mockGetTeamIdsWithPermission.mockResolvedValue([adminTeamId]);
      mockPrisma.user.findMany = vi.fn(fakeUserFindMany) as unknown as typeof mockPrisma.user.findMany;
      mockPrisma.booking.groupBy = vi.fn().mockResolvedValue([]);
    });

    it("forbids an admin from filtering by a user whose invitation is still pending", async () => {
      await expect(
        getBookings({
          user: mockUser,
          prisma: mockPrisma,
          kysely: mockKysely as unknown as Kysely<DB>,
          bookingListingByStatus: ["upcoming"],
          filters: { userIds: [victimId] },
          take: 10,
          skip: 0,
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { teams: { some: { teamId: { in: [adminTeamId] }, accepted: true } } },
        })
      );
    });

    it("still allows filtering by a member who accepted the invitation", async () => {
      await expect(
        getBookings({
          user: mockUser,
          prisma: mockPrisma,
          kysely: mockKysely as unknown as Kysely<DB>,
          bookingListingByStatus: ["upcoming"],
          filters: { userIds: [3] },
          take: 10,
          skip: 0,
        })
      ).resolves.toBeDefined();
    });

    it("only widens the unfiltered list to accepted members of the administered teams", async () => {
      const { db, queries } = createCompilingKysely();

      await getBookings({
        user: mockUser,
        prisma: mockPrisma,
        kysely: db,
        bookingListingByStatus: ["upcoming"],
        filters: {},
        take: 10,
        skip: 0,
      });

      const listQuery = queries.find((q) => q.sql.includes("union_subquery") && q.sql.includes("limit"));
      expect(listQuery).toBeDefined();
      const sql = listQuery?.sql ?? "";
      const parameters = listQuery?.parameters ?? [];

      const membershipScopes = sql.match(/"Membership"\."teamId" in \(/g) ?? [];
      const acceptedChecks = [...sql.matchAll(/"Membership"\."accepted" = \$(\d+)/g)];

      // Attendee and organizer scopes both go through Membership.
      expect(membershipScopes).toHaveLength(2);
      expect(acceptedChecks).toHaveLength(membershipScopes.length);
      for (const [, index] of acceptedChecks) {
        expect(parameters[Number(index) - 1]).toBe(true);
      }
    });
  });
});

describe("system admin booking scopes", () => {
  const admin = { id: 1, email: "admin@example.com", orgId: null };

  const createCompilingKysely = () => {
    const queries: CompiledQuery[] = [];
    const db = new Kysely<DB>({
      dialect: {
        createAdapter: () => new PostgresAdapter(),
        createDriver: () => new DummyDriver(),
        createIntrospector: (k) => new PostgresIntrospector(k),
        createQueryCompiler: () => new PostgresQueryCompiler(),
      },
      log: (event) => {
        queries.push(event.query);
      },
    });
    return { db, queries };
  };

  const findListQuery = (queries: CompiledQuery[]) =>
    queries.find((q) => q.sql.includes("union_subquery") && q.sql.includes("limit"));

  let prisma: PrismaClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTeamIdsWithPermission.mockResolvedValue([]);
    prisma = {
      user: {
        findMany: vi.fn((args: { where?: { id?: { in?: number[] } } }) =>
          Promise.resolve((args?.where?.id?.in ?? []).map((id) => ({ id, email: `user${id}@example.com` })))
        ),
      },
      eventType: { findMany: vi.fn().mockResolvedValue([]) },
      booking: { findUnique: vi.fn(), groupBy: vi.fn().mockResolvedValue([]) },
      $queryRaw: vi.fn().mockResolvedValue([]),
    } as unknown as PrismaClient;
  });

  const run = (
    db: Kysely<DB>,
    filters: Parameters<typeof getBookings>[0]["filters"],
    isSystemAdmin: boolean | undefined
  ) =>
    getBookings({
      user: admin,
      prisma,
      kysely: db,
      bookingListingByStatus: ["upcoming"],
      filters,
      take: 10,
      skip: 0,
      isSystemAdmin,
    });

  it("leaves the default listing unchanged for an admin", async () => {
    const asUser = createCompilingKysely();
    await run(asUser.db, {}, false);
    const asAdmin = createCompilingKysely();
    await run(asAdmin.db, {}, true);

    expect(findListQuery(asAdmin.queries)?.sql).toBe(findListQuery(asUser.queries)?.sql);
    expect(recordAdminAction).not.toHaveBeenCalled();
  });

  it("forbids the all scope to anyone but a system admin", async () => {
    const { db } = createCompilingKysely();
    await expect(run(db, { scope: "all" }, false)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(run(db, { scope: "all" }, undefined)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lists every booking for an admin with the all scope, paginated and audited", async () => {
    const { db, queries } = createCompilingKysely();
    await run(db, { scope: "all" }, true);

    const sql = findListQuery(queries)?.sql ?? "";
    expect(sql).toContain("limit");
    expect(sql).toContain("offset");
    expect(sql).not.toContain('"Booking"."userId"');
    expect(sql).not.toContain('"Attendee"');
    expect(sql).not.toContain("distinct");
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: admin.id,
        path: "viewer.bookings.get",
        outcome: "granted",
        context: expect.objectContaining({ scope: "all" }),
      })
    );
  });

  it("keeps DISTINCT on the all scope when an attendee filter joins attendees", async () => {
    const { db, queries } = createCompilingKysely();
    await run(db, { scope: "all", attendeeName: "Jane" }, true);

    expect(findListQuery(queries)?.sql).toContain("select distinct");
  });

  it("lets an admin filter by any user and audits it", async () => {
    const { db, queries } = createCompilingKysely();
    await expect(run(db, { userIds: [42] }, true)).resolves.toBeDefined();

    const listQuery = findListQuery(queries);
    expect(listQuery?.sql).toContain('"userId" in ($');
    expect(listQuery?.parameters).toContain(42);
    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ context: expect.objectContaining({ userIds: [42] }) })
    );
  });

  it("still forbids a non-admin from filtering by any user", async () => {
    const { db } = createCompilingKysely();
    await expect(run(db, { userIds: [42] }, false)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(recordAdminAction).not.toHaveBeenCalled();
  });

  it("does not audit an admin filtering on their own bookings", async () => {
    const { db } = createCompilingKysely();
    await run(db, { userIds: [admin.id] }, true);
    expect(recordAdminAction).not.toHaveBeenCalled();
  });

  it("lists the bookings of any team's event types for an admin", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ id: 501 }, { id: 502 }]);
    const { db, queries } = createCompilingKysely();
    await run(db, { teamIds: [77] }, true);

    const listQuery = findListQuery(queries);
    const sql = listQuery?.sql ?? "";
    expect(sql).toContain('"Booking"."eventTypeId" in ($');
    expect(listQuery?.parameters).toEqual(expect.arrayContaining([501, 502]));
    expect(sql).not.toContain('"Booking"."userId" = $');
    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ context: expect.objectContaining({ teamIds: [77] }) })
    );
  });

  it("returns nothing for a team without event types instead of the whole instance", async () => {
    const { db, queries } = createCompilingKysely();
    const result = await run(db, { teamIds: [77] }, true);

    expect(result).toEqual({ bookings: [], recurringInfo: [], totalCount: 0 });
    expect(findListQuery(queries)).toBeUndefined();
  });

  it("keeps the regular team filter for a non-admin", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ id: 501 }]);
    const { db, queries } = createCompilingKysely();
    await run(db, { teamIds: [77] }, false);

    expect(findListQuery(queries)?.sql).toContain('"Booking"."userId" = $');
    expect(recordAdminAction).not.toHaveBeenCalled();
  });

  it("does not widen the team filter for an admin who already administers the team", async () => {
    mockGetTeamIdsWithPermission.mockResolvedValue([77]);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ id: 501 }]);
    const { db, queries } = createCompilingKysely();
    await run(db, { teamIds: [77] }, true);

    expect(findListQuery(queries)?.sql).toContain('"Booking"."userId" = $');
    expect(recordAdminAction).not.toHaveBeenCalled();
  });
});

describe("filtering on one's own bookings (My bookings segment)", () => {
  const me = { id: 1, email: "me@example.com", orgId: null };
  const administeredTeamId = 10;

  const createCompilingKysely = () => {
    const queries: CompiledQuery[] = [];
    const db = new Kysely<DB>({
      dialect: {
        createAdapter: () => new PostgresAdapter(),
        createDriver: () => new DummyDriver(),
        createIntrospector: (k) => new PostgresIntrospector(k),
        createQueryCompiler: () => new PostgresQueryCompiler(),
      },
      log: (event) => {
        queries.push(event.query);
      },
    });
    return { db, queries };
  };

  const listSql = (queries: CompiledQuery[]) =>
    queries.find((q) => q.sql.includes("union_subquery") && q.sql.includes("limit"))?.sql ?? "";

  let prisma: PrismaClient;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = {
      user: {
        findMany: vi.fn((args: { where?: { id?: { in?: number[] } } }) =>
          Promise.resolve((args?.where?.id?.in ?? []).map((id) => ({ id, email: `user${id}@example.com` })))
        ),
      },
      eventType: { findMany: vi.fn().mockResolvedValue([]) },
      booking: { findUnique: vi.fn(), groupBy: vi.fn().mockResolvedValue([]) },
      $queryRaw: vi.fn().mockResolvedValue([]),
    } as unknown as PrismaClient;
  });

  const run = (
    db: Kysely<DB>,
    filters: Parameters<typeof getBookings>[0]["filters"],
    isSystemAdmin: boolean
  ) =>
    getBookings({
      user: me,
      prisma,
      kysely: db,
      bookingListingByStatus: ["upcoming"],
      filters,
      take: 10,
      skip: 0,
      isSystemAdmin,
    });

  // A team booking between two other members only matches the team scopes (Membership-based
  // attendee/organizer subqueries and the team event type subquery): none of them may be part of
  // the query once userIds is given.
  it.each([
    ["a regular user", [], false],
    ["a team admin", [administeredTeamId], false],
    ["a system admin who is also a team admin", [administeredTeamId], true],
  ] as const)("only returns the bookings of the filtered user for %s", async (_label, teamIds, isSystemAdmin) => {
    mockGetTeamIdsWithPermission.mockResolvedValue([...teamIds]);
    const { db, queries } = createCompilingKysely();

    await run(db, { userIds: [me.id] }, isSystemAdmin);

    const sql = listSql(queries);
    expect(sql).toContain('"userId" in ($');
    expect(sql).toContain('"Attendee"."email" in ($');
    expect(sql).not.toContain('"Membership"');
    expect(sql).not.toContain('"EventType"."teamId"');
    expect(sql).not.toContain('"Booking"."userId" = $');
    expect(recordAdminAction).not.toHaveBeenCalled();
  });

  it("keeps the team scope without a userIds filter", async () => {
    mockGetTeamIdsWithPermission.mockResolvedValue([administeredTeamId]);
    const { db, queries } = createCompilingKysely();

    await run(db, {}, false);

    expect(listSql(queries)).toContain('"Membership"');
  });

  it("still lists every booking for a system admin with the all scope", async () => {
    mockGetTeamIdsWithPermission.mockResolvedValue([administeredTeamId]);
    const { db, queries } = createCompilingKysely();

    await run(db, { scope: "all" }, true);

    const sql = listSql(queries);
    expect(sql).not.toContain('"Membership"');
    expect(sql).not.toContain('"userId"');
  });
});

describe("getHandler - system admin detection", () => {
  type HandlerUser = Parameters<typeof getHandler>[0]["ctx"]["user"];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAllUserBookings).mockResolvedValue({ bookings: [], recurringInfo: [], totalCount: 0 });
  });

  it.each([
    ["an admin with a regular session", "ADMIN", { user: {} }, true],
    ["an admin impersonating someone", "ADMIN", { user: { impersonatedBy: { id: 9 } } }, false],
    ["a regular user", "USER", { user: {} }, false],
    ["an admin without session context", "ADMIN", undefined, false],
  ])("passes isSystemAdmin for %s", async (_label, role, session, expected) => {
    await getHandler({
      ctx: {
        user: {
          id: 1,
          email: "a@example.com",
          role,
          profile: { organizationId: null },
        } as unknown as HandlerUser,
        prisma: {} as PrismaClient,
        session,
      },
      input: { filters: {}, limit: 10, offset: 0 },
    });

    expect(getAllUserBookings).toHaveBeenCalledWith(expect.objectContaining({ isSystemAdmin: expected }));
  });
});

describe("getBookings - page, count and hydration queries", () => {
  const me = { id: 1, email: "me@example.com", orgId: null };

  type Row = Record<string, unknown>;

  class RespondingDriver extends DummyDriver {
    constructor(private readonly respond: (query: CompiledQuery) => Row[]) {
      super();
    }

    override async acquireConnection(): Promise<DatabaseConnection> {
      return {
        executeQuery: async <R>(query: CompiledQuery) => ({ rows: this.respond(query) as R[] }),
        streamQuery: async function* () {},
      };
    }
  }

  const isCountQuery = (q: CompiledQuery) => q.sql.includes('"bookingCount"');
  const isPageQuery = (q: CompiledQuery) =>
    q.sql.includes("union_subquery") && q.sql.includes("limit") && !isCountQuery(q);
  const isHydrationQuery = (q: CompiledQuery) => q.sql.includes('as "rescheduler"');

  const hydratedBooking = (id: number, overrides: Row = {}): Row => ({
    id,
    uid: `booking-${id}`,
    startTime: new Date("2030-01-01T10:00:00Z"),
    endTime: new Date("2030-01-01T10:30:00Z"),
    recurringEventId: null,
    fromReschedule: null,
    rescheduler: null,
    eventType: null,
    user: null,
    attendees: [],
    seatsReferences: [],
    ...overrides,
  });

  const createDb = ({ hydrated = [] as Row[], count = 0 } = {}) => {
    const queries: CompiledQuery[] = [];
    const db = new Kysely<DB>({
      dialect: {
        createAdapter: () => new PostgresAdapter(),
        createDriver: () =>
          new RespondingDriver((q) => {
            queries.push(q);
            if (isCountQuery(q)) return [{ bookingCount: String(count) }];
            if (isPageQuery(q)) return hydrated.map((b) => ({ id: b.id }));
            if (isHydrationQuery(q)) return hydrated;
            return [];
          }),
        createIntrospector: (k) => new PostgresIntrospector(k),
        createQueryCompiler: () => new PostgresQueryCompiler(),
      },
    });
    return { db, queries };
  };

  let prisma: PrismaClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTeamIdsWithPermission.mockResolvedValue([]);
    prisma = {
      user: { findMany: vi.fn().mockResolvedValue([]) },
      eventType: { findMany: vi.fn().mockResolvedValue([]) },
      booking: { findUnique: vi.fn(), groupBy: vi.fn().mockResolvedValue([]) },
      $queryRaw: vi.fn().mockResolvedValue([]),
    } as unknown as PrismaClient;
  });

  const run = (
    db: Kysely<DB>,
    filters: Parameters<typeof getBookings>[0]["filters"] = {},
    isSystemAdmin = false
  ) =>
    getBookings({
      user: me,
      prisma,
      kysely: db,
      bookingListingByStatus: ["upcoming"],
      filters,
      take: 10,
      skip: 0,
      isSystemAdmin,
    });

  it("applies the created and updated date filters to the count as well as to the page", async () => {
    const { db, queries } = createDb({ count: 4 });

    const result = await run(db, {
      afterCreatedDate: "2030-01-01T00:00:00.000Z",
      beforeCreatedDate: "2030-02-01T00:00:00.000Z",
      afterUpdatedDate: "2030-01-05T00:00:00.000Z",
      beforeUpdatedDate: "2030-01-20T00:00:00.000Z",
    });

    const countQuery = queries.find(isCountQuery);
    const pageQuery = queries.find(isPageQuery);
    for (const query of [countQuery, pageQuery]) {
      const sql = query?.sql ?? "";
      expect(sql).toContain('"union_subquery"."createdAt" >= $');
      expect(sql).toContain('"union_subquery"."createdAt" <= $');
      expect(sql).toContain('"union_subquery"."updatedAt" >= $');
      expect(sql).toContain('"union_subquery"."updatedAt" <= $');
    }
    expect(countQuery?.parameters).toEqual(pageQuery?.parameters.slice(0, countQuery?.parameters.length));
    expect(result.totalCount).toBe(4);
  });

  it("counts distinct ids when the union can return the same booking twice", async () => {
    const { db, queries } = createDb();

    await run(db);

    expect(queries.find(isCountQuery)?.sql).toContain('count(distinct "union_subquery"."id")');
  });

  it("counts rows without DISTINCT when an admin lists every booking", async () => {
    const { db, queries } = createDb();

    await run(db, { scope: "all" }, true);

    const sql = queries.find(isCountQuery)?.sql ?? "";
    expect(sql).toContain("count(*)");
    expect(sql).not.toContain("distinct");
  });

  it("keeps DISTINCT in the count of every booking when an attendee filter joins attendees", async () => {
    const { db, queries } = createDb();

    await run(db, { scope: "all", attendeeEmail: "jane@example.com" }, true);

    expect(queries.find(isCountQuery)?.sql).toContain('count(distinct "union_subquery"."id")');
  });

  // A seated attendee has their own Attendee row on the booking, which the attendee scopes match.
  it.each([
    ["the default scope", {}, [], '"Attendee"."email" = $'],
    ["a team admin", {}, [10], '"Attendee"."email" = $'],
    ["a userIds filter", { userIds: [1] }, [], '"Attendee"."email" in ($'],
  ] as const)("finds seated attendees through their Attendee row with %s", async (_label, filters, teamIds, attendeeMatch) => {
    mockGetTeamIdsWithPermission.mockResolvedValue([...teamIds]);
    prisma.user.findMany = vi
      .fn()
      .mockResolvedValue([{ id: 1, email: me.email }]) as unknown as typeof prisma.user.findMany;
    const { db, queries } = createDb();

    await run(db, filters);

    for (const query of [queries.find(isPageQuery), queries.find(isCountQuery)]) {
      const sql = query?.sql ?? "";
      expect(sql).toContain(attendeeMatch);
      expect(sql).not.toContain('"BookingSeat"');
    }
    expect(queries.find(isPageQuery)?.parameters).toContain(me.email);
  });

  it("reads the rescheduler in the hydration query instead of one lookup per booking", async () => {
    const { db, queries } = createDb({
      count: 2,
      hydrated: [
        hydratedBooking(1, { fromReschedule: "original-1", rescheduler: "host@example.com" }),
        hydratedBooking(2),
      ],
    });

    const result = await run(db);

    expect(queries.find(isHydrationQuery)?.sql).toContain(
      '"originalBooking"."uid" = "Booking"."fromReschedule"'
    );
    expect(prisma.booking.findUnique).not.toHaveBeenCalled();
    expect(result.bookings.map((b) => [b.id, b.rescheduler])).toEqual([
      [1, "host@example.com"],
      [2, null],
    ]);
    expect(result.totalCount).toBe(2);
  });

  it("reads the attendees' user data in the hydration query instead of a second Attendee lookup", async () => {
    const withAccount = {
      id: 11,
      email: "jane@example.com",
      name: "Jane",
      user: { name: "Jane Doe", email: "jane@example.com", avatarUrl: "/jane.png", username: "jane" },
    };
    const withoutAccount = {
      id: 12,
      email: "guest@example.com",
      name: "Guest",
      user: { name: null, email: "guest@example.com", avatarUrl: null, username: null },
    };
    const { db, queries } = createDb({
      count: 1,
      hydrated: [hydratedBooking(1, { attendees: [withAccount, withoutAccount] })],
    });

    const result = await run(db);

    const hydrationSql = queries.find(isHydrationQuery)?.sql ?? "";
    expect(hydrationSql).toContain("json_build_object('name'");
    expect(hydrationSql).toContain('"users"."email" = "Attendee"."email"');
    expect(hydrationSql).not.toMatch(/join "users"/);
    expect(queries.filter((q) => q.sql.includes('from "Attendee" left join "users"'))).toHaveLength(0);
    expect(queries.filter((q) => !isCountQuery(q) && !isPageQuery(q) && !isHydrationQuery(q))).toHaveLength(
      0
    );
    expect(result.bookings[0].attendees).toEqual([withAccount, withoutAccount]);
  });

  it("keeps the user data of the attendees left visible on a seated booking", async () => {
    const mine = {
      id: 21,
      email: me.email,
      name: "Me",
      user: { name: "Me", email: me.email, avatarUrl: null, username: "me" },
    };
    const other = {
      id: 22,
      email: "other@example.com",
      name: "Other",
      user: { name: null, email: "other@example.com", avatarUrl: null, username: null },
    };
    const { db } = createDb({
      hydrated: [
        hydratedBooking(1, {
          attendees: [mine, other],
          seatsReferences: [{ referenceUid: "seat-1", attendee: { email: me.email } }],
          eventType: { seatsShowAttendees: false, hosts: [] },
        }),
      ],
    });

    const result = await run(db);

    expect(result.bookings[0].attendees).toEqual([mine]);
  });

  it("looks up the caller's own recurring series outside an admin view", async () => {
    const { db } = createDb({ hydrated: [hydratedBooking(1, { recurringEventId: "series-1" })] });

    await run(db);

    expect(prisma.booking.groupBy).toHaveBeenCalledTimes(2);
    expect(prisma.booking.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { recurringEventId: { not: { equals: null } }, userId: me.id } })
    );
  });

  it("looks up the recurring series of the page in an admin view", async () => {
    const { db } = createDb({
      hydrated: [
        hydratedBooking(1, { recurringEventId: "series-1" }),
        hydratedBooking(2, { recurringEventId: "series-1" }),
        hydratedBooking(3),
      ],
    });

    await run(db, { scope: "all" }, true);

    expect(prisma.booking.groupBy).toHaveBeenCalledTimes(2);
    expect(prisma.booking.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { recurringEventId: { in: ["series-1"] } } })
    );
  });
});
