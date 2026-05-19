import type { Metadata } from "next";
import { cookies, headers } from "next/headers";

import { WEBAPP_URL } from "@calcom/lib/constants";

import { buildLegacyCtx } from "@lib/buildLegacyCtx";
import { withAppDirSsr } from "app/WithAppDirSsr";
import type { PageProps as _PageProps } from "app/_types";
import { generateMeetingMetadata } from "app/_utils";
import { getTeamServerSideProps } from "@server/lib/team/[slug]/getServerSideProps";
import type { TeamPagePublicProps } from "@server/lib/team/[slug]/getServerSideProps";

import TeamPublicView from "~/team/team-public-view";

const getData: (ctx: ReturnType<typeof buildLegacyCtx>) => Promise<TeamPagePublicProps> =
  withAppDirSsr<TeamPagePublicProps>(getTeamServerSideProps);

export const generateMetadata = async ({ params, searchParams }: _PageProps): Promise<Metadata> => {
  const props = await getData(buildLegacyCtx(await headers(), await cookies(), await params, await searchParams));
  const { team, isSEOIndexable } = props;

  const meeting = {
    title: team.markdownStrippedBio,
    profile: { name: team.name, image: team.logoUrl ?? null },
  };

  const metadata = await generateMeetingMetadata(
    meeting,
    () => team.name || "",
    () => team.name || "",
    false,
    WEBAPP_URL,
    `/team/${team.slug ?? ""}`
  );

  return {
    ...metadata,
    robots: {
      follow: isSEOIndexable,
      index: isSEOIndexable,
    },
  };
};

export default async function TeamPage({ params, searchParams }: _PageProps) {
  const props = await getData(buildLegacyCtx(await headers(), await cookies(), await params, await searchParams));
  return <TeamPublicView {...props} />;
}
