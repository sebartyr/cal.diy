import type { GetServerSideProps, GetServerSidePropsContext } from "next";

import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import type { GetBookingType } from "@calcom/features/bookings/lib/get-booking";
import {
  getBookingForReschedule,
  getBookingForSeatedEvent,
} from "@calcom/features/bookings/lib/get-booking";
import type { getPublicEvent } from "@calcom/features/eventtypes/lib/getPublicEvent";
import { EventRepository } from "@calcom/features/eventtypes/repositories/EventRepository";
import slugify from "@calcom/lib/slugify";
import { prisma } from "@calcom/prisma";

type TeamEventPageProps = {
  eventData: NonNullable<Awaited<ReturnType<typeof getPublicEvent>>>;
  booking: GetBookingType | null;
  rescheduleUid: string | null;
  bookingUid: string | null;
  user: string;
  slug: string;
  teamId: number;
  isBrandingHidden: boolean;
  isSEOIndexable: boolean;
  themeBasis: string | null;
  orgBannerUrl: null;
  isEmbed?: boolean;
  isInstantMeeting: boolean;
};

function pickString(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[value.length - 1] ?? null : value;
}

export const getTeamTypeServerSideProps: GetServerSideProps<TeamEventPageProps> = async (
  context: GetServerSidePropsContext
) => {
  const teamSlugRaw = pickString(context.query.slug);
  const eventTypeSlugRaw = pickString(context.query.type);
  if (!teamSlugRaw || !eventTypeSlugRaw) return { notFound: true } as const;

  const teamSlug = slugify(teamSlugRaw);
  const eventSlug = slugify(eventTypeSlugRaw);

  const eventData = await EventRepository.getPublicEvent({
    username: teamSlug,
    eventSlug,
    isTeamEvent: true,
    org: null,
    fromRedirectOfNonOrgLink: false,
  });

  if (!eventData) return { notFound: true } as const;

  const session = await getServerSession(context);

  let booking: GetBookingType | null = null;
  let rescheduleUid: string | null = null;
  let bookingUid: string | null = null;

  const rescheduleParam = pickString(context.query.rescheduleUid);
  const seatReferenceParam = pickString(context.query.seatReferenceUid);
  const bookingUidParam = pickString(context.query.bookingUid);

  if (rescheduleParam) {
    booking = await getBookingForReschedule(rescheduleParam, session?.user?.id);
    rescheduleUid = rescheduleParam;
  } else if (seatReferenceParam) {
    booking = await getBookingForSeatedEvent(seatReferenceParam);
    bookingUid = bookingUidParam;
  } else if (bookingUidParam) {
    bookingUid = bookingUidParam;
  }

  // Aligned with /team/[slug]/getServerSideProps.ts — Cal.diy disabled orgs
  // but legacy teams may still carry a non-null parentId, so we match on
  // isOrganization rather than parentId.
  const teamRow = await prisma.team.findFirst({
    where: { slug: teamSlug, isOrganization: false },
    select: { id: true, hideBranding: true },
  });
  const isBrandingHidden = teamRow?.hideBranding ?? false;

  const props: TeamEventPageProps = {
    eventData,
    booking,
    rescheduleUid,
    bookingUid,
    user: teamSlug,
    slug: eventSlug,
    teamId: teamRow?.id ?? 0,
    isBrandingHidden,
    isSEOIndexable: !eventData.hidden,
    themeBasis: teamSlug,
    orgBannerUrl: null,
    isInstantMeeting: pickString(context.query.isInstantMeeting) === "true",
  };

  return { props } as const;
}

export type { TeamEventPageProps };
