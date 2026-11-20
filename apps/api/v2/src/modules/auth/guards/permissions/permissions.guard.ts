import { timingSafeEqual } from "node:crypto";
import { isApiKey } from "@/lib/api-key";
import { Permissions } from "@/modules/auth/decorators/permissions/permissions.decorator";
import { OAuthClientRepository } from "@/modules/oauth-clients/oauth-client.repository";
import { OAuthClientsOutputService } from "@/modules/oauth-clients/services/oauth-clients/oauth-clients-output.service";
import { TokensRepository } from "@/modules/tokens/tokens.repository";
import { TokensService } from "@/modules/tokens/tokens.service";
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { getToken } from "next-auth/jwt";

import { X_CAL_CLIENT_ID, X_CAL_SECRET_KEY } from "@calcom/platform-constants";
import { hasPermissions } from "@calcom/platform-utils";
import type { PlatformOAuthClient } from "@calcom/prisma/client";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private tokensRepository: TokensRepository,
    private tokensService: TokensService,
    private readonly config: ConfigService,
    private readonly oAuthClientRepository: OAuthClientRepository,
    private readonly oAuthClientsOutputService: OAuthClientsOutputService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.get(Permissions, context.getHandler());

    if (!requiredPermissions?.length || !Object.keys(requiredPermissions)?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const bearerToken = request.get("Authorization")?.replace("Bearer ", "");
    const nextAuthSecret = this.config.get("next.authSecret", { infer: true });
    const nextAuthToken = await getToken({ req: request, secret: nextAuthSecret });
    const oAuthClientId = request.params?.clientId || request.get(X_CAL_CLIENT_ID);
    const apiKey = bearerToken && isApiKey(bearerToken, this.config.get("api.apiKeyPrefix") ?? "cal_");
    const isThirdPartyBearerToken = bearerToken && this.getDecodedThirdPartyAccessToken(bearerToken);

    // only check permissions for accessTokens attached to platform oAuth Client or platform oAuth credentials, not for next token or api key or third party oauth client
    if (nextAuthToken || apiKey || isThirdPartyBearerToken) {
      return true;
    }

    if (!bearerToken && !oAuthClientId) {
      throw new ForbiddenException(
        "PermissionsGuard - no authentication provided. Provide either authorization bearer token containing managed user access token or oAuth client id in 'x-cal-client-id' header."
      );
    }

    // A client id is public (atoms send it from the browser), so it only selects the client's permissions
    // together with its secret. This guard often runs before ApiAuthGuard, which checks the secret too.
    const oAuthClient = bearerToken
      ? await this.getOAuthClientByAccessToken(bearerToken)
      : await this.getOAuthClientById(oAuthClientId, request.get(X_CAL_SECRET_KEY));

    const hasRequiredPermissions = hasPermissions(oAuthClient.permissions, [...requiredPermissions]);

    if (!hasRequiredPermissions) {
      throw new ForbiddenException(
        `PermissionsGuard - oAuth client with id=${
          oAuthClient.id
        } does not have the required permissions=${requiredPermissions
          .map((permission) => this.oAuthClientsOutputService.transformOAuthClientPermission(permission))
          .join(
            ", "
          )}. Go to platform dashboard settings and add the required permissions to the oAuth client.`
      );
    }

    return true;
  }

  async getOAuthClientByAccessToken(
    accessToken: string
  ): Promise<Pick<PlatformOAuthClient, "id" | "permissions">> {
    const oAuthClient = await this.tokensRepository.getAccessTokenClient(accessToken);
    if (!oAuthClient) {
      throw new ForbiddenException("PermissionsGuard - no oAuth client found for the access token");
    }
    return oAuthClient;
  }

  async getOAuthClientById(
    id: string,
    secret: string | undefined
  ): Promise<Pick<PlatformOAuthClient, "id" | "permissions">> {
    if (!secret) {
      throw new ForbiddenException(
        `PermissionsGuard - '${X_CAL_CLIENT_ID}' must come with the client secret in '${X_CAL_SECRET_KEY}'`
      );
    }
    const oAuthClient = await this.oAuthClientRepository.getOAuthClient(id);
    if (!oAuthClient || !isSameSecret(oAuthClient.secret, secret)) {
      throw new ForbiddenException("PermissionsGuard - invalid oAuth client credentials");
    }
    return { id: oAuthClient.id, permissions: oAuthClient.permissions };
  }

  getDecodedThirdPartyAccessToken(bearerToken: string) {
    return this.tokensService.getDecodedThirdPartyAccessToken(bearerToken);
  }
}

function isSameSecret(expected: string, provided: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}
