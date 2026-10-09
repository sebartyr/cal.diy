import { trpc } from "../trpc";

// me.get is mounted by every Shell page and runs several DB queries: profile, appearance, 2FA and
// password mutations invalidate viewer.me explicitly, so a window focus does not need to refetch it.
// Retries fall back to the QueryClient default (up to 3, none on BAD_REQUEST/FORBIDDEN/UNAUTHORIZED).
export function useMeQuery() {
  const meQuery = trpc.viewer.me.get.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  return meQuery;
}

export default useMeQuery;
