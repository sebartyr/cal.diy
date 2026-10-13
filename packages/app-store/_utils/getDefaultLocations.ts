import { getUsersCredentialsIncludeServiceAccountKey } from "@calcom/app-store/delegationCredential";
import type { Prisma } from "@calcom/prisma/client";
import { type eventTypeLocations, userMetadata as userMetadataSchema } from "@calcom/prisma/zod-utils";
import type { z } from "zod";
import { JitsiLocationType } from "../constants";
import getApps, { getAppFromSlug } from "../utils";

type EventTypeLocation = z.infer<typeof eventTypeLocations>[number];

type User = {
  id: number;
  email: string;
  metadata: Prisma.JsonValue;
};

/**
 * Last-resort location when neither the user nor the deployment picked a usable one.
 *
 * Jitsi needs no API key and no per-user credential, so it is the only candidate that cannot
 * resolve to "no location at all" — which would create event types with no location and
 * bookings with no meeting URL, with nothing failing loudly along the way.
 */
export const FALLBACK_CONFERENCING_LOCATION_TYPE = JitsiLocationType;

/**
 * Read straight from app metadata rather than from getApps(): getApps only fills in
 * locationOption when the app has a credential or is global, so a deployment default that is
 * neither would silently resolve to no location.
 */
function getLocationTypeFromSlug(slug: string): string | undefined {
  return getAppFromSlug(slug)?.appData?.location?.type;
}

/**
 * @param defaultConferencingAppSlug The deployment-wide default, read by the caller from the
 * Deployment record. It is passed in rather than read here because packages/app-store must not
 * import from packages/features.
 */
export async function getDefaultLocations(
  user: User,
  defaultConferencingAppSlug?: string | null
): Promise<EventTypeLocation[]> {
  const defaultConferencingData = userMetadataSchema.parse(user.metadata)?.defaultConferencingApp;

  if (defaultConferencingData?.appSlug) {
    // We are not returning the credential, so we are fine with the service account key
    const credentials = await getUsersCredentialsIncludeServiceAccountKey(user);

    const foundApp = getApps(credentials, true).filter(
      (app) => app.slug === defaultConferencingData.appSlug
    )[0]; // There is only one possible install here so index [0] is the one we are looking for ;

    if (foundApp?.locationOption?.value) {
      return [{ type: foundApp.locationOption.value, link: defaultConferencingData.appLink }];
    }
    // The user's pick is no longer installed. Fall through to the deployment default instead of
    // handing back a location type they have no credential for.
  }

  if (defaultConferencingAppSlug) {
    const locationType = getLocationTypeFromSlug(defaultConferencingAppSlug);
    if (locationType) return [{ type: locationType }];
  }

  return [{ type: FALLBACK_CONFERENCING_LOCATION_TYPE }];
}
