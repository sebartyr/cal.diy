-- Recreate the impersonation journal dropped in 20260319100000_drop_impersonations_table.
-- Constraint and index names match the 2022 definitions so the schema is identical to upstream.

-- CreateTable
CREATE TABLE "Impersonations" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "impersonatedUserId" INTEGER NOT NULL,
    "impersonatedById" INTEGER NOT NULL,

    CONSTRAINT "Impersonations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Impersonations_impersonatedUserId_idx" ON "Impersonations"("impersonatedUserId");

-- CreateIndex
CREATE INDEX "Impersonations_impersonatedById_idx" ON "Impersonations"("impersonatedById");

-- AddForeignKey
ALTER TABLE "Impersonations" ADD CONSTRAINT "Impersonations_impersonatedUserId_fkey" FOREIGN KEY ("impersonatedUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Impersonations" ADD CONSTRAINT "Impersonations_impersonatedById_fkey" FOREIGN KEY ("impersonatedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
