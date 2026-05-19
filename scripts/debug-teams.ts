import { prisma } from "@calcom/prisma";

async function main() {
  const teams = await prisma.team.findMany({
    select: { id: true, slug: true, name: true, isOrganization: true, parentId: true },
    take: 30,
  });
  console.log(`Found ${teams.length} teams:`);
  for (const t of teams) {
    console.log(`  id=${t.id} slug=${t.slug} name="${t.name}" isOrg=${t.isOrganization} parentId=${t.parentId}`);
  }

  const eventTypes = await prisma.eventType.findMany({
    where: { teamId: { not: null } },
    select: { id: true, slug: true, title: true, teamId: true, schedulingType: true, hidden: true },
    take: 30,
  });
  console.log(`\nFound ${eventTypes.length} team event types:`);
  for (const e of eventTypes) {
    console.log(`  id=${e.id} slug=${e.slug} title="${e.title}" teamId=${e.teamId} type=${e.schedulingType} hidden=${e.hidden}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
