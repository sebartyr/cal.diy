import type { Session } from "next-auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnlockedUserForSessionMock, recordAdminActionMock, recordAdminDenialMock } = vi.hoisted(() => ({
  findUnlockedUserForSessionMock: vi.fn(),
  recordAdminActionMock: vi.fn(),
  recordAdminDenialMock: vi.fn(),
}));

// Real getUserSession/getUserFromSession run; only the data access is faked.
vi.mock("@calcom/features/users/repositories/UserRepository", () => ({
  UserRepository: class {
    findUnlockedUserForSession = findUnlockedUserForSessionMock;
    async enrichUserWithTheProfile<T>({ user }: { user: T }) {
      return { ...user, profile: null };
    }
  },
}));

vi.mock("@calcom/features/audit-log/adminAuditLog", () => ({
  recordAdminAction: recordAdminActionMock,
  recordAdminDenial: recordAdminDenialMock,
}));

vi.mock("@sentry/nextjs", () => ({ setUser: vi.fn() }));

import { createContextInner } from "../../createContext";
import { authedAdminProcedure } from "../../procedures/authedProcedure";
import { createCallerFactory, router } from "../../trpc";

const createCaller = createCallerFactory(router({ admin: authedAdminProcedure.query(() => "admin-ok") }));

type SessionRole = NonNullable<Session["user"]["role"]>;

async function callAdmin({ tokenRole, dbRole }: { tokenRole: SessionRole; dbRole: "USER" | "ADMIN" }) {
  // Mirrors what getServerSession hands to tRPC: the role is already capped by the JWT role, but
  // getUserFromSession must not re-elevate it from the database either.
  const session: Session = {
    hasValidLicense: true,
    upId: "usr-7",
    expires: new Date(Date.now() + 60_000).toISOString(),
    user: { id: 7, uuid: "uuid-7", email: "u7@example.com", role: tokenRole },
  };
  findUnlockedUserForSessionMock.mockResolvedValue({
    id: 7,
    uuid: "uuid-7",
    email: "u7@example.com",
    username: "u7",
    role: dbRole,
    twoFactorEnabled: true,
    metadata: {},
    locale: "en",
  });
  const caller = createCaller(await createContextInner({ locale: "en", session }));
  return caller.admin();
}

beforeEach(() => {
  findUnlockedUserForSessionMock.mockReset();
  recordAdminActionMock.mockReset();
  recordAdminDenialMock.mockReset();
});

describe("authedAdminProcedure requires an ADMIN role validated at login and in the database", () => {
  it("allows JWT ADMIN + DB ADMIN", async () => {
    await expect(callAdmin({ tokenRole: "ADMIN", dbRole: "ADMIN" })).resolves.toBe("admin-ok");
  });

  it.each([
    ["JWT USER + DB ADMIN (promotion without re-login)", "USER", "ADMIN"],
    ["JWT INACTIVE_ADMIN + DB ADMIN", "INACTIVE_ADMIN", "ADMIN"],
    ["JWT ADMIN + DB USER (demotion)", "ADMIN", "USER"],
  ] as const)("refuses %s with FORBIDDEN", async (_, tokenRole, dbRole) => {
    await expect(callAdmin({ tokenRole, dbRole })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(recordAdminActionMock).not.toHaveBeenCalled();
    expect(recordAdminDenialMock).toHaveBeenCalledOnce();
  });

  it("refuses locked accounts (no unlocked user found) with UNAUTHORIZED", async () => {
    const session: Session = {
      hasValidLicense: true,
      upId: "usr-7",
      expires: new Date(Date.now() + 60_000).toISOString(),
      user: { id: 7, uuid: "uuid-7", email: "u7@example.com", role: "ADMIN" },
    };
    findUnlockedUserForSessionMock.mockResolvedValue(null);
    const caller = createCaller(await createContextInner({ locale: "en", session }));
    await expect(caller.admin()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
