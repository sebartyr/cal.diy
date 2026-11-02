import { z } from "zod";

export type TUpdateInputSchema = {
  licenseKey?: string;
  signatureToken?: string;
};

export const ZUpdateInputSchema: z.ZodType<TUpdateInputSchema, TUpdateInputSchema> = z.object({
  licenseKey: z.string().optional(),
  signatureToken: z.string().optional(),
});
