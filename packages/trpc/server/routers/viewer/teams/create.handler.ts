import { TRPCError } from "@trpc/server";

import { prisma } from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";

import type { TrpcSessionUser } from "../../../types";

type Options = {
  ctx: { user: NonNullable<TrpcSessionUser> };
  input: { name: string; slug: string };
};

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export async function createHandler({ ctx, input }: Options) {
  const slug = input.slug.toLowerCase();
  if (!SLUG_RE.test(slug)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Slug must contain only lowercase letters, digits and hyphens",
    });
  }

  const clash = await prisma.team.findFirst({ where: { slug }, select: { id: true } });
  if (clash) {
    throw new TRPCError({ code: "CONFLICT", message: "Slug already in use" });
  }

  const team = await prisma.team.create({
    data: {
      slug,
      name: input.name,
      isOrganization: false,
      isPrivate: false,
      hideBranding: false,
      members: {
        create: {
          userId: ctx.user.id,
          role: MembershipRole.OWNER,
          accepted: true,
        },
      },
    },
    select: { id: true, slug: true, name: true },
  });

  return team;
}
