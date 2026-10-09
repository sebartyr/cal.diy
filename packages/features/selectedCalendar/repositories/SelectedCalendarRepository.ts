import type { ISelectedCalendarRepository } from "@calcom/features/selectedCalendar/repositories/SelectedCalendarRepository.interface";
import { buildCredentialPayloadForPrisma } from "@calcom/lib/server/buildCredentialPayloadForCalendar";
import type { PrismaClient } from "@calcom/prisma";
import { prisma } from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";
import type { SelectedCalendarEventTypeIds } from "@calcom/types/Calendar";

export type UpdateArguments = {
  where: FindManyArgs["where"];
  data: Prisma.SelectedCalendarUpdateManyArgs["data"];
};
export type FindManyArgs = {
  where?: {
    userId?:
      | number
      | {
          in: number[];
        };
    credentialId?: number | null;
    integration?: string;
    externalId?: string;
    eventTypeId?: number | null;
    googleChannelId?:
      | string
      | null
      | {
          not: null;
        };
  };
  orderBy?: {
    userId?: "asc" | "desc";
  };
  select?: Prisma.SelectedCalendarSelect;
};

const MAX_SUBSCRIBE_ERRORS = 3;

export class SelectedCalendarRepository implements ISelectedCalendarRepository {
  constructor(private prismaClient: PrismaClient) {}

  // Instance method for DI (implements interface)
  async findById(id: string) {
    return this.prismaClient.selectedCalendar.findUnique({
      where: { id },
    });
  }

  async findByChannelId(channelId: string) {
    return this.prismaClient.selectedCalendar.findFirst({ where: { channelId } });
  }

  async findNextSubscriptionBatch({
    take,
    teamIds,
    integrations,
    genericCalendarSuffixes,
  }: {
    take: number;
    teamIds: number[];
    integrations: string[];
    genericCalendarSuffixes?: string[];
  }) {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const needsSubscriptionFilter: Prisma.SelectedCalendarWhereInput = {
      OR: [{ syncSubscribedAt: null }, { channelExpiration: null }, { channelExpiration: { lte: now } }],
    };

    const retryableWindowFilter: Prisma.SelectedCalendarWhereInput = {
      OR: [{ syncSubscribedErrorAt: null }, { syncSubscribedErrorAt: { lt: oneDayAgo } }],
    };

    const retryableErrorCountFilter: Prisma.SelectedCalendarWhereInput = {
      syncSubscribedErrorCount: { lt: MAX_SUBSCRIBE_ERRORS },
    };

    const suffixFilters =
      genericCalendarSuffixes?.map<Prisma.SelectedCalendarWhereInput>((suffix) => ({
        NOT: { externalId: { endsWith: suffix } },
      })) ?? [];

    const andFilters = [
      needsSubscriptionFilter,
      retryableWindowFilter,
      retryableErrorCountFilter,
      ...suffixFilters,
    ];

    return this.prismaClient.selectedCalendar.findMany({
      where: {
        integration: { in: integrations },
        user: {
          teams: {
            some: {
              accepted: true,
              teamId: { in: teamIds },
            },
          },
        },
        AND: andFilters.length ? andFilters : undefined,
      },
      take,
    });
  }

  async updateSyncStatus(
    id: string,
    data: Pick<
      Prisma.SelectedCalendarUpdateInput,
      "syncToken" | "syncedAt" | "syncErrorAt" | "syncErrorCount"
    >
  ) {
    return this.prismaClient.selectedCalendar.update({
      where: { id },
      data,
    });
  }

  async updateSubscription(
    id: string,
    data: Pick<
      Prisma.SelectedCalendarUpdateInput,
      | "channelId"
      | "channelResourceId"
      | "channelResourceUri"
      | "channelKind"
      | "channelExpiration"
      | "syncSubscribedAt"
      | "syncSubscribedErrorAt"
      | "syncSubscribedErrorCount"
    >
  ) {
    return this.prismaClient.selectedCalendar.update({
      where: { id },
      data,
    });
  }

  // Static methods for direct usage (from lib version)
  private static async findConflicting(data: {
    userId: number;
    integration: string;
    externalId: string;
    eventTypeId?: number | null;
  }) {
    return await SelectedCalendarRepository.findFirst({
      where: {
        userId: data.userId,
        integration: data.integration,
        externalId: data.externalId,
        eventTypeId: data.eventTypeId || null,
      },
    });
  }

  static async findById(id: string) {
    return await prisma.selectedCalendar.findUnique({ where: { id } });
  }

  static async create(data: Prisma.SelectedCalendarUncheckedCreateInput) {
    const conflictingCalendar = await SelectedCalendarRepository.findConflicting(data);

    if (conflictingCalendar) {
      throw new Error(
        `Selected calendar already exists for userId: ${data.userId}, integration: ${data.integration}, externalId: ${data.externalId}, eventTypeId: ${data.eventTypeId}`
      );
    }

    return await prisma.selectedCalendar.create({
      data: {
        ...data,
      },
    });
  }

  static async upsert(data: Prisma.SelectedCalendarUncheckedCreateInput) {
    const credentialPayload = buildCredentialPayloadForPrisma({
      credentialId: data.credentialId,
      delegationCredentialId: data.delegationCredentialId,
    });

    const newData = {
      ...data,
      ...credentialPayload,
    };

    const conflictingCalendar = await SelectedCalendarRepository.findConflicting(newData);
    if (conflictingCalendar) {
      return await prisma.selectedCalendar.update({
        where: {
          id: conflictingCalendar.id,
        },
        data: newData,
      });
    }

    return await prisma.selectedCalendar.create({
      data: newData,
    });
  }

  static async delete({ where }: { where: Prisma.SelectedCalendarUncheckedCreateInput }) {
    const calendarsToDelete = await SelectedCalendarRepository.findMany({ where });

    if (calendarsToDelete.length === 0) {
      throw new Error("SelectedCalendar not found");
    }

    if (calendarsToDelete.length > 1) {
      throw new Error("Multiple SelectedCalendar records found to delete. deleteMany should be used instead");
    }

    return await prisma.selectedCalendar.delete({
      where: {
        id: calendarsToDelete[0].id,
      },
    });
  }

  static async deleteById({ id }: { id: string }) {
    return await prisma.selectedCalendar.delete({
      where: {
        id,
      },
    });
  }

  static async createIfNotExists(data: Prisma.SelectedCalendarUncheckedCreateInput) {
    const conflictingCalendar = await SelectedCalendarRepository.findConflicting(data);

    if (conflictingCalendar) return conflictingCalendar;
    return await prisma.selectedCalendar.create({
      data,
    });
  }

  static async findMany({ where, select, orderBy }: FindManyArgs) {
    const args = {
      where,
      select,
      orderBy,
    } satisfies Prisma.SelectedCalendarFindManyArgs;
    return await prisma.selectedCalendar.findMany(args);
  }

  static async findUniqueOrThrow({ where }: { where: Prisma.SelectedCalendarWhereInput }) {
    const calendars = await prisma.selectedCalendar.findMany({ where });
    if (calendars.length === 0) {
      throw new Error("SelectedCalendar not found");
    }
    return calendars[0];
  }

  static async findFirst({ where }: { where: Prisma.SelectedCalendarWhereInput }) {
    return await prisma.selectedCalendar.findFirst({
      where,
    });
  }

  static async findFirstOrThrow({ where }: { where: Prisma.SelectedCalendarWhereInput }) {
    const calendar = await SelectedCalendarRepository.findFirst({ where });
    if (!calendar) {
      throw new Error("SelectedCalendar not found");
    }
    return calendar;
  }

  static async update(args: UpdateArguments) {
    const calendarsToUpdate = await SelectedCalendarRepository.findMany({ where: args.where });

    if (calendarsToUpdate.length === 0) {
      throw new Error("SelectedCalendar not found");
    }

    if (calendarsToUpdate.length > 1) {
      throw new Error("Multiple SelectedCalendar records found to update. updateMany should be used instead");
    }

    const calendarToUpdate = calendarsToUpdate[0];

    return await prisma.selectedCalendar.update({
      where: {
        id: calendarToUpdate.id,
      },
      data: args.data,
    });
  }

  static async upsertManyForEventTypeIds({
    data,
    eventTypeIds,
  }: {
    data: Prisma.SelectedCalendarUncheckedCreateInput;
    eventTypeIds: SelectedCalendarEventTypeIds;
  }) {
    const userId = data.userId;
    return await Promise.all(
      eventTypeIds.map((eventTypeId) =>
        SelectedCalendarRepository.upsert({
          ...data,
          eventTypeId,
          userId,
          integration: data.integration,
          externalId: data.externalId,
          credentialId: data.credentialId,
        })
      )
    );
  }
}
