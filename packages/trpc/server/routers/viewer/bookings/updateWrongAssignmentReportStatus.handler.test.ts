import { MembershipRole, WrongAssignmentReportStatus } from "@calcom/prisma/enums";
import type { TrpcSessionUser } from "@calcom/trpc/server/types";
import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateWrongAssignmentReportStatusHandler } from "./updateWrongAssignmentReportStatus.handler";

const mockFindTeamIdById = vi.fn();
const mockUpdateStatus = vi.fn();
const mockCheckPermission = vi.fn();

vi.mock("@calcom/features/bookings/repositories/WrongAssignmentReportRepository", () => ({
  WrongAssignmentReportRepository: class MockWrongAssignmentReportRepository {
    findTeamIdById = mockFindTeamIdById;
    updateStatus = mockUpdateStatus;
  },
}));
vi.mock("@calcom/features/membership/di/TeamRolePermissionService.container", () => ({
  getTeamRolePermissionService: () => ({ checkPermission: mockCheckPermission }),
}));
vi.mock("@calcom/prisma", () => ({
  default: {},
  prisma: {},
}));

const REPORT_ID = "6f1c9a52-6d0e-4f43-9b0a-2b9a6f0e6d11";
const user = { id: 42 } as NonNullable<TrpcSessionUser>;
const input = { reportId: REPORT_ID, status: WrongAssignmentReportStatus.REVIEWED };

describe("updateWrongAssignmentReportStatusHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws NOT_FOUND when the report does not exist", async () => {
    mockFindTeamIdById.mockResolvedValue(null);

    await expect(updateWrongAssignmentReportStatusHandler({ ctx: { user }, input })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });

  it("throws FORBIDDEN when the user is not an admin/owner of the report's team", async () => {
    mockFindTeamIdById.mockResolvedValue({ id: REPORT_ID, teamId: 7 });
    mockCheckPermission.mockResolvedValue(false);

    const promise = updateWrongAssignmentReportStatusHandler({ ctx: { user }, input });

    await expect(promise).rejects.toBeInstanceOf(TRPCError);
    await expect(promise).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockCheckPermission).toHaveBeenCalledWith({
      userId: 42,
      teamId: 7,
      permission: "booking.update",
      fallbackRoles: [MembershipRole.ADMIN, MembershipRole.OWNER],
    });
    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });

  it("rejects reports that are not attached to a team", async () => {
    mockFindTeamIdById.mockResolvedValue({ id: REPORT_ID, teamId: null });
    mockCheckPermission.mockResolvedValue(false);

    await expect(updateWrongAssignmentReportStatusHandler({ ctx: { user }, input })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mockCheckPermission).toHaveBeenCalledWith(expect.objectContaining({ teamId: null }));
    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });

  it("updates the report when the user is an admin/owner of the report's team", async () => {
    mockFindTeamIdById.mockResolvedValue({ id: REPORT_ID, teamId: 7 });
    mockCheckPermission.mockResolvedValue(true);
    mockUpdateStatus.mockResolvedValue({ id: REPORT_ID, status: WrongAssignmentReportStatus.REVIEWED });

    const result = await updateWrongAssignmentReportStatusHandler({ ctx: { user }, input });

    expect(result).toEqual({
      success: true,
      report: { id: REPORT_ID, status: WrongAssignmentReportStatus.REVIEWED },
    });
    expect(mockUpdateStatus).toHaveBeenCalledWith({
      id: REPORT_ID,
      status: WrongAssignmentReportStatus.REVIEWED,
      reviewedById: 42,
    });
  });
});
