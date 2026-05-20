import { TRPCError } from "@trpc/server";

import { prisma } from "@calcom/prisma";
import { Prisma } from "@calcom/prisma/client";
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

  // Pre-check is a UX nicety; the real uniqueness guarantee comes from the
  // catch on P2002 below (the application-level check is racy under load).
  const clash = await prisma.team.findFirst({ where: { slug }, select: { id: true } });
  if (clash) {
    throw new TRPCError({ code: "CONFLICT", message: "Slug already in use" });
  }

  try {
    return await prisma.team.create({
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
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new TRPCError({ code: "CONFLICT", message: "Slug already in use" });
    }
    throw e;
  }
}
