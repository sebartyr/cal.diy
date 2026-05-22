/**
 * Seeds a small but realistic test environment so a developer can play with
 * the team booking flow end-to-end:
 *   - 1 admin user with a known password (admin@local.dev / admin)
 *   - 4 members with default availability (9-18h Paris, Mon-Fri)
 *   - 2 teams with several event types covering ROUND_ROBIN / COLLECTIVE / MANAGED
 *   - Hosts attached to each event type
 *
 * Idempotent: re-runs upsert everything by stable key (email / team slug / event slug).
 */

import process from "node:process";
import { hashPassword } from "@calcom/lib/auth/hashPassword";
import { prisma } from "@calcom/prisma";
import { IdentityProvider, MembershipRole, SchedulingType } from "@calcom/prisma/enums";
import { assertDevDatabase } from "./lib/assert-dev-database";

const TZ = "Europe/Paris";
const DEFAULT_WEEKDAY_AVAILABILITY = {
  days: [1, 2, 3, 4, 5],
  startTime: new Date("1970-01-01T09:00:00.000Z"),
  endTime: new Date("1970-01-01T18:00:00.000Z"),
};

type UserSpec = {
  email: string;
  username: string;
  name: string;
  password?: string;
};

async function upsertUser(spec: UserSpec) {
  const existing = await prisma.user.findUnique({ where: { email: spec.email } });
  const user =
    existing ??
    (await prisma.user.create({
      data: {
        email: spec.email,
        username: spec.username,
        name: spec.name,
        emailVerified: new Date(),
        timeZone: TZ,
        identityProvider: IdentityProvider.CAL,
        locale: "fr",
      },
    }));

  if (spec.password) {
    const hash = await hashPassword(spec.password);
    await prisma.userPassword.upsert({
      where: { userId: user.id },
      create: { userId: user.id, hash },
      update: { hash },
    });
  }

  // Ensure default schedule (9-18h Mon-Fri) for this user.
  let schedule = await prisma.schedule.findFirst({ where: { userId: user.id } });
  if (!schedule) {
    schedule = await prisma.schedule.create({
      data: {
        userId: user.id,
        name: "Heures de travail",
        timeZone: TZ,
        availability: {
          create: [DEFAULT_WEEKDAY_AVAILABILITY],
        },
      },
    });
  }

  if (user.defaultScheduleId !== schedule.id) {
    await prisma.user.update({
      where: { id: user.id },
      data: { defaultScheduleId: schedule.id },
    });
  }

  return { user, scheduleId: schedule.id };
}

async function upsertTeam(slug: string, name: string, bio: string) {
  const existing = await prisma.team.findFirst({ where: { slug } });
  if (existing) {
    return prisma.team.update({
      where: { id: existing.id },
      data: { name, bio, isOrganization: false, isPrivate: false, hideBranding: false },
    });
  }
  return prisma.team.create({
    data: { slug, name, bio, isOrganization: false, isPrivate: false, hideBranding: false },
  });
}

async function attachMember(userId: number, teamId: number, role: MembershipRole) {
  await prisma.membership.upsert({
    where: { userId_teamId: { userId, teamId } },
    create: { userId, teamId, role, accepted: true },
    update: { role, accepted: true },
  });
}

type EventSpec = {
  slug: string;
  title: string;
  length: number;
  schedulingType: SchedulingType;
  description?: string;
};

async function upsertEventType(teamId: number, spec: EventSpec) {
  const existing = await prisma.eventType.findFirst({ where: { teamId, slug: spec.slug } });
  if (existing) {
    return prisma.eventType.update({
      where: { id: existing.id },
      data: {
        title: spec.title,
        length: spec.length,
        schedulingType: spec.schedulingType,
        description: spec.description ?? null,
        hidden: false,
      },
    });
  }
  return prisma.eventType.create({
    data: {
      teamId,
      slug: spec.slug,
      title: spec.title,
      length: spec.length,
      schedulingType: spec.schedulingType,
      description: spec.description ?? null,
      hidden: false,
      position: 0,
    },
  });
}

async function setHosts(eventTypeId: number, userIds: number[], isFixed = false) {
  // Wipe existing hosts on this event type and recreate.
  await prisma.host.deleteMany({ where: { eventTypeId } });
  for (const userId of userIds) {
    await prisma.host.create({
      data: { userId, eventTypeId, isFixed },
    });
  }
}

async function main() {
  // Refuse the run unless the target DB is on the dev allowlist. This seed
  // creates an admin account with a trivial password — running it against a
  // hosted DB would create a publicly-known backdoor.
  assertDevDatabase();

  // ────────────────── Users ──────────────────
  const admin = await upsertUser({
    email: "admin@local.dev",
    username: "admin",
    name: "Admin Local",
    password: "admin",
  });
  console.log(`✓ Admin: admin@local.dev / admin (id=${admin.user.id})`);

  const alice = await upsertUser({
    email: "alice@local.dev",
    username: "alice",
    name: "Alice Dupont",
    password: "alice",
  });
  const bob = await upsertUser({
    email: "bob@local.dev",
    username: "bob",
    name: "Bob Martin",
    password: "bob",
  });
  const claire = await upsertUser({
    email: "claire@local.dev",
    username: "claire",
    name: "Claire Bernard",
    password: "claire",
  });
  const david = await upsertUser({
    email: "david@local.dev",
    username: "david",
    name: "David Petit",
    password: "david",
  });

  // ────────────────── Team 1: rdv-cloud-change-15min ──────────────────
  const cloudTeam = await upsertTeam(
    "rdv-cloud-change-15min",
    "RDV Cloud Change",
    "Réservez un créneau pour discuter de votre migration vers Clever Cloud."
  );
  console.log(`✓ Team /team/${cloudTeam.slug} (id=${cloudTeam.id})`);

  await attachMember(admin.user.id, cloudTeam.id, MembershipRole.OWNER);
  await attachMember(alice.user.id, cloudTeam.id, MembershipRole.ADMIN);
  await attachMember(bob.user.id, cloudTeam.id, MembershipRole.MEMBER);
  await attachMember(claire.user.id, cloudTeam.id, MembershipRole.MEMBER);

  const cloudIntro = await upsertEventType(cloudTeam.id, {
    slug: "intro-15min",
    title: "Intro Cloud — 15 min",
    length: 15,
    schedulingType: SchedulingType.ROUND_ROBIN,
    description: "Un premier échange rapide pour comprendre votre contexte.",
  });
  await setHosts(cloudIntro.id, [alice.user.id, bob.user.id, claire.user.id]);

  const cloudDeep = await upsertEventType(cloudTeam.id, {
    slug: "workshop-60min",
    title: "Atelier technique — 1h",
    length: 60,
    schedulingType: SchedulingType.COLLECTIVE,
    description: "Tous les hosts assistent à cet atelier (mode collective).",
  });
  await setHosts(cloudDeep.id, [admin.user.id, alice.user.id, bob.user.id]);

  const cloudFollowUp = await upsertEventType(cloudTeam.id, {
    slug: "suivi-30min",
    title: "Suivi de projet — 30 min",
    length: 30,
    schedulingType: SchedulingType.ROUND_ROBIN,
    description: "Point d'avancement régulier avec un membre de l'équipe.",
  });
  await setHosts(cloudFollowUp.id, [alice.user.id, claire.user.id]);

  console.log(`  • /team/${cloudTeam.slug}/${cloudIntro.slug}  (ROUND_ROBIN, 3 hosts)`);
  console.log(`  • /team/${cloudTeam.slug}/${cloudDeep.slug}  (COLLECTIVE, 3 hosts)`);
  console.log(`  • /team/${cloudTeam.slug}/${cloudFollowUp.slug}  (ROUND_ROBIN, 2 hosts)`);

  // ────────────────── Team 2: demos-produit ──────────────────
  const demoTeam = await upsertTeam(
    "demos-produit",
    "Démos Produit",
    "Une démo live de la plateforme avec un membre de l'équipe produit."
  );
  console.log(`✓ Team /team/${demoTeam.slug} (id=${demoTeam.id})`);

  await attachMember(admin.user.id, demoTeam.id, MembershipRole.OWNER);
  await attachMember(claire.user.id, demoTeam.id, MembershipRole.ADMIN);
  await attachMember(david.user.id, demoTeam.id, MembershipRole.MEMBER);

  const demoQuick = await upsertEventType(demoTeam.id, {
    slug: "demo-30min",
    title: "Démo express — 30 min",
    length: 30,
    schedulingType: SchedulingType.ROUND_ROBIN,
    description: "Un tour rapide de la plateforme, sans engagement.",
  });
  await setHosts(demoQuick.id, [claire.user.id, david.user.id]);

  const demoLong = await upsertEventType(demoTeam.id, {
    slug: "demo-45min",
    title: "Démo approfondie — 45 min",
    length: 45,
    schedulingType: SchedulingType.MANAGED,
    description: "Démonstration ciblée selon vos besoins (mode managed).",
  });
  await setHosts(demoLong.id, [admin.user.id, david.user.id]);

  console.log(`  • /team/${demoTeam.slug}/${demoQuick.slug}  (ROUND_ROBIN, 2 hosts)`);
  console.log(`  • /team/${demoTeam.slug}/${demoLong.slug}  (MANAGED, 2 hosts)`);

  console.log("");
  console.log("Login: http://localhost:3000/auth/login");
  console.log("  • admin@local.dev / admin");
  console.log("  • alice@local.dev / alice");
  console.log("  • bob@local.dev / bob");
  console.log("  • claire@local.dev / claire");
  console.log("  • david@local.dev / david");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
