// @calcom/platform-libraries pulls in ESM-only dependencies that Jest's CommonJS runtime cannot load.
jest.mock("@calcom/platform-libraries", () => ({}), { virtual: true });

import { MembershipRoles } from "@/modules/auth/decorators/roles/membership-roles.decorator";
import { MembershipsRepository } from "@/modules/memberships/memberships.repository";
import { OAuthClientRepository } from "@/modules/oauth-clients/oauth-client.repository";
import { createMock } from "@golevelup/ts-jest";
import { BadRequestException, ExecutionContext, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { MembershipRole } from "@calcom/prisma/enums";
import { PlatformTeamRolesGuard } from "./platform-team-roles.guard";

describe("PlatformTeamRolesGuard", () => {
  const teamId = 10;
  const otherTeamId = 20;
  const userId = 5;
  const clientId = "client-id";

  let guard: PlatformTeamRolesGuard;
  let reflector: Reflector;
  let mockOAuthClientRepository: { getOAuthClient: jest.Mock };
  let mockMembershipsRepository: { findMembershipByTeamId: jest.Mock };

  beforeEach(() => {
    reflector = new Reflector();
    mockOAuthClientRepository = { getOAuthClient: jest.fn().mockResolvedValue({ id: clientId, organizationId: teamId }) };
    mockMembershipsRepository = {
      findMembershipByTeamId: jest.fn().mockResolvedValue({ accepted: true, role: "ADMIN" }),
    };
    guard = new PlatformTeamRolesGuard(
      reflector,
      createMock<OAuthClientRepository>(mockOAuthClientRepository),
      createMock<MembershipsRepository>(mockMembershipsRepository)
    );
  });

  type TestRequest = {
    user?: { id: number; isSystemAdmin: boolean };
    organizationId: number | null;
    params: Record<string, string>;
    query: Record<string, unknown>;
    platformTeamId?: number;
  };

  function createContext(
    request: Partial<TestRequest>,
    roles: MembershipRole[] | null = ["ADMIN", "OWNER"]
  ): { context: ExecutionContext; request: TestRequest } {
    const fullRequest: TestRequest = {
      user: { id: userId, isSystemAdmin: false },
      organizationId: null,
      params: {},
      query: {},
      ...request,
    };
    jest.spyOn(reflector, "get").mockImplementation((decorator) =>
      decorator === MembershipRoles ? (roles ?? undefined) : undefined
    );
    const context = createMock<ExecutionContext>({
      switchToHttp: () => ({ getRequest: () => fullRequest }),
    });
    return { context, request: fullRequest };
  }

  describe("team resolution from the route OAuth client", () => {
    it("should use the team owning the OAuth client", async () => {
      const { context, request } = createContext({ params: { clientId } });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.platformTeamId).toBe(teamId);
      expect(mockMembershipsRepository.findMembershipByTeamId).toHaveBeenCalledWith(teamId, userId);
    });

    it("should throw NotFoundException when the OAuth client does not exist", async () => {
      mockOAuthClientRepository.getOAuthClient.mockResolvedValue(null);
      const { context } = createContext({ params: { clientId } });

      await expect(guard.canActivate(context)).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException when a team API key targets another team's OAuth client", async () => {
      const { context } = createContext({ params: { clientId }, organizationId: otherTeamId });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
  });

  describe("team resolution without OAuth client in the route", () => {
    it("should use the team of a team API key", async () => {
      const { context, request } = createContext({ organizationId: teamId });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.platformTeamId).toBe(teamId);
    });

    it("should use the teamId query parameter", async () => {
      const { context, request } = createContext({ query: { teamId: String(teamId) } });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.platformTeamId).toBe(teamId);
    });

    it("should throw ForbiddenException when the teamId query parameter differs from the API key team", async () => {
      const { context } = createContext({ organizationId: teamId, query: { teamId: String(otherTeamId) } });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it("should throw BadRequestException when no team can be resolved", async () => {
      const { context } = createContext({});

      await expect(guard.canActivate(context)).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException when teamId is not a positive integer", async () => {
      const { context } = createContext({ query: { teamId: "abc" } });

      await expect(guard.canActivate(context)).rejects.toThrow(BadRequestException);
    });
  });

  describe("roles", () => {
    it("should let a system admin through without membership", async () => {
      const { context } = createContext({ user: { id: userId, isSystemAdmin: true }, params: { clientId } });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(mockMembershipsRepository.findMembershipByTeamId).not.toHaveBeenCalled();
    });

    it("should throw ForbiddenException when there is no user", async () => {
      const { context } = createContext({ user: undefined, params: { clientId } });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it("should throw ForbiddenException when the user is not a member of the team", async () => {
      mockMembershipsRepository.findMembershipByTeamId.mockResolvedValue(null);
      const { context } = createContext({ params: { clientId } });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it("should throw ForbiddenException when the membership is not accepted", async () => {
      mockMembershipsRepository.findMembershipByTeamId.mockResolvedValue({ accepted: false, role: "OWNER" });
      const { context } = createContext({ params: { clientId } });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it("should throw ForbiddenException when the role is not allowed", async () => {
      mockMembershipsRepository.findMembershipByTeamId.mockResolvedValue({ accepted: true, role: "MEMBER" });
      const { context } = createContext({ params: { clientId } });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it("should let a member through when the route allows MEMBER", async () => {
      mockMembershipsRepository.findMembershipByTeamId.mockResolvedValue({ accepted: true, role: "MEMBER" });
      const { context } = createContext({ params: { clientId } }, ["MEMBER", "ADMIN", "OWNER"]);

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it("should deny when the route declares no roles", async () => {
      const { context } = createContext({ params: { clientId } }, null);

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
  });
});
