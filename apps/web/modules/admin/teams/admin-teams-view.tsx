"use client";

import Link from "next/link";
import { useState } from "react";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { Avatar } from "@calcom/ui/components/avatar";
import { Badge } from "@calcom/ui/components/badge";
import { Button } from "@calcom/ui/components/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@calcom/ui/components/dialog";
import { Icon } from "@calcom/ui/components/icon";
import { showToast } from "@calcom/ui/components/toast";

export default function AdminTeamsView() {
  const { t } = useLocale();
  const [search, setSearch] = useState("");
  const teams = trpc.viewer.teams.adminList.useQuery({ search: search.trim() || undefined });
  const teamList = teams.data?.teams ?? [];

  const [pendingDelete, setPendingDelete] = useState<{ id: number; name: string } | null>(null);
  const adminDelete = trpc.viewer.teams.adminDelete.useMutation({
    onSuccess: () => {
      showToast(t("team_deleted", { defaultValue: "Équipe supprimée" }), "success");
      setPendingDelete(null);
      teams.refetch();
    },
    onError: (e) => showToast(e.message, "error"),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("search_teams", { defaultValue: "Rechercher par nom ou slug…" }) as string}
          className="border-subtle bg-default text-emphasis w-full max-w-sm rounded-md border px-3 py-2 text-sm"
        />
        <span className="text-subtle text-sm">
          {teamList.length} {t("teams_count", { defaultValue: "équipe(s)" })}
        </span>
      </div>

      {teams.isPending ? (
        <p className="text-subtle text-sm">{t("loading", { defaultValue: "Chargement…" })}</p>
      ) : teamList.length === 0 ? (
        <p className="text-subtle text-sm">
          {t("no_teams_found", { defaultValue: "Aucune équipe ne correspond." })}
        </p>
      ) : (
        <ul className="bg-default border-subtle divide-subtle overflow-hidden rounded-md border divide-y">
          {teamList.map((team) => (
            <li key={team.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar
                  size="sm"
                  alt={team.name}
                  imageSrc={team.logoUrl ?? undefined}
                  fallback={<Icon name="users" className="h-4 w-4" />}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-emphasis truncate font-medium">{team.name}</p>
                    {team.isPrivate ? (
                      <Badge variant="gray" size="sm">
                        {t("private", { defaultValue: "Privée" })}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-subtle truncate text-xs">
                    /team/{team.slug ?? "—"} · #{team.id}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-subtle text-xs">
                  {team._count.members} {t("members_count", { defaultValue: "membre(s)" })}
                </span>
                <span className="text-subtle text-xs">
                  {team._count.eventTypes} {t("event_types_count", { defaultValue: "event types" })}
                </span>
                <Link href={`/settings/teams/${team.id}/profile`}>
                  <Button color="secondary" size="sm" StartIcon="external-link">
                    {t("manage", { defaultValue: "Gérer" })}
                  </Button>
                </Link>
                <Button
                  size="sm"
                  color="destructive"
                  StartIcon="trash-2"
                  onClick={() => setPendingDelete({ id: team.id, name: team.name })}>
                  {t("delete", { defaultValue: "Supprimer" })}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader
            title={t("confirm_delete_team", { defaultValue: "Confirmer la suppression" })}
          />
          <p className="text-subtle text-sm">
            {pendingDelete
              ? t("admin_delete_team_warning", {
                  defaultValue: `Cette action supprime définitivement l'équipe "${pendingDelete.name}" et tous ses event types. Aucune confirmation des membres ne sera demandée.`,
                })
              : null}
          </p>
          <DialogFooter>
            <Button color="secondary" onClick={() => setPendingDelete(null)}>
              {t("cancel", { defaultValue: "Annuler" })}
            </Button>
            <Button
              color="destructive"
              loading={adminDelete.isPending}
              onClick={() =>
                pendingDelete ? adminDelete.mutate({ teamId: pendingDelete.id }) : null
              }>
              {t("delete", { defaultValue: "Supprimer" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
