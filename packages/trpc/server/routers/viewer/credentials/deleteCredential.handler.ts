import handleDeleteCredential from "@calcom/features/credentials/handleDeleteCredential";
import { MembershipRole } from "@calcom/prisma/enums";
import type { TrpcSessionUser } from "@calcom/trpc/server/types";
import { requireMember } from "../teams/permissions";
import type { TDeleteCredentialInputSchema } from "./deleteCredential.schema";

type DeleteCredentialOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
  };
  input: TDeleteCredentialInputSchema;
};

export const deleteCredentialHandler = async ({ ctx, input }: DeleteCredentialOptions) => {
  const { user } = ctx;
  const { id, teamId } = input;

  // handleDeleteCredential scopes team credentials by teamId only, so the
  // caller's right to administer that team has to be enforced here.
  if (teamId) {
    await requireMember(user.id, teamId, MembershipRole.ADMIN, user);
  }

  await handleDeleteCredential({ userId: user.id, userMetadata: user.metadata, credentialId: id, teamId });
};
