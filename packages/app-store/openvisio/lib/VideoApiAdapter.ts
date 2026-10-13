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
  // On a team-level install there is no owning user, so no token can be minted and the room
  // is left in place even though it was created as event.organizer.email.
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
    /**
     * Rooms are NOT guaranteed to be removed. The delegated external API of La Suite Meet
     * exposes no DELETE on its RoomViewSet — the upstream documentation still lists the
     * operation as forthcoming — so this request only succeeds on a deployment that adds
     * the endpoint itself. It is issued anyway, best effort, and every failure (405 as much
     * as 404) is swallowed: cancelling a booking must never fail over room cleanup.
     *
     * If the OpenVisio add-on gains a documented DELETE contract, cover it with a test
     * asserting the real expected id and scopes instead of a stubbed success.
     */
    deleteMeeting: async (uid: string): Promise<void> => {
      if (!credentialEmail) {
        log.debug("Skipping OpenVisio room cleanup: credential has no owning user", { uid });
        return;
      }
      try {
        await openVisioFetcher(credentialEmail, `/rooms/${encodeURIComponent(uid)}/`, {
          method: "DELETE",
        });
      } catch (error) {
        log.warn("OpenVisio room was not deleted", { uid, error });
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
