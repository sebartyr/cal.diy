import { WEBAPP_URL } from "@calcom/lib/constants";
import type { TeamEventPageProps } from "@server/lib/team/[slug]/[type]/getServerSideProps";
import { getTeamTypeServerSideProps } from "@server/lib/team/[slug]/[type]/getServerSideProps";
import type { PageProps as _PageProps } from "app/_types";
import { generateMeetingMetadata } from "app/_utils";
import { withCachedAppDirSsr } from "app/WithAppDirSsr";
import type { Metadata } from "next";
import TeamTypePublicView from "~/team/team-type-public-view";

const getData: (pageProps: _PageProps) => Promise<TeamEventPageProps> =
  withCachedAppDirSsr<TeamEventPageProps>(getTeamTypeServerSideProps);

export const generateMetadata = async ({ params, searchParams }: _PageProps): Promise<Metadata> => {
  const props = await getData({ params, searchParams });
  const { eventData, isBrandingHidden, isSEOIndexable, booking, user, slug } = props;
  const title = eventData?.title ?? "";
  const profileName = eventData?.profile?.name ?? "";

  const meeting = {
    title,
    profile: { name: profileName, image: eventData?.profile?.image ?? null },
    users:
      eventData?.users?.map((u) => ({
        name: `${u.name ?? ""}`,
        username: `${u.username ?? ""}`,
      })) ?? [],
  };

  const metadata = await generateMeetingMetadata(
    meeting,
    (t) => `${booking ? t("reschedule") : ""} ${title} | ${profileName}`,
    (t) => `${booking ? t("reschedule") : ""} ${title}`,
    isBrandingHidden,
    WEBAPP_URL,
    `/team/${user}/${slug}`
  );

  return {
    ...metadata,
    robots: {
      follow: isSEOIndexable,
      index: isSEOIndexable,
    },
  };
};

export default async function TeamTypePage({ params, searchParams }: _PageProps) {
  const props = await getData({ params, searchParams });
  return <TeamTypePublicView {...props} />;
}
