import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export const GetPlatformTeamId = createParamDecorator((_: unknown, ctx: ExecutionContext): number => {
  const request = ctx.switchToHttp().getRequest();
  const platformTeamId = request.platformTeamId;

  if (!platformTeamId) {
    throw new Error("GetPlatformTeamId decorator: platformTeamId not found, is PlatformTeamRolesGuard applied?");
  }

  return platformTeamId;
});
