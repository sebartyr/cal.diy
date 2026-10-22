import { BadRequestException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { OAuthFlowController } from "@/modules/oauth-clients/controllers/oauth-flow/oauth-flow.controller";
import { OAuthClientRepository } from "@/modules/oauth-clients/oauth-client.repository";
import { OAuthFlowService } from "@/modules/oauth-clients/services/oauth-flow.service";
import { TokensRepository } from "@/modules/tokens/tokens.repository";

describe("OAuthFlowController", () => {
  let controller: OAuthFlowController;
  let mockOAuthFlowService: { exchangeAuthorizationToken: jest.Mock };

  const clientId = "client-id";
  const body = { clientSecret: "secret" };

  beforeEach(async () => {
    mockOAuthFlowService = { exchangeAuthorizationToken: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OAuthFlowController],
      providers: [
        { provide: OAuthClientRepository, useValue: {} },
        { provide: TokensRepository, useValue: {} },
        { provide: OAuthFlowService, useValue: mockOAuthFlowService },
      ],
    }).compile();

    controller = module.get<OAuthFlowController>(OAuthFlowController);
  });

  describe("exchange", () => {
    it("should throw BadRequestException when the Authorization header is missing", async () => {
      await expect(controller.exchange(undefined, clientId, body)).rejects.toThrow(BadRequestException);
      expect(mockOAuthFlowService.exchangeAuthorizationToken).not.toHaveBeenCalled();
    });

    it("should throw BadRequestException when the Bearer token is empty", async () => {
      await expect(controller.exchange("Bearer ", clientId, body)).rejects.toThrow(BadRequestException);
    });

    it("should exchange the authorization code from the Bearer header", async () => {
      const tokens = { accessToken: "a", refreshToken: "r", accessTokenExpiresAt: 1, refreshTokenExpiresAt: 2 };
      mockOAuthFlowService.exchangeAuthorizationToken.mockResolvedValue(tokens);

      const result = await controller.exchange("Bearer code-123", clientId, body);

      expect(mockOAuthFlowService.exchangeAuthorizationToken).toHaveBeenCalledWith("code-123", clientId, "secret");
      expect(result.data).toEqual(tokens);
    });
  });
});
