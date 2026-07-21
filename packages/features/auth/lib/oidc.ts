import process from "node:process";
export const OIDC_ISSUER = process.env.OIDC_ISSUER;
export const OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID;
export const OIDC_CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET;
/** Label rendered on the login button, e.g. "Keycloak". */
export const OIDC_PROVIDER_NAME = process.env.OIDC_PROVIDER_NAME || "SSO";
export const OIDC_SCOPES = process.env.OIDC_SCOPES || "openid profile email";
export const IS_OIDC_LOGIN_ENABLED = !!(
  OIDC_ISSUER &&
  OIDC_CLIENT_ID &&
  OIDC_CLIENT_SECRET &&
  process.env.OIDC_LOGIN_ENABLED === "true"
);

/**
 * Discovery endpoint. Keycloak exposes it per realm, i.e. the issuer is
 * `${host}/realms/${realm}` and this resolves to `${issuer}/.well-known/openid-configuration`.
 */
export const OIDC_WELL_KNOWN = OIDC_ISSUER
  ? `${OIDC_ISSUER.replace(/\/$/, "")}/.well-known/openid-configuration`
  : undefined;
