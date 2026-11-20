import { HttpError } from "@calcom/lib/http-error";
import logger from "@calcom/lib/logger";
import prisma from "@calcom/prisma";
import type { NextApiRequest } from "next";
import { decodeOAuthState } from "../oauth/decodeOAuthState";
import { throwIfNotHaveAdminAccessToTeam } from "../throwIfNotHaveAdminAccessToTeam";

/**
 * This function is used to create app credentials for either a user or a team
 *
 * @param appData information about the app
 * @param appData.type the app slug
 * @param appData.appId the app slug
 * @param key the keys for the app's credentials
 * @param req the request object from the API call. Used to determine if the credential belongs to a user or a team
 */
const createOAuthAppCredential = async (
  appData: { type: string; appId: string },
  key: unknown,
  req: NextApiRequest
) => {
  const userId = req.session?.user.id;
  if (!userId) {
    throw new HttpError({ statusCode: 401, message: "You must be logged in to do this" });
  }
  // SEC-102: every OAuth /add route signs the state, so a callback reaching this point without a
  // session-bound nonce is a forged or replayed redirect; never attach the provider's tokens to it.
  const state = decodeOAuthState(req);
  if (!state) {
    throw new HttpError({ statusCode: 400, message: "Missing or invalid OAuth state" });
  }

  if (state.teamId) {
    // Check that the user belongs to the team
    await throwIfNotHaveAdminAccessToTeam({ teamId: state.teamId, userId });

    const teamCredential = await prisma.credential.create({
      data: {
        type: appData.type,
        key: key || {},
        teamId: state.teamId,
        appId: appData.appId,
      },
      select: { id: true },
    });
    logCredentialCreated(teamCredential.id, appData, { userId, teamId: state.teamId });
    return teamCredential;
  }

  const userCredential = await prisma.credential.create({
    data: {
      type: appData.type,
      key: key || {},
      userId,
      appId: appData.appId,
    },
    select: { id: true },
  });
  logCredentialCreated(userCredential.id, appData, { userId, teamId: null });
  return userCredential;
};

const logCredentialCreated = (
  credentialId: number,
  appData: { type: string; appId: string },
  owner: { userId: number; teamId: number | null }
) => {
  logger.getSubLogger({ prefix: ["createOAuthAppCredential"] }).info("OAuth credential created", {
    credentialId,
    type: appData.type,
    appId: appData.appId,
    ...owner,
  });
};

export default createOAuthAppCredential;
