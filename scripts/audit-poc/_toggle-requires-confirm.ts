#!/usr/bin/env -S npx tsx
/**
 * Toggle requiresConfirmation on the audit event-type so new bookings land
 * in PENDING status (no idempotencyKey → exercises the actual race).
 *
 * Usage:
 *   ON=1  npx tsx scripts/audit-poc/_toggle-requires-confirm.ts   # enable
 *   ON=0  npx tsx scripts/audit-poc/_toggle-requires-confirm.ts   # disable
 */
import { prisma } from "@calcom/prisma";

async function main() {
  const ON = process.env.ON === "1";
  const owner = await prisma.user.findUnique({
    where: { email: "audit-poc-owner@local.test" },
    select: { id: true },
  });
  if (!owner) throw new Error("owner not found");
  const evt = await prisma.eventType.findFirst({
    where: { userId: owner.id, slug: "audit-30min" },
    select: { id: true },
  });
  if (!evt) throw new Error("event-type audit-30min not found");
  const updated = await prisma.eventType.update({
    where: { id: evt.id },
    data: { requiresConfirmation: ON },
    select: { id: true, slug: true, requiresConfirmation: true },
  });
  console.log(
    `event-type ${updated.id} (${updated.slug}) requiresConfirmation=${updated.requiresConfirmation}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
