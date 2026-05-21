import { defaultResponderForAppDir } from "app/api/defaultResponderForAppDir";
import { parseRequestData } from "app/api/parseRequestData";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { validPassword } from "@calcom/features/auth/lib/validPassword";
import { hashPassword } from "@calcom/lib/auth/hashPassword";
import { checkRateLimitAndThrowError } from "@calcom/lib/checkRateLimitAndThrowError";
import getIP from "@calcom/lib/getIP";
import { piiHasher } from "@calcom/lib/server/PiiHasher";
import prisma from "@calcom/prisma";
import { IdentityProvider } from "@calcom/prisma/enums";

const passwordResetRequestSchema = z.object({
  csrfToken: z.string(),
  password: z.string().refine(validPassword, () => ({
    message: "Password does not meet the requirements",
  })),
  requestId: z.string(), // format doesn't matter.
});

async function handler(req: NextRequest) {
  const body = await parseRequestData(req);
  const {
    password: rawPassword,
    requestId: rawRequestId,
    csrfToken: submittedToken,
  } = passwordResetRequestSchema.parse(body);
  const cookieStore = await cookies();

  const cookieToken = cookieStore.get("calcom.csrf_token")?.value;

  if (submittedToken !== cookieToken) {
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  }

  // token verified, delete the cookie / a resubmit on failure requires a new csrf token.
  cookieStore.delete("calcom.csrf_token");

  const remoteIp = getIP(req);
  await checkRateLimitAndThrowError({
    rateLimitingType: "core",
    identifier: `api:reset-password:${piiHasher.hash(remoteIp)}`,
  });

  // BUG-002 (Sprint 4): consume the token atomically before doing any work,
  // so two concurrent submits of the same reset-link can't both succeed.
  // updateMany returns the number of rows it expired — exactly one row should
  // match (id + still-valid expires). If it's zero, the token is invalid,
  // already used, or expired; we don't distinguish to avoid an oracle.
  const now = new Date();
  const consumed = await prisma.resetPasswordRequest.updateMany({
    where: {
      id: rawRequestId,
      expires: { gt: now },
    },
    data: { expires: now },
  });
  if (consumed.count === 0) {
    return NextResponse.json({}, { status: 404 });
  }

  const maybeRequest = await prisma.resetPasswordRequest.findUnique({
    where: { id: rawRequestId },
    select: { email: true },
  });
  if (!maybeRequest) {
    return NextResponse.json({}, { status: 404 });
  }

  const hashedPassword = await hashPassword(rawPassword);
  // this can fail if a password request has been made for an email that has since changed or-
  // never existed within Cal. In this case we do not want to disclose the email's existence.
  // instead, we just return 404
  try {
    await prisma.user.update({
      where: {
        email: maybeRequest.email,
      },
      data: {
        password: {
          upsert: {
            create: { hash: hashedPassword },
            update: { hash: hashedPassword },
          },
        },
        emailVerified: new Date(),
        identityProvider: IdentityProvider.CAL,
        identityProviderId: null,
      },
    });
  } catch (e) {
    return NextResponse.json({}, { status: 404 });
  }

  return NextResponse.json({ message: "Password reset." }, { status: 201 });
}

export const POST = defaultResponderForAppDir(handler);
