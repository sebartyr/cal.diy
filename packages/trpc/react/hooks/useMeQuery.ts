import { trpc } from "../trpc";

export function useMeQuery() {
  const meQuery = trpc.viewer.me.get.useQuery();

  return meQuery;
}

export default useMeQuery;
