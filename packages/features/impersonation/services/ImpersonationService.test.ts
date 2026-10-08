import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { recordAdminActionMock, recordAdminDenialMock } = vi.hoisted(() => ({
  recordAdminActionMock: vi.fn(),
  recordAdminDenialMock: vi.fn(),
}));

vi.mock("@calcom/features/audit-log/adminAuditLog", () => ({
  recordAdminAction: recordAdminActionMock,
  recordAdminDenial: recordAdminDenialMock,
}));

import type { ImpersonationRepository } from "@calcom/features/impersonation/repositories/ImpersonationRepository";
import type { UserRepository } from "@calcom/features/users/repositories/UserRepository";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import type { ImpersonationActor, ImpersonationIdentity } from "./ImpersonationService";
import { ImpersonationService } from "./ImpersonationService";

const buildIdentity = (overrides: Partial<ImpersonationIdentity> = {}): ImpersonationIdentity => ({
  id: 2,
  uuid: "target-uuid",
  username: "target",
  name: "Target",
  email: "target@example.com",
  role: "USER",
  locked: false,
  locale: "en",
  twoFactorEnabled: false,
  ...overrides,
});

const admin = buildIdentity({
  id: 1,
  uuid: "admin-uuid",
  username: "admin",
  name: "Admin",
  email: "admin@example.com",
  role: "ADMIN",
  twoFactorEnabled: true,
});

const adminActor: ImpersonationActor = { userId: 1, sessionRole: "ADMIN", impersonatedById: null };

function setup({
  adminIdentity = admin,
  target = buildIdentity(),
}: {
  adminIdentity?: ImpersonationIdentity | null;
  target?: ImpersonationIdentity | null;
} = {}) {
  const findAuthIdentityById = vi.fn(async ({ id }: { id: number }) =>
    adminIdentity && id === adminIdentity.id ? adminIdentity : null
  );
  const findAuthIdentityByUsernameOrEmail = vi.fn(async () => target);
  const create = vi.fn(async () => ({ id: 10, createdAt: new Date() }));

  const userRepository = { findAuthIdentityById, findAuthIdentityByUsernameOrEmail } as Pick<
    UserRepository,
    "findAuthIdentityById" | "findAuthIdentityByUsernameOrEmail"
  > as UserRepository;
  const impersonationRepository = { create } as Pick<
    ImpersonationRepository,
    "create"
  > as ImpersonationRepository;

  const service = new ImpersonationService({ userRepository, impersonationRepository });
  return { service, create, findAuthIdentityByUsernameOrEmail };
}

async function expectErrorCode(promise: Promise<unknown>, code: ErrorCode) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e
  );
  expect(error).toBeInstanceOf(ErrorWithCode);
  expect((error as ErrorWithCode).code).toBe(code);
}

beforeEach(() => {
  recordAdminActionMock.mockReset();
  recordAdminDenialMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("ImpersonationService.startImpersonation", () => {
  it("logs the impersonation and returns the target with the impersonator", async () => {
    const { service, create, findAuthIdentityByUsernameOrEmail } = setup();

    const result = await service.startImpersonation({ actor: adminActor, usernameOrEmail: "  Target " });

    expect(findAuthIdentityByUsernameOrEmail).toHaveBeenCalledWith({ usernameOrEmail: "target" });
    expect(create).toHaveBeenCalledWith({ impersonatedUserId: 2, impersonatedById: 1 });
    expect(result.user.id).toBe(2);
    expect(result.impersonatedBy).toEqual({ id: 1, uuid: "admin-uuid", role: "ADMIN" });
    expect(recordAdminActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 1,
        path: "auth.impersonation.start",
        outcome: "granted",
        context: { targetUserId: 2 },
      })
    );
  });

  it("rejects requests without a session", async () => {
    const { service, create } = setup();
    await expectErrorCode(
      service.startImpersonation({ actor: null, usernameOrEmail: "target" }),
      ErrorCode.Unauthorized
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects nested impersonation", async () => {
    const { service, create } = setup();
    await expectErrorCode(
      service.startImpersonation({
        actor: { userId: 3, sessionRole: "USER", impersonatedById: 1 },
        usernameOrEmail: "target",
      }),
      ErrorCode.Forbidden
    );
    expect(create).not.toHaveBeenCalled();
    expect(recordAdminDenialMock).toHaveBeenCalledOnce();
  });

  it("rejects a session whose token role is not ADMIN (e.g. INACTIVE_ADMIN)", async () => {
    const { service, create } = setup();
    await expectErrorCode(
      service.startImpersonation({
        actor: { ...adminActor, sessionRole: "INACTIVE_ADMIN" },
        usernameOrEmail: "target",
      }),
      ErrorCode.Forbidden
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("re-reads the role from the database and rejects a demoted admin", async () => {
    const { service, create } = setup({ adminIdentity: { ...admin, role: "USER" } });
    await expectErrorCode(
      service.startImpersonation({ actor: adminActor, usernameOrEmail: "target" }),
      ErrorCode.Forbidden
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects an admin that no longer exists or is locked", async () => {
    await expectErrorCode(
      setup({ adminIdentity: null }).service.startImpersonation({
        actor: adminActor,
        usernameOrEmail: "target",
      }),
      ErrorCode.Forbidden
    );
    await expectErrorCode(
      setup({ adminIdentity: { ...admin, locked: true } }).service.startImpersonation({
        actor: adminActor,
        usernameOrEmail: "target",
      }),
      ErrorCode.Forbidden
    );
  });

  it("requires 2FA when REQUIRE_2FA_FOR_ADMIN is enabled", async () => {
    vi.stubEnv("REQUIRE_2FA_FOR_ADMIN", "true");
    const { service, create } = setup({ adminIdentity: { ...admin, twoFactorEnabled: false } });
    await expectErrorCode(
      service.startImpersonation({ actor: adminActor, usernameOrEmail: "target" }),
      ErrorCode.Forbidden
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("does not require 2FA when REQUIRE_2FA_FOR_ADMIN is disabled", async () => {
    vi.stubEnv("REQUIRE_2FA_FOR_ADMIN", "false");
    const { service, create } = setup({ adminIdentity: { ...admin, twoFactorEnabled: false } });
    await service.startImpersonation({ actor: adminActor, usernameOrEmail: "target" });
    expect(create).toHaveBeenCalledOnce();
  });

  it("rejects an empty identifier", async () => {
    const { service } = setup();
    await expectErrorCode(
      service.startImpersonation({ actor: adminActor, usernameOrEmail: "   " }),
      ErrorCode.BadRequest
    );
  });

  it("rejects an unknown target", async () => {
    const { service, create } = setup({ target: null });
    await expectErrorCode(
      service.startImpersonation({ actor: adminActor, usernameOrEmail: "ghost" }),
      ErrorCode.NotFound
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects self impersonation", async () => {
    const { service, create } = setup({ target: admin });
    await expectErrorCode(
      service.startImpersonation({ actor: adminActor, usernameOrEmail: "admin" }),
      ErrorCode.BadRequest
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a locked target", async () => {
    const { service, create } = setup({ target: buildIdentity({ locked: true }) });
    await expectErrorCode(
      service.startImpersonation({ actor: adminActor, usernameOrEmail: "target" }),
      ErrorCode.Forbidden
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects an ADMIN target", async () => {
    const { service, create } = setup({ target: buildIdentity({ id: 5, role: "ADMIN" }) });
    await expectErrorCode(
      service.startImpersonation({ actor: adminActor, usernameOrEmail: "other-admin" }),
      ErrorCode.Forbidden
    );
    expect(create).not.toHaveBeenCalled();
    expect(recordAdminDenialMock).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: 1, path: "auth.impersonation.start" })
    );
  });
});

describe("ImpersonationService.stopImpersonation", () => {
  const impersonatedActor: ImpersonationActor = { userId: 2, sessionRole: "USER", impersonatedById: 1 };

  it("returns the impersonating admin reloaded from the database and logs the end", async () => {
    const { service, create } = setup();
    const result = await service.stopImpersonation({ actor: impersonatedActor, returnToId: 1 });

    expect(result.user).toEqual(admin);
    expect(create).not.toHaveBeenCalled();
    expect(recordAdminActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 1,
        path: "auth.impersonation.stop",
        context: { impersonatedUserId: 2 },
      })
    );
  });

  it("rejects when the session is not impersonated", async () => {
    const { service } = setup();
    await expectErrorCode(
      service.stopImpersonation({ actor: adminActor, returnToId: 1 }),
      ErrorCode.Unauthorized
    );
    await expectErrorCode(service.stopImpersonation({ actor: null, returnToId: 1 }), ErrorCode.Unauthorized);
  });

  it("rejects a returnToId that is not the impersonating admin", async () => {
    const { service } = setup();
    await expectErrorCode(
      service.stopImpersonation({ actor: impersonatedActor, returnToId: 42 }),
      ErrorCode.Forbidden
    );
    expect(recordAdminActionMock).not.toHaveBeenCalled();
    expect(recordAdminDenialMock).toHaveBeenCalledOnce();
  });

  it("rejects when the admin account was deleted or locked meanwhile", async () => {
    await expectErrorCode(
      setup({ adminIdentity: null }).service.stopImpersonation({ actor: impersonatedActor, returnToId: 1 }),
      ErrorCode.Forbidden
    );
    await expectErrorCode(
      setup({ adminIdentity: { ...admin, locked: true } }).service.stopImpersonation({
        actor: impersonatedActor,
        returnToId: 1,
      }),
      ErrorCode.Forbidden
    );
  });
});
