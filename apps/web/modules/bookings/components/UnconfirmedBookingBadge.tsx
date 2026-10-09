"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { Badge } from "@calcom/ui/components/badge";
import Link from "next/link";

export default function UnconfirmedBookingBadge() {
  const { t } = useLocale();
  const { data: unconfirmedBookingCount } = trpc.viewer.me.bookingUnconfirmedCount.useQuery(undefined, {
    // Short enough for new booking requests to show up quickly, long enough to skip refetching on every page.
    staleTime: 30_000,
  });
  if (!unconfirmedBookingCount) return null;
  return (
    <Link href="/bookings/unconfirmed">
      <Badge
        rounded
        title={t("unconfirmed_bookings_tooltip")}
        variant="orange"
        className="cursor-pointer hover:bg-orange-800 hover:text-orange-100">
        {unconfirmedBookingCount}
      </Badge>
    </Link>
  );
}
