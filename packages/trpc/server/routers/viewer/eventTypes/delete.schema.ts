import { z } from "zod";

export type TDeleteInputSchema = {
  id: number;
};

export const ZDeleteInputSchema: z.ZodType<TDeleteInputSchema, TDeleteInputSchema> = z.object({
  id: z.number(),
});
