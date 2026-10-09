import process from "node:process";
import { loadTranslations } from "@calcom/i18n/server";
import { BookingStatus } from "@calcom/prisma/enums";
import type { PageProps as _PageProps } from "app/_types";
import { _generateMetadata } from "app/_utils";
import { CustomI18nProvider } from "app/CustomI18nProvider";
import { withCachedAppDirSsr } from "app/WithAppDirSsr";
import OldPage from "~/bookings/views/bookings-single-view";
import {
  type PageProps as ClientPageProps,
  getServerSideProps,
} from "~/bookings/views/bookings-single-view.getServerSideProps";

const getData = withCachedAppDirSsr<ClientPageProps>(getServerSideProps);

export const generateMetadata = async ({ params, searchParams }: _PageProps) => {
  const { bookingInfo, eventType, recurringBookings, orgSlug } = await getData({ params, searchParams });
  const needsConfirmation = bookingInfo.status === BookingStatus.PENDING && eventType.requiresConfirmation;

  const metadata = await _generateMetadata(
    (t) =>
      t(`booking_${needsConfirmation ? "submitted" : "confirmed"}${recurringBookings ? "_recurring" : ""}`),
    (t) =>
      t(`booking_${needsConfirmation ? "submitted" : "confirmed"}${recurringBookings ? "_recurring" : ""}`),
    false,
    process.env.NEXT_PUBLIC_WEBAPP_URL ?? "",
    `/booking/${(await params).uid}`
  );

  return {
    ...metadata,
    robots: {
      index: false,
      follow: false,
    },
  };
};

const ServerPage = async ({ params, searchParams }: _PageProps) => {
  const props = await getData({ params, searchParams });

  const eventLocale = props.eventType?.interfaceLanguage;
  if (eventLocale) {
    const ns = "common";
    const translations = await loadTranslations(eventLocale, ns);
    return (
      <CustomI18nProvider translations={translations} locale={eventLocale} ns={ns}>
        <OldPage {...props} />
      </CustomI18nProvider>
    );
  }

  return <OldPage {...props} />;
};
export default ServerPage;
