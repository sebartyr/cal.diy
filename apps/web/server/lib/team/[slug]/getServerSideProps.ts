import logger from "@calcom/lib/logger";
import { markdownToSafeHTML } from "@calcom/lib/markdownToSafeHTML";
import { stripMarkdown } from "@calcom/lib/stripMarkdown";
import { prisma } from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";
import { SchedulingType } from "@calcom/prisma/enums";
import { teamMetadataSchema } from "@calcom/prisma/zod-utils";
import type { GetServerSideProps, GetServerSidePropsContext } from "next";

const log = logger.getSubLogger({ prefix: ["team/[slug]"] });

function pickString(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[value.length - 1] ?? null) : value;
}

const publicTeamSelect = {
  id: true,
  name: true,
  slug: true,
  bio: true,
  logoUrl: true,
  bannerUrl: true,
  brandColor: true,
  darkBrandColor: true,
  theme: true,
  isPrivate: true,
  hideBranding: true,
  metadata: true,
  eventTypes: {
    where: {
      hidden: false,
      schedulingType: {
        in: [SchedulingType.ROUND_ROBIN, SchedulingType.COLLECTIVE, SchedulingType.MANAGED],
      },
    },
    orderBy: [{ position: "desc" }, { id: "asc" }],
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      length: true,
      schedulingType: true,
      price: true,
      currency: true,
      recurringEvent: true,
      requiresConfirmation: true,
      seatsPerTimeSlot: true,
      hidden: true,
      metadata: true,
    },
  },
} satisfies Prisma.TeamSelect;

type RawPublicTeam = Prisma.TeamGetPayload<{ select: typeof publicTeamSelect }>;

export type TeamPagePublicProps = {
  team: RawPublicTeam & {
    safeBio: string;
    markdownStrippedBio: string;
  };
  memberCount: number;
  considerUnpublished: boolean;
  themeBasis: string | null;
  isSEOIndexable: boolean;
};

export const getTeamServerSideProps: GetServerSideProps<TeamPagePublicProps> = async (
  context: GetServerSidePropsContext
) => {
  const slug = pickString(context.query.slug);
  if (!slug) return { notFound: true } as const;

  log.debug("team list SSR", { slug });

  // Match by slug, exclude organizations. Don't filter on parentId — Cal.diy disabled
  // orgs but pre-existing teams may still have a non-null parentId.
  const team = await prisma.team.findFirst({
    where: { slug, isOrganization: false },
    select: publicTeamSelect,
  });
  log.debug("team lookup", { slug, found: !!team, teamId: team?.id });

  if (team) {
    const safeBio = (await markdownToSafeHTML(team.bio)) || "";
    const markdownStrippedBio = stripMarkdown(team.bio ?? "");

    // The page only shows how many members the team has, and private teams must not reveal it.
    const memberCount = team.isPrivate
      ? 0
      : await prisma.membership.count({ where: { teamId: team.id, accepted: true } });

    const props: TeamPagePublicProps = {
      team: { ...team, safeBio, markdownStrippedBio },
      memberCount,
      considerUnpublished: false,
      themeBasis: team.slug,
      isSEOIndexable: true,
    };
    return { props } as const;
  }

  // Unpublished team: look up by metadata.requestedSlug.
  const unpublishedTeam = await prisma.team.findFirst({
    where: { metadata: { path: ["requestedSlug"], equals: slug } },
    select: publicTeamSelect,
  });

  if (!unpublishedTeam) return { notFound: true } as const;

  const parsedMetadata = teamMetadataSchema.safeParse(unpublishedTeam.metadata);
  const requestedSlug = parsedMetadata.success ? (parsedMetadata.data?.requestedSlug ?? null) : null;

  const props: TeamPagePublicProps = {
    team: {
      ...unpublishedTeam,
      slug: requestedSlug ?? unpublishedTeam.slug,
      safeBio: "",
      markdownStrippedBio: "",
    },
    memberCount: 0,
    considerUnpublished: true,
    themeBasis: unpublishedTeam.slug,
    isSEOIndexable: false,
  };
  return { props } as const;
};
