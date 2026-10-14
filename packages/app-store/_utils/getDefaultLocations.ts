import { getUsersCredentialsIncludeServiceAccountKey } from "@calcom/app-store/delegationCredential";
import logger from "@calcom/lib/logger";
import prisma from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";
import { type eventTypeLocations, userMetadata as userMetadataSchema } from "@calcom/prisma/zod-utils";
import type { z } from "zod";
import { FALLBACK_CONFERENCING_APP_SLUG, JitsiLocationType } from "../constants";
import getApps, { getAppFromSlug } from "../utils";

const log = logger.getSubLogger({ prefix: ["getDefaultLocations"] });

type EventTypeLocation = z.infer<typeof eventTypeLocations>[number];

type User = {
  id: number;
  email: string;
  metadata: Prisma.JsonValue;
};

export { FALLBACK_CONFERENCING_APP_SLUG };

/** Kept for callers that need the type rather than the slug. */
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
 * videoClient.createMeeting() throws when the App row is missing or disabled, so a location
 * pointing at such an app yields a booking with no meeting URL. An administrator can disable
 * any app from the admin panel at any time, including after it was made the default.
 */
async function isAppEnabled(slug: string): Promise<boolean> {
  const app = await prisma.app.findUnique({ where: { slug }, select: { enabled: true } });
  return app?.enabled === true;
}

async function resolveUsableLocation(slug: string): Promise<EventTypeLocation | null> {
  const type = getLocationTypeFromSlug(slug);
  if (!type) return null;
  if (!(await isAppEnabled(slug))) return null;
  return { type };
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
    const location = await resolveUsableLocation(defaultConferencingAppSlug);
    if (location) return [location];
    log.warn(
      `Deployment default conferencing app "${defaultConferencingAppSlug}" is disabled or not seeded; falling back`
    );
  }

  const fallback = await resolveUsableLocation(FALLBACK_CONFERENCING_APP_SLUG);
  if (fallback) return [fallback];

  // Better no location, which the host is prompted to fill in, than one that cannot produce a
  // meeting link. Reaching here means every conferencing provider is disabled or unseeded.
  log.warn(
    `No usable default conferencing app: "${FALLBACK_CONFERENCING_APP_SLUG}" is disabled or not seeded either`
  );
  return [];
}
