-- Feature flags that no code reads anymore: toggling them in the admin did nothing.
-- UserFeatures and TeamFeatures rows go with them (ON DELETE CASCADE).
DELETE FROM "Feature" WHERE "slug" IN (
  'active-user-billing',
  'attributes',
  'booking-calendar-view',
  'booking-email-sms-tasker',
  'cal-ai-voice-agents',
  'cal-video-log-in-overlay',
  'calendar-cache',
  'calendar-cache-serve',
  'delegation-credential',
  'domain-wide-delegation',
  'google-workspace-directory',
  'hwm-seating',
  'insights',
  'monthly-proration',
  'organizations',
  'pbac',
  'sidebar-tips',
  'signup-watchlist-review',
  'team-booking-page-cache',
  'teams',
  'tiered-support-chat',
  'use-api-v2-for-team-slots',
  'webhooks',
  'workflow-smtp-emails',
  'workflows'
);
