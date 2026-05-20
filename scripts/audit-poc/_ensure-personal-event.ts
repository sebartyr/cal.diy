#!/usr/bin/env -S npx tsx
/**
 * Ensure the audit-poc-owner user has a personal event-type for PoC 3.
 */
import { prisma } from "@calcom/prisma";

async function main() {
  const owner = await prisma.user.findUnique({
    where: { email: "audit-poc-owner@local.test" },
    select: { id: true, username: true, eventTypes: { select: { id: true, slug: true } } },
  });
  if (!owner) {
    console.error("owner not found, run _setup-users.ts first");
    process.exit(1);
  }
  const existing = owner.eventTypes.find((e) => e.slug === "audit-30min");
  if (existing) {
    console.log(`existing event-type: id=${existing.id} slug=${existing.slug}`);
    return;
  }
  const created = await prisma.eventType.create({
    data: {
      title: "Audit PoC 30min",
      slug: "audit-30min",
      length: 30,
      userId: owner.id,
      locations: [{ type: "integrations:daily" }],
    },
    select: { id: true, slug: true },
  });
  console.log(`created event-type: id=${created.id} slug=${created.slug} owner=${owner.username}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
