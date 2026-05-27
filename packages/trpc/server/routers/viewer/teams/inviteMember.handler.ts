import { randomBytes } from "node:crypto";
import { sendTeamInviteEmail } from "@calcom/emails/organization-email-service";
import { getTranslation } from "@calcom/i18n/server";
import { WEBAPP_URL } from "@calcom/lib/constants";
import logger from "@calcom/lib/logger";
import { prisma } from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";
import { TRPCError } from "@trpc/server";
import type { TrpcSessionUser } from "../../../types";
import { requireMember } from "./permissions";

const log = logger.getSubLogger({ prefix: ["teams.inviteMember"] });

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

  // SEC-302-FORK / BUG-100-FORK: send the actual invite email. The DB write
  // above is already committed at this point — if email delivery fails the
  // invitee can still accept via the in-app team list, so we log and swallow
  // the error rather than rolling back the membership.
  try {
    const team = await prisma.team.findUnique({
      where: { id: input.teamId },
      select: { name: true, parent: { select: { name: true } }, isOrganization: true },
    });
    if (team) {
      const language = await getTranslation(invitee.email ? "en" : "en", "common");
      await sendTeamInviteEmail({
        language,
        from: ctx.user.name ?? ctx.user.email ?? "Cal.diy",
        to: invitee.email,
        teamName: team.name,
        // Token-bearing link so the invitee can verify ownership of the
        // email even if they're not currently logged into the matching
        // account. The token is consumed by the accept flow.
        //
        // BUG-103-FORK: the callbackUrl must be URL-encoded — otherwise the
        // nested `?inviteToken=` is parsed as a param of `/auth/login` and the
        // token is dropped. It also has to point at a route that exists in this
        // fork: there is no `/teams` page, only `/settings/teams`, which reads
        // the token and auto-accepts the matching pending invite.
        joinLink: `${WEBAPP_URL}/auth/login?callbackUrl=${encodeURIComponent(
          `/settings/teams?inviteToken=${token}`
        )}`,
        isCalcomMember: true,
        isAutoJoin: false,
        isOrg: !!team.isOrganization,
        parentTeamName: team.parent?.name ?? undefined,
        isExistingUserMovedToOrg: false,
        prevLink: null,
        newLink: null,
      });
    }
  } catch (err) {
    log.error("Failed to send invite email — membership row still created", {
      teamId: input.teamId,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  return { ok: true as const };
}
