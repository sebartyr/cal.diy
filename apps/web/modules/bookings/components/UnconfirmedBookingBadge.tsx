"use client";

import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { Badge } from "@calcom/ui/components/badge";

const UNCONFIRMED_BOOKINGS_PATH = "/bookings/unconfirmed";

export default function UnconfirmedBookingBadge() {
  const { t } = useLocale();
  const router = useRouter();
  const { data: unconfirmedBookingCount } = trpc.viewer.me.bookingUnconfirmedCount.useQuery();
  if (!unconfirmedBookingCount) return null;

  // The badge sits inside the "Bookings" navigation link, and an <a> inside an <a> is invalid HTML
  // (hydration error). It navigates by itself instead, overriding the parent link's destination.
  const goToUnconfirmedBookings = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    router.push(UNCONFIRMED_BOOKINGS_PATH);
  };

  // A plain span: a Badge with onClick renders a <button>, which is not allowed inside <a> either.
  return (
    <span onClick={goToUnconfirmedBookings}>
      <Badge
        rounded
        title={t("unconfirmed_bookings_tooltip")}
        variant="orange"
        className="cursor-pointer hover:bg-orange-800 hover:text-orange-100">
        {unconfirmedBookingCount}
      </Badge>
    </span>
  );
}
