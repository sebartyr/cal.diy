import { createContainer } from "@calcom/features/di/di";
import { type UserRoleService, moduleLoader as userRoleServiceModuleLoader } from "./UserRoleService.module";

const userRoleServiceContainer = createContainer();

export function getUserRoleService(): UserRoleService {
  userRoleServiceModuleLoader.loadModule(userRoleServiceContainer);
  return userRoleServiceContainer.get<UserRoleService>(userRoleServiceModuleLoader.token);
}
