"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { MembershipRole } from "@calcom/prisma/enums";
import { trpc } from "@calcom/trpc/react";
import { Badge } from "@calcom/ui/components/badge";
import { Button } from "@calcom/ui/components/button";
import { Icon } from "@calcom/ui/components/icon";
import { showToast } from "@calcom/ui/components/toast";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

const roleBadgeVariant: Record<MembershipRole, "default" | "success" | "gray"> = {
  OWNER: "default",
  ADMIN: "success",
  MEMBER: "gray",
};

export default function TeamsSettingsView() {
  const { t } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams?.get("inviteToken") ?? null;
  const utils = trpc.useUtils();

  const { data: teams = [], isPending } = trpc.viewer.teams.list.useQuery();

  const acceptOrLeave = trpc.viewer.teams.acceptOrLeave.useMutation({
    onSuccess: () => utils.viewer.teams.list.invalidate(),
    onError: (e) => showToast(e.message, "error"),
  });

  const accept = (teamId: number, token?: string) =>
    acceptOrLeave.mutate(
      { teamId, accept: true, ...(token ? { inviteToken: token } : {}) },
      {
        onSuccess: () =>
          showToast(t("invitation_accepted", { defaultValue: "Invitation acceptée" }), "success"),
      }
    );

  const decline = (teamId: number) =>
    acceptOrLeave.mutate(
      { teamId, accept: false },
      {
        onSuccess: () =>
          showToast(t("invitation_declined", { defaultValue: "Invitation refusée" }), "success"),
      }
    );

  // When the invitee arrives from the email link (`?inviteToken=...`), auto-accept
  // the matching pending invite. The backend validates the token against the
  // team + email, so we attempt it against each pending membership and let the
  // server pick the one it belongs to. Run once per token.
  const autoAccepted = useRef(false);
  useEffect(() => {
    if (!inviteToken || isPending || autoAccepted.current) return;
    autoAccepted.current = true;

    const pending = teams.filter((m) => !m.accepted);
    if (pending.length === 0) {
      router.replace("/settings/teams");
      return;
    }

    (async () => {
      let accepted = false;
      for (const m of pending) {
        try {
          await acceptOrLeave.mutateAsync({ teamId: m.team.id, accept: true, inviteToken });
          accepted = true;
          break;
        } catch {
          // Token didn't match this team — try the next pending invite.
        }
      }
      if (accepted) {
        showToast(t("invitation_accepted", { defaultValue: "Invitation acceptée" }), "success");
        utils.viewer.teams.list.invalidate();
      } else {
        showToast(
          t("invite_token_invalid", { defaultValue: "Lien d'invitation invalide ou expiré." }),
          "error"
        );
      }
      router.replace("/settings/teams");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteToken, isPending, teams]);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-emphasis text-xl font-semibold">{t("teams", { defaultValue: "Équipes" })}</h1>
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
          {teams.map((m) => {
            const teamInfo = (
              <div className="flex min-w-0 items-center gap-3">
                <div className="bg-emphasis flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
                  <Icon name="users" className="text-default h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-emphasis truncate font-medium">{m.team.name}</p>
                  <p className="text-subtle truncate text-xs">/team/{m.team.slug}</p>
                </div>
              </div>
            );

            // Pending invite: no link to the profile (the user isn't a member yet,
            // so `teams.get` would 403). Offer accept / decline instead.
            if (!m.accepted) {
              return (
                <li key={m.team.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  {teamInfo}
                  <div className="flex items-center gap-2">
                    <Badge variant="warning" size="sm">
                      {t("pending", { defaultValue: "en attente" })}
                    </Badge>
                    <Button
                      size="sm"
                      color="secondary"
                      loading={acceptOrLeave.isPending}
                      onClick={() => decline(m.team.id)}>
                      {t("decline", { defaultValue: "Refuser" })}
                    </Button>
                    <Button
                      size="sm"
                      loading={acceptOrLeave.isPending}
                      onClick={() => accept(m.team.id, inviteToken ?? undefined)}>
                      {t("accept", { defaultValue: "Accepter" })}
                    </Button>
                  </div>
                </li>
              );
            }

            return (
              <li key={m.team.id} className="hover:bg-muted">
                <Link
                  href={`/settings/teams/${m.team.id}/profile`}
                  className="flex items-center justify-between gap-4 px-4 py-3">
                  {teamInfo}
                  <div className="flex items-center gap-2">
                    <Badge variant={roleBadgeVariant[m.role]} size="sm">
                      {m.role}
                    </Badge>
                    <Icon name="chevron-right" className="text-subtle h-4 w-4" />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
