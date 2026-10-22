import { API_KEY_OR_ACCESS_TOKEN_HEADER } from "@/lib/docs/headers";
import { Throttle } from "@/lib/endpoint-throttler-decorator";
import { GetUser } from "@/modules/auth/decorators/get-user/get-user.decorator";
import { ApiAuthGuard } from "@/modules/auth/guards/api-auth/api-auth.guard";
import { RequestEmailVerificationInput } from "@/modules/verified-resources/inputs/request-email-verification.input";
import { VerifyEmailInput } from "@/modules/verified-resources/inputs/verify-email.input";
import { RequestEmailVerificationOutput } from "@/modules/verified-resources/outputs/request-email-verification-output";
import {
  UserVerifiedEmailOutput,
  UserVerifiedEmailOutputData,
  UserVerifiedEmailsOutput,
} from "@/modules/verified-resources/outputs/verified-email.output";
import { VerifiedResourcesService } from "@/modules/verified-resources/services/verified-resources.service";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { plainToClass } from "class-transformer";

import { ERROR_STATUS, SUCCESS_STATUS } from "@calcom/platform-constants";
import { SkipTakePagination } from "@calcom/platform-types";

@Controller({
  path: "/v2/verified-resources",
})
@UseGuards(ApiAuthGuard)
@ApiTags("Verified Resources")
export class UserVerifiedResourcesController {
  constructor(private readonly verifiedResourcesService: VerifiedResourcesService) {}
  @ApiOperation({
    summary: "Request email verification code",
    description: `Sends a verification code to the email`,
  })
  @ApiHeader(API_KEY_OR_ACCESS_TOKEN_HEADER)
  @Post("/emails/verification-code/request")
  @HttpCode(HttpStatus.OK)
  @Throttle({ limit: 5, ttl: 60000, blockDuration: 60000, name: "users_verified_resources_emails_requests" })
  async requestEmailVerificationCode(
    @Body() body: RequestEmailVerificationInput,
    @GetUser("username") username: string,
    @GetUser("locale") locale: string
  ): Promise<RequestEmailVerificationOutput> {
    const verificationCodeRequest = await this.verifiedResourcesService.requestEmailVerificationCode(
      { username, locale },
      body.email
    );

    return {
      status: verificationCodeRequest ? SUCCESS_STATUS : ERROR_STATUS,
    };
  }

  @ApiOperation({
    summary: "Verify an email",
    description: `Use code to verify an email`,
  })
  @ApiHeader(API_KEY_OR_ACCESS_TOKEN_HEADER)
  @Post("/emails/verification-code/verify")
  @Throttle({ limit: 3, ttl: 60000, blockDuration: 60000, name: "users_verified_resources_phones_verify" })
  @HttpCode(HttpStatus.OK)
  async verifyEmail(
    @Body() body: VerifyEmailInput,
    @GetUser("id") userId: number
  ): Promise<UserVerifiedEmailOutput> {
    const verifiedEmail = await this.verifiedResourcesService.verifyEmail(userId, body.email, body.code);
    return {
      status: SUCCESS_STATUS,
      data: plainToClass(UserVerifiedEmailOutputData, verifiedEmail),
    };
  }

  @ApiOperation({
    summary: "Get list of verified emails",
  })
  @ApiHeader(API_KEY_OR_ACCESS_TOKEN_HEADER)
  @Get("/emails")
  @HttpCode(HttpStatus.OK)
  async getVerifiedEmails(
    @GetUser("id") userId: number,
    @Query() pagination: SkipTakePagination
  ): Promise<UserVerifiedEmailsOutput> {
    const verifiedEmails = await this.verifiedResourcesService.getUserVerifiedEmails(
      userId,
      pagination?.skip ?? 0,
      pagination?.take ?? 250
    );
    return {
      status: SUCCESS_STATUS,
      data: verifiedEmails.map((verifiedEmail) => plainToClass(UserVerifiedEmailOutputData, verifiedEmail)),
    };
  }

  @ApiOperation({
    summary: "Get verified email by id",
  })
  @ApiHeader(API_KEY_OR_ACCESS_TOKEN_HEADER)
  @Get("/emails/:id")
  @HttpCode(HttpStatus.OK)
  async getVerifiedEmailById(
    @GetUser("id") userId: number,
    @Param("id") id: number
  ): Promise<UserVerifiedEmailOutput> {
    const verifiedEmail = await this.verifiedResourcesService.getUserVerifiedEmailById(userId, id);
    return {
      status: SUCCESS_STATUS,
      data: plainToClass(UserVerifiedEmailOutputData, verifiedEmail),
    };
  }
}
