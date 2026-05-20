import { TRPCError } from "@trpc/server";
import { randomBytes } from "node:crypto";

import { prisma } from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";

import { requireMember } from "./permissions";
import type { TrpcSessionUser } from "../../../types";

type Options = {
  ctx: { user: NonNullable<TrpcSessionUser> };
  input: {
    teamId: number;
    /** Email of the invitee. Must already have an account in this MVP. */
    email: string;
    role: MembershipRole;
  };
};

export async function inviteMemberHandler({ ctx, input }: Options) {
  await requireMember(ctx.user.id, input.teamId, MembershipRole.ADMIN, ctx.user);

  const invitee = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
    select: { id: true, name: true, email: true },
  });

  // MVP: require the invitee to already have an account. We deliberately
  // return the same opaque response whether the email exists, is already a
  // member, or was just added — so a team admin can't enumerate accounts /
  // memberships from the response.
  if (!invitee) {
    return { ok: true as const };
  }

  const existing = await prisma.membership.findUnique({
    where: { userId_teamId: { userId: invitee.id, teamId: input.teamId } },
    select: { id: true },
  });
  if (existing) {
    return { ok: true as const };
  }

  // Token + membership creation must be atomic — otherwise a partial failure
  // leaves an orphan verification token tied to the invitee's email.
  const token = randomBytes(24).toString("hex");
  await prisma.$transaction([
    prisma.verificationToken.create({
      data: {
        identifier: invitee.email,
        token,
        expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        teamId: input.teamId,
      },
    }),
    prisma.membership.create({
      data: {
        userId: invitee.id,
        teamId: input.teamId,
        role: input.role,
        accepted: false,
      },
    }),
  ]);

  // TODO: send the invitation email containing `token`. The token is kept
  // server-side; never return it to the client.
  return { ok: true as const };
}
