import type { AppConfig } from "@/config/type";
import { AtomsSecondaryEmailsRepository } from "@/modules/atoms/atoms-secondary-emails.repository";
import { CheckEmailVerificationRequiredParams } from "@/modules/atoms/inputs/check-email-verification-required-params";
import { GetVerifiedEmailsInput } from "@/modules/atoms/inputs/get-verified-emails-params";
import { SendVerificationEmailInput } from "@/modules/atoms/inputs/send-verification-email.input";
import { VerifyEmailCodeInput } from "@/modules/atoms/inputs/verify-email-code.input";
import { MembershipsRepository } from "@/modules/memberships/memberships.repository";
import { UsersRepository } from "@/modules/users/users.repository";
import { Injectable, BadRequestException, ForbiddenException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  verifyCodeUnAuthenticated,
  sendEmailVerificationByCode,
  checkEmailVerificationRequired,
} from "@calcom/platform-libraries";

@Injectable()
export class VerificationAtomsService {
  private readonly logger = new Logger("VerificationAtomsService");

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly atomsSecondaryEmailsRepository: AtomsSecondaryEmailsRepository,
    private readonly usersRepository: UsersRepository,
    private readonly membershipsRepository: MembershipsRepository
  ) {}

  async checkEmailVerificationRequired(input: CheckEmailVerificationRequiredParams) {
    return await checkEmailVerificationRequired(input);
  }

  async verifyEmailCodeUnAuthenticated(input: VerifyEmailCodeInput) {
    try {
      return await verifyCodeUnAuthenticated(input.email, input.code);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "Invalid verification code") {
          throw new BadRequestException("Invalid verification code");
        }
        if (error.message === "Email and code are required") {
          throw new BadRequestException("Email and code are required");
        }
      }
      throw new BadRequestException("Verification failed");
    }
  }

  // The code is a TOTP derived from the email alone, so being authenticated does not change how it is checked.
  // Dev and E2E skip the check so authenticated atoms can be exercised without receiving the email,
  // as cal.com did before the fork (its instance-admin bypass is intentionally not kept).
  async verifyEmailCodeAuthenticated(input: VerifyEmailCodeInput) {
    if (this.config.get("env.type", { infer: true }) !== "production" || this.config.get("e2e", { infer: true })) {
      this.logger.warn("Skipping email code verification in dev/E2E environment");
      return true;
    }

    return this.verifyEmailCodeUnAuthenticated(input);
  }

  async sendEmailVerificationCode(input: SendVerificationEmailInput) {
    return await sendEmailVerificationByCode({
      email: input.email,
      username: input.username,
      language: input.language,
      isVerifyingEmail: input.isVerifyingEmail,
    });
  }

  async getVerifiedEmails(input: GetVerifiedEmailsInput): Promise<string[]> {
    const { userId, userEmail, teamId } = input;
    const userEmailWithoutOauthClientId = this.removeClientIdFromEmail(userEmail);

    if (teamId) {
      const membership = await this.membershipsRepository.findMembershipByTeamId(teamId, userId);
      if (!membership?.accepted) {
        throw new ForbiddenException("You are not a member of this team");
      }

      const verifiedEmails: string[] = [];

      const teamMembers = await this.usersRepository.getUserEmailsVerifiedForTeam(teamId);

      if (teamMembers.length === 0) {
        return verifiedEmails;
      }

      teamMembers.forEach((member) => {
        const memberEmailWithoutOauthClientId = this.removeClientIdFromEmail(member.email);

        verifiedEmails.push(memberEmailWithoutOauthClientId);
        member.secondaryEmails.forEach((secondaryEmail) => {
          verifiedEmails.push(this.removeClientIdFromEmail(secondaryEmail.email));
        });
      });

      return verifiedEmails;
    }

    let verifiedEmails = [userEmailWithoutOauthClientId];

    const secondaryEmails = await this.atomsSecondaryEmailsRepository.getSecondaryEmailsVerified(userId);
    verifiedEmails = verifiedEmails.concat(
      secondaryEmails.map((secondaryEmail) => this.removeClientIdFromEmail(secondaryEmail.email))
    );

    return verifiedEmails;
  }

  async addVerifiedEmail({
    userId,
    existingPrimaryEmail,
    email,
    code,
  }: {
    userId: number;
    existingPrimaryEmail: string;
    email: string;
    code: string;
  }): Promise<boolean> {
    // Atoms append the OAuth client ID alias to the stored email, but the code was sent to the bare address.
    await this.verifyEmailCodeAuthenticated({ email: this.removeClientIdFromEmail(email), code });

    const existingSecondaryEmail =
      await this.atomsSecondaryEmailsRepository.getExistingSecondaryEmailByUserAndEmail(userId, email);
    const alreadyExistingEmail = await this.atomsSecondaryEmailsRepository.getExistingSecondaryEmail(email);

    if (alreadyExistingEmail) {
      throw new BadRequestException("Email already exists");
    }

    if (existingPrimaryEmail === email || existingSecondaryEmail === email) {
      return true;
    }

    await this.atomsSecondaryEmailsRepository.addSecondaryEmailVerified(userId, email);

    return true;
  }

  // Managed users get a "+<oAuthClientId>" alias (a 25-char cuid) appended to their local part.
  // Only that alias is stripped, so regular addresses and legitimate "+tag" suffixes are kept intact.
  removeClientIdFromEmail(email: string): string {
    return email.replace(/\+[a-zA-Z0-9]{25}(?=@)/, "");
  }
}
