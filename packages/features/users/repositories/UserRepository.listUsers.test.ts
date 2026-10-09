import { UserRepository } from "@calcom/features/users/repositories/UserRepository";
import type { PrismaClient } from "@calcom/prisma";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@calcom/app-store/delegationCredential", () => ({
  enrichHostsWithDelegationCredentials: vi.fn(),
  getUsersCredentialsIncludeServiceAccountKey: vi.fn(),
  getCredentialForSelectedCalendar: vi.fn(),
}));

vi.mock("@calcom/i18n/server", () => ({ getTranslation: vi.fn() }));

const user = (id: number) => ({
  id,
  locked: false,
  email: `user${id}@example.com`,
  username: `user${id}`,
  name: null,
  timeZone: "UTC",
  role: "USER",
  profiles: [],
});

describe("UserRepository.listUsers", () => {
  const findMany = vi.fn();
  const count = vi.fn();
  const repo = new UserRepository({ user: { findMany, count } } as unknown as PrismaClient);

  beforeEach(() => {
    vi.clearAllMocks();
    count.mockResolvedValue(42);
  });

  test("counts the matching users by default", async () => {
    findMany.mockResolvedValue([user(1), user(2), user(3)]);

    const result = await repo.listUsers({ searchTerm: "user", cursor: null, limit: 2 });

    expect(count).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledWith({ where: findMany.mock.calls[0][0].where });
    expect(result).toEqual({ users: [user(1), user(2)], nextCursor: 2, total: 42 });
  });

  test("skips the count but keeps the cursor when withTotal is false", async () => {
    findMany.mockResolvedValueOnce([user(1), user(2), user(3)]).mockResolvedValueOnce([user(3)]);

    const firstPage = await repo.listUsers({ searchTerm: "user", cursor: null, limit: 2, withTotal: false });
    const lastPage = await repo.listUsers({
      searchTerm: "user",
      cursor: firstPage.nextCursor,
      limit: 2,
      withTotal: false,
    });

    expect(count).not.toHaveBeenCalled();
    expect(firstPage).toEqual({ users: [user(1), user(2)], nextCursor: 2, total: undefined });
    expect(lastPage).toEqual({ users: [user(3)], nextCursor: undefined, total: undefined });
    expect(findMany.mock.calls[1][0]).toMatchObject({ cursor: { id: 2 }, skip: 1, take: 3 });
  });

  test("returns the length as total without counting when there is no limit", async () => {
    findMany.mockResolvedValue([user(1), user(2)]);

    const result = await repo.listUsers({ cursor: null });

    expect(count).not.toHaveBeenCalled();
    expect(result.total).toBe(2);
  });
});
