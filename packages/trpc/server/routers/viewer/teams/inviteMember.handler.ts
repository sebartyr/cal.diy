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
  await requireMember(ctx.user.id, input.teamId, MembershipRole.ADMIN);

  const invitee = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
    select: { id: true, name: true, email: true },
  });

  // MVP: require the invitee to already have an account. Sending an email-based
  // invite to a new user is a follow-up.
  if (!invitee) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "No user with this email — invitee must sign up first",
    });
  }

  const existing = await prisma.membership.findUnique({
    where: { userId_teamId: { userId: invitee.id, teamId: input.teamId } },
  });
  if (existing) {
    throw new TRPCError({ code: "CONFLICT", message: "User is already in this team" });
  }

  // Generate a verification token so the invitee can confirm.
  const token = randomBytes(24).toString("hex");
  await prisma.verificationToken.create({
    data: {
      identifier: invitee.email,
      token,
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      teamId: input.teamId,
    },
  });

  const membership = await prisma.membership.create({
    data: {
      userId: invitee.id,
      teamId: input.teamId,
      role: input.role,
      accepted: false,
    },
    select: { id: true, role: true, accepted: true },
  });

  return { membership, token };
}
