import {
  APP_CREDENTIAL_SHARING_ENABLED,
  CREDENTIAL_SYNC_SECRET,
  CREDENTIAL_SYNC_SECRET_HEADER_NAME,
} from "@calcom/lib/constants";

// SEC-107 (Sprint 4): in-process mutex on (userId, appSlug). Some OAuth
// providers (notably Google) invalidate the old refresh token the moment
// they hand out a new one — two concurrent refresh attempts can lose the
// race and leave the credential broken. Coalesce concurrent refreshes
// here so only one upstream call happens at a time per (user, app).
//
// Scope is single-process. Multi-instance deployments still risk the same
// race across nodes; closing that needs a Redis lock (TODO if we observe
// it in prod).
const inflight = new Map<string, Promise<unknown>>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const refreshOAuthTokens = async (refreshFunction: () => any, appSlug: string, userId: number | null) => {
  const key = `${userId ?? "anon"}::${appSlug}`;
  const existing = inflight.get(key);
  if (existing) {
    return existing;
  }
  const work = (async () => {
    // Check that app syncing is enabled and that the credential belongs to a user
    if (
      APP_CREDENTIAL_SHARING_ENABLED &&
      process.env.CALCOM_CREDENTIAL_SYNC_ENDPOINT &&
      CREDENTIAL_SYNC_SECRET &&
      userId
    ) {
      // Customize the payload based on what your endpoint requires
      // The response should only contain the access token and expiry date
      const response = await fetch(process.env.CALCOM_CREDENTIAL_SYNC_ENDPOINT, {
        method: "POST",
        headers: {
          [CREDENTIAL_SYNC_SECRET_HEADER_NAME]: CREDENTIAL_SYNC_SECRET,
        },
        body: new URLSearchParams({
          calcomUserId: userId.toString(),
          appSlug,
        }),
      });
      return response;
    }
    return await refreshFunction();
  })().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, work);
  return work;
};

export default refreshOAuthTokens;
