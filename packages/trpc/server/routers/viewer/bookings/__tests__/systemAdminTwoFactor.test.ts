import type { Session } from "next-auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Reproduces the review finding on the real procedures: with REQUIRE_2FA_FOR_ADMIN on, an admin
// without 2FA is refused by the admin routes, and must not get the admin extensions of bookings.get
// either, while keeping the regular access to their own bookings.

const { getUserSessionMock, prismaMock } = vi.hoisted(() => ({
  getUserSessionMock: vi.fn(),
  prismaMock: {
    user: {
      findMany: vi.fn(),
    },
    booking: {
      groupBy: vi.fn(),
      findUnique: vi.fn(),
    },
    eventType: {
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

vi.mock("@calcom/features/auth/lib/userFromSessionUtils", () => ({
  getUserSession: getUserSessionMock,
}));

vi.mock("@calcom/features/audit-log/adminAuditLog", () => ({
  recordAdminAction: vi.fn(),
  recordAdminDenial: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({ setUser: vi.fn() }));

vi.mock("@calcom/prisma", () => ({
  prisma: prismaMock,
  default: prismaMock,
  readonlyPrisma: prismaMock,
}));

vi.mock("@calcom/features/membership/di/TeamRolePermissionService.container", () => ({
  getTeamRolePermissionService: () => ({ getTeamIdsWithPermission: vi.fn().mockResolvedValue([]) }),
}));

vi.mock("@calcom/kysely", async () => {
  const { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } = await import(
    "kysely"
  );
  return {
    default: new Kysely({
      dialect: {
        createAdapter: () => new PostgresAdapter(),
        createDriver: () => new DummyDriver(),
        createIntrospector: (k) => new PostgresIntrospector(k),
        createQueryCompiler: () => new PostgresQueryCompiler(),
      },
    }),
  };
});

import { createContextInner } from "../../../../createContext";
import { createCallerFactory, router } from "../../../../trpc";
import { adminRouter } from "../../admin/_router";
import { bookingsRouter } from "../_router";

const createCaller = createCallerFactory(router({ bookings: bookingsRouter, admin: adminRouter }));

const ADMIN_ID = 1;

function buildSession(): Session {
  return {
    hasValidLicense: true,
    upId: `usr-${ADMIN_ID}`,
    expires: new Date(Date.now() + 60_000).toISOString(),
    user: { id: ADMIN_ID, uuid: "admin-uuid", email: "admin@example.com", role: "ADMIN" },
  };
}

async function adminCaller({ twoFactorEnabled }: { twoFactorEnabled: boolean }) {
  const session = buildSession();
  getUserSessionMock.mockResolvedValue({
    user: {
      id: ADMIN_ID,
      email: "admin@example.com",
      role: "ADMIN",
      locked: false,
      twoFactorEnabled,
      profile: { organizationId: null },
    },
    session,
  });
  return createCaller(await createContextInner({ locale: "en", session }));
}

const listInput = (filters: Record<string, unknown>) => ({ filters, limit: 10, offset: 0 });

describe("bookings.get admin extensions under REQUIRE_2FA_FOR_ADMIN", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("REQUIRE_2FA_FOR_ADMIN", "true");
    prismaMock.user.findMany.mockImplementation(async (args: { where?: { id?: { in?: number[] } } }) =>
      (args?.where?.id?.in ?? []).map((id) => ({ id, email: `user${id}@example.com` }))
    );
    prismaMock.booking.groupBy.mockResolvedValue([]);
    prismaMock.$queryRaw.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses the admin routes to an admin without 2FA (reference behaviour)", async () => {
    const caller = await adminCaller({ twoFactorEnabled: false });
    await expect(caller.admin.listPaginated({ limit: 10 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses the all scope to an admin without 2FA", async () => {
    const caller = await adminCaller({ twoFactorEnabled: false });
    await expect(caller.bookings.get(listInput({ scope: "all" }))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("refuses another user's bookings to an admin without 2FA", async () => {
    const caller = await adminCaller({ twoFactorEnabled: false });
    await expect(caller.bookings.get(listInput({ userIds: [42] }))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("keeps an admin without 2FA's access to their own bookings", async () => {
    const caller = await adminCaller({ twoFactorEnabled: false });
    await expect(caller.bookings.get(listInput({}))).resolves.toMatchObject({ totalCount: 0 });
    await expect(caller.bookings.get(listInput({ userIds: [ADMIN_ID] }))).resolves.toMatchObject({
      totalCount: 0,
    });
  });

  it("grants the admin extensions once 2FA is enabled", async () => {
    const caller = await adminCaller({ twoFactorEnabled: true });
    await expect(caller.bookings.get(listInput({ scope: "all" }))).resolves.toMatchObject({
      totalCount: 0,
    });
    await expect(caller.bookings.get(listInput({ userIds: [42] }))).resolves.toMatchObject({
      totalCount: 0,
    });
  });
});
