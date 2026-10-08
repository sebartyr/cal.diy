"use client";

import type {
  FilterableColumn as _FilterableColumn,
  FacetedValue,
  FilterValueSchema,
} from "@calcom/features/data-table/lib/types";
import { useDebounce } from "@calcom/lib/hooks/useDebounce";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { FilterType } from "@calcom/types/data-table";
import classNames from "@calcom/ui/classNames";
import { buttonClasses } from "@calcom/ui/components/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@calcom/ui/components/command";
import { CheckIcon } from "@coss/ui/icons";
import { useMemo, useState } from "react";
import {
  type UseRemoteFilterOptions,
  useRemoteFilterOptionsLoader,
} from "~/data-table/contexts/DataTableRemoteFilterOptionsContext";
import { useDataTable, useFilterValue } from "~/data-table/hooks";

type FilterableColumn = Extract<_FilterableColumn, { type: Extract<FilterType, "ms" | "ss"> }>;

type FilterableSelectColumn<T extends Extract<FilterType, "ms" | "ss">> = Extract<
  FilterableColumn,
  { type: T }
>;

type FilterValue<T extends Extract<FilterType, "ms" | "ss">> = ReturnType<
  typeof useFilterValue<T, FilterValueSchema<T>>
>;

export type BaseSelectFilterOptionsProps<T extends Extract<FilterType, "ms" | "ss">> = {
  column: FilterableSelectColumn<T>;
  filterValueSchema: FilterValueSchema<T>;
  isOptionSelected: (filterValue: FilterValue<T> | undefined, optionValue: string | number) => boolean;
  onOptionSelect: (
    column: FilterableSelectColumn<T>,
    currentFilterValue: FilterValue<T> | undefined,
    optionValue: string | number
  ) => void;
  testIdPrefix: string;
};

type SectionedOptions = {
  [section: string]: FacetedValue[];
};

function getSectionedOptions(options: FacetedValue[]) {
  // First map and normalize the options
  const normalizedOptions = options
    .map((option) => {
      if (!option) return null;
      const {
        label: optionLabel,
        value: optionValue,
        section,
      } = typeof option === "string" ? { label: option, value: option, section: undefined } : option;
      return { label: optionLabel, value: optionValue, section };
    })
    .filter((option): option is NonNullable<typeof option> => option !== null);

  // Group options by section
  const sectionedOptions: SectionedOptions = {};

  let currentSection = "";
  normalizedOptions.forEach((option) => {
    const sectionKey = option.section ?? ""; // Use empty string for unsectioned items
    if (sectionKey && sectionKey !== currentSection) {
      currentSection = sectionKey;
    }
    if (!sectionedOptions[currentSection]) {
      sectionedOptions[currentSection] = [];
    }
    const { section: _, ...optionWithoutSection } = option;
    sectionedOptions[currentSection].push(optionWithoutSection);
  });

  return sectionedOptions;
}

export function BaseSelectFilterOptions<T extends Extract<FilterType, "ms" | "ss">>(
  props: BaseSelectFilterOptionsProps<T>
) {
  const useRemoteOptions = useRemoteFilterOptionsLoader(props.column.id);
  if (useRemoteOptions) {
    return <RemoteSelectFilterOptions {...props} useRemoteOptions={useRemoteOptions} />;
  }
  return <LocalSelectFilterOptions {...props} />;
}

function OptionCheckbox({ checked }: { checked: boolean }) {
  return (
    <div
      className={classNames(
        "border-subtle mr-2 flex h-4 w-4 items-center justify-center rounded-sm",
        checked ? "bg-primary-default" : "border opacity-50"
      )}>
      {checked && <CheckIcon className="text-primary-foreground h-4 w-4" />}
    </div>
  );
}

function ClearFilterGroup({ columnId }: { columnId: string }) {
  const { t } = useLocale();
  const { removeFilter } = useDataTable();
  return (
    <CommandGroup>
      <CommandItem
        onSelect={() => {
          removeFilter(columnId);
        }}
        className={classNames("w-full justify-center text-center", buttonClasses({ color: "secondary" }))}>
        {t("clear")}
      </CommandItem>
    </CommandGroup>
  );
}

/** Options searched and paginated on the server (see DataTableRemoteFilterOptionsProvider). */
function RemoteSelectFilterOptions<T extends Extract<FilterType, "ms" | "ss">>({
  column,
  filterValueSchema,
  isOptionSelected,
  onOptionSelect,
  testIdPrefix,
  useRemoteOptions,
}: BaseSelectFilterOptionsProps<T> & { useRemoteOptions: UseRemoteFilterOptions }) {
  const { t } = useLocale();
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const { options, isLoading, hasMore, loadMore } = useRemoteOptions({ searchTerm: debouncedSearchTerm });
  const filterValue = useFilterValue(column.id, filterValueSchema);

  return (
    <Command data-testid={`${testIdPrefix}-${column.id}`} shouldFilter={false}>
      <CommandInput
        placeholder={t("search")}
        value={searchTerm}
        onValueChange={setSearchTerm}
        data-testid={`select-filter-options-search-${column.id}`}
      />
      <CommandList>
        {!isLoading && <CommandEmpty>{t("no_options_available")}</CommandEmpty>}
        {options.map((option) => {
          const { label: optionLabel, value: optionValue } =
            typeof option === "string" ? { label: option, value: option } : option;
          return (
            <CommandItem key={optionValue} onSelect={() => onOptionSelect(column, filterValue, optionValue)}>
              <OptionCheckbox checked={isOptionSelected(filterValue, optionValue)} />
              {optionLabel}
            </CommandItem>
          );
        })}
        {hasMore && (
          <CommandItem onSelect={loadMore} className="justify-center text-subtle">
            {isLoading ? t("loading") : t("load_more_results")}
          </CommandItem>
        )}
      </CommandList>
      <CommandSeparator />
      <ClearFilterGroup columnId={column.id} />
    </Command>
  );
}

function LocalSelectFilterOptions<T extends Extract<FilterType, "ms" | "ss">>({
  column,
  filterValueSchema,
  isOptionSelected,
  onOptionSelect,
  testIdPrefix,
}: BaseSelectFilterOptionsProps<T>) {
  const { t } = useLocale();

  const filterValue = useFilterValue(column.id, filterValueSchema);

  const options = useMemo(() => {
    const sectionedOptions = getSectionedOptions(column.options);

    // Sort options within each section based on selection status
    Object.keys(sectionedOptions).forEach((section) => {
      sectionedOptions[section] = [
        ...sectionedOptions[section].filter((option) => isOptionSelected(filterValue, option.value)),
        ...sectionedOptions[section].filter((option) => !isOptionSelected(filterValue, option.value)),
      ];
    });

    // Flatten the sections back into an array with section information
    return Object.keys(sectionedOptions).flatMap((section) =>
      sectionedOptions[section].map((option, index) => ({
        section: section === "" || index > 0 ? undefined : section,
        ...option,
      }))
    );
  }, [column.options, filterValue]);

  return (
    <Command data-testid={`${testIdPrefix}-${column.id}`}>
      <CommandInput placeholder={t("search")} data-testid={`select-filter-options-search-${column.id}`} />
      <CommandList>
        <CommandEmpty>{t("no_options_available")}</CommandEmpty>
        {options.map((option, index) => {
          const { label: optionLabel, value: optionValue, section } = option;

          return (
            <>
              {section && index !== 0 && <hr className="border-subtle my-1" />}
              {section && (
                <div className="text-subtle px-4 py-2 text-xs font-medium uppercase leading-none">
                  {section}
                </div>
              )}
              <CommandItem
                key={optionValue}
                onSelect={() => onOptionSelect(column, filterValue, optionValue)}>
                <OptionCheckbox checked={isOptionSelected(filterValue, optionValue)} />
                {optionLabel}
              </CommandItem>
            </>
          );
        })}
      </CommandList>
      <CommandSeparator />
      <ClearFilterGroup columnId={column.id} />
    </Command>
  );
}
