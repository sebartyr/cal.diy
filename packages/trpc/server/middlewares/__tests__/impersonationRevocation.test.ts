import type { PrismaClient } from "@calcom/prisma";
import type { NextApiRequest } from "next";
import { createMocks } from "node-mocks-http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockReset } from "vitest-mock-extended";

const { prismaMock, getTokenMock } = await vi.hoisted(async () => {
  const { mockDeep } = await import("vitest-mock-extended");
  return { prismaMock: mockDeep<PrismaClient>(), getTokenMock: vi.fn() };
});

vi.mock("@calcom/prisma", () => ({ default: prismaMock, prisma: prismaMock, readonlyPrisma: prismaMock }));
vi.mock("next-auth/jwt", () => ({ getToken: getTokenMock }));
vi.mock("@sentry/nextjs", () => ({ setUser: vi.fn() }));
vi.mock("@calcom/features/users/repositories/UserRepository", () => ({
  UserRepository: class {
    async enrichUserWithTheProfile<T>({ user }: { user: T }) {
      return { ...user, profile: null };
    }
    async findUnlockedUserForSession({ userId }: { userId: number }) {
      return { id: userId, uuid: "target-uuid", email: "target@example.com", role: "USER", metadata: {} };
    }
  },
}));

import { createContextInner } from "../../createContext";
import authedProcedure from "../../procedures/authedProcedure";
import { createCallerFactory, router } from "../../trpc";

const createCaller = createCallerFactory(router({ regular: authedProcedure.query(() => "regular-ok") }));

const target = { id: 2, uuid: "target-uuid", email: "target@example.com", role: "USER", locked: false };

async function callAsImpersonatedTarget(author: { role: string; locked: boolean }, tokenSuffix: string) {
  getTokenMock.mockResolvedValue({
    sub: "2",
    email: "target@example.com",
    role: "USER",
    upId: `usr-2-${tokenSuffix}`,
    impersonatedBy: { id: 1, uuid: "admin-uuid", role: "ADMIN" },
    impersonationExpiresAt: Math.floor(Date.now() / 1000) + 600,
  });
  prismaMock.user.findUnique
    .mockResolvedValueOnce(target as never)
    .mockResolvedValueOnce({ id: 1, uuid: "admin-uuid", ...author } as never);

  const { req } = createMocks<NextApiRequest>({ method: "GET" });
  // No session in the context: getUserSession resolves it through the real getServerSession.
  const caller = createCaller(await createContextInner({ locale: "en", session: null, req }));
  return caller.regular();
}

beforeEach(() => {
  mockReset(prismaMock);
  getTokenMock.mockReset();
});

describe("impersonated sessions are revoked when the author stops being an active admin", () => {
  it("serves ordinary procedures while the author is an active admin", async () => {
    await expect(callAsImpersonatedTarget({ role: "ADMIN", locked: false }, "a")).resolves.toBe("regular-ok");
  });

  it("answers UNAUTHORIZED once the author is demoted", async () => {
    await expect(callAsImpersonatedTarget({ role: "USER", locked: false }, "b")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("answers UNAUTHORIZED once the author is locked", async () => {
    await expect(callAsImpersonatedTarget({ role: "ADMIN", locked: true }, "c")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
