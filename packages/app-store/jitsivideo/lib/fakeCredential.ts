import type { CredentialForCalendarService } from "@calcom/types/Credential";
import { metadata } from "../_metadata";

/**
 * Synthetic credential used when a booking's video location has no matching credential.
 *
 * Replaces FAKE_DAILY_CREDENTIAL now that Cal Video is removed. The Jitsi adapter reads
 * nothing from its credential — the host and path pattern come from the App row's keys,
 * defaulting to meet.jit.si — so an empty key is all it needs.
 */
export const FAKE_JITSI_CREDENTIAL: CredentialForCalendarService & { invalid: boolean } = {
  id: 0,
  type: metadata.type,
  key: {},
  userId: 0,
  user: { email: "" },
  appId: metadata.slug,
  invalid: false,
  teamId: null,
  encryptedKey: null,
  delegatedToId: null,
  delegatedTo: null,
  delegationCredentialId: null,
};
