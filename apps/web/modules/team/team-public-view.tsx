"use client";

import classNames from "classnames";
import Link from "next/link";

import { useIsEmbed } from "@calcom/embed-core/embed-iframe";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import useTheme from "@calcom/lib/hooks/useTheme";
import { Avatar } from "@calcom/ui/components/avatar";
import { UnpublishedEntity } from "@calcom/ui/components/unpublished-entity";

import type { TeamPagePublicProps } from "@server/lib/team/[slug]/getServerSideProps";

export type PageProps = TeamPagePublicProps;

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

export default function TeamPublicView({ team, members, considerUnpublished }: PageProps) {
  useTheme(team.theme);
  const { t } = useLocale();
  const isEmbed = useIsEmbed();
  const teamName = team.name || t("nameless_team");

  if (considerUnpublished) {
    return (
      <div className="flex h-full min-h-[calc(100dvh)] items-center justify-center">
        <UnpublishedEntity teamSlug={team.slug ?? undefined} logoUrl={team.logoUrl} name={team.name} />
      </div>
    );
  }

  return (
    <main className={classNames("mx-auto max-w-3xl px-4 py-24", isEmbed && "h-full")}>
      <div className="text-center">
        <Avatar
          alt={teamName}
          imageSrc={team.logoUrl ?? `/team/${team.slug}/avatar.png`}
          size="lg"
          className="mx-auto mb-4 h-20 w-20"
        />
        <h1 className="font-cal text-emphasis text-3xl">{teamName}</h1>
        {team.markdownStrippedBio ? (
          <p
            className="text-subtle mt-2 mx-auto max-w-prose text-sm"
            dangerouslySetInnerHTML={{ __html: team.safeBio }}
          />
        ) : null}
        {members.length > 0 ? (
          <p className="text-subtle mt-2 text-xs">
            {t("number_of_members", { count: members.length, defaultValue: `${members.length} members` })}
          </p>
        ) : null}
      </div>

      <ul className="bg-default border-subtle divide-subtle mt-8 divide-y overflow-hidden rounded-md border">
        {team.eventTypes.map((eventType) => (
          <li key={eventType.id} className="hover:bg-muted relative">
            <Link
              href={`/team/${team.slug}/${eventType.slug}`}
              className="block w-full px-6 py-5"
              data-testid={`event-type-link-${eventType.id}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-emphasis font-semibold">{eventType.title}</p>
                  {eventType.description ? (
                    <p className="text-subtle mt-1 text-sm line-clamp-2">{eventType.description}</p>
                  ) : null}
                  <p className="text-subtle mt-1 text-xs">{formatDuration(eventType.length)}</p>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {team.eventTypes.length === 0 ? (
        <p className="text-subtle mt-8 text-center text-sm">
          {t("no_event_types_have_been_setup_yet", { defaultValue: "No event types available." })}
        </p>
      ) : null}
    </main>
  );
}
