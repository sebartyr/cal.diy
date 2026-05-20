import type { PrismaClient } from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionCheckService } from "../util";

/**
 * Direct unit-tests of the PermissionCheckService. The same logic is also
 * exercised end-to-end through createEventPbacProcedure tests, but this
 * file pins down the SEC-001 fix in isolation: the previous stub returned
 * true for every call (including non-members of the team), making every
 * PBAC-gated mutation a cross-tenant IDOR.
 */
describe("PermissionCheckService", () => {
  const findUnique = vi.fn();
  const findMany = vi.fn();
  const prisma = {
    membership: { findUnique, findMany },
  } as unknown as PrismaClient;

  const svc = new PermissionCheckService(prisma);

  beforeEach(() => {
    findUnique.mockReset();
    findMany.mockReset();
  });

  describe("checkPermission", () => {
    it("returns false when teamId is missing", async () => {
      const r = await svc.checkPermission({
        userId: 1,
        teamId: null,
        permission: "eventType.update",
        fallbackRoles: [MembershipRole.ADMIN, MembershipRole.OWNER],
      });
      expect(r).toBe(false);
      expect(findUnique).not.toHaveBeenCalled();
    });

    it("returns false when the user has no Membership row", async () => {
      findUnique.mockResolvedValueOnce(null);
      const r = await svc.checkPermission({
        userId: 1,
        teamId: 10,
        permission: "eventType.update",
        fallbackRoles: [MembershipRole.ADMIN, MembershipRole.OWNER],
      });
      expect(r).toBe(false);
    });

    it("returns false when Membership exists but accepted=false", async () => {
      findUnique.mockResolvedValueOnce({ role: MembershipRole.ADMIN, accepted: false });
      const r = await svc.checkPermission({
        userId: 1,
        teamId: 10,
        permission: "eventType.update",
        fallbackRoles: [MembershipRole.ADMIN, MembershipRole.OWNER],
      });
      expect(r).toBe(false);
    });

    it("returns false when role is below the requested fallback set", async () => {
      findUnique.mockResolvedValueOnce({ role: MembershipRole.MEMBER, accepted: true });
      const r = await svc.checkPermission({
        userId: 1,
        teamId: 10,
        permission: "eventType.update",
        fallbackRoles: [MembershipRole.ADMIN, MembershipRole.OWNER],
      });
      expect(r).toBe(false);
    });

    it("returns true when role is in the fallback set and membership is accepted", async () => {
      findUnique.mockResolvedValueOnce({ role: MembershipRole.OWNER, accepted: true });
      const r = await svc.checkPermission({
        userId: 1,
        teamId: 10,
        permission: "eventType.update",
        fallbackRoles: [MembershipRole.ADMIN, MembershipRole.OWNER],
      });
      expect(r).toBe(true);
    });

    it("hasPermission mirrors checkPermission", async () => {
      findUnique.mockResolvedValueOnce({ role: MembershipRole.ADMIN, accepted: true });
      const r = await svc.hasPermission({
        userId: 1,
        teamId: 10,
        permission: "eventType.read",
        fallbackRoles: [MembershipRole.MEMBER, MembershipRole.ADMIN, MembershipRole.OWNER],
      });
      expect(r).toBe(true);
    });
  });

  describe("getTeamIdsWithPermission", () => {
    it("filters to accepted memberships with a matching role", async () => {
      findMany.mockResolvedValueOnce([{ teamId: 10 }, { teamId: 11 }]);
      const ids = await svc.getTeamIdsWithPermission({
        userId: 1,
        permission: "eventType.update",
        fallbackRoles: [MembershipRole.ADMIN, MembershipRole.OWNER],
      });
      expect(ids).toEqual([10, 11]);
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 1,
            accepted: true,
            role: { in: [MembershipRole.ADMIN, MembershipRole.OWNER] },
          }),
        })
      );
    });

    it("returns [] when the user has no matching membership", async () => {
      findMany.mockResolvedValueOnce([]);
      const ids = await svc.getTeamIdsWithPermission({
        userId: 999,
        permission: "eventType.update",
        fallbackRoles: [MembershipRole.OWNER],
      });
      expect(ids).toEqual([]);
    });
  });
});
