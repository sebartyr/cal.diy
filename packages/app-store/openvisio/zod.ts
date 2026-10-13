import { z } from "zod";

export const DEFAULT_MEETING_URL_PATTERN = "{apiBaseUrl}/{slug}";

export const appKeysSchema = z.object({
  // Base URL of the OpenVisio external API (provided by the Clever Cloud add-on),
  // e.g. https://visio.clever.cloud
  apiBaseUrl: z.string().url(),
  // Application credentials issued by the OpenVisio add-on, used to mint delegated
  // access tokens on behalf of the booking organizer.
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  // Fallback pattern used to build the room URL when the API response omits `url`
  // (i.e. when APPLICATION_BASE_URL is not configured on the OpenVisio side).
  // The admin app form seeds every key with "", and .default() only fills in
  // `undefined` — so an untouched field would otherwise persist as "" and
  // produce a booking with an empty meeting link.
  meetingUrlPattern: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().min(1).default(DEFAULT_MEETING_URL_PATTERN)
  ),
});

export const appDataSchema = z.object({});
