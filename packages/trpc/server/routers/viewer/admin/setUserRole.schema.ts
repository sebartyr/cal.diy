import { z } from "zod";

export const ZAdminSetUserRoleSchema = z.object({
  userId: z.number().int().positive(),
  role: z.enum(["USER", "ADMIN"]),
});

export type TAdminSetUserRoleSchema = z.infer<typeof ZAdminSetUserRoleSchema>;
