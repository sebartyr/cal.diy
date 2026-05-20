import { z } from "zod";

import { MembershipRole } from "@calcom/prisma/enums";

export const ZTeamIdInput = z.object({ teamId: z.number().int().positive() });

export const ZCreateInput = z.object({
  name: z.string().min(1).max(80),
  slug: z.string().min(1).max(64),
});

// Caps a `logoUrl` / `bannerUrl` payload. Web URLs are far under 2 KB, base64
// data URLs from the ImageUploader (512×512 PNG) land around 250–500 KB.
// 1 MB leaves headroom for a slightly larger crop without letting a team
// admin DoS the row by stuffing megabytes of base64 into the column.
const MAX_IMAGE_FIELD_LENGTH = 1_048_576;

const imageField = z.string().max(MAX_IMAGE_FIELD_LENGTH).nullable().optional();

export const ZUpdateInput = z.object({
  teamId: z.number().int().positive(),
  name: z.string().min(1).max(80).optional(),
  slug: z.string().min(1).max(64).optional(),
  bio: z.string().max(8_000).nullable().optional(),
  logoUrl: imageField,
  bannerUrl: imageField,
  brandColor: z.string().max(32).nullable().optional(),
  darkBrandColor: z.string().max(32).nullable().optional(),
  theme: z.string().max(64).nullable().optional(),
  isPrivate: z.boolean().optional(),
  hideBranding: z.boolean().optional(),
});

export const ZRemoveMemberInput = z.object({
  teamId: z.number().int().positive(),
  // Despite the historic `memberId` name, this is the *user* id (the
  // Membership compound key is (userId, teamId), not its own row id).
  userId: z.number().int().positive(),
});

export const ZChangeMemberRoleInput = z.object({
  teamId: z.number().int().positive(),
  userId: z.number().int().positive(),
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
  // SEC-302-FORK: optional invite token issued by inviteMember.
  inviteToken: z.string().min(32).max(64).optional(),
});

export const ZAdminListInput = z.object({
  search: z.string().max(128).optional(),
});

export const ZAddMembersToEventTypesInput = z.object({
  teamId: z.number().int().positive(),
  eventTypeIds: z.array(z.number().int().positive()).min(1),
  userIds: z.array(z.number().int().positive()).min(1),
});
