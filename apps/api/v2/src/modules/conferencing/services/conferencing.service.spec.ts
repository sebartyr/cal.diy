// @calcom/platform-libraries pulls in ESM-only dependencies that Jest's CommonJS runtime cannot load.
jest.mock("@calcom/platform-libraries", () => ({ userMetadata: { parse: jest.fn() } }), { virtual: true });
jest.mock(
  "@calcom/platform-libraries/app-store",
  () => ({
    getUsersCredentialsIncludeServiceAccountKey: jest.fn(),
    getApps: jest.fn(),
    handleDeleteCredential: jest.fn(),
  }),
  { virtual: true }
);

import { OFFICE_365_VIDEO, ZOOM } from "@calcom/platform-constants";
import { BadRequestException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import type { OAuthCallbackState } from "@/modules/conferencing/controllers/conferencing.controller";
import { ConferencingRepository } from "@/modules/conferencing/repositories/conferencing.repository";
import { ConferencingService } from "@/modules/conferencing/services/conferencing.service";
import { GoogleMeetService } from "@/modules/conferencing/services/google-meet.service";
import { ZoomVideoService } from "@/modules/conferencing/services/zoom-video.service";
import { TokensRepository } from "@/modules/tokens/tokens.repository";
import { UsersRepository } from "@/modules/users/users.repository";

describe("ConferencingService", () => {
  let service: ConferencingService;
  let mockZoomVideoService: { generateZoomAuthUrl: jest.Mock; connectZoomApp: jest.Mock };

  const state: OAuthCallbackState = { accessToken: "token", onErrorReturnTo: "", fromApp: false, returnTo: "" };

  beforeEach(async () => {
    mockZoomVideoService = {
      generateZoomAuthUrl: jest.fn().mockResolvedValue("https://zoom.example.com/oauth"),
      connectZoomApp: jest.fn().mockResolvedValue({ url: "https://app.example.com" }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConferencingService,
        { provide: ConferencingRepository, useValue: {} },
        { provide: UsersRepository, useValue: {} },
        { provide: TokensRepository, useValue: { getAccessTokenOwnerId: jest.fn().mockResolvedValue(1) } },
        { provide: GoogleMeetService, useValue: {} },
        { provide: ZoomVideoService, useValue: mockZoomVideoService },
      ],
    }).compile();

    service = module.get<ConferencingService>(ConferencingService);
  });

  describe("generateOAuthUrl", () => {
    it("should generate the Zoom OAuth URL", async () => {
      await expect(service.generateOAuthUrl(ZOOM, state)).resolves.toBe("https://zoom.example.com/oauth");
    });

    it("should reject Microsoft Teams, whose app was removed", async () => {
      await expect(service.generateOAuthUrl(OFFICE_365_VIDEO, state)).rejects.toThrow(
        new BadRequestException("Invalid conferencing app, available apps are: zoom")
      );
    });
  });

  describe("connectOauthApps", () => {
    it("should connect Zoom", async () => {
      await service.connectOauthApps(ZOOM, "code", state);

      expect(mockZoomVideoService.connectZoomApp).toHaveBeenCalledWith(state, "code", 1, undefined);
    });

    it("should reject Microsoft Teams, whose app was removed", async () => {
      await expect(service.connectOauthApps(OFFICE_365_VIDEO, "code", state)).rejects.toThrow(
        BadRequestException
      );
    });
  });
});
