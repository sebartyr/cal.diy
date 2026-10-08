import { bindModuleToClassOnToken, createModule, type ModuleLoader } from "@calcom/features/di/di";
import { moduleLoader as prismaModuleLoader } from "@calcom/features/di/modules/Prisma";
import { UserRoleRepository } from "@calcom/features/users/repositories/UserRoleRepository";
import { USERS_DI_TOKENS } from "./tokens";

const thisModule = createModule();
const token = USERS_DI_TOKENS.USER_ROLE_REPOSITORY;
const moduleToken = USERS_DI_TOKENS.USER_ROLE_REPOSITORY_MODULE;

const loadModule = bindModuleToClassOnToken({
  module: thisModule,
  moduleToken,
  token,
  classs: UserRoleRepository,
  dep: prismaModuleLoader,
});

export const moduleLoader: ModuleLoader = {
  token,
  loadModule,
};

export type { UserRoleRepository };
