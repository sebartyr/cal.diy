"use client";

import Link from "next/link";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { MembershipRole } from "@calcom/prisma/enums";
import { trpc } from "@calcom/trpc/react";
import { Badge } from "@calcom/ui/components/badge";
import { Button } from "@calcom/ui/components/button";
import { Icon } from "@calcom/ui/components/icon";

const roleBadgeVariant: Record<MembershipRole, "default" | "success" | "gray"> = {
  OWNER: "default",
  ADMIN: "success",
  MEMBER: "gray",
};

export default function TeamsSettingsPage() {
  const { t } = useLocale();
  const { data: teams = [], isPending } = trpc.viewer.teams.list.useQuery();

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-emphasis text-xl font-semibold">
            {t("teams", { defaultValue: "Équipes" })}
          </h1>
          <p className="text-subtle text-sm">
            {t("teams_description", { defaultValue: "Gérez vos équipes et leurs membres." })}
          </p>
        </div>
        <Button href="/settings/teams/new" StartIcon="plus">
          {t("new_team", { defaultValue: "Nouvelle équipe" })}
        </Button>
      </header>

      {isPending ? (
        <p className="text-subtle text-sm">{t("loading", { defaultValue: "Chargement…" })}</p>
      ) : teams.length === 0 ? (
        <div className="border-subtle rounded-md border p-8 text-center">
          <p className="text-emphasis font-medium">
            {t("no_teams_yet", { defaultValue: "Aucune équipe pour l'instant." })}
          </p>
          <p className="text-subtle mt-1 text-sm">
            {t("create_first_team", { defaultValue: "Créez votre première équipe pour commencer." })}
          </p>
        </div>
      ) : (
        <ul className="bg-default border-subtle divide-subtle overflow-hidden rounded-md border divide-y">
          {teams.map((m) => (
            <li key={m.team.id} className="hover:bg-muted">
              <Link
                href={`/settings/teams/${m.team.id}/profile`}
                className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="bg-emphasis flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
                    <Icon name="users" className="text-default h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-emphasis truncate font-medium">{m.team.name}</p>
                    <p className="text-subtle truncate text-xs">/team/{m.team.slug}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={roleBadgeVariant[m.role]} size="sm">
                    {m.role}
                  </Badge>
                  {!m.accepted ? (
                    <Badge variant="warning" size="sm">
                      pending
                    </Badge>
                  ) : null}
                  <Icon name="chevron-right" className="text-subtle h-4 w-4" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
