import { TRPCError } from "@trpc/server";

import { prisma } from "@calcom/prisma";
import { Prisma } from "@calcom/prisma/client";
import { MembershipRole } from "@calcom/prisma/enums";

import { requireMember } from "./permissions";
import type { TrpcSessionUser } from "../../../types";

type Options = {
  ctx: { user: NonNullable<TrpcSessionUser> };
  input: {
    teamId: number;
    name?: string;
    slug?: string;
    bio?: string | null;
    logoUrl?: string | null;
    bannerUrl?: string | null;
    brandColor?: string | null;
    darkBrandColor?: string | null;
    theme?: string | null;
    isPrivate?: boolean;
    hideBranding?: boolean;
  };
};

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export async function updateHandler({ ctx, input }: Options) {
  await requireMember(ctx.user.id, input.teamId, MembershipRole.ADMIN, ctx.user);

  if (input.slug !== undefined) {
    const slug = input.slug.toLowerCase();
    if (!SLUG_RE.test(slug)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid slug" });
    }
    input.slug = slug;
  }

  const { teamId, ...data } = input;
  try {
    return await prisma.team.update({
      where: { id: teamId },
      data,
      select: { id: true, slug: true, name: true },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new TRPCError({ code: "CONFLICT", message: "Slug already in use" });
    }
    throw e;
  }
}
