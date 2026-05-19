import type { GetServerSideProps, GetServerSidePropsContext } from "next";

import logger from "@calcom/lib/logger";
import { markdownToSafeHTML } from "@calcom/lib/markdownToSafeHTML";
import { stripMarkdown } from "@calcom/lib/stripMarkdown";
import { prisma } from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";
import { SchedulingType } from "@calcom/prisma/enums";
import { teamMetadataSchema } from "@calcom/prisma/zod-utils";

const log = logger.getSubLogger({ prefix: ["team/[slug]"] });

function pickString(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[value.length - 1] ?? null : value;
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
  members: {
    where: { accepted: true },
    select: {
      role: true,
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          avatarUrl: true,
        },
      },
    },
  },
} satisfies Prisma.TeamSelect;

type RawPublicTeam = Prisma.TeamGetPayload<{ select: typeof publicTeamSelect }>;

export type TeamPagePublicProps = {
  team: RawPublicTeam & {
    safeBio: string;
    markdownStrippedBio: string;
  };
  members: { id: number; name: string | null; username: string | null; avatarUrl: string | null }[];
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
    const memberUsers = team.isPrivate ? [] : team.members.map((m) => m.user);

    const props: TeamPagePublicProps = {
      team: { ...team, safeBio, markdownStrippedBio },
      members: memberUsers,
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
  const requestedSlug = parsedMetadata.success ? parsedMetadata.data?.requestedSlug ?? null : null;

  const props: TeamPagePublicProps = {
    team: {
      ...unpublishedTeam,
      slug: requestedSlug ?? unpublishedTeam.slug,
      safeBio: "",
      markdownStrippedBio: "",
    },
    members: [],
    considerUnpublished: true,
    themeBasis: unpublishedTeam.slug,
    isSEOIndexable: false,
  };
  return { props } as const;
}
