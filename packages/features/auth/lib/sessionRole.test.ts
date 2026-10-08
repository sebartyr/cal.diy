import { describe, expect, it } from "vitest";
import { getEffectivePermissionRole, getEffectiveSessionRole } from "./sessionRole";

describe("sessionRole", () => {
  it.each([
    ["USER", "ADMIN", "USER", "USER"],
    ["INACTIVE_ADMIN", "ADMIN", "INACTIVE_ADMIN", "USER"],
    [undefined, "ADMIN", "USER", "USER"],
    [null, "ADMIN", "USER", "USER"],
    ["ADMIN", "ADMIN", "ADMIN", "ADMIN"],
    ["ADMIN", "USER", "USER", "USER"],
    ["INACTIVE_ADMIN", "USER", "USER", "USER"],
    ["USER", "USER", "USER", "USER"],
  ] as const)("token %s + DB %s -> session %s, permission %s", (tokenRole, dbRole, sessionRole, permissionRole) => {
    expect(getEffectiveSessionRole(tokenRole, dbRole)).toBe(sessionRole);
    expect(getEffectivePermissionRole(tokenRole, dbRole)).toBe(permissionRole);
  });
});
