-- Apps removed from the app store (Unkey/SendGrid/unused-apps prune, remaining
-- apps prune, Stripe and Teams, Cal Video) still have their "App" row. Nothing
-- reads them any more, but they keep stale keys around and, for Credential,
-- Webhook and ApiKey, rows that point at integrations that no longer exist.
--
-- The list is explicit rather than "everything not in the app store" so that
-- apps added later, or added by a fork, are never caught by this migration.
--
-- Deleting an App cascades to Credential, Webhook, ApiKey and Payment. Those
-- belong to removed integrations (e.g. Zapier webhooks and API keys) and go
-- with them — except Payment: payment history is kept by detaching it from
-- the app first.
CREATE TEMP TABLE "_removed_app_slugs" (slug TEXT PRIMARY KEY);
INSERT INTO "_removed_app_slugs" (slug) VALUES
  ('alby'),
  ('attio'),
  ('autocheckin'),
  ('baa-for-hipaa'),
  ('basecamp3'),
  ('bolna'),
  ('btcpayserver'),
  ('cal-ai'),
  ('campfire'),
  ('campsite'),
  ('chatbase'),
  ('clic'),
  ('closecom'),
  ('daily-video'),
  ('deel'),
  ('demodesk'),
  ('dialpad'),
  ('dub'),
  ('eightxeight'),
  ('element-call'),
  ('elevenlabs'),
  ('facetime'),
  ('fathom'),
  ('fonio-ai'),
  ('framer'),
  ('ga4'),
  ('giphy'),
  ('granola'),
  ('greetmate-ai'),
  ('gtm'),
  ('hitpay'),
  ('horizon-workrooms'),
  ('hubspot'),
  ('huddle01'),
  ('insihts'),
  ('intercom'),
  ('jelly'),
  ('lindy'),
  ('linear'),
  ('make'),
  ('matomo'),
  ('metapixel'),
  ('millis-ai'),
  ('mirotalk'),
  ('monobot'),
  ('msteams'),
  ('n8n'),
  ('nextcloudtalk'),
  ('paypal'),
  ('ping'),
  ('pipedream'),
  ('plausible'),
  ('posthog'),
  ('raycast'),
  ('retell-ai'),
  ('riverside'),
  ('roam'),
  ('routing-forms'),
  ('salesforce'),
  ('salesroom'),
  ('sendgrid'),
  ('shimmervideo'),
  ('sirius_video'),
  ('skiff'),
  ('skype'),
  ('stripe'),
  ('sylapsvideo'),
  ('synthflow'),
  ('tandem'),
  ('telli'),
  ('twipla'),
  ('typeform'),
  ('umami'),
  ('vital-automation'),
  ('weather_in_your_calendar'),
  ('webex'),
  ('whereby'),
  ('wipe-my-cal'),
  ('wordpress'),
  ('zapier'),
  ('zoho-bigin'),
  ('zohocrm')
;

UPDATE "Payment" SET "appId" = NULL WHERE "appId" IN (SELECT slug FROM "_removed_app_slugs");

DELETE FROM "App" WHERE "slug" IN (SELECT slug FROM "_removed_app_slugs");

DROP TABLE "_removed_app_slugs";
