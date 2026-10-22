import { BaseStrategy } from "@/lib/passport/strategies/types";
import { ApiAuthGuardRequest } from "@/modules/auth/strategies/api-auth/api-auth.strategy";
import { UsersService } from "@/modules/users/services/users.service";
import { UsersRepository } from "@/modules/users/users.repository";
import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";

@Injectable()
export class ApiAuthMockStrategy extends PassportStrategy(BaseStrategy, "api-auth") {
  constructor(
    private readonly email: string,
    private readonly usersRepository: UsersRepository,
    private readonly usersService: UsersService
  ) {
    super();
  }

  // authenticate() is overridden, so passport never reaches validate(); @nestjs/passport 11
  // still declares it abstract on the strategy mixin.
  validate(): never {
    throw new Error("ApiAuthMockStrategy authenticates in authenticate(); validate() is not used");
  }

  async authenticate(request: ApiAuthGuardRequest) {
    try {
      const user = await this.usersRepository.findByEmailWithProfile(this.email);
      if (!user) {
        throw new Error("User with the provided ID not found");
      }

      const organizationId = this.usersService.getUserMainOrgId(user) as number;
      request.organizationId = organizationId;

      return this.success(user);
    } catch (error) {
      console.error(error);
      if (error instanceof Error) return this.error(error);
    }
  }
}
