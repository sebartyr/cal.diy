import { SUCCESS_STATUS } from "@calcom/platform-constants";
import { MembershipRole } from "@calcom/platform-libraries";
import { CreateOAuthClientInput, Pagination, UpdateOAuthClientInput } from "@calcom/platform-types";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiExcludeEndpoint,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiCreatedResponse as DocsCreatedResponse,
} from "@nestjs/swagger";
import { API_VERSIONS_VALUES } from "@/lib/api-versions";
import { API_KEY_HEADER } from "@/lib/docs/headers";
import { GetPlatformTeamId } from "@/modules/auth/decorators/get-platform-team-id/get-platform-team-id.decorator";
import { MembershipRoles } from "@/modules/auth/decorators/roles/membership-roles.decorator";
import { ApiAuthGuard } from "@/modules/auth/guards/api-auth/api-auth.guard";
import { PlatformTeamRolesGuard } from "@/modules/auth/guards/platform-team-roles/platform-team-roles.guard";
import { GetManagedUsersOutput } from "@/modules/oauth-clients/controllers/oauth-client-users/outputs/get-managed-users.output";
import { CreateOAuthClientResponseDto } from "@/modules/oauth-clients/controllers/oauth-clients/responses/CreateOAuthClientResponse.dto";
import { GetOAuthClientResponseDto } from "@/modules/oauth-clients/controllers/oauth-clients/responses/GetOAuthClientResponse.dto";
import { GetOAuthClientsResponseDto } from "@/modules/oauth-clients/controllers/oauth-clients/responses/GetOAuthClientsResponse.dto";
import { OAuthClientsService } from "@/modules/oauth-clients/services/oauth-clients/oauth-clients.service";
import { OAuthClientUsersOutputService } from "@/modules/oauth-clients/services/oauth-clients-users-output.service";
import { UsersRepository } from "@/modules/users/users.repository";

const TEAM_ID_QUERY = {
  name: "teamId",
  required: false,
  type: Number,
  description:
    "Team owning the OAuth clients. Required unless the request is authenticated with an API key created for that team.",
};

@Controller({
  path: "/v2/oauth-clients",
  version: API_VERSIONS_VALUES,
})
@ApiTags("Deprecated: Platform OAuth Clients")
@UseGuards(ApiAuthGuard, PlatformTeamRolesGuard)
@ApiHeader(API_KEY_HEADER)
export class OAuthClientsController {
  private readonly logger = new Logger("OAuthClientController");

  constructor(
    private readonly oAuthClientUsersOutputService: OAuthClientUsersOutputService,
    private readonly oAuthClientsService: OAuthClientsService,
    private readonly userRepository: UsersRepository
  ) {}

  @Post("/")
  @HttpCode(HttpStatus.CREATED)
  @MembershipRoles([MembershipRole.ADMIN, MembershipRole.OWNER])
  @DocsCreatedResponse({
    description: "Create an OAuth client",
    type: CreateOAuthClientResponseDto,
  })
  @ApiOperation({
    summary: "Create an OAuth client",
    description: `<Warning>These endpoints are deprecated and will be removed in the future.</Warning>`,
  })
  @ApiQuery(TEAM_ID_QUERY)
  async createOAuthClient(
    @GetPlatformTeamId() teamId: number,
    @Body() body: CreateOAuthClientInput
  ): Promise<CreateOAuthClientResponseDto> {
    this.logger.log(`Creating OAuth Client for team ${teamId}`);

    const oAuthClientCredentials = await this.oAuthClientsService.createOAuthClient(teamId, body);

    return {
      status: SUCCESS_STATUS,
      data: oAuthClientCredentials,
    };
  }

  @Get("/")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Get all OAuth clients",
    description: `<Warning>These endpoints are deprecated and will be removed in the future.</Warning>`,
  })
  // Responses carry the client secret, which authenticates as the team owner: members must not read it.
  @MembershipRoles([MembershipRole.ADMIN, MembershipRole.OWNER])
  @ApiQuery(TEAM_ID_QUERY)
  async getOAuthClients(@GetPlatformTeamId() teamId: number): Promise<GetOAuthClientsResponseDto> {
    const clients = await this.oAuthClientsService.getOAuthClients(teamId);
    return { status: SUCCESS_STATUS, data: clients };
  }

  @Get("/:clientId")
  @HttpCode(HttpStatus.OK)
  @MembershipRoles([MembershipRole.ADMIN, MembershipRole.OWNER])
  @ApiOperation({
    summary: "Get an OAuth client",
    description: `<Warning>These endpoints are deprecated and will be removed in the future.</Warning>`,
  })
  async getOAuthClientById(@Param("clientId") clientId: string): Promise<GetOAuthClientResponseDto> {
    const client = await this.oAuthClientsService.getOAuthClientById(clientId);
    return { status: SUCCESS_STATUS, data: client };
  }

  @Get("/:clientId/managed-users")
  @HttpCode(HttpStatus.OK)
  @MembershipRoles([MembershipRole.ADMIN, MembershipRole.OWNER, MembershipRole.MEMBER])
  // note(Lauris): Excluding this endpoint because we have oauth-clients-users.controller to fetch oAuth users and I am leaving this endpoint
  // just in case someone is using it.
  @ApiExcludeEndpoint()
  async getOAuthClientManagedUsersById(
    @Param("clientId") clientId: string,
    @Query() queryParams: Pagination
  ): Promise<GetManagedUsersOutput> {
    const { offset, limit } = queryParams;
    const existingManagedUsers = await this.userRepository.findManagedUsersByOAuthClientId(
      clientId,
      offset ?? 0,
      limit ?? 50
    );

    return {
      status: SUCCESS_STATUS,
      data: existingManagedUsers.map((user) => this.oAuthClientUsersOutputService.getResponseUser(user)),
    };
  }

  @Patch("/:clientId")
  @HttpCode(HttpStatus.OK)
  @MembershipRoles([MembershipRole.ADMIN, MembershipRole.OWNER])
  @ApiOperation({
    summary: "Update an OAuth client",
    description: `<Warning>These endpoints are deprecated and will be removed in the future.</Warning>`,
  })
  async updateOAuthClient(
    @Param("clientId") clientId: string,
    @Body() body: UpdateOAuthClientInput
  ): Promise<GetOAuthClientResponseDto> {
    this.logger.log(`Updating OAuth Client ${clientId}`);
    const client = await this.oAuthClientsService.updateOAuthClient(clientId, body);
    return { status: SUCCESS_STATUS, data: client };
  }

  @Delete("/:clientId")
  @HttpCode(HttpStatus.OK)
  @MembershipRoles([MembershipRole.ADMIN, MembershipRole.OWNER])
  @ApiOperation({
    summary: "Delete an OAuth client",
    description: `<Warning>These endpoints are deprecated and will be removed in the future.</Warning>`,
  })
  async deleteOAuthClient(@Param("clientId") clientId: string): Promise<GetOAuthClientResponseDto> {
    this.logger.log(`Deleting OAuth Client with ID: ${clientId}`);
    const client = await this.oAuthClientsService.deleteOAuthClient(clientId);
    return { status: SUCCESS_STATUS, data: client };
  }
}
