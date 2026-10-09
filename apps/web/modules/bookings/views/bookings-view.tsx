"use client";

import type { SystemFilterSegment, UseSegments } from "@calcom/features/data-table/lib/types";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import classNames from "@calcom/ui/classNames";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import { DataTableRemoteFilterOptionsProvider } from "~/data-table/contexts/DataTableRemoteFilterOptionsContext";
import { DataTableProvider } from "~/data-table/DataTableProvider";
import { useSegments } from "~/data-table/hooks/useSegments";
import { BookingListContainer } from "../components/BookingListContainer";
import { useActiveFiltersValidator } from "../hooks/useActiveFiltersValidator";
import { useIsPristineBookingsUrl } from "../hooks/useAllBookingsScope";
import { useBookingsView } from "../hooks/useBookingsView";
import { useAdminTeamFilterOptions, useAdminUserFilterOptions } from "../hooks/useFacetedUniqueValues";
import {
  ALL_BOOKINGS_SEGMENT_ID,
  getMyBookingsActiveFilters,
  MY_BOOKINGS_SEGMENT,
  MY_BOOKINGS_SEGMENT_ID,
} from "../lib/constants";
import type { validStatuses } from "../lib/validStatuses";

const BookingCalendarContainer = dynamic(() =>
  import("../components/BookingCalendarContainer").then((mod) => ({
    default: mod.BookingCalendarContainer,
  }))
);

type BookingsProps = {
  status: (typeof validStatuses)[number];
  userId?: number;
  permissions: {
    canReadOthersBookings: boolean;
  };
  bookingsV3Enabled: boolean;
  bookingAuditEnabled: boolean;
  isSystemAdmin?: boolean;
};

export function useSystemSegments(userId?: number, isSystemAdmin = false) {
  const { t } = useLocale();

  const systemSegments: SystemFilterSegment[] = useMemo(() => {
    if (!userId) return [];

    const segments: SystemFilterSegment[] = [
      {
        id: MY_BOOKINGS_SEGMENT_ID,
        name: t("my_bookings"),
        type: "system",
        activeFilters: getMyBookingsActiveFilters(userId),
        perPage: 10,
      },
    ];

    // The list query turns this segment into filters.scope = "all", which bookings.get only accepts
    // from system admins.
    if (isSystemAdmin) {
      segments.push({
        id: ALL_BOOKINGS_SEGMENT_ID,
        name: t("all_bookings_filter_label"),
        type: "system",
        activeFilters: [],
        perPage: 10,
      });
    }

    return segments;
  }, [userId, isSystemAdmin, t]);

  return systemSegments;
}

// "My bookings" is only the default of a blank URL: filter edits drop the system segment but keep
// the filters in the URL, and those (reloads, shared links) must not be overridden. The bookings page
// already redirects blank URLs to the segment and its filters (getDefaultBookingsListUrl), because this
// mount-time URL write can be dropped by the Next.js router; this only covers URLs it never saw.
export const useBookingSegments: UseSegments = (props) => {
  const result = useSegments(props);
  const isPristineUrl = useIsPristineBookingsUrl();
  return {
    ...result,
    preferredSegmentId: result.preferredSegmentId ?? (isPristineUrl ? MY_BOOKINGS_SEGMENT : null),
  };
};

// System admins pick any user or team of the instance in the member and team filters.
const adminRemoteFilterOptions = {
  userId: useAdminUserFilterOptions,
  teamId: useAdminTeamFilterOptions,
};
const noRemoteFilterOptions = {};

export default function Bookings(props: BookingsProps) {
  const pathname = usePathname();
  const isSystemAdmin = !!props.isSystemAdmin;
  const systemSegments = useSystemSegments(props.userId, isSystemAdmin);
  const validateActiveFilters = useActiveFiltersValidator({
    canReadOthersBookings: props.permissions.canReadOthersBookings,
    isSystemAdmin,
  });
  if (!pathname) return null;
  return (
    <DataTableProvider
      tableIdentifier={pathname}
      useSegments={useBookingSegments}
      systemSegments={systemSegments}
      validateActiveFilters={validateActiveFilters}>
      <DataTableRemoteFilterOptionsProvider
        value={isSystemAdmin ? adminRemoteFilterOptions : noRemoteFilterOptions}>
        <BookingsContent {...props} />
      </DataTableRemoteFilterOptionsProvider>
    </DataTableProvider>
  );
}

function BookingsContent({
  status,
  permissions,
  bookingsV3Enabled,
  bookingAuditEnabled,
  isSystemAdmin = false,
}: BookingsProps) {
  const [view] = useBookingsView({ bookingsV3Enabled });

  return (
    <div className={classNames(view === "calendar" && "-mb-8")}>
      {view === "list" && (
        <BookingListContainer
          status={status}
          permissions={permissions}
          bookingsV3Enabled={bookingsV3Enabled}
          bookingAuditEnabled={bookingAuditEnabled}
          isSystemAdmin={isSystemAdmin}
        />
      )}
      {bookingsV3Enabled && view === "calendar" && (
        <BookingCalendarContainer
          status={status}
          permissions={permissions}
          bookingsV3Enabled={bookingsV3Enabled}
          isSystemAdmin={isSystemAdmin}
        />
      )}
    </div>
  );
}
