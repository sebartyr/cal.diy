"use client";

import { useFormContext } from "react-hook-form";

import type { FormValues } from "@calcom/features/eventtypes/lib/types";
import { useLocale } from "@calcom/lib/hooks/useLocale";

type Props = {
  team: { id: number; name: string } | null;
  eventType: { id: number };
};

const EXPIRY_PRESETS_SECONDS = [
  { label: "30 sec", value: 30 },
  { label: "1 min", value: 60 },
  { label: "2 min", value: 120 },
  { label: "5 min", value: 300 },
];

export default function EventInstantTab({ team }: Props) {
  const { t } = useLocale();
  const form = useFormContext<FormValues>();

  const isInstantEvent = form.watch("isInstantEvent") ?? false;
  const expirySeconds = form.watch("instantMeetingExpiryTimeOffsetInSeconds") ?? 60;
  const assignAllTeamMembers = form.watch("assignAllTeamMembers") ?? false;

  if (!team) {
    return (
      <p className="text-subtle text-sm">
        {t("instant_team_only", {
          defaultValue: "La réservation instantanée n'est disponible que sur les event types d'équipe.",
        })}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={isInstantEvent}
            onChange={(e) =>
              form.setValue("isInstantEvent", e.target.checked, { shouldDirty: true })
            }
            className="mt-0.5"
          />
          <span>
            <span className="text-emphasis font-medium">
              {t("enable_instant_booking", { defaultValue: "Activer la réservation instantanée" })}
            </span>
            <span className="text-subtle mt-1 block text-xs">
              {t("enable_instant_booking_description", {
                defaultValue:
                  "Les visiteurs peuvent rejoindre un appel sans choisir de créneau. Un hôte disponible accepte la demande en temps réel.",
              })}
            </span>
          </span>
        </label>
      </section>

      {isInstantEvent ? (
        <>
          <section className="space-y-3">
            <header>
              <h2 className="text-emphasis text-sm font-semibold">
                {t("instant_expiry", { defaultValue: "Délai d'expiration" })}
              </h2>
              <p className="text-subtle text-xs">
                {t("instant_expiry_description", {
                  defaultValue:
                    "Temps maximum avant qu'un hôte n'accepte la demande. Au-delà, la demande expire.",
                })}
              </p>
            </header>

            <div className="flex flex-wrap gap-2">
              {EXPIRY_PRESETS_SECONDS.map((preset) => (
                <button
                  type="button"
                  key={preset.value}
                  onClick={() =>
                    form.setValue("instantMeetingExpiryTimeOffsetInSeconds", preset.value, {
                      shouldDirty: true,
                    })
                  }
                  className={`border-subtle rounded-md border px-3 py-1.5 text-xs ${
                    expirySeconds === preset.value
                      ? "bg-emphasis text-default border-emphasis"
                      : "bg-default text-emphasis hover:bg-muted"
                  }`}>
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="number"
                min={10}
                max={1800}
                value={expirySeconds}
                onChange={(e) =>
                  form.setValue(
                    "instantMeetingExpiryTimeOffsetInSeconds",
                    Math.max(10, Number(e.target.value) || 60),
                    { shouldDirty: true }
                  )
                }
                className="border-subtle bg-default w-28 rounded-md border px-3 py-2 text-sm"
              />
              <span className="text-subtle text-xs">
                {t("seconds", { defaultValue: "secondes" })}
              </span>
            </div>
          </section>

          <section>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={assignAllTeamMembers}
                onChange={(e) =>
                  form.setValue("assignAllTeamMembers", e.target.checked, { shouldDirty: true })
                }
                className="mt-0.5"
              />
              <span>
                <span className="text-emphasis font-medium">
                  {t("assign_all_team_members_instant", {
                    defaultValue: "Notifier tous les membres de l'équipe",
                  })}
                </span>
                <span className="text-subtle mt-1 block text-xs">
                  {t("assign_all_team_members_instant_description", {
                    defaultValue:
                      "Tous les membres recevront la demande. Le premier à accepter prend la réservation.",
                  })}
                </span>
              </span>
            </label>
          </section>
        </>
      ) : null}
    </div>
  );
}
