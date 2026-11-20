-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "rescheduleReason" TEXT,
ADD COLUMN "rescheduleRequestedAt" TIMESTAMP(3);
