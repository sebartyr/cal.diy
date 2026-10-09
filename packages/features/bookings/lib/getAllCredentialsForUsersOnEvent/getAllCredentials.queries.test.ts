import type { CredentialPayload } from "@calcom/types/Credential";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { credentialFindManyMock, teamFindFirstMock, teamFindUniqueMock, enrichUserWithItsProfileMock } =
  vi.hoisted(() => ({
    credentialFindManyMock: vi.fn(),
    teamFindFirstMock: vi.fn(),
    teamFindUniqueMock: vi.fn(),
    enrichUserWithItsProfileMock: vi.fn(),
  }));

vi.mock("@calcom/prisma", () => {
  const prismaMock = {
    credential: { findMany: credentialFindManyMock },
    team: { findFirst: teamFindFirstMock, findUnique: teamFindUniqueMock },
  };
  return { default: prismaMock, prisma: prismaMock };
});

vi.mock("@calcom/features/users/repositories/UserRepository", () => ({
  UserRepository: vi.fn().mockImplementation(function () {
    return { enrichUserWithItsProfile: enrichUserWithItsProfileMock };
  }),
}));

import { getAllCredentialsIncludeServiceAccountKey } from "./getAllCredentials";

const buildCredential = (id: number, type: string, overrides: Partial<CredentialPayload> = {}) =>
  ({
    id,
    appId: type,
    type,
    userId: null,
    user: null,
    teamId: null,
    key: {},
    encryptedKey: null,
    invalid: false,
    delegationCredentialId: null,
    ...overrides,
  }) satisfies CredentialPayload;

describe("getAllCredentialsIncludeServiceAccountKey queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("orders credentials user, team, parent team then org without mutating the user's credentials", async () => {
    const userCredentials = [buildCredential(1, "user-credential", { userId: 1 })];
    credentialFindManyMock.mockResolvedValue([buildCredential(2, "team-credential", { teamId: 10 })]);
    teamFindFirstMock.mockResolvedValue({
      credentials: [buildCredential(3, "parent-team-credential", { teamId: 20 })],
    });
    enrichUserWithItsProfileMock.mockResolvedValue({ profile: { organizationId: 30 } });
    teamFindUniqueMock.mockResolvedValue({
      credentials: [buildCredential(4, "org-credential", { teamId: 30 })],
    });

    const credentials = await getAllCredentialsIncludeServiceAccountKey(
      { id: 1, username: "test", email: "test@example.com", credentials: userCredentials },
      { userId: 1, team: { id: 10, parentId: 30 }, parentId: 5, metadata: {} }
    );

    expect(credentials.map((credential) => credential.type)).toEqual([
      "user-credential",
      "team-credential",
      "parent-team-credential",
      "org-credential",
    ]);
    expect(userCredentials).toHaveLength(1);
    expect(credentialFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: { teamId: 10 } }));
    expect(teamFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { eventTypes: { some: { id: 5 } } } })
    );
    expect(teamFindUniqueMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 30 } }));
  });

  it("starts the team, parent team and profile lookups before any of them resolves", async () => {
    const pending: Array<() => void> = [];
    const deferred = <T>(value: T) =>
      new Promise<T>((resolve) => {
        pending.push(() => resolve(value));
      });
    credentialFindManyMock.mockImplementation(() => deferred([]));
    teamFindFirstMock.mockImplementation(() => deferred(null));
    enrichUserWithItsProfileMock.mockImplementation(() => deferred({ profile: null }));

    const resultPromise = getAllCredentialsIncludeServiceAccountKey(
      { id: 1, username: "test", email: "test@example.com", credentials: [] },
      { userId: 1, team: { id: 10, parentId: null }, parentId: 5, metadata: {} }
    );

    await Promise.resolve();
    expect(credentialFindManyMock).toHaveBeenCalledTimes(1);
    expect(teamFindFirstMock).toHaveBeenCalledTimes(1);
    expect(enrichUserWithItsProfileMock).toHaveBeenCalledTimes(1);

    for (const resolve of pending) resolve();
    await expect(resultPromise).resolves.toEqual([]);
    expect(teamFindUniqueMock).not.toHaveBeenCalled();
  });

  it("skips the team and parent team queries for a personal event type", async () => {
    enrichUserWithItsProfileMock.mockResolvedValue({ profile: null });
    const userCredentials = [buildCredential(1, "user-credential", { userId: 1 })];

    const credentials = await getAllCredentialsIncludeServiceAccountKey(
      { id: 1, username: "test", email: "test@example.com", credentials: userCredentials },
      { userId: 1, team: null, parentId: null, metadata: {} }
    );

    expect(credentials).toEqual(userCredentials);
    expect(credentials).not.toBe(userCredentials);
    expect(credentialFindManyMock).not.toHaveBeenCalled();
    expect(teamFindFirstMock).not.toHaveBeenCalled();
    expect(teamFindUniqueMock).not.toHaveBeenCalled();
  });
});
