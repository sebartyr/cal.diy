import type { Metadata } from "next";
import { cookies, headers } from "next/headers";

import { WEBAPP_URL } from "@calcom/lib/constants";

import { buildLegacyCtx } from "@lib/buildLegacyCtx";
import { withAppDirSsr } from "app/WithAppDirSsr";
import type { PageProps as _PageProps } from "app/_types";
import { generateMeetingMetadata } from "app/_utils";
import { getTeamTypeServerSideProps } from "@server/lib/team/[slug]/[type]/getServerSideProps";
import type { TeamEventPageProps } from "@server/lib/team/[slug]/[type]/getServerSideProps";

import TeamTypePublicView from "~/team/team-type-public-view";

const getData: (ctx: ReturnType<typeof buildLegacyCtx>) => Promise<TeamEventPageProps> =
  withAppDirSsr<TeamEventPageProps>(getTeamTypeServerSideProps);

export const generateMetadata = async ({ params, searchParams }: _PageProps): Promise<Metadata> => {
  const props = await getData(buildLegacyCtx(await headers(), await cookies(), await params, await searchParams));
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
  const props = await getData(buildLegacyCtx(await headers(), await cookies(), await params, await searchParams));
  return <TeamTypePublicView {...props} />;
}
