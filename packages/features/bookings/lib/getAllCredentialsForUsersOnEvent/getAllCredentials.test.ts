import {
  addEventTypesToDb,
  addTeamsToDb,
  addUsersToDb,
  createCredentials,
} from "@calcom/testing/lib/bookingScenario/bookingScenario";
import { UserRepository } from "@calcom/features/users/repositories/UserRepository";
import { describe, expect, test, vi } from "vitest";

vi.mock("@calcom/features/users/repositories/UserRepository", () => {
  return {
    UserRepository: vi.fn().mockImplementation(function () {
      return {
        enrichUserWithItsProfile: vi.fn(),
      };
    }),
  };
});
describe("getAllCredentialsIncludeServiceAccountKey", () => {
  test("Get an individual's credentials", async () => {
    const mockEnrichUserWithItsProfile = vi.fn().mockReturnValue({
      profile: null,
    });

    const mockUserRepository = vi.mocked(UserRepository);
    if (mockUserRepository && typeof mockUserRepository.mockImplementation === "function") {
      mockUserRepository.mockImplementation(function () {
        return {
          enrichUserWithItsProfile: mockEnrichUserWithItsProfile,
        } as InstanceType<typeof UserRepository>;
      });
    }

    const getAllCredentialsIncludeServiceAccountKey = (await import("./getAllCredentials"))
      .getAllCredentialsIncludeServiceAccountKey;

    const userCredential = {
      id: 1,
      type: "user-credential",
      userId: 1,
      teamId: null,
      key: {},
      appId: "user-credential",
      invalid: false,
    };
    await createCredentials([
      userCredential,
      { type: "other-user-credential", userId: 2, key: {} },
      { type: "team-credential", teamId: 1, key: {} },
    ]);

    const credentials = await getAllCredentialsIncludeServiceAccountKey(
      {
        id: 1,
        username: "test",
        credentials: [{ ...userCredential, user: { email: "test@test.com" } }],
      },
      {
        userId: 1,
        team: null,
        parentId: null,
        metadata: {},
      }
    );

    expect(credentials).toHaveLength(1);

    expect(credentials).toContainEqual(expect.objectContaining({ type: "user-credential" }));
  });

  describe("Handle CRM credentials", () => {
    describe("If CRM is enabled on the event type", () => {
      describe("With _crm credentials", () => {
        test("For users", async () => {
          const mockEnrichUserWithItsProfile = vi.fn().mockReturnValue({
            profile: null,
          });

          const mockUserRepository = vi.mocked(UserRepository);
          if (mockUserRepository && typeof mockUserRepository.mockImplementation === "function") {
            mockUserRepository.mockImplementation(function () {
              return {
                enrichUserWithItsProfile: mockEnrichUserWithItsProfile,
              } as InstanceType<typeof UserRepository>;
            });
          }

          const getAllCredentialsIncludeServiceAccountKey = (await import("./getAllCredentials"))
            .getAllCredentialsIncludeServiceAccountKey;

          const crmCredential = {
            id: 1,
            type: "pipedrive-crm_crm",
            userId: 1,
            teamId: null,
            key: {},
            appId: "pipedrive-crm",
            invalid: false,
          };

          const otherCredential = {
            id: 2,
            type: "other_credential",
            userId: 1,
            teamId: null,
            key: {},
            appId: "other",
            invalid: false,
          };

          await createCredentials([
            crmCredential,
            {
              type: "pipedrive-crm_crm",
              userId: 2,
              key: {},
            },
            {
              type: "pipedrive-crm_crm",
              teamId: 1,
              key: {},
            },
          ]);

          const credentials = await getAllCredentialsIncludeServiceAccountKey(
            {
              id: 1,
              username: "test",
              credentials: [
                { ...crmCredential, user: { email: "test@test.com" } },
                {
                  ...otherCredential,
                  user: { email: "test@test.com" },
                },
              ],
            },
            {
              userId: 1,
              team: null,
              parentId: null,
              metadata: {
                apps: {
                  "pipedrive-crm": {
                    enabled: true,
                    credentialId: 1,
                    appCategories: ["crm"],
                  },
                },
              },
            }
          );

          expect(credentials).toHaveLength(2);

          expect(credentials).toContainEqual(expect.objectContaining({ userId: 1, type: "pipedrive-crm_crm" }));
        });
        test("For teams", async () => {
          const mockEnrichUserWithItsProfile = vi.fn().mockReturnValue({
            profile: null,
          });

          const mockUserRepository = vi.mocked(UserRepository);
          if (mockUserRepository && typeof mockUserRepository.mockImplementation === "function") {
            mockUserRepository.mockImplementation(function () {
              return {
                enrichUserWithItsProfile: mockEnrichUserWithItsProfile,
              } as InstanceType<typeof UserRepository>;
            });
          }

          const getAllCredentialsIncludeServiceAccountKey = (await import("./getAllCredentials"))
            .getAllCredentialsIncludeServiceAccountKey;

          const crmCredential = {
            id: 1,
            type: "pipedrive-crm_crm",
            userId: 1,
            teamId: null,
            key: {},
            appId: "pipedrive-crm",
            invalid: false,
          };

          await createCredentials([
            crmCredential,
            {
              type: "pipedrive-crm_crm",
              userId: 2,
              key: {},
            },
            {
              id: 3,
              type: "pipedrive-crm_crm",
              teamId: 1,
              key: {},
            },
            {
              type: "other_credential",
              teamId: 1,
              key: {},
            },
          ]);

          const credentials = await getAllCredentialsIncludeServiceAccountKey(
            {
              id: 1,
              username: "test",
              credentials: [{ ...crmCredential, user: { email: "test@test.com" } }],
            },
            {
              userId: null,
              team: {
                id: 1,
                parentId: null,
              },
              parentId: null,
              metadata: {
                apps: {
                  "pipedrive-crm": {
                    enabled: true,
                    credentialId: 3,
                    appCategories: ["crm"],
                  },
                },
              },
            }
          );

          expect(credentials).toHaveLength(2);

          expect(credentials).toContainEqual(expect.objectContaining({ teamId: 1, type: "pipedrive-crm_crm" }));
        });
        test("For child of managed event type", async () => {
          const mockEnrichUserWithItsProfile = vi.fn().mockReturnValue({
            profile: null,
          });

          const mockUserRepository = vi.mocked(UserRepository);
          if (mockUserRepository && typeof mockUserRepository.mockImplementation === "function") {
            mockUserRepository.mockImplementation(function () {
              return {
                enrichUserWithItsProfile: mockEnrichUserWithItsProfile,
              } as InstanceType<typeof UserRepository>;
            });
          }

          const getAllCredentialsIncludeServiceAccountKey = (await import("./getAllCredentials"))
            .getAllCredentialsIncludeServiceAccountKey;

          const teamId = 1;
          const crmCredential = {
            id: 1,
            type: "pipedrive-crm_crm",
            userId: 1,
            teamId: null,
            key: {},
            appId: "pipedrive-crm",
            invalid: false,
          };

          await createCredentials([
            crmCredential,
            {
              type: "pipedrive-crm_crm",
              userId: 2,
              key: {},
            },
            {
              id: 3,
              type: "pipedrive-crm_crm",
              teamId,
              key: {},
            },
            {
              type: "other_credential",
              teamId,
              key: {},
            },
          ]);

          await addTeamsToDb([
            {
              id: teamId,
              name: "Test team",
              slug: "test-team",
            },
          ]);

          const testEventType = await addEventTypesToDb([
            {
              id: 3,
              title: "Test event type",
              slug: "test-event-type",
              length: 15,
              team: {
                connect: {
                  id: teamId,
                },
              },
            },
          ]);

          console.log(testEventType);

          const credentials = await getAllCredentialsIncludeServiceAccountKey(
            {
              id: 1,
              username: "test",
              credentials: [{ ...crmCredential, user: { email: "test@test.com" } }],
            },
            {
              userId: null,
              team: {
                id: 2,
                parentId: 1,
              },
              parentId: 3,
              metadata: {
                apps: {
                  "pipedrive-crm": {
                    enabled: true,
                    credentialId: 3,
                    appCategories: ["crm"],
                  },
                },
              },
            }
          );

          expect(credentials).toHaveLength(2);

          expect(credentials).toContainEqual(expect.objectContaining({ teamId, type: "pipedrive-crm_crm" }));
        });
        test("For an org user", async () => {
          const getAllCredentialsIncludeServiceAccountKey = (await import("./getAllCredentials"))
            .getAllCredentialsIncludeServiceAccountKey;
          const orgId = 3;
          const mockEnrichUserWithItsProfile = vi.fn().mockReturnValue({
            profile: { organizationId: orgId },
          });

          const mockUserRepository = vi.mocked(UserRepository);
          if (mockUserRepository && typeof mockUserRepository.mockImplementation === "function") {
            mockUserRepository.mockImplementation(function () {
              return {
                enrichUserWithItsProfile: mockEnrichUserWithItsProfile,
              } as InstanceType<typeof UserRepository>;
            });
          }

          const crmCredential = {
            id: 1,
            type: "pipedrive-crm_crm",
            userId: 1,
            teamId: null,
            key: {},
            appId: "pipedrive-crm",
            invalid: false,
          };

          const otherCredential = {
            id: 2,
            type: "other_credential",
            userId: 1,
            teamId: null,
            key: {},
            appId: "other",
            invalid: false,
          };

          await createCredentials([
            crmCredential,
            {
              type: "pipedrive-crm_crm",
              userId: 2,
              key: {},
            },
            {
              id: 3,
              type: "pipedrive-crm_crm",
              teamId: orgId,
              key: {},
            },
            {
              type: "other_credential",
              teamId: orgId,
              key: {},
            },
          ]);

          await addTeamsToDb([
            {
              id: orgId,
              name: "Test team",
              slug: "test-team",
            },
          ]);

          await addUsersToDb([
            {
              id: 1,
              email: "test@test.com",
              username: "test",
              schedules: [],
              profiles: {
                create: [{ organizationId: orgId, uid: "MOCK_UID", username: "test" }],
              },
            },
          ]);

          const credentials = await getAllCredentialsIncludeServiceAccountKey(
            {
              id: 1,
              username: "test",
              credentials: [
                { ...crmCredential, user: { email: "test@test.com" } },
                {
                  ...otherCredential,
                  user: { email: "test@test.com" },
                },
              ],
            },
            {
              userId: 1,
              team: null,
              parentId: null,
              metadata: {
                apps: {
                  "pipedrive-crm": {
                    enabled: true,
                    credentialId: 3,
                    appCategories: ["crm"],
                  },
                },
              },
            }
          );

          expect(credentials).toHaveLength(3);

          expect(credentials).toContainEqual(
            expect.objectContaining({ teamId: orgId, type: "pipedrive-crm_crm" })
          );
        });
      });
      describe("Default with _other_calendar credentials", () => {
        test("For users", async () => {
          const getAllCredentialsIncludeServiceAccountKey = (await import("./getAllCredentials"))
            .getAllCredentialsIncludeServiceAccountKey;

          const crmCredential = {
            id: 1,
            type: "salesforce_other_calendar",
            userId: 1,
            teamId: null,
            key: {},
            appId: "pipedrive-crm",
            invalid: false,
          };

          const otherCredential = {
            id: 2,
            type: "other_credential",
            userId: 1,
            teamId: null,
            key: {},
            appId: "other",
            invalid: false,
          };

          await createCredentials([
            crmCredential,
            {
              type: "pipedrive-crm_crm",
              userId: 2,
              key: {},
            },
            {
              type: "pipedrive-crm_crm",
              teamId: 1,
              key: {},
            },
          ]);

          const credentials = await getAllCredentialsIncludeServiceAccountKey(
            {
              id: 1,
              username: "test",
              credentials: [
                { ...crmCredential, user: { email: "test@test.com" } },
                {
                  ...otherCredential,
                  user: { email: "test@test.com" },
                },
              ],
            },
            {
              userId: 1,
              team: null,
              parentId: null,
              metadata: {
                apps: {},
              },
            }
          );

          expect(credentials).toHaveLength(2);

          expect(credentials).toContainEqual(
            expect.objectContaining({ userId: 1, type: "salesforce_other_calendar" })
          );
        });
        test("For teams", async () => {
          const getAllCredentialsIncludeServiceAccountKey = (await import("./getAllCredentials"))
            .getAllCredentialsIncludeServiceAccountKey;

          const crmCredential = {
            id: 1,
            type: "pipedrive-crm_crm",
            userId: 1,
            teamId: null,
            key: {},
            appId: "pipedrive-crm",
            invalid: false,
          };

          await createCredentials([
            crmCredential,
            {
              type: "pipedrive-crm_crm",
              userId: 2,
              key: {},
            },
            {
              id: 3,
              type: "salesforce_other_calendar",
              teamId: 1,
              key: {},
            },
            {
              type: "other_credential",
              teamId: 1,
              key: {},
            },
          ]);

          const credentials = await getAllCredentialsIncludeServiceAccountKey(
            {
              id: 1,
              username: "test",
              credentials: [{ ...crmCredential, user: { email: "test@test.com" } }],
            },
            {
              userId: null,
              team: {
                id: 1,
                parentId: null,
              },
              parentId: null,
              metadata: {
                apps: {},
              },
            }
          );

          expect(credentials).toHaveLength(2);

          expect(credentials).toContainEqual(
            expect.objectContaining({ teamId: 1, type: "salesforce_other_calendar" })
          );
        });
        test("For child of managed event type", async () => {
          const getAllCredentialsIncludeServiceAccountKey = (await import("./getAllCredentials"))
            .getAllCredentialsIncludeServiceAccountKey;

          const teamId = 1;
          const crmCredential = {
            id: 1,
            type: "pipedrive-crm_crm",
            userId: 1,
            teamId: null,
            key: {},
            appId: "pipedrive-crm",
            invalid: false,
          };

          await createCredentials([
            crmCredential,
            {
              type: "pipedrive-crm_crm",
              userId: 2,
              key: {},
            },
            {
              id: 3,
              type: "salesforce_other_calendar",
              teamId,
              key: {},
            },
            {
              type: "other_credential",
              teamId,
              key: {},
            },
          ]);

          await addTeamsToDb([
            {
              id: teamId,
              name: "Test team",
              slug: "test-team",
            },
          ]);

          const testEventType = await addEventTypesToDb([
            {
              id: 3,
              title: "Test event type",
              slug: "test-event-type",
              length: 15,
              team: {
                connect: {
                  id: teamId,
                },
              },
            },
          ]);

          console.log(testEventType);

          const credentials = await getAllCredentialsIncludeServiceAccountKey(
            {
              id: 1,
              username: "test",
              credentials: [{ ...crmCredential, user: { email: "test@test.com" } }],
            },
            {
              userId: null,
              team: {
                id: 2,
                parentId: 1,
              },
              parentId: 3,
              metadata: {
                apps: {},
              },
            }
          );

          expect(credentials).toHaveLength(2);

          expect(credentials).toContainEqual(
            expect.objectContaining({ teamId, type: "salesforce_other_calendar" })
          );
        });
        test("For an org user", async () => {
          const getAllCredentialsIncludeServiceAccountKey = (await import("./getAllCredentials"))
            .getAllCredentialsIncludeServiceAccountKey;
          const orgId = 3;
          const mockEnrichUserWithItsProfile = vi.fn().mockReturnValue({
            profile: { organizationId: orgId },
          });

          const mockUserRepository = vi.mocked(UserRepository);
          if (mockUserRepository && typeof mockUserRepository.mockImplementation === "function") {
            mockUserRepository.mockImplementation(function () {
              return {
                enrichUserWithItsProfile: mockEnrichUserWithItsProfile,
              } as InstanceType<typeof UserRepository>;
            });
          }

          const crmCredential = {
            id: 1,
            type: "pipedrive-crm_crm",
            userId: 1,
            teamId: null,
            key: {},
            appId: "pipedrive-crm",
            invalid: false,
          };

          const otherCredential = {
            id: 2,
            type: "other_credential",
            userId: 1,
            teamId: null,
            key: {},
            appId: "other",
            invalid: false,
          };

          await createCredentials([
            crmCredential,
            {
              type: "pipedrive-crm_crm",
              userId: 2,
              key: {},
            },
            {
              id: 3,
              type: "salesforce_other_calendar",
              teamId: orgId,
              key: {},
            },
            {
              type: "other_credential",
              teamId: orgId,
              key: {},
            },
          ]);

          await addTeamsToDb([
            {
              id: orgId,
              name: "Test team",
              slug: "test-team",
            },
          ]);

          await addUsersToDb([
            {
              id: 1,
              email: "test@test.com",
              username: "test",
              schedules: [],
              profiles: {
                create: [{ organizationId: orgId, uid: "MOCK_UID", username: "test" }],
              },
            },
          ]);

          const credentials = await getAllCredentialsIncludeServiceAccountKey(
            {
              id: 1,
              username: "test",
              credentials: [
                { ...crmCredential, user: { email: "test@test.com" } },
                {
                  ...otherCredential,
                  user: { email: "test@test.com" },
                },
              ],
            },
            {
              userId: 1,
              team: null,
              parentId: null,
              metadata: {
                apps: {},
              },
            }
          );

          expect(credentials).toHaveLength(3);

          expect(credentials).toContainEqual(
            expect.objectContaining({ teamId: orgId, type: "salesforce_other_calendar" })
          );
        });
      });
    });
  });
});

describe("CRM app pointing to a deleted credential", () => {
  const setup = async () => {
    vi.mocked(UserRepository).mockImplementation(function () {
      return {
        enrichUserWithItsProfile: vi.fn().mockReturnValue({ profile: null }),
      } as InstanceType<typeof UserRepository>;
    });
    return (await import("./getAllCredentials")).getAllCredentialsIncludeServiceAccountKey;
  };

  const reinstalledCredential = {
    id: 128,
    type: "pipedrive-crm_crm",
    userId: 20,
    teamId: null,
    key: {},
    appId: "pipedrive-crm",
    invalid: false,
  };

  const eventTypeBoundTo = (credentialId: number, enabled = true) => ({
    userId: 20,
    team: null,
    parentId: null,
    metadata: {
      apps: {
        "pipedrive-crm": { enabled, credentialId, appCategories: ["crm"] },
      },
    },
  });

  const user = (credentials: (typeof reinstalledCredential)[]) => ({
    id: 20,
    username: "test",
    email: "test@test.com",
    credentials: credentials.map((credential) => ({ ...credential, user: { email: "test@test.com" } })),
  });

  test("falls back to the user's current installation of the same app", async () => {
    const getAllCredentialsIncludeServiceAccountKey = await setup();

    const credentials = await getAllCredentialsIncludeServiceAccountKey(
      user([reinstalledCredential]),
      eventTypeBoundTo(126)
    );

    expect(credentials).toContainEqual(expect.objectContaining({ id: 128, type: "pipedrive-crm_crm" }));
  });

  test("prefers the OAuth credential over a legacy empty _other_calendar one", async () => {
    const getAllCredentialsIncludeServiceAccountKey = await setup();
    const legacy = { ...reinstalledCredential, id: 125, type: "pipedrive-crm_other_calendar" };

    const credentials = await getAllCredentialsIncludeServiceAccountKey(
      user([legacy, reinstalledCredential]),
      eventTypeBoundTo(126)
    );

    expect(credentials.map((credential) => credential.id)).toContain(128);
  });

  test("does not fall back when the app is disabled on the event type", async () => {
    const getAllCredentialsIncludeServiceAccountKey = await setup();

    const credentials = await getAllCredentialsIncludeServiceAccountKey(
      user([reinstalledCredential]),
      eventTypeBoundTo(126, false)
    );

    expect(credentials).not.toContainEqual(expect.objectContaining({ type: "pipedrive-crm_crm" }));
  });

  test("keeps only the selected installation when it still exists", async () => {
    const getAllCredentialsIncludeServiceAccountKey = await setup();
    const other = { ...reinstalledCredential, id: 129 };

    const credentials = await getAllCredentialsIncludeServiceAccountKey(
      user([reinstalledCredential, other]),
      eventTypeBoundTo(128)
    );

    expect(credentials.map((credential) => credential.id)).toEqual([128]);
  });
});
