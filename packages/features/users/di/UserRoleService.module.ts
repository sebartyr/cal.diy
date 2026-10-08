import { bindModuleToClassOnToken, createModule, type ModuleLoader } from "@calcom/features/di/di";
import { UserRoleService } from "@calcom/features/users/services/UserRoleService";
import { USERS_DI_TOKENS } from "./tokens";
import { moduleLoader as userRoleRepositoryModuleLoader } from "./UserRoleRepository.module";

const thisModule = createModule();
const token = USERS_DI_TOKENS.USER_ROLE_SERVICE;
const moduleToken = USERS_DI_TOKENS.USER_ROLE_SERVICE_MODULE;

const loadModule = bindModuleToClassOnToken({
  module: thisModule,
  moduleToken,
  token,
  classs: UserRoleService,
  depsMap: {
    userRoleRepository: userRoleRepositoryModuleLoader,
  },
});

export const moduleLoader: ModuleLoader = {
  token,
  loadModule,
};

export type { UserRoleService };
