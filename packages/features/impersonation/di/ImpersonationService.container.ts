import { createContainer } from "@calcom/features/di/di";
import {
  type ImpersonationService,
  moduleLoader as impersonationServiceModuleLoader,
} from "./ImpersonationService.module";

const impersonationServiceContainer = createContainer();

export function getImpersonationService(): ImpersonationService {
  impersonationServiceModuleLoader.loadModule(impersonationServiceContainer);
  return impersonationServiceContainer.get<ImpersonationService>(impersonationServiceModuleLoader.token);
}
