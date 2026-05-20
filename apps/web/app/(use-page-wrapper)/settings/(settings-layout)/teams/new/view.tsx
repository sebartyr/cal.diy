"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { showToast } from "@calcom/ui/components/toast";
import { Button } from "@calcom/ui/components/button";

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function NewTeamView() {
  const { t } = useLocale();
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  const create = trpc.viewer.teams.create.useMutation({
    onSuccess: (team) => {
      showToast(t("team_created", { defaultValue: "Équipe créée" }), "success");
      router.push(`/settings/teams/${team.id}/profile`);
    },
    onError: (e) => {
      showToast(e.message, "error");
    },
  });

  const onNameChange = (value: string) => {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  };

  return (
    <div className="space-y-6 max-w-xl">
      <header>
        <h1 className="text-emphasis text-xl font-semibold">
          {t("new_team", { defaultValue: "Nouvelle équipe" })}
        </h1>
        <p className="text-subtle text-sm">
          {t("new_team_description", {
            defaultValue: "Vous serez automatiquement défini comme propriétaire.",
          })}
        </p>
      </header>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim() || !slug.trim()) return;
          create.mutate({ name: name.trim(), slug: slug.trim() });
        }}>
        <div>
          <label htmlFor="team-name" className="text-emphasis mb-1 block text-sm font-medium">
            {t("team_name", { defaultValue: "Nom de l'équipe" })}
          </label>
          <input
            id="team-name"
            type="text"
            required
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            className="border-subtle bg-default text-emphasis w-full rounded-md border px-3 py-2 text-sm"
            placeholder="Mon équipe"
          />
        </div>

        <div>
          <label htmlFor="team-slug" className="text-emphasis mb-1 block text-sm font-medium">
            {t("team_url", { defaultValue: "URL publique" })}
          </label>
          <div className="flex items-stretch">
            <span className="border-subtle bg-muted text-subtle inline-flex items-center rounded-l-md border border-r-0 px-3 text-sm">
              /team/
            </span>
            <input
              id="team-slug"
              type="text"
              required
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value.toLowerCase());
              }}
              pattern="^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$"
              className="border-subtle bg-default text-emphasis w-full rounded-r-md border px-3 py-2 text-sm"
              placeholder="mon-equipe"
            />
          </div>
          <p className="text-subtle mt-1 text-xs">
            {t("slug_hint", { defaultValue: "Minuscules, chiffres et tirets uniquement." })}
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" color="secondary" href="/settings/teams">
            {t("cancel", { defaultValue: "Annuler" })}
          </Button>
          <Button type="submit" loading={create.isPending}>
            {t("create", { defaultValue: "Créer" })}
          </Button>
        </div>
      </form>
    </div>
  );
}
