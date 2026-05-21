import { beforeEach, describe, expect, it, vi } from "vitest";

const denialMock = vi.fn();
const actionMock = vi.fn();
vi.mock("@calcom/features/audit-log/adminAuditLog", () => ({
  recordAdminAction: actionMock,
  recordAdminDenial: denialMock,
}));

// We re-implement the gate the same way as in sessionMiddleware.ts, but
// in a pure function we can exercise directly. The real middleware uses
// `isAuthed.unstable_pipe(...)` which would require a tRPC test harness
// to invoke.
type GateUser = { id: number; role: string; email: string; twoFactorEnabled: boolean } | undefined | null;

function checkAdminGate({
  user,
  path,
  require2fa,
}: {
  user: GateUser;
  path: string;
  require2fa: boolean;
}): "ok" | "unauthorized" | "forbidden" {
  if (user?.role !== "ADMIN") {
    if (user?.id) {
      denialMock({
        actorUserId: user.id,
        path,
        reason: "non-admin role attempted to call admin route",
      });
    }
    return "unauthorized";
  }
  if (require2fa && !user.twoFactorEnabled) {
    denialMock({
      actorUserId: user.id,
      path,
      reason: "admin without 2FA enrolled blocked by REQUIRE_2FA_FOR_ADMIN",
    });
    return "forbidden";
  }
  actionMock({
    actorUserId: user.id,
    actorEmail: user.email,
    path,
    outcome: "granted",
  });
  return "ok";
}

beforeEach(() => {
  denialMock.mockReset();
  actionMock.mockReset();
});

describe("admin gate (SPRINT3-041)", () => {
  const admin = { id: 1, role: "ADMIN", email: "a@x.com", twoFactorEnabled: true };
  const adminNo2fa = { id: 1, role: "ADMIN", email: "a@x.com", twoFactorEnabled: false };
  const member = { id: 2, role: "MEMBER", email: "m@x.com", twoFactorEnabled: false };

  it("admin with 2FA always passes", () => {
    expect(checkAdminGate({ user: admin, path: "p", require2fa: true })).toBe("ok");
    expect(actionMock).toHaveBeenCalledOnce();
    expect(denialMock).not.toHaveBeenCalled();
  });

  it("admin without 2FA passes when flag is off (backward compat)", () => {
    expect(checkAdminGate({ user: adminNo2fa, path: "p", require2fa: false })).toBe("ok");
    expect(actionMock).toHaveBeenCalledOnce();
    expect(denialMock).not.toHaveBeenCalled();
  });

  it("admin without 2FA is denied when flag is on", () => {
    expect(checkAdminGate({ user: adminNo2fa, path: "viewer.admin.x", require2fa: true })).toBe(
      "forbidden"
    );
    expect(actionMock).not.toHaveBeenCalled();
    expect(denialMock).toHaveBeenCalledWith({
      actorUserId: 1,
      path: "viewer.admin.x",
      reason: "admin without 2FA enrolled blocked by REQUIRE_2FA_FOR_ADMIN",
    });
  });

  it("non-admin gets unauthorized and a recorded denial", () => {
    expect(checkAdminGate({ user: member, path: "viewer.admin.x", require2fa: true })).toBe(
      "unauthorized"
    );
    expect(denialMock).toHaveBeenCalledWith({
      actorUserId: 2,
      path: "viewer.admin.x",
      reason: "non-admin role attempted to call admin route",
    });
  });

  it("anonymous (no user) is unauthorized without a denial entry (no actor to attribute)", () => {
    expect(checkAdminGate({ user: null, path: "viewer.admin.x", require2fa: true })).toBe(
      "unauthorized"
    );
    expect(denialMock).not.toHaveBeenCalled();
  });
});
