import { z } from "zod";

export type TRemoveNotificationsSubscriptionInputSchema = {
  subscription: string;
};

export const ZRemoveNotificationsSubscriptionInputSchema: z.ZodType<TRemoveNotificationsSubscriptionInputSchema, TRemoveNotificationsSubscriptionInputSchema> =
  z.object({
    subscription: z.string(),
  });
