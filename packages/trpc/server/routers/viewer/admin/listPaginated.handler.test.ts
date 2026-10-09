import type { TrpcSessionUser } from "@calcom/trpc/server/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import listPaginatedHandler from "./listPaginated.handler";
import { ZListMembersSchema } from "./listPaginated.schema";

const { listUsers } = vi.hoisted(() => ({ listUsers: vi.fn() }));

vi.mock("@calcom/features/di/containers/UserRepository", () => ({
  getUserRepository: () => ({ listUsers }),
}));

const ctx = { user: { id: 1 } as NonNullable<TrpcSessionUser> };

describe("listPaginatedHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listUsers.mockResolvedValue({ users: [{ id: 1 }], nextCursor: 1, total: 5 });
  });

  it("keeps the total for callers that do not opt out", async () => {
    const input = ZListMembersSchema.parse({ limit: 10 });

    const result = await listPaginatedHandler({ ctx, input });

    expect(listUsers).toHaveBeenCalledWith(expect.objectContaining({ limit: 10, withTotal: undefined }));
    expect(result).toEqual({ rows: [{ id: 1 }], nextCursor: 1, meta: { totalRowCount: 5 } });
  });

  it("forwards withTotal: false to the repository", async () => {
    listUsers.mockResolvedValue({ users: [{ id: 1 }], nextCursor: 1, total: undefined });
    const input = ZListMembersSchema.parse({ limit: 10, withTotal: false });

    const result = await listPaginatedHandler({ ctx, input });

    expect(listUsers).toHaveBeenCalledWith(expect.objectContaining({ withTotal: false }));
    expect(result.meta.totalRowCount).toBeUndefined();
  });
});
