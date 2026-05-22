import { z } from "zod";

import { MembershipRole } from "@calcom/prisma/enums";

export const ZTeamIdInput = z.object({ teamId: z.number().int().positive() });

// SEC-306-FORK (Sprint 4): adminDelete needs an explicit `force` flag to
// destroy a team that still has future/active bookings, so an admin can't
// nuke a tenant by mistake.
export const ZAdminDeleteInput = z.object({
  teamId: z.number().int().positive(),
  force: z.boolean().optional(),
});

export const ZCreateInput = z.object({
  name: z.string().min(1).max(80),
  slug: z.string().min(1).max(64),
});

// SEC-304-FORK (Sprint 4): cap a `logoUrl` / `bannerUrl` payload tighter.
// Web URLs are far under 2 KB, and the ImageUploader produces resized PNG
// data: URLs around 30–80 KB after the Sprint-4 client resize. 256 KB
// leaves headroom for an oversized crop without letting a team admin DoS
// the row by stuffing megabytes of base64 into the column (which then
// fans out into every booking page payload that includes the team logo).
const MAX_IMAGE_FIELD_LENGTH = 256 * 1024;

// Accept either a short http(s) URL (rare path: external host) or a
// reasonable-sized data: URL (common path: inline base64). The string max
// is the ultimate guard, but we also reject obvious data:* mime types we
// don't want (data:text/html etc.).
const imageField = z
  .string()
  .max(MAX_IMAGE_FIELD_LENGTH)
  .refine(
    (s) => !s.startsWith("data:") || /^data:image\/(png|jpe?g|svg\+xml|webp);/i.test(s),
    "Only PNG/JPEG/SVG/WebP data URIs are allowed for image fields"
  )
  .nullable()
  .optional();

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

// BUG-101-FORK (Sprint 4): cursor-based pagination so the admin team listing
// can scale past the previous hardcoded take: 200 cap.
export const ZAdminListInput = z.object({
  search: z.string().max(128).optional(),
  limit: z.number().int().positive().max(200).default(50).optional(),
  cursor: z.number().int().positive().optional(),
});

export const ZAddMembersToEventTypesInput = z.object({
  teamId: z.number().int().positive(),
  eventTypeIds: z.array(z.number().int().positive()).min(1),
  userIds: z.array(z.number().int().positive()).min(1),
});
