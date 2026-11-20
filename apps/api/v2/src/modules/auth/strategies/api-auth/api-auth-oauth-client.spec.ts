import { ApiKeysRepository } from "@/modules/api-keys/api-keys-repository";
import { ApiAuthGuardRequest, ApiAuthStrategy } from "@/modules/auth/strategies/api-auth/api-auth.strategy";
import { MembershipsRepository } from "@/modules/memberships/memberships.repository";
import { OAuthClientRepository } from "@/modules/oauth-clients/oauth-client.repository";
import { OAuthFlowService } from "@/modules/oauth-clients/services/oauth-flow.service";
import { TokensRepository } from "@/modules/tokens/tokens.repository";
import { TokensService } from "@/modules/tokens/tokens.service";
import { UsersService } from "@/modules/users/services/users.service";
import { UsersRepository } from "@/modules/users/users.repository";
import { createMock } from "@golevelup/ts-jest";
import { ConfigService } from "@nestjs/config";

describe("ApiAuthStrategy.oAuthClientStrategy", () => {
  const oauthRepository = createMock<OAuthClientRepository>();
  const strategy = new ApiAuthStrategy(
    createMock<ConfigService>(),
    createMock<OAuthFlowService>(),
    createMock<TokensRepository>(),
    createMock<TokensService>(),
    createMock<UsersRepository>(),
    createMock<ApiKeysRepository>(),
    oauthRepository,
    createMock<UsersService>(),
    createMock<MembershipsRepository>()
  );
  const request = createMock<ApiAuthGuardRequest>();
  const INVALID = "ApiAuthStrategy - oAuth client - Invalid client credentials";

  it("answers the same for an unknown client and a wrong secret", async () => {
    (oauthRepository.getOAuthClient as jest.Mock).mockResolvedValue(null);
    await expect(strategy.oAuthClientStrategy("unknown", "secret", request)).rejects.toThrow(INVALID);

    (oauthRepository.getOAuthClient as jest.Mock).mockResolvedValue({ id: "c", secret: "right", organizationId: 1 });
    await expect(strategy.oAuthClientStrategy("c", "wrong", request)).rejects.toThrow(INVALID);
    await expect(strategy.oAuthClientStrategy("c", "right-but-longer", request)).rejects.toThrow(INVALID);
  });
});
