import { Reflector } from "@nestjs/core";

import { MembershipRoles } from "@/modules/auth/decorators/roles/membership-roles.decorator";
import { OAuthClientsController } from "@/modules/oauth-clients/controllers/oauth-clients/oauth-clients.controller";

jest.mock("@calcom/platform-libraries", () => ({
  MembershipRole: { MEMBER: "MEMBER", ADMIN: "ADMIN", OWNER: "OWNER" },
}));

describe("OAuthClientsController membership roles", () => {
  const reflector = new Reflector();

  // The client secret authenticates as the team owner, so a member reading it could escalate to ADMIN/OWNER routes.
  it.each(["getOAuthClients", "getOAuthClientById"] as const)(
    "should not let members call %s, which returns the client secret",
    (handlerName) => {
      const roles = reflector.get(MembershipRoles, OAuthClientsController.prototype[handlerName]);

      expect(roles).toEqual(["ADMIN", "OWNER"]);
    }
  );
});
