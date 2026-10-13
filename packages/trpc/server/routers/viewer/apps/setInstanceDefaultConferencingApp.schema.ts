import { z } from "zod";

export const ZSetInstanceDefaultConferencingAppInputSchema = z.object({
  /** Null clears the deployment default and restores the built-in fallback. */
  slug: z.string().min(1).nullable(),
});

export type TSetInstanceDefaultConferencingAppInputSchema = z.infer<
  typeof ZSetInstanceDefaultConferencingAppInputSchema
>;
