-- New event types require host confirmation and at least 24 hours of notice.
-- Existing event types keep their current settings.
ALTER TABLE "EventType" ALTER COLUMN "requiresConfirmation" SET DEFAULT true,
ALTER COLUMN "minimumBookingNotice" SET DEFAULT 1440;
