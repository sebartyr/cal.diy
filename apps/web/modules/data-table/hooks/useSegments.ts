import { recalculateDateRange } from "@calcom/features/data-table/lib/dateRange";
import {
  type SegmentIdentifier,
  SYSTEM_SEGMENT_PREFIX,
  type UseSegments,
} from "@calcom/features/data-table/lib/types";
import { isDateRangeFilterValue } from "@calcom/features/data-table/lib/utils";
import { useMemo } from "react";

export const useSegments: UseSegments = ({ tableIdentifier, providedSegments, systemSegments }) => {
  const rawSegments = providedSegments
    ? { segments: providedSegments, preferredSegmentId: null as SegmentIdentifier | null }
    : undefined;
  // Segments are local in this fork (system segments and provided ones, nothing to fetch), so they
  // are ready immediately. Waiting for providedSegments meant a segment taken from the URL was never
  // applied to the filters.
  const isSuccess = true;
  const setPreference = (_args: { tableIdentifier: string; segmentId: SegmentIdentifier | null }) => {};

  const preferredSegmentId = useMemo(() => rawSegments?.preferredSegmentId || null, [rawSegments]);

  const segments = useMemo(() => {
    const userSegments = providedSegments || rawSegments?.segments || [];

    const processedSystemSegments = (systemSegments || []).map((segment) => ({
      perPage: 10,
      tableIdentifier,
      ...segment,
      id: `${SYSTEM_SEGMENT_PREFIX}${segment.id}`,
      type: "system" as const,
      activeFilters: segment.activeFilters.map((filter) => {
        if (isDateRangeFilterValue(filter.v)) {
          return {
            ...filter,
            v: recalculateDateRange(filter.v),
          };
        }
        return filter;
      }),
    }));

    const processedUserSegments = userSegments.map((segment) => ({
      ...segment,
      type: "user" as const,
      activeFilters: segment.activeFilters.map((filter) => {
        if (isDateRangeFilterValue(filter.v)) {
          return {
            ...filter,
            v: recalculateDateRange(filter.v),
          };
        }
        return filter;
      }),
    }));

    return [...processedSystemSegments, ...processedUserSegments];
  }, [rawSegments, providedSegments, systemSegments, tableIdentifier]);

  return {
    segments,
    preferredSegmentId,
    isSuccess,
    setPreference,
    isSegmentEnabled: true,
  };
};
