import { WEBAPP_URL } from "@calcom/lib/constants";
import type { TeamPagePublicProps } from "@server/lib/team/[slug]/getServerSideProps";
import { getTeamServerSideProps } from "@server/lib/team/[slug]/getServerSideProps";
import type { PageProps as _PageProps } from "app/_types";
import { generateMeetingMetadata } from "app/_utils";
import { withCachedAppDirSsr } from "app/WithAppDirSsr";
import type { Metadata } from "next";
import TeamPublicView from "~/team/team-public-view";

const getData: (pageProps: _PageProps) => Promise<TeamPagePublicProps> =
  withCachedAppDirSsr<TeamPagePublicProps>(getTeamServerSideProps);

export const generateMetadata = async ({ params, searchParams }: _PageProps): Promise<Metadata> => {
  const props = await getData({ params, searchParams });
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
  const props = await getData({ params, searchParams });
  return <TeamPublicView {...props} />;
}
