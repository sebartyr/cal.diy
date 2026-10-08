import { beforeEach, describe, expect, it, vi } from "vitest";

const { recordAdminActionMock, recordAdminDenialMock } = vi.hoisted(() => ({
  recordAdminActionMock: vi.fn(),
  recordAdminDenialMock: vi.fn(),
}));

vi.mock("@calcom/features/audit-log/adminAuditLog", () => ({
  recordAdminAction: recordAdminActionMock,
  recordAdminDenial: recordAdminDenialMock,
}));

import type {
  UserPermissionRoleDto,
  UserRoleDto,
  UserRoleRepository,
} from "@calcom/features/users/repositories/UserRoleRepository";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { SET_USER_ROLE_AUDIT_PATH, UserRoleService } from "./UserRoleService";

const ACTOR = { id: 1, email: "root@example.com" };

function createFakeRepository(users: UserRoleDto[]) {
  const store = new Map(users.map((user) => [user.id, { ...user }]));
  const fake = {
    findById: vi.fn(async ({ id }: { id: number }) => store.get(id) ?? null),
    countByRole: vi.fn(
      async ({ role }: { role: UserPermissionRoleDto }) =>
        [...store.values()].filter((user) => user.role === role).length
    ),
    updateRole: vi.fn(async ({ id, role }: { id: number; role: UserPermissionRoleDto }) => {
      const user = store.get(id);
      if (!user) throw new Error(`missing user ${id}`);
      user.role = role;
      return { ...user };
    }),
    withSerializableTransaction: vi.fn(async <T>(fn: (repository: UserRoleRepository) => Promise<T>) =>
      fn(fake as unknown as UserRoleRepository)
    ),
  };
  return { fake, store, repository: fake as unknown as UserRoleRepository };
}

function buildService(users: UserRoleDto[]) {
  const { fake, store, repository } = createFakeRepository(users);
  return { service: new UserRoleService({ userRoleRepository: repository }), fake, store };
}

async function expectErrorCode(promise: Promise<unknown>, code: ErrorCode) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ErrorWithCode);
  expect((error as ErrorWithCode).code).toBe(code);
}

describe("UserRoleService.setUserRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses to change the actor's own role and records a denial", async () => {
    const { service, fake } = buildService([
      { id: ACTOR.id, role: "ADMIN", locked: false },
      { id: 2, role: "ADMIN", locked: false },
    ]);

    await expectErrorCode(
      service.setUserRole({ actor: ACTOR, targetUserId: ACTOR.id, role: "USER" }),
      ErrorCode.Forbidden
    );

    expect(fake.withSerializableTransaction).not.toHaveBeenCalled();
    expect(fake.updateRole).not.toHaveBeenCalled();
    expect(recordAdminActionMock).not.toHaveBeenCalled();
    expect(recordAdminDenialMock).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: ACTOR.id, path: SET_USER_ROLE_AUDIT_PATH })
    );
  });

  it("refuses to demote the last remaining admin", async () => {
    // The actor is a USER here only to isolate the last-admin rule from the self-change rule.
    const { service, fake, store } = buildService([
      { id: ACTOR.id, role: "USER", locked: false },
      { id: 2, role: "ADMIN", locked: false },
    ]);

    await expectErrorCode(
      service.setUserRole({ actor: ACTOR, targetUserId: 2, role: "USER" }),
      ErrorCode.BadRequest
    );

    expect(fake.withSerializableTransaction).toHaveBeenCalledTimes(1);
    expect(fake.countByRole).toHaveBeenCalledWith({ role: "ADMIN" });
    expect(fake.updateRole).not.toHaveBeenCalled();
    expect(store.get(2)?.role).toBe("ADMIN");
    expect(recordAdminActionMock).not.toHaveBeenCalled();
    expect(recordAdminDenialMock).toHaveBeenCalledWith(
      expect.objectContaining({ reason: expect.stringContaining("last remaining admin") })
    );
  });

  it("refuses to change the role of a locked user", async () => {
    const { service, fake } = buildService([
      { id: ACTOR.id, role: "ADMIN", locked: false },
      { id: 2, role: "USER", locked: true },
    ]);

    await expectErrorCode(
      service.setUserRole({ actor: ACTOR, targetUserId: 2, role: "ADMIN" }),
      ErrorCode.BadRequest
    );

    expect(fake.updateRole).not.toHaveBeenCalled();
    expect(recordAdminActionMock).not.toHaveBeenCalled();
    expect(recordAdminDenialMock).toHaveBeenCalledWith(
      expect.objectContaining({ context: { targetUserId: 2, to: "ADMIN" } })
    );
  });

  it("throws NotFound for an unknown user", async () => {
    const { service } = buildService([{ id: ACTOR.id, role: "ADMIN", locked: false }]);

    await expectErrorCode(
      service.setUserRole({ actor: ACTOR, targetUserId: 999, role: "ADMIN" }),
      ErrorCode.NotFound
    );
  });

  it("is a no-op when the role is unchanged", async () => {
    const { service, fake } = buildService([
      { id: ACTOR.id, role: "ADMIN", locked: false },
      { id: 2, role: "ADMIN", locked: false },
    ]);

    const result = await service.setUserRole({ actor: ACTOR, targetUserId: 2, role: "ADMIN" });

    expect(result).toEqual({ userId: 2, from: "ADMIN", to: "ADMIN", changed: false });
    expect(fake.updateRole).not.toHaveBeenCalled();
    expect(recordAdminActionMock).not.toHaveBeenCalled();
  });

  it("promotes a user inside a serializable transaction and audits from/to", async () => {
    const { service, fake, store } = buildService([
      { id: ACTOR.id, role: "ADMIN", locked: false },
      { id: 2, role: "USER", locked: false },
    ]);

    const result = await service.setUserRole({ actor: ACTOR, targetUserId: 2, role: "ADMIN" });

    expect(result).toEqual({ userId: 2, from: "USER", to: "ADMIN", changed: true });
    expect(fake.withSerializableTransaction).toHaveBeenCalledTimes(1);
    expect(fake.updateRole).toHaveBeenCalledWith({ id: 2, role: "ADMIN" });
    expect(store.get(2)?.role).toBe("ADMIN");
    expect(recordAdminActionMock).toHaveBeenCalledWith({
      actorUserId: ACTOR.id,
      actorEmail: ACTOR.email,
      path: SET_USER_ROLE_AUDIT_PATH,
      outcome: "granted",
      context: { targetUserId: 2, from: "USER", to: "ADMIN" },
    });
    expect(recordAdminDenialMock).not.toHaveBeenCalled();
  });

  it("demotes an admin when another admin remains", async () => {
    const { service, store } = buildService([
      { id: ACTOR.id, role: "ADMIN", locked: false },
      { id: 2, role: "ADMIN", locked: false },
    ]);

    const result = await service.setUserRole({ actor: ACTOR, targetUserId: 2, role: "USER" });

    expect(result.changed).toBe(true);
    expect(store.get(2)?.role).toBe("USER");
    expect(recordAdminActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ context: { targetUserId: 2, from: "ADMIN", to: "USER" } })
    );
  });

  it("does not audit a success when the transaction fails", async () => {
    const { service, fake } = buildService([
      { id: ACTOR.id, role: "ADMIN", locked: false },
      { id: 2, role: "USER", locked: false },
    ]);
    fake.updateRole.mockRejectedValueOnce(new Error("could not serialize access"));

    await expect(service.setUserRole({ actor: ACTOR, targetUserId: 2, role: "ADMIN" })).rejects.toThrow(
      "could not serialize access"
    );
    expect(recordAdminActionMock).not.toHaveBeenCalled();
  });
});

describe("UserRoleService.isActiveSystemAdmin", () => {
  it.each([
    [{ id: 2, role: "ADMIN", locked: false } as UserRoleDto, true],
    [{ id: 2, role: "ADMIN", locked: true } as UserRoleDto, false],
    [{ id: 2, role: "USER", locked: false } as UserRoleDto, false],
  ])("reads the role from the repository (%o -> %s)", async (user, expected) => {
    const { service } = buildService([user]);
    await expect(service.isActiveSystemAdmin(2)).resolves.toBe(expected);
  });

  it("returns false for an unknown user", async () => {
    const { service } = buildService([]);
    await expect(service.isActiveSystemAdmin(2)).resolves.toBe(false);
  });
});
