/**
 * DEV-ONLY: give an existing user a local password so you can sign in via
 * /auth/login without setting up Google OAuth credentials locally.
 *
 * Usage: EMAIL=you@example.com PASSWORD=devpass set -a && . ./.env && set +a
 *        npx tsx scripts/dev-grant-password.ts
 *
 * Never run against a production database — this overwrites the user's
 * identityProvider to CAL.
 */
import { hashPassword } from "@calcom/lib/auth/hashPassword";
import { prisma } from "@calcom/prisma";
import { IdentityProvider } from "@calcom/prisma/enums";

async function main() {
  const email = process.env.EMAIL;
  const password = process.env.PASSWORD ?? "devpass";

  const dbUrl = process.env.DATABASE_URL ?? "";
  const looksLikeProd =
    /\b(prod|production)\b/i.test(dbUrl) || process.env.NODE_ENV === "production";
  if (looksLikeProd && process.env.I_KNOW_WHAT_IM_DOING !== "yes") {
    console.error(
      "Refusing to run: DATABASE_URL or NODE_ENV looks production-like.\n" +
        "Set I_KNOW_WHAT_IM_DOING=yes to force, but really, don't."
    );
    process.exit(1);
  }

  if (!email) {
    console.error("Missing EMAIL env var. Example: EMAIL=you@x.com PASSWORD=devpass npx tsx ...");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true, email: true, identityProvider: true },
  });

  if (!user) {
    console.error(`No user with email ${email} in this DB. Did the dump restore succeed?`);
    process.exit(1);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      identityProvider: IdentityProvider.CAL,
      emailVerified: new Date(),
      // Strip any 2FA carried over from the prod dump so the dev login is
      // a plain email + password flow.
      twoFactorEnabled: false,
      twoFactorSecret: null,
      backupCodes: null,
    },
  });

  const hash = await hashPassword(password);
  await prisma.userPassword.upsert({
    where: { userId: user.id },
    create: { userId: user.id, hash },
    update: { hash },
  });

  console.log(`✓ User ${user.email} (id=${user.id}) ready.`);
  console.log(`  Sign in: http://localhost:3000/auth/login`);
  console.log(`  Email:    ${user.email}`);
  console.log(`  Password: ${password}`);
  console.log(`  Previous identityProvider: ${user.identityProvider} → CAL`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
