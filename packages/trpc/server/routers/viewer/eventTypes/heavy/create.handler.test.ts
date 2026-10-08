import type { PrismaClient } from "@calcom/prisma";
import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHandler } from "./create.handler";

const mockFindScheduleByIdForOwnershipCheck = vi.fn();
const mockEventTypeCreate = vi.fn();

vi.mock("@calcom/features/schedules/repositories/ScheduleRepository", () => ({
  ScheduleRepository: vi.fn().mockImplementation(function () {
    return { findScheduleByIdForOwnershipCheck: mockFindScheduleByIdForOwnershipCheck };
  }),
}));

vi.mock("@calcom/features/eventtypes/repositories/eventTypeRepository", () => ({
  EventTypeRepository: vi.fn().mockImplementation(function () {
    return { create: mockEventTypeCreate };
  }),
}));

vi.mock("@calcom/app-store/_utils/getDefaultLocations", () => ({
  getDefaultLocations: vi.fn().mockResolvedValue([{ type: "integrations:daily" }]),
}));

vi.mock("../util", () => ({
  PermissionCheckService: vi.fn().mockImplementation(function () {
    return { checkPermission: vi.fn().mockResolvedValue(false) };
  }),
}));

const USER_ID = 1;

const ctx = {
  user: {
    id: USER_ID,
    role: "USER" as const,
    organizationId: null,
    organization: { isOrgAdmin: false },
    profile: { id: null },
    metadata: {},
    email: "user@example.com",
  },
  prisma: {} as PrismaClient,
};

const baseInput = { title: "Meeting", slug: "meeting", length: 30 };

describe("createHandler schedule ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEventTypeCreate.mockResolvedValue({ id: 42 });
  });

  it("rejects a scheduleId owned by another user", async () => {
    mockFindScheduleByIdForOwnershipCheck.mockResolvedValue({ userId: 2 });

    await expect(createHandler({ ctx, input: { ...baseInput, scheduleId: 99 } })).rejects.toThrow(
      new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this schedule" })
    );
    expect(mockFindScheduleByIdForOwnershipCheck).toHaveBeenCalledWith({ scheduleId: 99 });
    expect(mockEventTypeCreate).not.toHaveBeenCalled();
  });

  it("rejects a scheduleId that does not exist", async () => {
    mockFindScheduleByIdForOwnershipCheck.mockResolvedValue(null);

    await expect(createHandler({ ctx, input: { ...baseInput, scheduleId: 99 } })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mockEventTypeCreate).not.toHaveBeenCalled();
  });

  it("connects a schedule owned by the current user", async () => {
    mockFindScheduleByIdForOwnershipCheck.mockResolvedValue({ userId: USER_ID });

    await createHandler({ ctx, input: { ...baseInput, scheduleId: 7 } });

    expect(mockEventTypeCreate).toHaveBeenCalledWith(
      expect.objectContaining({ schedule: { connect: { id: 7 } } })
    );
  });

  it("skips the ownership check when no scheduleId is provided", async () => {
    await createHandler({ ctx, input: baseInput });

    expect(mockFindScheduleByIdForOwnershipCheck).not.toHaveBeenCalled();
    expect(mockEventTypeCreate).toHaveBeenCalledWith(expect.objectContaining({ schedule: undefined }));
  });
});
