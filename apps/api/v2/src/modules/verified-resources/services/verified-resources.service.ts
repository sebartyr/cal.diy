import { verifyCodeUnAuthenticated } from "@calcom/platform-libraries";
import { sendEmailVerificationByCode } from "@calcom/platform-libraries/emails";
import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { TeamsVerifiedResourcesRepository } from "@/modules/verified-resources/teams-verified-resources.repository";
import { UsersVerifiedResourcesRepository } from "@/modules/verified-resources/users-verified-resources.repository";

@Injectable()
export class VerifiedResourcesService {
  constructor(
    private readonly usersVerifiedResourcesRepository: UsersVerifiedResourcesRepository,
    private readonly teamsVerifiedResourcesRepository: TeamsVerifiedResourcesRepository
  ) {}

  async requestEmailVerificationCode(user: { username: string; locale: string }, email: string) {
    const res = await sendEmailVerificationByCode({
      email: email,
      language: user.locale,
      username: user.username,
      isVerifyingEmail: true,
    });

    if (res.ok && !res.skipped) {
      return true;
    }

    if (!res.ok) {
      throw new BadRequestException("Email could not be verified.");
    }

    if (res.skipped) {
      throw new ConflictException("Email is already verified.");
    }

    return true;
  }



  async verifyEmail(userId: number, email: string, code: string) {
    try {
      await verifyCodeUnAuthenticated(email, code);
    } catch {
      throw new BadRequestException("Invalid Verification Code");
    }

    const existingVerifiedEmail = await this.usersVerifiedResourcesRepository.findUserVerifiedEmail(
      userId,
      email
    );
    if (existingVerifiedEmail) {
      return existingVerifiedEmail;
    }

    return this.usersVerifiedResourcesRepository.createUserVerifiedEmail(userId, email);
  }

  async getUserVerifiedEmailById(userId: number, id: number) {
    return this.usersVerifiedResourcesRepository.getUserVerifiedEmailById(userId, id);
  }

  async getTeamVerifiedEmailById(teamId: number, id: number) {
    return this.teamsVerifiedResourcesRepository.getTeamVerifiedEmailById(id, teamId);
  }

  async getVerifiedEmail(userId: number, email: string) {
    return this.usersVerifiedResourcesRepository.getUserVerifiedEmail(userId, email);
  }

  async getUserVerifiedEmails(userId: number, skip = 0, take = 250) {
    return this.usersVerifiedResourcesRepository.getUserVerifiedEmails(userId, skip, take);
  }

  async getTeamVerifiedEmails(teamId: number, skip = 0, take = 250) {
    return this.teamsVerifiedResourcesRepository.getTeamVerifiedEmails(teamId, skip, take);
  }






}
