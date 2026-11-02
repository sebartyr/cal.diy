import { UserSchema } from "@calcom/prisma/zod/modelSchema/UserSchema";
import type { z } from "zod";

// `role` is deliberately absent: it can only change through `viewer.admin.setUserRole`, which
// enforces the self/last-admin/locked guards and the audit trail. `identityProvider` is absent
// because it is owned by the sign-in flow (it is paired with `identityProviderId`, and a non-CAL
// value skips the admin password/2FA policy and enables OAuth auto-linking by email).
export const userBodySchema = UserSchema.pick({
  name: true,
  email: true,
  username: true,
  bio: true,
  timeZone: true,
  weekStart: true,
  theme: true,
  defaultScheduleId: true,
  locale: true,
  timeFormat: true,
  // brandColor: true,
  // darkBrandColor: true,
  allowDynamicBooking: true,
  avatarUrl: true,
});

export type TUserBodySchema = z.infer<typeof userBodySchema>;
