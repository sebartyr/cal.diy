import { createContainer } from "@calcom/features/di/di";
import {
  type TeamRolePermissionService,
  moduleLoader as teamRolePermissionServiceModuleLoader,
} from "./TeamRolePermissionService.module";

const container = createContainer();

export function getTeamRolePermissionService(): TeamRolePermissionService {
  teamRolePermissionServiceModuleLoader.loadModule(container);
  return container.get<TeamRolePermissionService>(teamRolePermissionServiceModuleLoader.token);
}
