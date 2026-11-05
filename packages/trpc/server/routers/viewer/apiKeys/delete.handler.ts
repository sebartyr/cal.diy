import { PrismaApiKeyRepository } from "@calcom/features/api-keys-legacy/api-keys/repositories/PrismaApiKeyRepository";
import type { PrismaClient } from "@calcom/prisma";
import { TRPCError } from "@trpc/server";
import type { TrpcSessionUser } from "../../../types";
import type { TDeleteInputSchema } from "./delete.schema";

type DeleteOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
    prisma: PrismaClient;
  };
  input: TDeleteInputSchema;
};

export const deleteHandler = async ({ ctx, input }: DeleteOptions) => {
  const { id } = input;

  const deletedCount = await new PrismaApiKeyRepository(ctx.prisma).deleteByIdAndUserId({
    id,
    userId: ctx.user.id,
  });

  if (deletedCount === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: `API key ${id} not found for this user` });
  }

  return {
    id,
  };
};
