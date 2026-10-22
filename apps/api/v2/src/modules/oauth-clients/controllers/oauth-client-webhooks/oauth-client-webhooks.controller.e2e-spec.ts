import type { PlatformOAuthClient, Team, Webhook } from "@calcom/prisma/client";
import { INestApplication } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { MembershipRepositoryFixture } from "test/fixtures/repository/membership.repository.fixture";
import { OAuthClientRepositoryFixture } from "test/fixtures/repository/oauth-client.repository.fixture";
import { TeamRepositoryFixture } from "test/fixtures/repository/team.repository.fixture";
import { UserRepositoryFixture } from "test/fixtures/repository/users.repository.fixture";
import { WebhookRepositoryFixture } from "test/fixtures/repository/webhooks.repository.fixture";
import { randomString } from "test/utils/randomString";
import { withApiAuth } from "test/utils/withApiAuth";
import { AppModule } from "@/app.module";
import { bootstrap } from "@/bootstrap";
import { PrismaModule } from "@/modules/prisma/prisma.module";
import { TokensModule } from "@/modules/tokens/tokens.module";
import { UsersModule } from "@/modules/users/users.module";
import { UserWithProfile } from "@/modules/users/users.repository";
import { CreateWebhookInputDto, UpdateWebhookInputDto } from "@/modules/webhooks/inputs/webhook.input";
import {
  OAuthClientWebhookOutputResponseDto,
  OAuthClientWebhooksOutputResponseDto,
} from "@/modules/webhooks/outputs/oauth-client-webhook.output";

describe("OAuth client WebhooksController (e2e)", () => {
  let app: INestApplication;
  const userEmail = `oauth-client-webhooks-user-${randomString()}@api.com`;
  const otherUserEmail = `oauth-client-webhooks-other-user-${randomString()}@api.com`;
  let user: UserWithProfile;
  let otherUser: UserWithProfile;
  let oAuthClient: PlatformOAuthClient;
  let otherOAuthClient: PlatformOAuthClient;
  let team: Team;
  let otherTeam: Team;
  let oAuthClientRepositoryFixture: OAuthClientRepositoryFixture;
  let userRepositoryFixture: UserRepositoryFixture;
  let webhookRepositoryFixture: WebhookRepositoryFixture;
  let otherOAuthClientWebhook: Webhook;
  let membershipRepositoryFixture: MembershipRepositoryFixture;
  let teamRepositoryFixture: TeamRepositoryFixture;

  let webhook: OAuthClientWebhookOutputResponseDto["data"];

  beforeAll(async () => {
    const moduleRef = await withApiAuth(
      userEmail,
      Test.createTestingModule({
        imports: [AppModule, PrismaModule, UsersModule, TokensModule],
      })
    ).compile();
    userRepositoryFixture = new UserRepositoryFixture(moduleRef);
    webhookRepositoryFixture = new WebhookRepositoryFixture(moduleRef);
    oAuthClientRepositoryFixture = new OAuthClientRepositoryFixture(moduleRef);
    teamRepositoryFixture = new TeamRepositoryFixture(moduleRef);
    membershipRepositoryFixture = new MembershipRepositoryFixture(moduleRef);
    user = await userRepositoryFixture.create({
      email: userEmail,
      username: userEmail,
    });
    otherUser = await userRepositoryFixture.create({
      email: otherUserEmail,
      username: otherUserEmail,
    });

    // Regular teams own the OAuth clients: organizations cannot be created in Cal.diy.
    team = await teamRepositoryFixture.create({
      name: `oauth-client-webhooks-team-${randomString()}`,
    });
    otherTeam = await teamRepositoryFixture.create({
      name: `oauth-client-webhooks-other-team-${randomString()}`,
    });
    await membershipRepositoryFixture.create({
      role: "OWNER",
      user: { connect: { id: user.id } },
      team: { connect: { id: team.id } },
      accepted: true,
    });
    await membershipRepositoryFixture.create({
      role: "OWNER",
      user: { connect: { id: otherUser.id } },
      team: { connect: { id: otherTeam.id } },
      accepted: true,
    });

    const data = {
      logo: "logo-url",
      name: "name",
      redirectUris: ["redirect-uri"],
      permissions: 32,
    };
    const secret = "secret";
    oAuthClient = await oAuthClientRepositoryFixture.create(team.id, data, secret);
    otherOAuthClient = await oAuthClientRepositoryFixture.create(otherTeam.id, data, secret);
    otherOAuthClientWebhook = await webhookRepositoryFixture.create({
      id: `oauth-client-webhook-${randomString()}`,
      active: true,
      payloadTemplate: "string",
      subscriberUrl: "https://example.com",
      eventTriggers: ["BOOKING_CREATED", "BOOKING_RESCHEDULED", "BOOKING_CANCELLED"],
      platformOAuthClient: { connect: { id: otherOAuthClient.id } },
    });

    app = moduleRef.createNestApplication();
    bootstrap(app as NestExpressApplication);

    await app.init();
  });

  afterAll(async () => {
    await userRepositoryFixture.deleteByEmail(user.email);
    await teamRepositoryFixture.delete(team.id);
    await userRepositoryFixture.deleteByEmail(otherUser.email);
    await teamRepositoryFixture.delete(otherTeam.id);
    await app.close();
  });

  it("/webhooks (POST)", () => {
    return request(app.getHttpServer())
      .post(`/v2/oauth-clients/${oAuthClient.id}/webhooks`)
      .send({
        subscriberUrl: "https://example.com",
        triggers: ["BOOKING_CREATED", "BOOKING_RESCHEDULED", "BOOKING_CANCELLED"],
        active: true,
        payloadTemplate: "string",
      } satisfies CreateWebhookInputDto)
      .expect(201)
      .then(async (res) => {
        expect(res.body).toMatchObject({
          status: "success",
          data: {
            id: expect.any(String),
            subscriberUrl: "https://example.com",
            active: true,
            oAuthClientId: oAuthClient.id,
            payloadTemplate: "string",
            triggers: ["BOOKING_CREATED", "BOOKING_RESCHEDULED", "BOOKING_CANCELLED"],
          },
        } satisfies OAuthClientWebhookOutputResponseDto);
        webhook = res.body.data;
      });
  });

  it("/oauth-clients/:oAuthClientId/webhooks/:webhookId (PATCH)", () => {
    return request(app.getHttpServer())
      .patch(`/v2/oauth-clients/${oAuthClient.id}/webhooks/${webhook.id}`)
      .send({
        active: false,
      } satisfies UpdateWebhookInputDto)
      .expect(200)
      .then((res) => {
        expect(res.body.data.active).toBe(false);
      });
  });

  it("/oauth-clients/:oAuthClientId/webhooks/:webhookId (GET)", () => {
    return request(app.getHttpServer())
      .get(`/v2/oauth-clients/${oAuthClient.id}/webhooks/${webhook.id}`)
      .expect(200)
      .then((res) => {
        expect(res.body).toMatchObject({
          status: "success",
          data: {
            id: expect.any(String),
            subscriberUrl: "https://example.com",
            triggers: ["BOOKING_CREATED", "BOOKING_RESCHEDULED", "BOOKING_CANCELLED"],
            active: false,
            payloadTemplate: "string",
            oAuthClientId: oAuthClient.id,
          },
        } satisfies OAuthClientWebhookOutputResponseDto);
      });
  });

  it("/oauth-clients/:oAuthClientId/webhooks/:webhookId (GET) should fail to get a webhook that does not exist", () => {
    return request(app.getHttpServer()).get(`/v2/oauth-clients/${oAuthClient.id}/webhooks/90284`).expect(404);
  });

  it("/webhooks (GET)", () => {
    return request(app.getHttpServer())
      .get(`/v2/oauth-clients/${oAuthClient.id}/webhooks`)
      .expect(200)
      .then((res) => {
        const responseBody = res.body as OAuthClientWebhooksOutputResponseDto;
        responseBody.data.forEach((webhook) => {
          expect(webhook.oAuthClientId).toBe(oAuthClient.id);
        });
      });
  });
  it("/webhooks (GET) should fail to get webhooks of OAuth client that doesn't belong to you", () => {
    return request(app.getHttpServer()).get(`/v2/oauth-clients/${otherOAuthClient.id}/webhooks`).expect(403);
  });

  it("/oauth-clients/:oAuthClientId/webhooks/:webhookId (DELETE)", () => {
    return request(app.getHttpServer())
      .delete(`/v2/oauth-clients/${oAuthClient.id}/webhooks/${webhook.id}`)
      .expect(200)
      .then((res) => {
        expect(res.body).toMatchObject({
          status: "success",
          data: {
            id: expect.any(String),
            subscriberUrl: "https://example.com",
            triggers: ["BOOKING_CREATED", "BOOKING_RESCHEDULED", "BOOKING_CANCELLED"],
            active: false,
            payloadTemplate: "string",
            oAuthClientId: oAuthClient.id,
          },
        } satisfies OAuthClientWebhookOutputResponseDto);
      });
  });

  it("/oauth-clients/:oAuthClientId/webhooks/:webhookId (DELETE) should fail to delete webhooks of an OAuth client that doesn't belong to you", () => {
    return request(app.getHttpServer())
      .delete(`/v2/oauth-clients/${otherOAuthClient.id}/webhooks/${otherOAuthClientWebhook.id}`)
      .expect(403);
  });

  it("/oauth-clients/:oAuthClientId/webhooks/:webhookId (DELETE) should fail to delete a webhook that does not exist", () => {
    return request(app.getHttpServer())
      .delete(`/v2/oauth-clients/${oAuthClient.id}/webhooks/1234453`)
      .expect(404);
  });
});
