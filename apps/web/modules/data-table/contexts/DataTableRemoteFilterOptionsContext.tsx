"use client";

import type { FacetedValue } from "@calcom/features/data-table/lib/types";
import { createContext, useContext } from "react";

export type RemoteFilterOptions = {
  options: FacetedValue[];
  isLoading: boolean;
  hasMore: boolean;
  loadMore: () => void;
};

/**
 * Loads the options of a select filter from the server, for lists too large to be passed as
 * faceted values. It is called as a hook by the filter popover: it must be a stable function.
 */
export type UseRemoteFilterOptions = (args: { searchTerm: string }) => RemoteFilterOptions;

const DataTableRemoteFilterOptionsContext = createContext<Record<string, UseRemoteFilterOptions>>({});

/**
 * Maps column ids to server-side option loaders. Columns without a loader keep their faceted
 * values and client-side search.
 */
export const DataTableRemoteFilterOptionsProvider = DataTableRemoteFilterOptionsContext.Provider;

export function useRemoteFilterOptionsLoader(columnId: string): UseRemoteFilterOptions | undefined {
  return useContext(DataTableRemoteFilterOptionsContext)[columnId];
}
