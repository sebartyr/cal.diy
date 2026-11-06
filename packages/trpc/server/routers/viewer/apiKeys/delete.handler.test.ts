import type { PrismaClient } from "@calcom/prisma";
import type { TrpcSessionUser } from "@calcom/trpc/server/types";
import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteHandler } from "./delete.handler";

const deleteMany = vi.fn();
const prisma = { apiKey: { deleteMany } } as unknown as PrismaClient;
const ctx = { user: { id: 7 } as NonNullable<TrpcSessionUser>, prisma };

describe("apiKeys deleteHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes the key only when it belongs to the current user", async () => {
    deleteMany.mockResolvedValue({ count: 1 });

    const result = await deleteHandler({ ctx, input: { id: "key-1" } });

    expect(deleteMany).toHaveBeenCalledWith({ where: { id: "key-1", userId: 7 } });
    expect(result).toEqual({ id: "key-1" });
  });

  it("throws NOT_FOUND instead of a 500 when the key is already gone or owned by someone else", async () => {
    deleteMany.mockResolvedValue({ count: 0 });

    const promise = deleteHandler({ ctx, input: { id: "key-1" } });

    await expect(promise).rejects.toBeInstanceOf(TRPCError);
    await expect(promise).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
