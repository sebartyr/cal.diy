import { OAuthClientRepository } from "@/modules/oauth-clients/oauth-client.repository";
import { UnauthorizedException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { CalProviderController } from "./provider.controller";

describe("CalProviderController", () => {
  let controller: CalProviderController;
  let mockOAuthClientRepository: { getOAuthClient: jest.Mock };

  beforeEach(async () => {
    mockOAuthClientRepository = {
      getOAuthClient: jest.fn().mockResolvedValue({ id: "client-id", organizationId: 10, name: "Client" }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CalProviderController],
      providers: [{ provide: OAuthClientRepository, useValue: mockOAuthClientRepository }],
    }).compile();

    controller = module.get<CalProviderController>(CalProviderController);
  });

  describe("verifyClientId", () => {
    it("should not report the owning team as an organization", async () => {
      const result = await controller.verifyClientId("client-id");

      expect(result.data).toEqual({ clientId: "client-id", organizationId: null, name: "Client" });
    });

    it("should throw UnauthorizedException for an unknown client", async () => {
      mockOAuthClientRepository.getOAuthClient.mockResolvedValue(null);

      await expect(controller.verifyClientId("unknown")).rejects.toThrow(UnauthorizedException);
    });
  });
});
