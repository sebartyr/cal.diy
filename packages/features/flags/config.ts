/**
 * Right now we only support boolean flags.
 * Maybe later on we can add string variants or numeric ones
 **/
export type AppFlags = {
  emails: boolean;
  "email-verification": boolean;
  "disable-signup": boolean;
  "organizer-request-email-v2": boolean;
  "salesforce-crm-tasker": boolean;
  "restriction-schedule": boolean;
  "calendar-subscription-cache": boolean;
  "calendar-subscription-sync": boolean;
  "onboarding-v3": boolean;
  "booker-botid": boolean;
  "bookings-v3": boolean;
  "booking-audit": boolean;
  "sink-shortener": boolean;
};

export type TeamFeatures = Record<keyof AppFlags, boolean>;

/**
 * Explicit state for API/UI layer.
 * - "enabled": row with enabled = true
 * - "disabled": row with enabled = false
 * - "inherit": no row
 */
export type FeatureState = "enabled" | "disabled" | "inherit";

export type FeatureId = keyof AppFlags;
