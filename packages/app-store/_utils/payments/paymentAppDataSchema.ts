import { z } from "zod";

import { RefundPolicy } from "@calcom/lib/payment/types";

import { eventTypeAppCardZod } from "../../eventTypeAppCardZod";
import { paymentOptions } from "./paymentOptions";

/**
 * Event-type metadata shared by every payment app. Lived in the stripepayment app, which was
 * the reference implementation, until it was removed; nothing here is Stripe-specific.
 */

// Extract the payment options enum from paymentOptions
// https://stackoverflow.com/a/73825370
type PaymentOption = (typeof paymentOptions)[number]["value"];
const VALUES: [PaymentOption, ...PaymentOption[]] = [
  paymentOptions[0].value,
  ...paymentOptions.slice(1).map((option) => option.value),
];

export const paymentOptionEnum = z.enum(VALUES);

export const autoChargeNoShowFeeTimeUnitEnum = z.enum(["minutes", "hours", "days"]);

export const paymentAppDataSchema = eventTypeAppCardZod.merge(
  z.object({
    price: z.number(),
    currency: z.string(),
    paymentOption: paymentOptionEnum.optional(),
    enabled: z.boolean().optional(),
    refundPolicy: z.nativeEnum(RefundPolicy).optional(),
    refundDaysCount: z.number().optional(),
    refundCountCalendarDays: z.boolean().optional(),
    autoChargeNoShowFeeIfCancelled: z.boolean().optional(),
    autoChargeNoShowFeeTimeValue: z.number().optional(),
    autoChargeNoShowFeeTimeUnit: autoChargeNoShowFeeTimeUnitEnum.optional(),
  })
);
