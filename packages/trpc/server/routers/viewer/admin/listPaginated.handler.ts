import { getUserRepository } from "@calcom/features/di/containers/UserRepository";
import type { TrpcSessionUser } from "../../../types";
import type { TListMembersSchema } from "./listPaginated.schema";

type GetOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
  };
  input: TListMembersSchema;
};
const listPaginatedHandler = async ({ input }: GetOptions) => {
  const userRepository = getUserRepository();

  const { cursor, limit, searchTerm, ids, withTotal } = input;

  const { users, total, nextCursor } = await userRepository.listUsers({
    searchTerm,
    limit,
    cursor,
    ids,
    withTotal,
  });

  return {
    rows: users,
    nextCursor,
    meta: {
      totalRowCount: total,
    },
  };
};

export default listPaginatedHandler;
