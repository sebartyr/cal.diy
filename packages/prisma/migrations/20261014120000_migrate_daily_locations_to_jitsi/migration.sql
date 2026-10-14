-- Cal Video (Daily) is removed from the app store. Every event type location
-- pointing at it moves to Jitsi, the deployment's default conferencing app,
-- which needs no API key and no per-user credential.
--
-- Only the Daily entry is rewritten, by changing its "type" in place:
--   * the event type's other locations are kept, in their original order;
--   * fields on the entry itself (e.g. displayLocationPublicly) are preserved;
--   * if the event type already offers Jitsi, the Daily entry is dropped
--     instead of rewritten, so Jitsi is not listed twice;
--   * NULL locations and event types without Daily are not touched.
--
-- Past bookings are deliberately left alone: Booking.location and
-- BookingReference rows of type daily_video record what actually happened.
UPDATE "EventType" AS et
SET "locations" = (
  SELECT COALESCE(jsonb_agg(s.new_elem ORDER BY s.ord), '[]'::jsonb)
  FROM (
    SELECT
      CASE
        WHEN elem->>'type' = 'integrations:daily'
          THEN jsonb_set(elem, '{type}', '"integrations:jitsi"')
        ELSE elem
      END AS new_elem,
      elem->>'type' AS orig_type,
      ord
    FROM jsonb_array_elements(et."locations"::jsonb) WITH ORDINALITY AS t(elem, ord)
  ) AS s
  WHERE NOT (
    s.orig_type = 'integrations:daily'
    AND et."locations"::jsonb @> '[{"type": "integrations:jitsi"}]'::jsonb
  )
)
WHERE et."locations"::jsonb @> '[{"type": "integrations:daily"}]'::jsonb;

-- Users and teams that picked Cal Video as their default conferencing app now
-- default to Jitsi; left alone, "daily-video" would resolve to no app at all.
UPDATE "users"
SET "metadata" = jsonb_set("metadata"::jsonb, '{defaultConferencingApp,appSlug}', '"jitsi"')
WHERE "metadata"::jsonb -> 'defaultConferencingApp' ->> 'appSlug' = 'daily-video';

UPDATE "Team"
SET "metadata" = jsonb_set("metadata"::jsonb, '{defaultConferencingApp,appSlug}', '"jitsi"')
WHERE "metadata"::jsonb -> 'defaultConferencingApp' ->> 'appSlug' = 'daily-video';
