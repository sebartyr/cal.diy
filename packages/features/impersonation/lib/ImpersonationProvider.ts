import process from "node:process";
import { getImpersonationService } from "@calcom/features/impersonation/di/ImpersonationService.container";
import type {
  ImpersonatedBy,
  ImpersonationActor,
  ImpersonationIdentity,
} from "@calcom/features/impersonation/services/ImpersonationService";
import { ProfileRepository } from "@calcom/features/profile/repositories/ProfileRepository";
import { WEBAPP_URL } from "@calcom/lib/constants";
import { NextRequest } from "next/server";
import type { User } from "next-auth";
import { getToken } from "next-auth/jwt";
import CredentialsProvider from "next-auth/providers/credentials";
import { z } from "zod";
import { IMPERSONATION_PROVIDER_ID, isImpersonationExpired } from "./impersonationSession";

const credentialsSchema = z.object({
  username: z.string().optional(),
  returnToId: z.coerce.number().int().positive().optional(),
});

type RequestHeaders = Record<string, unknown> | undefined;

export async function getImpersonationActorFromHeaders(
  headers: RequestHeaders
): Promise<ImpersonationActor | null> {
  const cookieHeader = headers?.cookie;
  if (typeof cookieHeader !== "string" || !cookieHeader) return null;

  // NextAuth only forwards the raw headers to `authorize`, so the session cookie is read back
  // through a NextRequest, which is the only cookie-aware request shape `getToken` accepts.
  const req = new NextRequest(WEBAPP_URL || "http://localhost:3000", { headers: { cookie: cookieHeader } });
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub || isImpersonationExpired(token)) return null;

  const userId = Number(token.sub);
  if (!Number.isInteger(userId) || userId <= 0) return null;

  return {
    userId,
    sessionRole: token.role,
    impersonatedById: token.impersonatedBy?.id ?? null,
  };
}

async function toNextAuthUser(
  identity: ImpersonationIdentity,
  impersonatedBy?: ImpersonatedBy
): Promise<User> {
  const profiles = await ProfileRepository.findAllProfilesForUserIncludingMovedUser({
    id: identity.id,
    username: identity.username,
  });
  return {
    id: identity.id,
    uuid: identity.uuid,
    username: identity.username,
    email: identity.email,
    name: identity.name,
    role: identity.role,
    locale: identity.locale,
    profile: profiles[0],
    ...(impersonatedBy && { impersonatedBy }),
  };
}

export async function authorizeImpersonation(
  rawCredentials: Record<string, string> | undefined,
  headers: RequestHeaders
): Promise<User> {
  const credentials = credentialsSchema.parse(rawCredentials ?? {});
  const actor = await getImpersonationActorFromHeaders(headers);
  const impersonationService = getImpersonationService();

  if (credentials.returnToId !== undefined) {
    const { user } = await impersonationService.stopImpersonation({
      actor,
      returnToId: credentials.returnToId,
    });
    return toNextAuthUser(user);
  }

  const { user, impersonatedBy } = await impersonationService.startImpersonation({
    actor,
    usernameOrEmail: credentials.username ?? "",
  });
  return toNextAuthUser(user, impersonatedBy);
}

export const ImpersonationProvider = CredentialsProvider({
  id: IMPERSONATION_PROVIDER_ID,
  name: "Impersonation",
  type: "credentials",
  credentials: {
    username: { type: "text" },
    returnToId: { type: "text" },
  },
  authorize: (credentials, req) => authorizeImpersonation(credentials, req.headers),
});
