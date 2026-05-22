import { jwtVerify } from "jose";

import { WEBSITE_URL } from "@calcom/lib/constants";

export async function verifyTotpLoginJwt(token: string): Promise<{ email: string }> {
  if (!process.env.CALENDSO_ENCRYPTION_KEY) {
    throw new Error("Missing CALENDSO_ENCRYPTION_KEY");
  }
  const secret = new TextEncoder().encode(process.env.CALENDSO_ENCRYPTION_KEY);
  const { payload } = await jwtVerify(token, secret, {
    issuer: WEBSITE_URL,
    audience: `${WEBSITE_URL}/auth/login`,
    algorithms: ["HS256"],
  });
  const email = payload.email;
  if (typeof email !== "string" || !email) {
    throw new Error("Invalid totp login JWT payload");
  }
  return { email };
}
