import { WebhooksService } from "@/modules/webhooks/services/webhooks.service";
import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Request } from "express";

import type { Webhook } from "@calcom/prisma/client";

// Runs after PlatformTeamRolesGuard, which already checked that the caller may manage the OAuth client
// of the route: this guard only checks that the webhook belongs to that client.
@Injectable()
export class IsOAuthClientWebhookGuard implements CanActivate {
  constructor(private readonly webhooksService: WebhooksService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request<{ webhookId: string; clientId: string }> & { webhook: Webhook }>();
    const webhookId = request.params.webhookId;
    const oAuthClientId = request.params.clientId;

    if (!webhookId) {
      throw new BadRequestException(
        "IsOAuthClientWebhookGuard - webhookId parameter not specified in the request"
      );
    }

    if (!oAuthClientId) {
      throw new BadRequestException(
        "IsOAuthClientWebhookGuard - oAuthClientId parameter not specified in the request"
      );
    }

    const webhook = await this.webhooksService.getWebhookById(webhookId);

    if (webhook.platformOAuthClientId !== oAuthClientId) {
      throw new ForbiddenException("IsOAuthClientWebhookGuard - Webhook does not belong to this oAuthClient");
    }

    request.webhook = webhook;

    return true;
  }
}
