import type { PrismaClient } from "@calcom/prisma";
import { CreationSource, UserPermissionRole } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import addHandler from "./add.handler";

describe("users.add handler", () => {
  const create = vi.fn();
  const prisma = { user: { create } } as unknown as PrismaClient;

  beforeEach(() => {
    vi.clearAllMocks();
    create.mockResolvedValue({ id: 60, email: "jane@example.com" });
  });

  it("marks the admin-provided email as verified so OIDC sign-in can link the account", async () => {
    const before = Date.now();

    await addHandler({
      ctx: { prisma },
      input: { name: "Jane", email: "jane@example.com", username: "jane" },
    });

    const { data } = create.mock.calls[0][0];
    expect(data.emailVerified).toBeInstanceOf(Date);
    expect(data.emailVerified.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("creates a regular user from the web app with the submitted fields", async () => {
    const result = await addHandler({
      ctx: { prisma },
      input: { name: "Jane", email: "jane@example.com", username: "jane" },
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Jane",
          email: "jane@example.com",
          username: "jane",
          role: UserPermissionRole.USER,
          creationSource: CreationSource.WEBAPP,
        }),
        select: expect.any(Object),
      })
    );
    expect(result).toEqual({
      user: { id: 60, email: "jane@example.com" },
      message: "User with id: 60 added successfully",
    });
  });
});
