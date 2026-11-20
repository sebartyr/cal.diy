/**
 * A locked user may still hold a JWT issued before the lock (valid up to 30 days):
 * getServerSession must refuse it, as sign-in does.
 */
import type { NextApiRequest } from "next";
import type { RequestMethod } from "node-mocks-http";
import { createMocks } from "node-mocks-http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  prismaMock,
  resetPrismaMock,
  createLoggerMock,
  createPrismaMock,
  createUserRepositoryMock,
  createAvatarUrlMock,
  createSafeStringifyMock,
  createGetTokenMock,
  createMockUser,
  createMockToken,
}: typeof import("../__mocks__/getServerSession.mocks") = await vi.hoisted(
  async () => await import("../__mocks__/getServerSession.mocks")
);

vi.mock("@calcom/lib/logger", createLoggerMock);
vi.mock("@calcom/prisma", createPrismaMock);
vi.mock("@calcom/features/users/repositories/UserRepository", createUserRepositoryMock);
vi.mock("@calcom/lib/getAvatarUrl", createAvatarUrlMock);
vi.mock("@calcom/lib/safeStringify", createSafeStringifyMock);
vi.mock("next-auth/jwt", createGetTokenMock);

import { getToken } from "next-auth/jwt";
import { getServerSession } from "./getServerSession";

type MockNextApiRequest = ReturnType<typeof createMocks<NextApiRequest>>["req"];

function createMockRequest(method: RequestMethod = "GET"): MockNextApiRequest {
  const { req } = createMocks<NextApiRequest>({ method });
  return req;
}

function setupGetTokenMock(tokenData: object | null): void {
  vi.mocked(getToken).mockResolvedValue(tokenData as Record<string, unknown> | null);
}

describe("getServerSession and locked accounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPrismaMock();
  });

  it("refuses a session to a locked user", async () => {
    const lockedUser = createMockUser({ id: 42, locked: true } as Partial<
      Parameters<typeof createMockUser>[0]
    >);
    setupGetTokenMock(createMockToken({ sub: "42", upId: "usr-42" }));
    prismaMock.user.findUnique.mockResolvedValue(lockedUser);

    const session = await getServerSession({ req: createMockRequest() });

    expect(session).toBeNull();
  });

  it("still returns a session to an unlocked user", async () => {
    const activeUser = createMockUser({ id: 43, locked: false } as Partial<
      Parameters<typeof createMockUser>[0]
    >);
    setupGetTokenMock(createMockToken({ sub: "43", upId: "usr-43" }));
    prismaMock.user.findUnique.mockResolvedValue(activeUser);

    const session = await getServerSession({ req: createMockRequest() });

    expect(session).not.toBeNull();
    expect(session?.user.id).toBe(43);
  });
});
