import { prisma } from "@calcom/prisma";

async function main() {
  const evt = await prisma.eventType.findFirst({
    where: { slug: "audit-30min" },
    select: { id: true },
  });
  if (!evt) throw new Error("event-type not found");
  const bookings = await prisma.booking.findMany({
    where: { eventTypeId: evt.id, startTime: new Date("2026-06-10T14:00:00.000Z") },
    select: { id: true, status: true, startTime: true, attendees: { select: { email: true } } },
    orderBy: { id: "asc" },
  });
  console.log(`bookings for eventTypeId=${evt.id} at 2026-06-10T14:00:00Z: ${bookings.length}`);
  for (const b of bookings) {
    console.log(`  id=${b.id} status=${b.status} attendees=${b.attendees.map((a) => a.email).join(",")}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
