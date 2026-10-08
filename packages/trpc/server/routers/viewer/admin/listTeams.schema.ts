import { z } from "zod";

export const ZAdminListTeamsSchema = z.object({
  limit: z.number().min(1).max(100).default(20),
  cursor: z.number().nullish(),
  searchTerm: z.string().nullish(),
  // Resolves the labels of already selected teams, e.g. in the bookings admin filter.
  ids: z.number().array().max(100).optional(),
});

export type TAdminListTeamsSchema = z.infer<typeof ZAdminListTeamsSchema>;
