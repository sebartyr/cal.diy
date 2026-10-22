import { NextAuthPassportStrategy } from "@/lib/passport/strategies/types";
import { UsersRepository } from "@/modules/users/users.repository";
import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";

@Injectable()
export class NextAuthMockStrategy extends PassportStrategy(NextAuthPassportStrategy, "next-auth") {
  constructor(private readonly email: string, private readonly userRepository: UsersRepository) {
    super();
  }
  // authenticate() is overridden, so passport never reaches validate(); @nestjs/passport 11
  // still declares it abstract on the strategy mixin.
  validate(): never {
    throw new Error("NextAuthMockStrategy authenticates in authenticate(); validate() is not used");
  }

  async authenticate() {
    try {
      const user = await this.userRepository.findByEmailWithProfile(this.email);
      if (!user) {
        throw new Error("User with the provided email not found");
      }

      return this.success(user);
    } catch (error) {
      console.error(error);
      if (error instanceof Error) return this.error(error);
    }
  }
}
