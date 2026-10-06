import { ScheduleRepository } from "@calcom/features/schedules/repositories/ScheduleRepository";
import { prisma } from "@calcom/prisma";
import { TRPCError } from "@trpc/server";
import type { TrpcSessionUser } from "../../../../types";
import type { TBulkUpdateToDefaultAvailabilityInputSchema } from "./bulkUpdateDefaultAvailability.schema";

type BulkUpdateToDefaultAvailabilityOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
  };
  input: TBulkUpdateToDefaultAvailabilityInputSchema;
};

export const bulkUpdateToDefaultAvailabilityHandler = async ({
  ctx,
  input,
}: BulkUpdateToDefaultAvailabilityOptions) => {
  const { eventTypeIds, selectedDefaultScheduleId } = input;
  const defaultScheduleId = ctx.user.defaultScheduleId;

  if (!selectedDefaultScheduleId && !defaultScheduleId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Default schedule not set",
    });
  }

  if (selectedDefaultScheduleId) {
    const scheduleRepo = new ScheduleRepository(prisma);
    const schedule = await scheduleRepo.findScheduleByIdForOwnershipCheck({
      scheduleId: selectedDefaultScheduleId,
    });
    if (!schedule || schedule.userId !== ctx.user.id) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this schedule" });
    }
  }

  return await prisma.eventType.updateMany({
    where: {
      id: {
        in: eventTypeIds,
      },
      userId: ctx.user.id,
    },
    data: {
      scheduleId: selectedDefaultScheduleId || defaultScheduleId,
    },
  });
};
