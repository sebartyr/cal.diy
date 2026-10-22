import { slugify } from "@calcom/platform-libraries";
import type { PlatformOAuthClient, User } from "@calcom/prisma/client";
import { ConflictException, Injectable, Logger } from "@nestjs/common";
import { CalendarsService } from "@/platform/calendars/services/calendars.service";
import { EventTypesService_2024_04_15 } from "@/platform/event-types/event-types_2024_04_15/services/event-types.service";
import { SchedulesService_2024_04_15 } from "@/platform/schedules/schedules_2024_04_15/services/schedules.service";
import { Locales } from "@/lib/enums/locales";
import { GetManagedUsersInput } from "@/modules/oauth-clients/controllers/oauth-client-users/inputs/get-managed-users.input";
import { ProfilesRepository } from "@/modules/profiles/profiles.repository";
import { TokensRepository } from "@/modules/tokens/tokens.repository";
import { CreateManagedUserInput } from "@/modules/users/inputs/create-managed-user.input";
import { UpdateManagedUserInput } from "@/modules/users/inputs/update-managed-user.input";
import { UsersRepository } from "@/modules/users/users.repository";

@Injectable()
export class OAuthClientUsersService {
  private readonly logger = new Logger("OAuthClientUsersService");

  constructor(
    private readonly userRepository: UsersRepository,
    private readonly tokensRepository: TokensRepository,
    private readonly eventTypesService: EventTypesService_2024_04_15,
    private readonly schedulesService: SchedulesService_2024_04_15,
    private readonly calendarsService: CalendarsService,
    private readonly profilesRepository: ProfilesRepository
  ) {}

  // Managed users are linked to the team owning the OAuth client only through the OAuth client: they are
  // not team members (they belong to the integrator's own customers) and have no organization profile.
  async createOAuthClientUser(oAuthClient: PlatformOAuthClient, body: CreateManagedUserInput) {
    const oAuthClientId = oAuthClient.id;

    const existingUser = await this.getExistingUserByEmail(oAuthClientId, body.email);
    if (existingUser) {
      throw new ConflictException(
        `User with the provided e-mail already exists. Existing user ID=${existingUser.id}`
      );
    }

    const email = OAuthClientUsersService.getOAuthUserEmail(oAuthClientId, body.email);
    const username = OAuthClientUsersService.getOAuthUserUsername(email);

    // Without an organization the (username, organizationId) unique index does not apply, so two emails
    // slugifying to the same username must be caught here.
    const existingUsername = await this.userRepository.findByUsername(username);
    if (existingUsername) {
      throw new ConflictException(
        `User with the username derived from the provided e-mail already exists. Existing user ID=${existingUsername.id}`
      );
    }

    const user = await this.userRepository.create(
      { ...body, email, locale: body.locale ?? Locales.EN },
      username,
      oAuthClientId,
      true
    );

    const { accessToken, refreshToken, accessTokenExpiresAt, refreshTokenExpiresAt } =
      await this.tokensRepository.createOAuthTokens(oAuthClientId, user.id);

    if (oAuthClient.areDefaultEventTypesEnabled) {
      await this.eventTypesService.createUserDefaultEventTypes(user.id);
    }

    if (body.timeZone) {
      const defaultSchedule = await this.schedulesService.createUserDefaultSchedule(user.id, body.timeZone);
      user.defaultScheduleId = defaultSchedule.id;
    }

    try {
      this.logger.log(`Setting default calendars in db for user with id ${user.id}`);
      await this.calendarsService.getCalendars(user.id);
    } catch (err) {
      this.logger.error(`Could not get calendars of new managed user with id ${user.id}`);
    }

    return {
      user,
      tokens: {
        accessToken,
        accessTokenExpiresAt,
        refreshToken,
        refreshTokenExpiresAt,
      },
    };
  }

  async getExistingUserByEmail(oAuthClientId: string, email: string) {
    const oAuthEmail = OAuthClientUsersService.getOAuthUserEmail(oAuthClientId, email);
    return await this.userRepository.findByEmail(oAuthEmail);
  }

  async getManagedUsers(oAuthClientId: string, queryParams: GetManagedUsersInput) {
    const { offset, limit, emails } = queryParams;

    const oAuthEmails = emails?.map((email) =>
      email.includes(oAuthClientId) ? email : OAuthClientUsersService.getOAuthUserEmail(oAuthClientId, email)
    );

    const managedUsers = await this.userRepository.findManagedUsersByOAuthClientIdAndEmails(
      oAuthClientId,
      offset ?? 0,
      limit ?? 50,
      oAuthEmails
    );

    return managedUsers;
  }

  async updateOAuthClientUser(oAuthClientId: string, userId: number, body: UpdateManagedUserInput) {
    if (body.email) {
      const emailWithOAuthId = OAuthClientUsersService.getOAuthUserEmail(oAuthClientId, body.email);
      body.email = emailWithOAuthId;
      const newUsername = OAuthClientUsersService.getOAuthUserUsername(emailWithOAuthId);
      await this.userRepository.updateUsername(userId, newUsername);
      // Managed users created before the organization removal still have an org profile carrying the username.
      await this.profilesRepository.updateUsernameByUserId(userId, newUsername);
    }

    return this.userRepository.update(userId, body);
  }

  static getOAuthUserUsername(oAuthUserEmail: string) {
    const [emailUser, emailDomain] = oAuthUserEmail.split("@");
    const [domainName, TLD] = emailDomain.split(".");
    return slugify(`${emailUser}-${domainName}-${TLD}`);
  }

  static getOAuthUserEmail(oAuthClientId: string, userEmail: string) {
    if (userEmail.includes(`+${oAuthClientId}@`)) {
      return userEmail;
    }
    const [username, emailDomain] = userEmail.split("@");
    return `${username}+${oAuthClientId}@${emailDomain}`;
  }
}
