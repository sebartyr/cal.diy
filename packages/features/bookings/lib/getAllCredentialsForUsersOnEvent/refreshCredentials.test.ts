import type { CredentialForCalendarService } from "@calcom/types/Credential";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { findManyMock, findUniqueMock } = vi.hoisted(() => ({
  findManyMock: vi.fn(),
  findUniqueMock: vi.fn(),
}));

vi.mock("@calcom/prisma", () => {
  const prismaMock = { credential: { findMany: findManyMock, findUnique: findUniqueMock } };
  return { default: prismaMock, prisma: prismaMock };
});

import { refreshCredentials } from "./refreshCredentials";

const buildCredential = (
  id: number,
  overrides: Partial<CredentialForCalendarService> = {}
): CredentialForCalendarService => ({
  id,
  appId: "google-calendar",
  type: "google_calendar",
  userId: 1,
  user: { email: "organizer@example.com" },
  teamId: null,
  key: { access_token: `stale-${id}` },
  encryptedKey: null,
  invalid: false,
  delegationCredentialId: null,
  ...overrides,
});

describe("refreshCredentials", () => {
  beforeEach(() => {
    findManyMock.mockReset();
    findUniqueMock.mockReset();
  });

  it("loads every non-delegation credential in a single query", async () => {
    findManyMock.mockResolvedValue([]);

    await refreshCredentials([buildCredential(1), buildCredential(2), buildCredential(3)]);

    expect(findManyMock).toHaveBeenCalledTimes(1);
    expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: [1, 2, 3] } } }));
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("returns the fresh credentials in the input order, whatever order the database returns", async () => {
    const fresh1 = buildCredential(1, { key: { access_token: "fresh-1" } });
    const fresh2 = buildCredential(2, { key: { access_token: "fresh-2" } });
    findManyMock.mockResolvedValue([fresh2, fresh1]);

    const result = await refreshCredentials([buildCredential(1), buildCredential(2)]);

    expect(result).toEqual([fresh1, fresh2]);
  });

  it("keeps the original credential when it no longer exists in the database", async () => {
    const fresh1 = buildCredential(1, { key: { access_token: "fresh-1" } });
    const missing = buildCredential(2);
    findManyMock.mockResolvedValue([fresh1]);

    const result = await refreshCredentials([buildCredential(1), missing]);

    expect(result).toEqual([fresh1, missing]);
  });

  it("does not query the database for delegation credentials", async () => {
    const result = await refreshCredentials([buildCredential(-1)]);

    expect(findManyMock).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });
});
