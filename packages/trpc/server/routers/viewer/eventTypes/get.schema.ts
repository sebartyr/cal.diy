import { z } from "zod";

export type TGetInputSchema = {
  id: number;
};

export const ZGetInputSchema: z.ZodType<TGetInputSchema, TGetInputSchema> = z.object({
  id: z.number(),
});
