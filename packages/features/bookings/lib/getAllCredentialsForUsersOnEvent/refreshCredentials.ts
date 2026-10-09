import { buildAllCredentials } from "@calcom/app-store/delegationCredential";
import { CredentialRepository } from "@calcom/features/credentials/repositories/CredentialRepository";
import { isDelegationCredential } from "@calcom/lib/delegationCredential";
import { withReporting } from "@calcom/lib/sentryWrapper";
import prisma from "@calcom/prisma";
import type { CredentialForCalendarService, CredentialPayload } from "@calcom/types/Credential";

/**
 * Refreshes the given set of credentials.
 *
 * @param credentials
 */
const _refreshCredentials = async (
  credentials: Array<CredentialForCalendarService>
): Promise<Array<CredentialForCalendarService>> => {
  const nonDelegationCredentials = credentials.filter(
    (cred) => !isDelegationCredential({ credentialId: cred.id })
  );
  const delegationCredentials = credentials.filter((cred) =>
    isDelegationCredential({ credentialId: cred.id })
  );
  const freshCredentials = await new CredentialRepository(prisma).findManyForCalendarServiceByIds({
    ids: nonDelegationCredentials.map((cred) => cred.id),
  });
  const freshCredentialsById = new Map<number, CredentialPayload>(
    freshCredentials.map((cred) => [cred.id, cred])
  );
  // A credential deleted since it was loaded is kept as-is rather than dropped
  const refreshedDbCredentials: CredentialPayload[] = nonDelegationCredentials.map(
    (cred) => freshCredentialsById.get(cred.id) ?? cred
  );
  return buildAllCredentials({ delegationCredentials, existingCredentials: refreshedDbCredentials });
};

export const refreshCredentials = withReporting(_refreshCredentials, "refreshCredentials");
