import { z } from "zod";

import { MembershipRole } from "@calcom/prisma/enums";

export const ZTeamIdInput = z.object({ teamId: z.number().int().positive() });

export const ZCreateInput = z.object({
  name: z.string().min(1).max(80),
  slug: z.string().min(1).max(64),
});

export const ZUpdateInput = z.object({
  teamId: z.number().int().positive(),
  name: z.string().min(1).max(80).optional(),
  slug: z.string().min(1).max(64).optional(),
  bio: z.string().nullable().optional(),
  logoUrl: z.string().nullable().optional(),
  bannerUrl: z.string().nullable().optional(),
  brandColor: z.string().nullable().optional(),
  darkBrandColor: z.string().nullable().optional(),
  theme: z.string().nullable().optional(),
  isPrivate: z.boolean().optional(),
  hideBranding: z.boolean().optional(),
});

export const ZRemoveMemberInput = z.object({
  teamId: z.number().int().positive(),
  memberId: z.number().int().positive(),
});

export const ZChangeMemberRoleInput = z.object({
  teamId: z.number().int().positive(),
  memberId: z.number().int().positive(),
  role: z.nativeEnum(MembershipRole),
});

export const ZInviteMemberInput = z.object({
  teamId: z.number().int().positive(),
  email: z.string().email(),
  role: z.nativeEnum(MembershipRole),
});

export const ZAcceptOrLeaveInput = z.object({
  teamId: z.number().int().positive(),
  accept: z.boolean(),
});

export const ZAddMembersToEventTypesInput = z.object({
  teamId: z.number().int().positive(),
  eventTypeIds: z.array(z.number().int().positive()).min(1),
  userIds: z.array(z.number().int().positive()).min(1),
});
