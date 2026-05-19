"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { Button } from "@calcom/ui/components/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@calcom/ui/components/dialog";
import { showToast } from "@calcom/ui/components/toast";

export default function TeamProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useLocale();
  const teamId = Number(params?.id);

  const { data: team, isPending, refetch } = trpc.viewer.teams.get.useQuery(
    { teamId },
    { enabled: Number.isFinite(teamId) }
  );

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [bio, setBio] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [hideBranding, setHideBranding] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (team) {
      setName(team.name);
      setSlug(team.slug ?? "");
      setBio(team.bio ?? "");
      setIsPrivate(team.isPrivate);
      setHideBranding(team.hideBranding);
    }
  }, [team]);

  const update = trpc.viewer.teams.update.useMutation({
    onSuccess: () => {
      showToast(t("saved", { defaultValue: "Enregistré" }), "success");
      refetch();
    },
    onError: (e) => showToast(e.message, "error"),
  });

  const deleteTeam = trpc.viewer.teams.delete.useMutation({
    onSuccess: () => {
      showToast(t("team_deleted", { defaultValue: "Équipe supprimée" }), "success");
      router.push("/settings/teams");
    },
    onError: (e) => showToast(e.message, "error"),
  });

  if (isPending) return <p className="text-subtle text-sm">{t("loading", { defaultValue: "Chargement…" })}</p>;
  if (!team)
    return (
      <p className="text-subtle text-sm">{t("team_not_found", { defaultValue: "Équipe introuvable." })}</p>
    );

  const canEdit = team.myRole === "OWNER" || team.myRole === "ADMIN";
  const canDelete = team.myRole === "OWNER";

  return (
    <div className="max-w-2xl space-y-8">
      <header>
        <h1 className="text-emphasis text-xl font-semibold">{team.name}</h1>
        <nav className="border-subtle mt-2 flex gap-4 border-b text-sm">
          <a className="border-emphasis -mb-px border-b-2 px-1 py-2" href={`/settings/teams/${team.id}/profile`}>
            {t("profile", { defaultValue: "Profil" })}
          </a>
          <a className="text-subtle px-1 py-2 hover:text-emphasis" href={`/settings/teams/${team.id}/members`}>
            {t("members", { defaultValue: "Membres" })}
          </a>
        </nav>
      </header>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate({ teamId, name, slug, bio, isPrivate, hideBranding });
        }}>
        <div>
          <label className="text-emphasis mb-1 block text-sm font-medium">
            {t("team_name", { defaultValue: "Nom" })}
          </label>
          <input
            type="text"
            disabled={!canEdit}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border-subtle bg-default text-emphasis w-full rounded-md border px-3 py-2 text-sm disabled:opacity-50"
          />
        </div>

        <div>
          <label className="text-emphasis mb-1 block text-sm font-medium">
            {t("team_url", { defaultValue: "URL" })}
          </label>
          <div className="flex">
            <span className="border-subtle bg-muted text-subtle inline-flex items-center rounded-l-md border border-r-0 px-3 text-sm">
              /team/
            </span>
            <input
              type="text"
              disabled={!canEdit}
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              pattern="^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$"
              className="border-subtle bg-default text-emphasis w-full rounded-r-md border px-3 py-2 text-sm disabled:opacity-50"
            />
          </div>
        </div>

        <div>
          <label className="text-emphasis mb-1 block text-sm font-medium">
            {t("bio", { defaultValue: "Description" })}
          </label>
          <textarea
            rows={4}
            disabled={!canEdit}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="border-subtle bg-default text-emphasis w-full rounded-md border px-3 py-2 text-sm disabled:opacity-50"
            placeholder={t("team_bio_placeholder", { defaultValue: "Présentez votre équipe…" }) as string}
          />
        </div>

        <fieldset className="space-y-3">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              disabled={!canEdit}
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
            />
            <span className="text-sm">
              <span className="text-emphasis font-medium">
                {t("private_team", { defaultValue: "Équipe privée" })}
              </span>
              <span className="text-subtle block text-xs">
                {t("private_team_description", {
                  defaultValue: "Cache la liste des membres sur la page publique.",
                })}
              </span>
            </span>
          </label>

          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              disabled={!canEdit}
              checked={hideBranding}
              onChange={(e) => setHideBranding(e.target.checked)}
            />
            <span className="text-sm">
              <span className="text-emphasis font-medium">
                {t("hide_branding", { defaultValue: "Masquer le branding" })}
              </span>
              <span className="text-subtle block text-xs">
                {t("hide_branding_description", { defaultValue: "Retire la mention en bas de page." })}
              </span>
            </span>
          </label>
        </fieldset>

        <div className="flex justify-end pt-2">
          <Button type="submit" loading={update.isPending} disabled={!canEdit}>
            {t("save", { defaultValue: "Enregistrer" })}
          </Button>
        </div>
      </form>

      {canDelete ? (
        <section className="border-error rounded-md border p-4">
          <h2 className="text-error font-semibold">
            {t("danger_zone", { defaultValue: "Zone à risque" })}
          </h2>
          <p className="text-subtle mt-1 text-sm">
            {t("delete_team_description", {
              defaultValue: "La suppression d'une équipe est définitive.",
            })}
          </p>
          <div className="mt-3">
            <Button color="destructive" onClick={() => setConfirmOpen(true)}>
              {t("delete_team", { defaultValue: "Supprimer l'équipe" })}
            </Button>
          </div>
        </section>
      ) : null}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader title={t("confirm_delete", { defaultValue: "Confirmer la suppression" })} />
          <p className="text-subtle text-sm">
            {t("delete_team_confirm", {
              defaultValue: `Cette action supprime "${team.name}" et tous ses event types.`,
            })}
          </p>
          <DialogFooter>
            <Button color="secondary" onClick={() => setConfirmOpen(false)}>
              {t("cancel", { defaultValue: "Annuler" })}
            </Button>
            <Button color="destructive" loading={deleteTeam.isPending} onClick={() => deleteTeam.mutate({ teamId })}>
              {t("delete", { defaultValue: "Supprimer" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
