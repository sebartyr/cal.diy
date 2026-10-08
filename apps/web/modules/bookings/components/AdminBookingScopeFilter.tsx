"use client";

import { useDebounce } from "@calcom/lib/hooks/useDebounce";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { Select } from "@calcom/ui/components/form";
import { useMemo, useState } from "react";
import { useDataTable } from "~/data-table/hooks/useDataTable";
import type { AdminBookingScope } from "../hooks/useAdminBookingScope";
import { useAdminBookingScope } from "../hooks/useAdminBookingScope";

const PAGE_SIZE = 20;

type Option<T> = { label: string; value: T };

function UserPicker({
  selectedId,
  onChange,
}: {
  selectedId: number | null;
  onChange: (userId: number | null) => void;
}) {
  const { t } = useLocale();
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const { data, fetchNextPage, hasNextPage, isFetching } = trpc.viewer.admin.listPaginated.useInfiniteQuery(
    { limit: PAGE_SIZE, searchTerm: debouncedSearchTerm || undefined },
    { getNextPageParam: (lastPage) => lastPage.nextCursor }
  );
  // The selected user may not be on the loaded pages (e.g. after a reload from the URL).
  const { data: selected } = trpc.viewer.admin.listPaginated.useQuery(
    { limit: 1, ids: selectedId ? [selectedId] : [] },
    { enabled: !!selectedId }
  );

  const options = useMemo<Option<number>[]>(
    () =>
      (data?.pages.flatMap((page) => page.rows) ?? []).map((user) => ({
        label: user.name ? `${user.name} (${user.email})` : user.email,
        value: user.id,
      })),
    [data]
  );

  const selectedUser = selected?.rows[0];
  const value = selectedUser
    ? {
        label: selectedUser.name ? `${selectedUser.name} (${selectedUser.email})` : selectedUser.email,
        value: selectedUser.id,
      }
    : null;

  return (
    <Select<Option<number>>
      size="sm"
      className="min-w-64"
      isClearable
      isLoading={isFetching}
      placeholder={t("admin_bookings_search_users")}
      aria-label={t("select_user")}
      options={options}
      value={value}
      filterOption={null}
      onInputChange={(input, { action }) => {
        if (action === "input-change") setSearchTerm(input);
      }}
      onMenuScrollToBottom={() => {
        if (hasNextPage) fetchNextPage();
      }}
      onChange={(option) => onChange(option?.value ?? null)}
      noOptionsMessage={() => t("no_results")}
    />
  );
}

function TeamPicker({
  selectedId,
  onChange,
}: {
  selectedId: number | null;
  onChange: (teamId: number | null) => void;
}) {
  const { t } = useLocale();
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const { data, fetchNextPage, hasNextPage, isFetching } = trpc.viewer.admin.listTeams.useInfiniteQuery(
    { limit: PAGE_SIZE, searchTerm: debouncedSearchTerm || undefined },
    { getNextPageParam: (lastPage) => lastPage.nextCursor }
  );
  const { data: selected } = trpc.viewer.admin.listTeams.useQuery(
    { limit: 1, ids: selectedId ? [selectedId] : [] },
    { enabled: !!selectedId }
  );

  const teamLabel = (team: { name: string; parent: { name: string } | null }) =>
    team.parent ? `${team.name} (${team.parent.name})` : team.name;

  const options = useMemo<Option<number>[]>(
    () =>
      (data?.pages.flatMap((page) => page.rows) ?? []).map((team) => ({
        label: teamLabel(team),
        value: team.id,
      })),
    [data]
  );

  const selectedTeam = selected?.rows[0];
  const value = selectedTeam ? { label: teamLabel(selectedTeam), value: selectedTeam.id } : null;

  return (
    <Select<Option<number>>
      size="sm"
      className="min-w-64"
      isClearable
      isLoading={isFetching}
      placeholder={t("admin_bookings_search_teams")}
      aria-label={t("select_team")}
      options={options}
      value={value}
      filterOption={null}
      onInputChange={(input, { action }) => {
        if (action === "input-change") setSearchTerm(input);
      }}
      onMenuScrollToBottom={() => {
        if (hasNextPage) fetchNextPage();
      }}
      onChange={(option) => onChange(option?.value ?? null)}
      noOptionsMessage={() => t("no_results")}
    />
  );
}

/** Only rendered for acting system admins: lets them widen the list beyond their own bookings. */
export function AdminBookingScopeFilter() {
  const { t } = useLocale();
  const { setPageIndex } = useDataTable();
  const { scope, userId, teamId, setScope, setUserId, setTeamId } = useAdminBookingScope({
    isSystemAdmin: true,
  });

  const scopeOptions: Option<AdminBookingScope>[] = [
    { label: t("my_bookings"), value: "mine" },
    { label: t("admin_bookings_scope_all"), value: "all" },
    { label: t("admin_bookings_scope_user"), value: "user" },
    { label: t("admin_bookings_scope_team"), value: "team" },
  ];

  const resetPage = () => setPageIndex(0);

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="admin-bookings-scope">
      <Select<Option<AdminBookingScope>>
        size="sm"
        className="min-w-44"
        aria-label={t("admin_bookings_scope")}
        options={scopeOptions}
        value={scopeOptions.find((option) => option.value === scope)}
        isSearchable={false}
        onChange={(option) => {
          if (!option) return;
          setScope(option.value);
          resetPage();
        }}
      />
      {scope === "user" && (
        <UserPicker
          selectedId={userId}
          onChange={(id) => {
            setUserId(id);
            resetPage();
          }}
        />
      )}
      {scope === "team" && (
        <TeamPicker
          selectedId={teamId}
          onChange={(id) => {
            setTeamId(id);
            resetPage();
          }}
        />
      )}
    </div>
  );
}
