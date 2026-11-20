import process from "node:process";
import { UserPermissionRole } from "@calcom/prisma/enums";
import { isTwoFactorRequiredForAdmins } from "./systemAdminPolicy";

/** Read at call time so that ops can flip it without the value being frozen at module load. */
export function isSsoTwoFactorEnabled(): boolean {
  return process.env.SSO_TWO_FACTOR_ENABLED === "true";
}

/**
 * Whether a user who just completed Google/Azure/OIDC/SAML sign-in must also enter their TOTP code.
 *
 * Off by default: the identity provider handles its own MFA. Admins under REQUIRE_2FA_FOR_ADMIN are
 * always asked, because the admin policy only checks that 2FA is enabled on the account and would
 * otherwise grant admin powers to an SSO session that never presented the second factor.
 */
export function shouldAskTwoFactorOnSsoLogin(user: {
  twoFactorEnabled: boolean;
  role: string | null | undefined;
}): boolean {
  if (!user.twoFactorEnabled) return false;
  if (isSsoTwoFactorEnabled()) return true;
  return isTwoFactorRequiredForAdmins() && user.role === UserPermissionRole.ADMIN;
}
