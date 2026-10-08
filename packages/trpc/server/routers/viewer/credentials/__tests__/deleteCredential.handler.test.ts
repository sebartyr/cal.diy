import { MembershipRole } from "@calcom/prisma/enums";
import { TRPCError } from "@trpc/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const handleDeleteCredential = vi.fn();
const requireMember = vi.fn();

vi.mock("@calcom/features/credentials/handleDeleteCredential", () => ({
  default: (...args: unknown[]) => handleDeleteCredential(...args),
}));

vi.mock("../../teams/permissions", () => ({
  requireMember: (...args: unknown[]) => requireMember(...args),
}));

import { deleteCredentialHandler } from "../deleteCredential.handler";

const user = { id: 7, metadata: null };
const ctx = { user: user as never };

describe("deleteCredentialHandler", () => {
  afterEach(() => vi.clearAllMocks());

  it("requires ADMIN membership of the team before deleting a team credential", async () => {
    requireMember.mockResolvedValueOnce({ role: MembershipRole.ADMIN });

    await deleteCredentialHandler({ ctx, input: { id: 3, teamId: 9 } });

    expect(requireMember).toHaveBeenCalledWith(7, 9, MembershipRole.ADMIN, user);
    expect(handleDeleteCredential).toHaveBeenCalledWith({
      userId: 7,
      userMetadata: null,
      credentialId: 3,
      teamId: 9,
    });
  });

  it("does not delete when the caller cannot administer the team", async () => {
    requireMember.mockRejectedValueOnce(new TRPCError({ code: "FORBIDDEN" }));

    await expect(deleteCredentialHandler({ ctx, input: { id: 3, teamId: 9 } })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(handleDeleteCredential).not.toHaveBeenCalled();
  });

  it("skips the team check for a personal credential", async () => {
    await deleteCredentialHandler({ ctx, input: { id: 3 } });

    expect(requireMember).not.toHaveBeenCalled();
    expect(handleDeleteCredential).toHaveBeenCalledWith({
      userId: 7,
      userMetadata: null,
      credentialId: 3,
      teamId: undefined,
    });
  });
});
