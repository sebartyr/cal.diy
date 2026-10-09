import { EventTypeRepository } from "@calcom/features/eventtypes/repositories/eventTypeRepository";
import { hasFilter } from "@calcom/features/filters/lib/hasFilter";
import { checkRateLimitAndThrowError } from "@calcom/lib/checkRateLimitAndThrowError";
import logger from "@calcom/lib/logger";
import type { PrismaClient } from "@calcom/prisma";
import { prisma } from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";
import type { TrpcSessionUser } from "../../../types";
import type { TGetEventTypesFromGroupSchema } from "./getByViewer.schema";
import { mapEventTypes } from "./util";

const log = logger.getSubLogger({ prefix: ["getEventTypesFromGroup"] });

type GetByViewerOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
    prisma: PrismaClient;
  };
  input: TGetEventTypesFromGroupSchema;
};

type EventType = Parameters<typeof mapEventTypes>[0][number];
type MappedEventType = Awaited<ReturnType<typeof mapEventTypes>>[number];
type MappedEventTypeWithHostFlag = MappedEventType & { isCurrentUserHost: boolean };

export const getEventTypesFromGroup = async ({
  ctx,
  input,
}: GetByViewerOptions): Promise<{
  eventTypes: MappedEventTypeWithHostFlag[];
  nextCursor: number | null | undefined;
}> => {
  await checkRateLimitAndThrowError({
    identifier: `eventTypes:getEventTypesFromGroup:${ctx.user.id}`,
    rateLimitingType: "common",
  });

  const userProfile = ctx.user.profile;
  const { group, limit, cursor, filters, searchQuery } = input;
  const { teamId, parentId } = group;

  const isFilterSet = (filters && hasFilter(filters)) || !!teamId;
  const isUpIdInFilter = filters?.upIds?.includes(userProfile.upId);

  const shouldListUserEvents =
    !isFilterSet || isUpIdInFilter || (isFilterSet && filters?.upIds && !isUpIdInFilter);

  const eventTypes: EventType[] = [];
  const eventTypeRepo = new EventTypeRepository(ctx.prisma);

  if (shouldListUserEvents || !teamId) {
    const baseQueryConditions = {
      teamId: null,
      schedulingType: null,
      ...(searchQuery ? { title: { contains: searchQuery, mode: "insensitive" as Prisma.QueryMode } } : {}),
    };

    // A single query keeps the cursor and page size consistent; querying parent and child event types
    // separately returned up to 2×limit+1 rows per page. AND is required because findAllByUpId spreads
    // `where` over its own profile OR, which a top-level OR here would overwrite.
    const userEventTypes = await eventTypeRepo.findAllByUpId(
      {
        upId: userProfile.upId,
        userId: ctx.user.id,
      },
      {
        where: {
          ...baseQueryConditions,
          AND: [{ OR: [{ parentId: null }, { parentId: { not: null }, userId: ctx.user.id }] }],
        },
        orderBy: [
          {
            position: "desc",
          },
          {
            id: "desc",
          },
        ],
        limit,
        cursor,
      }
    );

    eventTypes.push(...(userEventTypes ?? []));
  }

  if (teamId) {
    const teamEventTypes =
      (await eventTypeRepo.findTeamEventTypes({
        teamId,
        parentId,
        userId: ctx.user.id,
        limit,
        cursor,
        where: {
          ...(isFilterSet && !!filters?.schedulingTypes
            ? {
                schedulingType: { in: filters.schedulingTypes },
              }
            : null),
          ...(searchQuery ? { title: { contains: searchQuery, mode: "insensitive" } } : {}),
        },
        orderBy: [
          {
            position: "desc",
          },
          {
            id: "desc",
          },
        ],
      })) ?? [];

    eventTypes.push(...teamEventTypes);
  }

  let nextCursor: number | null | undefined;
  if (eventTypes.length > limit) {
    const nextItem = eventTypes.pop();
    nextCursor = nextItem?.id;
  }

  const mappedEventTypes: MappedEventType[] = await mapEventTypes(eventTypes);

  const eventTypeIds = mappedEventTypes.map((et) => et.id);
  const [userHostEntries, membership] = await Promise.all([
    prisma.host.findMany({
      where: {
        userId: ctx.user.id,
        eventTypeId: { in: eventTypeIds },
      },
      select: {
        eventTypeId: true,
      },
    }),
    teamId
      ? prisma.membership.findFirst({
          where: {
            userId: ctx.user.id,
            teamId,
            accepted: true,
            role: "MEMBER",
          },
          select: {
            team: {
              select: {
                isPrivate: true,
              },
            },
          },
        })
      : null,
  ]);
  const eventTypeIdsWhereUserIsHost = new Set(userHostEntries.map((h) => h.eventTypeId));

  const eventTypesWithHostFlag = mappedEventTypes.map((eventType) => ({
    ...eventType,
    isCurrentUserHost: eventTypeIdsWhereUserIsHost.has(eventType.id),
  }));

  if (membership && membership.team.isPrivate)
    eventTypesWithHostFlag.forEach((evType) => {
      evType.users = [];
      evType.hosts = [];
      evType.children = [];
    });

  return { eventTypes: eventTypesWithHostFlag, nextCursor: nextCursor ?? undefined };
};
