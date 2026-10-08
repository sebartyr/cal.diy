import { bindModuleToClassOnToken, createModule, type ModuleLoader } from "@calcom/features/di/di";
import { moduleLoader as userRepositoryModuleLoader } from "@calcom/features/di/modules/User";
import { ImpersonationService } from "@calcom/features/impersonation/services/ImpersonationService";
import { moduleLoader as impersonationRepositoryModuleLoader } from "./ImpersonationRepository.module";
import { IMPERSONATION_DI_TOKENS } from "./tokens";

const thisModule = createModule();
const token = IMPERSONATION_DI_TOKENS.IMPERSONATION_SERVICE;
const moduleToken = IMPERSONATION_DI_TOKENS.IMPERSONATION_SERVICE_MODULE;

const loadModule = bindModuleToClassOnToken({
  module: thisModule,
  moduleToken,
  token,
  classs: ImpersonationService,
  depsMap: {
    userRepository: userRepositoryModuleLoader,
    impersonationRepository: impersonationRepositoryModuleLoader,
  },
});

export const moduleLoader: ModuleLoader = {
  token,
  loadModule,
};

export type { ImpersonationService };
