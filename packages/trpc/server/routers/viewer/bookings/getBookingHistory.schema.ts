import { z } from "zod";

export type TGetBookingHistoryInputSchema = {
  bookingUid: string;
};

export const ZGetBookingHistoryInputSchema: z.ZodType<TGetBookingHistoryInputSchema, TGetBookingHistoryInputSchema> = z.object({
  bookingUid: z.string(),
});
