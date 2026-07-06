import logger from "@calcom/lib/logger";
import type { CalendarEvent } from "@calcom/types/Calendar";
import type { CredentialPayload } from "@calcom/types/Credential";
import type { PartialReference } from "@calcom/types/EventManager";
import type { VideoApiAdapter, VideoCallData } from "@calcom/types/VideoApiAdapter";
import { z } from "zod";
import { getOpenVisioAppKeys } from "./getOpenVisioAppKeys";
import { openVisioFetcher } from "./openVisioApiFetcher";

const OPENVISIO_TYPE = "openvisio_video";

const log = logger.getSubLogger({ prefix: ["app-store/openvisio/VideoApiAdapter"] });

const roomResponseSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  slug: z.string(),
  pin_code: z.string().nullish(),
  // `url` is only returned when APPLICATION_BASE_URL is configured on the OpenVisio side.
  url: z.string().url().nullish(),
});

function buildRoomUrl(pattern: string, apiBaseUrl: string, slug: string): string {
  return pattern.replaceAll("{apiBaseUrl}", apiBaseUrl.replace(/\/$/, "")).replaceAll("{slug}", slug);
}

const OpenVisioVideoApiAdapter = (credential: CredentialPayload): VideoApiAdapter => {
  // The delegated token that authorizes room deletion is scoped per user; deleteMeeting only
  // receives the room id, so we fall back to the installing user's email for cleanup.
  const credentialEmail = credential.user?.email;

  return {
    getAvailability: () => Promise.resolve([]),
    createMeeting: async (event: CalendarEvent): Promise<VideoCallData> => {
      const { apiBaseUrl, meetingUrlPattern } = await getOpenVisioAppKeys();
      const room = await openVisioFetcher<unknown>(event.organizer.email, "/rooms/", {
        method: "POST",
        body: JSON.stringify({}),
      }).then(roomResponseSchema.parse);

      return {
        type: OPENVISIO_TYPE,
        id: room.slug,
        password: room.pin_code ?? "",
        url: room.url ?? buildRoomUrl(meetingUrlPattern, apiBaseUrl, room.slug),
      };
    },
    deleteMeeting: async (uid: string): Promise<void> => {
      if (!credentialEmail) return;
      try {
        await openVisioFetcher(credentialEmail, `/rooms/${encodeURIComponent(uid)}/`, {
          method: "DELETE",
        });
      } catch (error) {
        // Best-effort cleanup: a failed deletion must never block booking cancellation.
        log.warn("Failed to delete OpenVisio room", { uid, error });
      }
    },
    updateMeeting: (bookingRef: PartialReference): Promise<VideoCallData> =>
      Promise.resolve({
        type: OPENVISIO_TYPE,
        id: bookingRef.meetingId as string,
        password: bookingRef.meetingPassword as string,
        url: bookingRef.meetingUrl as string,
      }),
  };
};

export default OpenVisioVideoApiAdapter;
