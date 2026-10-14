-- Cal Video (Daily) was removed: nothing writes or reads these any more.
--   * CalVideoSettings: per-event-type recording/transcription settings;
--   * VideoCallGuest: guests who joined a Cal Video room;
--   * EventType.canSendCalVideoTranscriptionEmails, Team.calVideoLogo and
--     Booking.isRecorded.
-- API v2 still accepts and returns the matching fields, with neutral values.

-- DropForeignKey
ALTER TABLE "CalVideoSettings" DROP CONSTRAINT "CalVideoSettings_eventTypeId_fkey";

-- AlterTable
ALTER TABLE "Booking" DROP COLUMN "isRecorded";

-- AlterTable
ALTER TABLE "EventType" DROP COLUMN "canSendCalVideoTranscriptionEmails";

-- AlterTable
ALTER TABLE "Team" DROP COLUMN "calVideoLogo";

-- DropTable
DROP TABLE "CalVideoSettings";

-- DropTable
DROP TABLE "VideoCallGuest";
