"use client";

import { useSearchParams } from "next/navigation";

import { BookerWebWrapper as Booker } from "@calcom/web/modules/bookings/components/BookerWebWrapper";
import { getBookerWrapperClasses } from "@calcom/features/bookings/Booker/utils/getBookerWrapperClasses";

import BookingPageErrorBoundary from "@components/error/BookingPageErrorBoundary";

import type { TeamEventPageProps } from "@server/lib/team/[slug]/[type]/getServerSideProps";

export type PageProps = TeamEventPageProps;

function durationFromSearch(
  multiple: number[] | undefined,
  queryDuration: string | null,
  fallback: number
): number {
  if (!multiple || multiple.length === 0) return fallback;
  const parsed = Number(queryDuration);
  return multiple.includes(parsed) ? parsed : fallback;
}

export default function TeamTypePublicView(props: PageProps) {
  const { eventData, user, slug, booking, isBrandingHidden, isEmbed, orgBannerUrl } = props;
  const searchParams = useSearchParams();

  return (
    <BookingPageErrorBoundary>
      <main className={getBookerWrapperClasses({ isEmbed: !!isEmbed })}>
        <Booker
          username={user}
          eventSlug={slug}
          bookingData={booking}
          hideBranding={isBrandingHidden}
          eventData={eventData}
          isTeamEvent
          entity={{ ...eventData.entity, eventTypeId: eventData.id }}
          durationConfig={eventData.metadata?.multipleDuration}
          orgBannerUrl={orgBannerUrl}
          duration={durationFromSearch(
            eventData.metadata?.multipleDuration,
            searchParams?.get("duration") ?? null,
            eventData.length
          )}
        />
      </main>
    </BookingPageErrorBoundary>
  );
}
