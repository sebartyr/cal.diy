import logger from "@calcom/lib/logger";
import prisma from "@calcom/prisma";
import type { CredentialPayload } from "@calcom/types/Credential";

export const invalidateCredential = async (credentialId: CredentialPayload["id"]) => {
  const credential = await prisma.credential.findUnique({
    where: {
      id: credentialId,
    },
  });

  if (credential) {
    await prisma.credential.update({
      where: {
        id: credentialId,
      },
      data: {
        invalid: true,
      },
    });
    // An invalid credential is skipped everywhere without further logs, so this is the only trace
    // of why an integration stopped working until it is reconnected.
    logger.getSubLogger({ prefix: ["invalidateCredential"] }).warn("Credential marked invalid", {
      credentialId,
      type: credential.type,
      appId: credential.appId,
      userId: credential.userId,
      teamId: credential.teamId,
    });
  }
};
