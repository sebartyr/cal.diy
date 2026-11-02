import { z } from "zod";

export type TAddSecondaryEmailInputSchema = {
  email: string;
  makePrimary?: boolean;
  redirectTo?: string;
};

export const ZAddSecondaryEmailInputSchema: z.ZodType<TAddSecondaryEmailInputSchema, TAddSecondaryEmailInputSchema> = z.object({
  email: z.string(),
  makePrimary: z.boolean().optional(),
  redirectTo: z.string().optional(),
});
