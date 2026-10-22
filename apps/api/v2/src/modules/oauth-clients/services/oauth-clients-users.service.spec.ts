// @calcom/platform-libraries pulls in ESM-only dependencies that Jest's CommonJS runtime cannot load;
// slugify is replaced by a minimal equivalent for the characters used in these tests.
jest.mock(
  "@calcom/platform-libraries",
  () => ({ slugify: (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-") }),
  { virtual: true }
);
jest.mock("@/platform/calendars/services/calendars.service", () => ({ CalendarsService: class {} }));
jest.mock("@/platform/event-types/event-types_2024_04_15/services/event-types.service", () => ({
  EventTypesService_2024_04_15: class {},
}));
jest.mock("@/platform/schedules/schedules_2024_04_15/services/schedules.service", () => ({
  SchedulesService_2024_04_15: class {},
}));

import type { PlatformOAuthClient } from "@calcom/prisma/client";
import { ConflictException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { OAuthClientUsersService } from "@/modules/oauth-clients/services/oauth-clients-users.service";
import { ProfilesRepository } from "@/modules/profiles/profiles.repository";
import { TokensRepository } from "@/modules/tokens/tokens.repository";
import { UsersRepository } from "@/modules/users/users.repository";
import { CalendarsService } from "@/platform/calendars/services/calendars.service";
import { EventTypesService_2024_04_15 } from "@/platform/event-types/event-types_2024_04_15/services/event-types.service";
import { SchedulesService_2024_04_15 } from "@/platform/schedules/schedules_2024_04_15/services/schedules.service";

describe("OAuthClientUsersService", () => {
  const oAuthClientId = "clxyz0123456789abcdefghij";
  const aliasedEmail = `alice+${oAuthClientId}@example.com`;
  const username = `alice-${oAuthClientId}-example-com`;
  const oAuthClient = {
    id: oAuthClientId,
    organizationId: 10,
    areDefaultEventTypesEnabled: true,
  } as PlatformOAuthClient;

  let service: OAuthClientUsersService;
  let usersRepository: {
    findByEmail: jest.Mock;
    findByUsername: jest.Mock;
    create: jest.Mock;
    updateUsername: jest.Mock;
    update: jest.Mock;
  };
  let profilesRepository: { updateUsernameByUserId: jest.Mock };
  let eventTypesService: { createUserDefaultEventTypes: jest.Mock };
  let schedulesService: { createUserDefaultSchedule: jest.Mock };
  let calendarsService: { getCalendars: jest.Mock };

  beforeEach(async () => {
    usersRepository = {
      findByEmail: jest.fn().mockResolvedValue(null),
      findByUsername: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 42, email: aliasedEmail, defaultScheduleId: null }),
      updateUsername: jest.fn(),
      update: jest.fn().mockResolvedValue({ id: 42 }),
    };
    profilesRepository = { updateUsernameByUserId: jest.fn() };
    eventTypesService = { createUserDefaultEventTypes: jest.fn() };
    schedulesService = { createUserDefaultSchedule: jest.fn().mockResolvedValue({ id: 7 }) };
    calendarsService = { getCalendars: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OAuthClientUsersService,
        { provide: UsersRepository, useValue: usersRepository },
        {
          provide: TokensRepository,
          useValue: {
            createOAuthTokens: jest.fn().mockResolvedValue({
              accessToken: "a",
              refreshToken: "r",
              accessTokenExpiresAt: new Date(0),
              refreshTokenExpiresAt: new Date(0),
            }),
          },
        },
        { provide: EventTypesService_2024_04_15, useValue: eventTypesService },
        { provide: SchedulesService_2024_04_15, useValue: schedulesService },
        { provide: CalendarsService, useValue: calendarsService },
        { provide: ProfilesRepository, useValue: profilesRepository },
      ],
    }).compile();

    service = module.get<OAuthClientUsersService>(OAuthClientUsersService);
  });

  describe("createOAuthClientUser", () => {
    const body = { email: "alice@example.com", name: "Alice" };

    it("should create a platform managed user linked to the OAuth client, with an aliased email", async () => {
      const result = await service.createOAuthClientUser(oAuthClient, body);

      expect(usersRepository.create).toHaveBeenCalledWith(
        { ...body, email: aliasedEmail, locale: "en" },
        username,
        oAuthClientId,
        true
      );
      expect(result.user.id).toBe(42);
      expect(result.tokens.accessToken).toBe("a");
    });

    it("should throw ConflictException when the aliased email is already used", async () => {
      usersRepository.findByEmail.mockResolvedValue({ id: 1 });

      await expect(service.createOAuthClientUser(oAuthClient, body)).rejects.toThrow(ConflictException);
      expect(usersRepository.create).not.toHaveBeenCalled();
    });

    it("should throw ConflictException when the derived username is already used", async () => {
      usersRepository.findByUsername.mockResolvedValue({ id: 2 });

      await expect(service.createOAuthClientUser(oAuthClient, body)).rejects.toThrow(ConflictException);
      expect(usersRepository.findByUsername).toHaveBeenCalledWith(username);
      expect(usersRepository.create).not.toHaveBeenCalled();
    });

    it("should create default event types only when the OAuth client enables them", async () => {
      await service.createOAuthClientUser({ ...oAuthClient, areDefaultEventTypesEnabled: false }, body);

      expect(eventTypesService.createUserDefaultEventTypes).not.toHaveBeenCalled();
    });

    it("should create a default schedule when a time zone is given", async () => {
      const result = await service.createOAuthClientUser(oAuthClient, { ...body, timeZone: "Europe/Paris" });

      expect(schedulesService.createUserDefaultSchedule).toHaveBeenCalledWith(42, "Europe/Paris");
      expect(result.user.defaultScheduleId).toBe(7);
    });

    it("should still return the user when default calendars cannot be fetched", async () => {
      calendarsService.getCalendars.mockRejectedValue(new Error("no calendars"));

      await expect(service.createOAuthClientUser(oAuthClient, body)).resolves.toHaveProperty("user");
    });
  });

  describe("updateOAuthClientUser", () => {
    it("should alias the new email and update the username, including legacy profiles", async () => {
      await service.updateOAuthClientUser(oAuthClientId, 42, { email: "alice@example.com" });

      expect(usersRepository.updateUsername).toHaveBeenCalledWith(42, username);
      expect(profilesRepository.updateUsernameByUserId).toHaveBeenCalledWith(42, username);
      expect(usersRepository.update).toHaveBeenCalledWith(42, { email: aliasedEmail });
    });

    it("should throw ConflictException without writing when another user has the aliased email", async () => {
      usersRepository.findByEmail.mockResolvedValue({ id: 99 });

      await expect(
        service.updateOAuthClientUser(oAuthClientId, 42, { email: "alice@example.com" })
      ).rejects.toThrow(ConflictException);
      expect(usersRepository.updateUsername).not.toHaveBeenCalled();
      expect(usersRepository.update).not.toHaveBeenCalled();
    });

    // "alice-tag@" and "alice+tag@" slugify to the same username.
    it("should throw ConflictException without writing when another user has the derived username", async () => {
      usersRepository.findByUsername.mockResolvedValue({ id: 99 });

      await expect(
        service.updateOAuthClientUser(oAuthClientId, 42, { email: "alice-tag@example.com" })
      ).rejects.toThrow(ConflictException);
      expect(usersRepository.updateUsername).not.toHaveBeenCalled();
      expect(profilesRepository.updateUsernameByUserId).not.toHaveBeenCalled();
      expect(usersRepository.update).not.toHaveBeenCalled();
    });

    it("should accept the user's own current email and username", async () => {
      usersRepository.findByEmail.mockResolvedValue({ id: 42 });
      usersRepository.findByUsername.mockResolvedValue({ id: 42 });

      await service.updateOAuthClientUser(oAuthClientId, 42, { email: "alice@example.com" });

      expect(usersRepository.update).toHaveBeenCalledWith(42, { email: aliasedEmail });
    });

    it("should not touch the username when the email is unchanged", async () => {
      await service.updateOAuthClientUser(oAuthClientId, 42, { name: "Alice B" });

      expect(usersRepository.updateUsername).not.toHaveBeenCalled();
      expect(usersRepository.update).toHaveBeenCalledWith(42, { name: "Alice B" });
    });
  });
});
