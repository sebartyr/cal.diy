import { adminUserSelect } from "@calcom/features/users/repositories/UserRepository";
import type { PrismaClient } from "@calcom/prisma";
import { CreationSource, UserPermissionRole } from "@calcom/prisma/enums";
import type { TUserBodySchema } from "./userBody.schema";

type AddOptions = {
  ctx: {
    prisma: PrismaClient;
  };
  input: TUserBodySchema;
};

const addHandler = async ({ ctx, input }: AddOptions) => {
  const user = await ctx.prisma.user.create({
    data: {
      ...input,
      role: UserPermissionRole.USER,
      creationSource: CreationSource.WEBAPP,
      // The address is vouched for by an instance admin, not self-declared. Without this the
      // OAuth/OIDC sign-in refuses to link the account (pre-hijacking guard), and an admin-created
      // user has no password, so they could never log in at all.
      emailVerified: new Date(),
    },
    select: adminUserSelect,
  });
  return { user, message: `User with id: ${user.id} added successfully` };
};

export default addHandler;
