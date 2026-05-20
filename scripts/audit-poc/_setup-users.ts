#!/usr/bin/env -S npx tsx
/**
 * Create / reset the two audit-poc test users with local CAL passwords.
 * Idempotent.
 *
 * Run:
 *   set -a && . ./.env && set +a
 *   npx tsx scripts/audit-poc/_setup-users.ts
 */
import { hashPassword } from "@calcom/lib/auth/hashPassword";
import { prisma } from "@calcom/prisma";
import { IdentityProvider } from "@calcom/prisma/enums";

type SeedUser = { email: string; username: string; name: string; password: string };

const USERS: SeedUser[] = [
  { email: "audit-poc-owner@local.test",   username: "audit-poc-owner",   name: "Audit PoC Owner",   password: "audit-poc-owner-pw" },
  { email: "audit-poc-attacker@local.test", username: "audit-poc-attacker", name: "Audit PoC Attacker", password: "audit-poc-attacker-pw" },
];

async function upsertUser(u: SeedUser) {
  const hash = await hashPassword(u.password);
  const existing = await prisma.user.findUnique({
    where: { email: u.email.toLowerCase() },
    select: { id: true },
  });
  let id: number;
  if (existing) {
    id = existing.id;
    await prisma.user.update({
      where: { id },
      data: {
        identityProvider: IdentityProvider.CAL,
        emailVerified: new Date(),
        twoFactorEnabled: false,
        twoFactorSecret: null,
        backupCodes: null,
        completedOnboarding: true,
      },
    });
  } else {
    const created = await prisma.user.create({
      data: {
        email: u.email.toLowerCase(),
        username: u.username,
        name: u.name,
        identityProvider: IdentityProvider.CAL,
        emailVerified: new Date(),
        twoFactorEnabled: false,
        completedOnboarding: true,
      },
      select: { id: true },
    });
    id = created.id;
  }
  await prisma.userPassword.upsert({
    where: { userId: id },
    create: { userId: id, hash },
    update: { hash },
  });
  // Reset memberships so the attacker is guaranteed not to be in the owner's team.
  await prisma.membership.deleteMany({ where: { userId: id } });
  console.log(`✓ user ${u.email} (id=${id}) ready  password=${u.password}`);
  return id;
}

async function main() {
  console.log("=== audit-poc test users setup ===");
  for (const u of USERS) {
    await upsertUser(u);
  }
  console.log("");
  console.log("done. Credentials:");
  for (const u of USERS) console.log(`  ${u.email} / ${u.password}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
