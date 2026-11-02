import { z } from "zod";

export type TEventTypeOrderInputSchema = {
  ids: number[];
};

export const ZEventTypeOrderInputSchema: z.ZodType<TEventTypeOrderInputSchema, TEventTypeOrderInputSchema> = z.object({
  ids: z.array(z.number()),
});
