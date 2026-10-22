// The real WebhooksService pulls in @calcom/platform-libraries, whose ESM-only dependencies Jest cannot load.
jest.mock("@/modules/webhooks/services/webhooks.service", () => ({ WebhooksService: class {} }));

import { WebhooksService } from "@/modules/webhooks/services/webhooks.service";
import { createMock } from "@golevelup/ts-jest";
import { BadRequestException, ExecutionContext, ForbiddenException, NotFoundException } from "@nestjs/common";
import { IsOAuthClientWebhookGuard } from "./is-oauth-client-webhook-guard";

describe("IsOAuthClientWebhookGuard", () => {
  const clientId = "client-id";
  const webhookId = "webhook-id";

  let guard: IsOAuthClientWebhookGuard;
  let mockWebhooksService: { getWebhookById: jest.Mock };

  beforeEach(() => {
    mockWebhooksService = {
      getWebhookById: jest.fn().mockResolvedValue({ id: webhookId, platformOAuthClientId: clientId }),
    };
    guard = new IsOAuthClientWebhookGuard(createMock<WebhooksService>(mockWebhooksService));
  });

  function createContext(params: Record<string, string>) {
    const request: { params: Record<string, string>; webhook?: unknown } = { params };
    const context = createMock<ExecutionContext>({
      switchToHttp: () => ({ getRequest: () => request }),
    });
    return { context, request };
  }

  it("should attach the webhook when it belongs to the OAuth client", async () => {
    const { context, request } = createContext({ clientId, webhookId });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.webhook).toEqual({ id: webhookId, platformOAuthClientId: clientId });
  });

  it("should throw ForbiddenException when the webhook belongs to another OAuth client", async () => {
    mockWebhooksService.getWebhookById.mockResolvedValue({ id: webhookId, platformOAuthClientId: "other" });
    const { context } = createContext({ clientId, webhookId });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it("should propagate NotFoundException when the webhook does not exist", async () => {
    mockWebhooksService.getWebhookById.mockRejectedValue(new NotFoundException());
    const { context } = createContext({ clientId, webhookId });

    await expect(guard.canActivate(context)).rejects.toThrow(NotFoundException);
  });

  it("should throw BadRequestException when webhookId is missing", async () => {
    const { context } = createContext({ clientId });

    await expect(guard.canActivate(context)).rejects.toThrow(BadRequestException);
  });
});
