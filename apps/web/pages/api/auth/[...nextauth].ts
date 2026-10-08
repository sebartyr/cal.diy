import { getOptions } from "@calcom/features/auth/lib/next-auth-options";
import { IMPERSONATION_PROVIDER_ID } from "@calcom/features/impersonation/lib/impersonationSession";
import { getTrackingFromCookies } from "@calcom/lib/tracking";
import type { NextApiRequest, NextApiResponse } from "next";
import NextAuth from "next-auth";
import { getToken } from "next-auth/jwt";

const PROVIDERS_ALLOWED_DURING_IMPERSONATION = new Set(["credentials", IMPERSONATION_PROVIDER_ID]);

// With a live JWT session NextAuth links a freshly authenticated OAuth/email identity to the
// signed-in user, so an admin going through such a flow while impersonating would attach their
// own identity to the target account.
async function isIdentityLinkingDuringImpersonation(req: NextApiRequest): Promise<boolean> {
  const [action, providerId] = Array.isArray(req.query.nextauth) ? req.query.nextauth : [];
  if (action !== "signin" && action !== "callback") return false;
  if (!providerId || PROVIDERS_ALLOWED_DURING_IMPERSONATION.has(providerId)) return false;
  const token = await getToken({ req });
  return !!token?.impersonatedBy;
}

// pass req to NextAuth: https://github.com/nextauthjs/next-auth/discussions/469
const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (await isIdentityLinkingDuringImpersonation(req)) {
    return res
      .status(403)
      .json({ message: "Signing in with another provider is not allowed while impersonating a user." });
  }
  return NextAuth(
    req,
    res,
    getOptions({
      getDubId: () => req.cookies.dub_id || req.cookies.dclid,
      getTrackingData: () => getTrackingFromCookies(req.cookies, req.query),
    })
  );
};

export default handler;
