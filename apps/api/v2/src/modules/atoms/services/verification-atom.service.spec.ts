// @calcom/platform-libraries pulls in ESM-only dependencies that Jest's CommonJS runtime cannot load.
const mockVerifyCodeUnAuthenticated = jest.fn();
jest.mock(
  "@calcom/platform-libraries",
  () => ({
    verifyCodeUnAuthenticated: mockVerifyCodeUnAuthenticated,
    sendEmailVerificationByCode: jest.fn(),
    checkEmailVerificationRequired: jest.fn(),
  }),
  { virtual: true }
);

import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { AtomsSecondaryEmailsRepository } from "@/modules/atoms/atoms-secondary-emails.repository";
import { VerificationAtomsService } from "@/modules/atoms/services/verification-atom.service";
import { MembershipsRepository } from "@/modules/memberships/memberships.repository";
import { UsersRepository } from "@/modules/users/users.repository";

describe("VerificationAtomsService", () => {
  let service: VerificationAtomsService;
  let mockSecondaryEmailsRepo: { getSecondaryEmailsVerified: jest.Mock };
  let mockUsersRepo: { getUserEmailsVerifiedForTeam: jest.Mock };
  let mockMembershipsRepo: { findMembershipByTeamId: jest.Mock };

  const userId = 7;
  const teamId = 3;
  const oAuthClientId = "clxyz0123456789abcdefghij";

  beforeEach(async () => {
    mockSecondaryEmailsRepo = { getSecondaryEmailsVerified: jest.fn().mockResolvedValue([]) };
    mockUsersRepo = { getUserEmailsVerifiedForTeam: jest.fn().mockResolvedValue([]) };
    mockMembershipsRepo = { findMembershipByTeamId: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VerificationAtomsService,
        { provide: AtomsSecondaryEmailsRepository, useValue: mockSecondaryEmailsRepo },
        { provide: UsersRepository, useValue: mockUsersRepo },
        { provide: MembershipsRepository, useValue: mockMembershipsRepo },
      ],
    }).compile();

    service = module.get<VerificationAtomsService>(VerificationAtomsService);
  });

  describe("verifyEmailCodeAuthenticated", () => {
    const input = { email: "alice@example.com", code: "123456" };

    it("should return true when the code is valid", async () => {
      mockVerifyCodeUnAuthenticated.mockResolvedValue(true);

      await expect(service.verifyEmailCodeAuthenticated(input)).resolves.toBe(true);
      expect(mockVerifyCodeUnAuthenticated).toHaveBeenCalledWith("alice@example.com", "123456");
    });

    it("should throw BadRequestException with a specific message when the code is invalid", async () => {
      mockVerifyCodeUnAuthenticated.mockRejectedValue(new Error("Invalid verification code"));

      await expect(service.verifyEmailCodeAuthenticated(input)).rejects.toThrow(
        new BadRequestException("Invalid verification code")
      );
    });

    it("should throw a generic BadRequestException for unexpected errors", async () => {
      mockVerifyCodeUnAuthenticated.mockRejectedValue(new Error("boom"));

      await expect(service.verifyEmailCodeAuthenticated(input)).rejects.toThrow(
        new BadRequestException("Verification failed")
      );
    });
  });

  describe("removeClientIdFromEmail", () => {
    it("should keep a regular email unchanged", () => {
      expect(service.removeClientIdFromEmail("alice@example.com")).toBe("alice@example.com");
    });

    it("should keep a legitimate +tag suffix", () => {
      expect(service.removeClientIdFromEmail("alice+work@example.com")).toBe("alice+work@example.com");
    });

    it("should strip the OAuth client ID alias of a managed user", () => {
      expect(service.removeClientIdFromEmail(`alice+${oAuthClientId}@example.com`)).toBe("alice@example.com");
    });

    it("should strip only the OAuth client ID alias when a +tag is also present", () => {
      expect(service.removeClientIdFromEmail(`alice+work+${oAuthClientId}@example.com`)).toBe(
        "alice+work@example.com"
      );
    });
  });

  describe("getVerifiedEmails", () => {
    it("should return the user's primary and verified secondary emails", async () => {
      mockSecondaryEmailsRepo.getSecondaryEmailsVerified.mockResolvedValue([{ email: "alice+work@example.com" }]);

      const result = await service.getVerifiedEmails({ userId, userEmail: "alice@example.com" });

      expect(result).toEqual(["alice@example.com", "alice+work@example.com"]);
      expect(mockMembershipsRepo.findMembershipByTeamId).not.toHaveBeenCalled();
    });

    it("should throw ForbiddenException when the user is not a member of the team", async () => {
      mockMembershipsRepo.findMembershipByTeamId.mockResolvedValue(null);

      await expect(service.getVerifiedEmails({ userId, userEmail: "alice@example.com", teamId })).rejects.toThrow(
        ForbiddenException
      );
      expect(mockMembershipsRepo.findMembershipByTeamId).toHaveBeenCalledWith(teamId, userId);
      expect(mockUsersRepo.getUserEmailsVerifiedForTeam).not.toHaveBeenCalled();
    });

    it("should throw ForbiddenException when the team invitation is not accepted yet", async () => {
      mockMembershipsRepo.findMembershipByTeamId.mockResolvedValue({ accepted: false });

      await expect(service.getVerifiedEmails({ userId, userEmail: "alice@example.com", teamId })).rejects.toThrow(
        ForbiddenException
      );
      expect(mockUsersRepo.getUserEmailsVerifiedForTeam).not.toHaveBeenCalled();
    });

    it("should return team members' verified emails when the user is a member of the team", async () => {
      mockMembershipsRepo.findMembershipByTeamId.mockResolvedValue({ accepted: true });
      mockUsersRepo.getUserEmailsVerifiedForTeam.mockResolvedValue([
        { email: "alice@example.com", secondaryEmails: [{ email: "alice+work@example.com" }] },
        { email: `bob+${oAuthClientId}@example.com`, secondaryEmails: [] },
      ]);

      const result = await service.getVerifiedEmails({ userId, userEmail: "alice@example.com", teamId });

      expect(result).toEqual(["alice@example.com", "alice+work@example.com", "bob@example.com"]);
    });
  });
});
