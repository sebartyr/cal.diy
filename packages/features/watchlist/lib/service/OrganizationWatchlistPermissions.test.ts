import type { PrismaBookingReportRepository } from "@calcom/features/bookingReport/repositories/PrismaBookingReportRepository";
import type { UserRepository } from "@calcom/features/users/repositories/UserRepository";
import type { WatchlistRepository } from "@calcom/features/watchlist/lib/repository/WatchlistRepository";
import { MembershipRole } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WatchlistErrorCode } from "../errors/WatchlistErrors";
import { OrganizationWatchlistOperationsService } from "./OrganizationWatchlistOperationsService";
import { OrganizationWatchlistQueryService } from "./OrganizationWatchlistQueryService";

const checkPermission = vi.fn();
const findOrgAndGlobalEntries = vi.fn();
const deleteEntry = vi.fn();
const watchlistRepo = { findOrgAndGlobalEntries, deleteEntry } as unknown as WatchlistRepository;

describe("OrganizationWatchlistQueryService permissions", () => {
  const service = new OrganizationWatchlistQueryService({
    watchlistRepo,
    userRepo: { findUsersByIds: vi.fn().mockResolvedValue([]) } as unknown as UserRepository,
    permissionCheckService: { checkPermission },
  });
  const input = { organizationId: 7, userId: 3, limit: 10, offset: 0 };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects users without an ADMIN/OWNER membership on the organization", async () => {
    checkPermission.mockResolvedValue(false);

    await expect(service.listWatchlistEntries(input)).rejects.toMatchObject({
      code: WatchlistErrorCode.PERMISSION_DENIED,
    });
    expect(checkPermission).toHaveBeenCalledWith({
      userId: 3,
      teamId: 7,
      permission: "watchlist.read",
      fallbackRoles: [MembershipRole.OWNER, MembershipRole.ADMIN],
    });
    expect(findOrgAndGlobalEntries).not.toHaveBeenCalled();
  });

  it("lists entries for organization admins", async () => {
    checkPermission.mockResolvedValue(true);
    findOrgAndGlobalEntries.mockResolvedValue({ rows: [], meta: { totalRowCount: 0 } });

    await expect(service.listWatchlistEntries(input)).resolves.toEqual({
      rows: [],
      meta: { totalRowCount: 0 },
    });
  });
});

describe("OrganizationWatchlistOperationsService permissions", () => {
  const service = new OrganizationWatchlistOperationsService({
    watchlistRepo,
    bookingReportRepo: {} as PrismaBookingReportRepository,
    permissionCheckService: { checkPermission },
    organizationId: 7,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects deletion by users without an ADMIN/OWNER membership on the organization", async () => {
    checkPermission.mockResolvedValue(false);

    await expect(service.deleteWatchlistEntry({ entryId: "entry-1", userId: 3 })).rejects.toMatchObject({
      code: WatchlistErrorCode.PERMISSION_DENIED,
    });
    expect(checkPermission).toHaveBeenCalledWith({
      userId: 3,
      teamId: 7,
      permission: "watchlist.delete",
      fallbackRoles: [MembershipRole.OWNER, MembershipRole.ADMIN],
    });
    expect(deleteEntry).not.toHaveBeenCalled();
  });

  it("deletes entries for organization admins", async () => {
    checkPermission.mockResolvedValue(true);

    await expect(service.deleteWatchlistEntry({ entryId: "entry-1", userId: 3 })).resolves.toMatchObject({
      success: true,
    });
    expect(deleteEntry).toHaveBeenCalledWith("entry-1", 3);
  });
});
