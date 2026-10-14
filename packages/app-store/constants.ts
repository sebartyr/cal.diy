export const MeetLocationType = "integrations:google:meet";

export const MSTeamsLocationType = "integrations:office365_video";

export const DailyLocationType = "integrations:daily";

export const JitsiLocationType = "integrations:jitsi";

/**
 * Last-resort conferencing app when neither the user nor the deployment picked a usable one.
 *
 * Jitsi needs no API key and no per-user credential, so it is the only candidate that cannot
 * resolve to "no location at all" — which would create event types with no location and
 * bookings with no meeting URL, with nothing failing loudly along the way.
 */
export const FALLBACK_CONFERENCING_APP_SLUG = "jitsi";
