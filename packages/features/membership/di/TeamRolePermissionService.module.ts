import { bindModuleToClassOnToken, createModule, type ModuleLoader } from "@calcom/features/di/di";
import { DI_TOKENS } from "@calcom/features/di/tokens";
import { TeamRolePermissionService } from "@calcom/features/membership/services/TeamRolePermissionService";
import { moduleLoader as membershipRepositoryModuleLoader } from "@calcom/features/users/di/MembershipRepository.module";

const thisModule = createModule();
const token = DI_TOKENS.TEAM_ROLE_PERMISSION_SERVICE;
const moduleToken = DI_TOKENS.TEAM_ROLE_PERMISSION_SERVICE_MODULE;
const loadModule = bindModuleToClassOnToken({
  module: thisModule,
  moduleToken,
  token,
  classs: TeamRolePermissionService,
  dep: membershipRepositoryModuleLoader,
});

export const moduleLoader: ModuleLoader = {
  token,
  loadModule,
};

export type { TeamRolePermissionService };
