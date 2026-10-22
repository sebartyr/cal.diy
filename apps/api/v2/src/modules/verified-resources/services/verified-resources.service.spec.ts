// @calcom/platform-libraries pulls in ESM-only dependencies that Jest's CommonJS runtime cannot load.
const mockVerifyCodeUnAuthenticated = jest.fn();
jest.mock(
  "@calcom/platform-libraries",
  () => ({
    sendVerificationCode: jest.fn(),
    verifyPhoneNumber: jest.fn(),
    verifyCodeUnAuthenticated: mockVerifyCodeUnAuthenticated,
  }),
  { virtual: true }
);
jest.mock("@calcom/platform-libraries/emails", () => ({ sendEmailVerificationByCode: jest.fn() }), {
  virtual: true,
});

import { BadRequestException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { VerifiedResourcesService } from "@/modules/verified-resources/services/verified-resources.service";
import { TeamsVerifiedResourcesRepository } from "@/modules/verified-resources/teams-verified-resources.repository";
import { UsersVerifiedResourcesRepository } from "@/modules/verified-resources/users-verified-resources.repository";

describe("VerifiedResourcesService", () => {
  let service: VerifiedResourcesService;
  let mockUsersRepo: { findUserVerifiedEmail: jest.Mock; createUserVerifiedEmail: jest.Mock };

  const userId = 7;
  const email = "alice@example.com";
  const verifiedEmail = { id: 1, userId, teamId: null, email };

  beforeEach(async () => {
    mockVerifyCodeUnAuthenticated.mockReset();
    mockUsersRepo = {
      findUserVerifiedEmail: jest.fn().mockResolvedValue(null),
      createUserVerifiedEmail: jest.fn().mockResolvedValue(verifiedEmail),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VerifiedResourcesService,
        { provide: UsersVerifiedResourcesRepository, useValue: mockUsersRepo },
        { provide: TeamsVerifiedResourcesRepository, useValue: {} },
      ],
    }).compile();

    service = module.get<VerifiedResourcesService>(VerifiedResourcesService);
  });

  describe("verifyEmail", () => {
    it("should throw BadRequestException and store nothing when the code is invalid", async () => {
      mockVerifyCodeUnAuthenticated.mockRejectedValue(new Error("Invalid verification code"));

      await expect(service.verifyEmail(userId, email, "000000")).rejects.toThrow(BadRequestException);
      expect(mockUsersRepo.createUserVerifiedEmail).not.toHaveBeenCalled();
    });

    it("should store and return the verified email when the code is valid", async () => {
      mockVerifyCodeUnAuthenticated.mockResolvedValue(true);

      await expect(service.verifyEmail(userId, email, "123456")).resolves.toEqual(verifiedEmail);
      expect(mockVerifyCodeUnAuthenticated).toHaveBeenCalledWith(email, "123456");
      expect(mockUsersRepo.createUserVerifiedEmail).toHaveBeenCalledWith(userId, email);
    });

    it("should return the existing record instead of creating a duplicate", async () => {
      mockVerifyCodeUnAuthenticated.mockResolvedValue(true);
      mockUsersRepo.findUserVerifiedEmail.mockResolvedValue(verifiedEmail);

      await expect(service.verifyEmail(userId, email, "123456")).resolves.toEqual(verifiedEmail);
      expect(mockUsersRepo.createUserVerifiedEmail).not.toHaveBeenCalled();
    });
  });
});
