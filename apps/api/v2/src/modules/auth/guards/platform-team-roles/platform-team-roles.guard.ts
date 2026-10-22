import { MembershipRoles } from "@/modules/auth/decorators/roles/membership-roles.decorator";
import { ApiAuthGuardRequest } from "@/modules/auth/strategies/api-auth/api-auth.strategy";
import { MembershipsRepository } from "@/modules/memberships/memberships.repository";
import { OAuthClientRepository } from "@/modules/oauth-clients/oauth-client.repository";
import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

// Platform OAuth clients are owned by a regular team (PlatformOAuthClient.organizationId references Team):
// organizations cannot be created in Cal.diy, so ownership and roles are checked against that team.
@Injectable()
export class PlatformTeamRolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly oAuthClientRepository: OAuthClientRepository,
    private readonly membershipsRepository: MembershipsRepository
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ApiAuthGuardRequest>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException("PlatformTeamRolesGuard - No user associated with the request.");
    }

    const teamId = await this.resolveTeamId(request);
    request.platformTeamId = teamId;

    if (user.isSystemAdmin) {
      return true;
    }

    const allowedRoles = this.reflector.get(MembershipRoles, context.getHandler());
    if (!allowedRoles?.length) {
      throw new ForbiddenException("PlatformTeamRolesGuard - No membership roles declared for this route.");
    }

    const membership = await this.membershipsRepository.findMembershipByTeamId(teamId, user.id);
    if (!membership?.accepted) {
      throw new ForbiddenException(`PlatformTeamRolesGuard - User is not a member of the team with id=${teamId}.`);
    }

    if (!allowedRoles.includes(membership.role)) {
      throw new ForbiddenException(
        `PlatformTeamRolesGuard - User must have one of the roles: ${allowedRoles.join(", ")}.`
      );
    }

    return true;
  }

  // A team API key or OAuth client credentials already pin the team (request.organizationId); any explicit
  // team (OAuth client of the route or ?teamId=) must then match it, so a key cannot reach another team.
  private async resolveTeamId(request: ApiAuthGuardRequest): Promise<number> {
    const authTeamId = request.organizationId;
    const oAuthClientId = request.params.clientId;

    if (oAuthClientId) {
      const oAuthClient = await this.oAuthClientRepository.getOAuthClient(oAuthClientId);
      if (!oAuthClient) {
        throw new NotFoundException(`PlatformTeamRolesGuard - OAuth client with id=${oAuthClientId} not found.`);
      }
      if (authTeamId && authTeamId !== oAuthClient.organizationId) {
        throw new ForbiddenException(
          `PlatformTeamRolesGuard - OAuth client with id=${oAuthClientId} does not belong to the team with id=${authTeamId}.`
        );
      }
      return oAuthClient.organizationId;
    }

    const queryTeamId = this.parseQueryTeamId(request.query.teamId);
    if (authTeamId && queryTeamId && authTeamId !== queryTeamId) {
      throw new ForbiddenException(
        `PlatformTeamRolesGuard - teamId=${queryTeamId} does not match the team of the API key or OAuth client.`
      );
    }

    const teamId = authTeamId ?? queryTeamId;
    if (!teamId) {
      throw new BadRequestException(
        "PlatformTeamRolesGuard - Provide the owning team with the 'teamId' query parameter or use a team API key."
      );
    }
    return teamId;
  }

  private parseQueryTeamId(value: unknown): number | null {
    if (value === undefined) {
      return null;
    }
    const teamId = typeof value === "string" ? Number(value) : Number.NaN;
    if (!Number.isInteger(teamId) || teamId <= 0) {
      throw new BadRequestException("PlatformTeamRolesGuard - 'teamId' query parameter must be a positive integer.");
    }
    return teamId;
  }
}
