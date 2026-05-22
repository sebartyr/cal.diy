import jwt from "jsonwebtoken";

import prisma from "@calcom/prisma";
import type { OAuthTokenPayload } from "@calcom/types/oauth";

/**
 * SEC-003: the previous implementation called
 *
 *     jwt.verify(token, process.env.CALENDSO_ENCRYPTION_KEY || "")
 *
 * which had two failure modes:
 *
 *   1. If the env var was unset/empty, jsonwebtoken was handed an empty key,
 *      which silently means "no signature validation" depending on the alg
 *      claim in the token header (e.g. `alg: none` or HS256 with empty key).
 *      Tokens forged by anyone could pass verify().
 *   2. The `catch` swallowed *all* errors as `return null`, so a misconfigured
 *      instance behaved exactly like one rejecting a bad token — silent
 *      operational failure mode, hard to detect.
 *
 * Fail loud and early: refuse to even attempt verify if the key is unset.
 * Callers still see `null` for a genuinely invalid token, but a missing
 * server-side key throws and surfaces in logs.
 */
function getJwtKeyOrThrow(): string {
  const key = process.env.CALENDSO_ENCRYPTION_KEY;
  if (!key || key.length === 0) {
    throw new Error(
      "CALENDSO_ENCRYPTION_KEY is not configured. Refusing to verify OAuth tokens with an empty key " +
        "(would accept forged JWTs). Set CALENDSO_ENCRYPTION_KEY in the deployment environment."
    );
  }
  return key;
}

export default async function isAuthorized(token: string, requiredScopes: string[] = []) {
  // Boot-style assertion: a misconfigured key is an operational bug, not a
  // bad token. Let it propagate so the caller logs it / fails the request
  // with a 500, instead of pretending it was a 401.
  const key = getJwtKeyOrThrow();

  let decodedToken: OAuthTokenPayload;
  try {
    decodedToken = jwt.verify(token, key) as OAuthTokenPayload;
  } catch {
    return null;
  }

  if (!decodedToken) return null;
  const hasAllRequiredScopes = requiredScopes.every((scope) => decodedToken.scope.includes(scope));

  if (!hasAllRequiredScopes || decodedToken.token_type !== "Access Token") {
    return null;
  }

  if (decodedToken.userId) {
    const user = await prisma.user.findUnique({
      where: {
        id: decodedToken.userId,
      },
      select: {
        id: true,
        username: true,
      },
    });

    if (!user) return null;

    return { id: user.id, name: user.username, isTeam: false };
  }

  if (decodedToken.teamId) {
    const team = await prisma.team.findUnique({
      where: {
        id: decodedToken.teamId,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!team) return null;
    return { ...team, isTeam: true };
  }

  return null;
}
