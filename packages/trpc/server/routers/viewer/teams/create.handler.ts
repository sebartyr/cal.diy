import { prisma } from "@calcom/prisma";
import { Prisma } from "@calcom/prisma/client";
import { MembershipRole } from "@calcom/prisma/enums";
import { TRPCError } from "@trpc/server";
import type { TrpcSessionUser } from "../../../types";

type Options = {
  ctx: { user: NonNullable<TrpcSessionUser> };
  input: { name: string; slug: string };
};

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * Parse the comma-separated TEAMS_ALLOWED_EMAIL_DOMAINS env var into a
 * normalized set. Empty/unset → no restriction (open instance behavior).
 *
 * Use plural form so the same var also covers SSO scenarios with multiple
 * employer-owned domains (e.g. `clever-cloud.com,clever-cloud.dev`).
 */
export function getAllowedEmailDomains(): Set<string> | null {
  const raw = process.env.TEAMS_ALLOWED_EMAIL_DOMAINS;
  if (!raw) return null;
  const domains = raw
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  return domains.length > 0 ? new Set(domains) : null;
}

export async function createHandler({ ctx, input }: Options) {
  // Optional gate for self-host instances that should only let employees
  // create teams. Off by default — set TEAMS_ALLOWED_EMAIL_DOMAINS to enable.
  const allowedDomains = getAllowedEmailDomains();
  if (allowedDomains) {
    const callerDomain = ctx.user.email?.split("@")[1]?.toLowerCase();
    if (!callerDomain || !allowedDomains.has(callerDomain)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Your account's email domain is not allowed to create teams on this instance",
      });
    }
  }

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
