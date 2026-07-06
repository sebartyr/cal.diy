import { z } from "zod";

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
  meetingUrlPattern: z.string().default("{apiBaseUrl}/{slug}"),
});

export const appDataSchema = z.object({});
