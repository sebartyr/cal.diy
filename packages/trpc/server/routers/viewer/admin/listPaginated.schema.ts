import { z } from "zod";

export const ZListMembersSchema = z.object({
  limit: z.number().min(1).max(100),
  cursor: z.number().nullish(),
  searchTerm: z.string().nullish(),
  // Resolves the labels of already selected users, e.g. in the bookings admin filter.
  ids: z.number().array().max(100).optional(),
});

export type TListMembersSchema = z.infer<typeof ZListMembersSchema>;
