import type { Session } from "next-auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUserSessionMock, recordAdminActionMock, recordAdminDenialMock } = vi.hoisted(() => ({
  getUserSessionMock: vi.fn(),
  recordAdminActionMock: vi.fn(),
  recordAdminDenialMock: vi.fn(),
}));

vi.mock("@calcom/features/auth/lib/userFromSessionUtils", () => ({
  getUserSession: getUserSessionMock,
}));

vi.mock("@calcom/features/audit-log/adminAuditLog", () => ({
  recordAdminAction: recordAdminActionMock,
  recordAdminDenial: recordAdminDenialMock,
}));

vi.mock("@sentry/nextjs", () => ({ setUser: vi.fn() }));

import { createContextInner } from "../../createContext";
import authedProcedure, {
  authedAdminProcedure,
  authedNonImpersonatedProcedure,
} from "../../procedures/authedProcedure";
import { createCallerFactory, router } from "../../trpc";

const testRouter = router({
  sensitive: authedNonImpersonatedProcedure.mutation(() => "sensitive-ok"),
  regular: authedProcedure.query(() => "regular-ok"),
  admin: authedAdminProcedure.query(() => "admin-ok"),
});

const createCaller = createCallerFactory(testRouter);

const impersonatedBy = { id: 1, uuid: "admin-uuid", role: "ADMIN" as const };

function buildSession(user: Partial<Session["user"]> = {}): Session {
  return {
    hasValidLicense: true,
    upId: "usr-2",
    expires: new Date(Date.now() + 60_000).toISOString(),
    user: { id: 2, uuid: "target-uuid", email: "target@example.com", role: "USER", ...user },
  };
}

async function callerFor({ role, session }: { role: "USER" | "ADMIN"; session: Session }) {
  getUserSessionMock.mockResolvedValue({
    user: { id: session.user.id, email: session.user.email, role, twoFactorEnabled: true },
    session,
  });
  return createCaller(await createContextInner({ locale: "en", session }));
}

beforeEach(() => {
  getUserSessionMock.mockReset();
  recordAdminActionMock.mockReset();
  recordAdminDenialMock.mockReset();
});

describe("impersonation guard middlewares", () => {
  it("lets regular sessions call sensitive procedures", async () => {
    const caller = await callerFor({ role: "USER", session: buildSession() });
    await expect(caller.sensitive()).resolves.toBe("sensitive-ok");
    expect(recordAdminDenialMock).not.toHaveBeenCalled();
  });

  it("blocks sensitive procedures for impersonated sessions and records the denial", async () => {
    const caller = await callerFor({ role: "USER", session: buildSession({ impersonatedBy }) });
    await expect(caller.sensitive()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(recordAdminDenialMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 1,
        path: "sensitive",
        context: { impersonatedUserId: 2 },
      })
    );
  });

  it("keeps regular procedures available to impersonated sessions", async () => {
    const caller = await callerFor({ role: "USER", session: buildSession({ impersonatedBy }) });
    await expect(caller.regular()).resolves.toBe("regular-ok");
  });

  it("lets admins call admin procedures outside impersonation", async () => {
    const caller = await callerFor({
      role: "ADMIN",
      session: buildSession({ id: 1, role: "ADMIN" }),
    });
    await expect(caller.admin()).resolves.toBe("admin-ok");
    expect(recordAdminActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: 1, path: "admin", outcome: "granted" })
    );
  });

  it("blocks admin procedures for impersonated sessions even if the target became ADMIN", async () => {
    const caller = await callerFor({
      role: "ADMIN",
      session: buildSession({ role: "ADMIN", impersonatedBy }),
    });
    await expect(caller.admin()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(recordAdminActionMock).not.toHaveBeenCalled();
    expect(recordAdminDenialMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 1,
        path: "admin",
        reason: "admin route blocked during impersonation",
      })
    );
  });

  it("still rejects unauthenticated calls with UNAUTHORIZED", async () => {
    getUserSessionMock.mockResolvedValue({ user: null, session: null });
    const caller = createCaller(await createContextInner({ locale: "en", session: null }));
    await expect(caller.sensitive()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
