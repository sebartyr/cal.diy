import { bindModuleToClassOnToken, createModule, type ModuleLoader } from "@calcom/features/di/di";
import { moduleLoader as prismaModuleLoader } from "@calcom/features/di/modules/Prisma";
import { ImpersonationRepository } from "@calcom/features/impersonation/repositories/ImpersonationRepository";
import { IMPERSONATION_DI_TOKENS } from "./tokens";

const thisModule = createModule();
const token = IMPERSONATION_DI_TOKENS.IMPERSONATION_REPOSITORY;
const moduleToken = IMPERSONATION_DI_TOKENS.IMPERSONATION_REPOSITORY_MODULE;

const loadModule = bindModuleToClassOnToken({
  module: thisModule,
  moduleToken,
  token,
  classs: ImpersonationRepository,
  dep: prismaModuleLoader,
});

export const moduleLoader: ModuleLoader = {
  token,
  loadModule,
};

export type { ImpersonationRepository };
