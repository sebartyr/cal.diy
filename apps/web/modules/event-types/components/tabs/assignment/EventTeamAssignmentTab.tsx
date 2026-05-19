"use client";

import { useMemo } from "react";
import { useFormContext, useFieldArray } from "react-hook-form";

import type { FormValues, Host } from "@calcom/features/eventtypes/lib/types";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { SchedulingType } from "@calcom/prisma/enums";
import type { RouterOutputs } from "@calcom/trpc/react";
import { Avatar } from "@calcom/ui/components/avatar";

type TeamMember = RouterOutputs["viewer"]["eventTypes"]["get"]["teamMembers"][number];

type Props = {
  team: { id: number; name: string } | null;
  teamMembers: TeamMember[];
  orgId?: number | null;
  eventType: { id: number };
};

const SCHEDULING_OPTIONS: { value: SchedulingType; label: string; description: string }[] = [
  {
    value: SchedulingType.ROUND_ROBIN,
    label: "Round-robin",
    description: "Un seul hôte par réservation, choisi par rotation pondérée.",
  },
  {
    value: SchedulingType.COLLECTIVE,
    label: "Collective",
    description: "Tous les hôtes participent à chaque réservation.",
  },
  {
    value: SchedulingType.MANAGED,
    label: "Managed",
    description: "Event type géré par l'équipe — chaque membre obtient sa propre instance.",
  },
];

export default function EventTeamAssignmentTab({ team, teamMembers }: Props) {
  const { t } = useLocale();
  const form = useFormContext<FormValues>();

  const schedulingType = form.watch("schedulingType") ?? SchedulingType.COLLECTIVE;
  const assignAllTeamMembers = form.watch("assignAllTeamMembers") ?? false;
  const isRRWeightsEnabled = form.watch("isRRWeightsEnabled") ?? false;

  const { fields, append, remove, update } = useFieldArray<FormValues, "hosts">({
    control: form.control,
    name: "hosts",
  });

  const memberByUserId = useMemo(() => {
    const m = new Map<number, TeamMember>();
    for (const member of teamMembers) {
      m.set(member.id, member);
    }
    return m;
  }, [teamMembers]);

  const selectedUserIds = useMemo(() => new Set(fields.map((f) => f.userId)), [fields]);
  const availableMembers = useMemo(
    () => teamMembers.filter((m) => !selectedUserIds.has(m.id)),
    [teamMembers, selectedUserIds]
  );

  if (!team) {
    return (
      <p className="text-subtle text-sm">
        {t("not_a_team_event", {
          defaultValue: "Cet event type n'est pas rattaché à une équipe.",
        })}
      </p>
    );
  }

  const isRoundRobin = schedulingType === SchedulingType.ROUND_ROBIN;
  const showWeights = isRoundRobin && isRRWeightsEnabled;

  return (
    <div className="space-y-8">
      {/* Scheduling type */}
      <section className="space-y-3">
        <header>
          <h2 className="text-emphasis text-base font-semibold">
            {t("scheduling_type", { defaultValue: "Type d'assignation" })}
          </h2>
          <p className="text-subtle text-sm">
            {t("scheduling_type_description", {
              defaultValue: "Comment les hôtes sont sélectionnés pour ce type d'event.",
            })}
          </p>
        </header>
        <div className="grid gap-2 md:grid-cols-3">
          {SCHEDULING_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`border-subtle hover:bg-muted block cursor-pointer rounded-md border p-3 ${
                schedulingType === opt.value ? "border-emphasis bg-muted" : ""
              }`}>
              <input
                type="radio"
                value={opt.value}
                checked={schedulingType === opt.value}
                onChange={() =>
                  form.setValue("schedulingType", opt.value, { shouldDirty: true })
                }
                className="sr-only"
              />
              <span className="text-emphasis font-medium">{opt.label}</span>
              <span className="text-subtle mt-1 block text-xs">{opt.description}</span>
            </label>
          ))}
        </div>
      </section>

      {/* Assign all toggle */}
      <section className="space-y-2">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={assignAllTeamMembers}
            onChange={(e) =>
              form.setValue("assignAllTeamMembers", e.target.checked, { shouldDirty: true })
            }
          />
          <span className="text-sm">
            <span className="text-emphasis font-medium">
              {t("assign_all_team_members", { defaultValue: "Assigner tous les membres de l'équipe" })}
            </span>
            <span className="text-subtle block text-xs">
              {t("assign_all_team_members_description", {
                defaultValue: "Les nouveaux membres seront automatiquement ajoutés à cet event type.",
              })}
            </span>
          </span>
        </label>

        {isRoundRobin ? (
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={isRRWeightsEnabled}
              onChange={(e) =>
                form.setValue("isRRWeightsEnabled", e.target.checked, { shouldDirty: true })
              }
            />
            <span className="text-sm">
              <span className="text-emphasis font-medium">
                {t("weighted_round_robin", { defaultValue: "Activer les poids (round-robin pondéré)" })}
              </span>
              <span className="text-subtle block text-xs">
                {t("weighted_round_robin_description", {
                  defaultValue: "Distribuer les réservations proportionnellement aux poids des hôtes.",
                })}
              </span>
            </span>
          </label>
        ) : null}
      </section>

      {/* Hosts list */}
      <section className="space-y-3">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-emphasis text-base font-semibold">
              {t("hosts", { defaultValue: "Hôtes" })} ({fields.length})
            </h2>
            <p className="text-subtle text-sm">
              {isRoundRobin
                ? t("hosts_description_rr", {
                    defaultValue: "Hôtes éligibles. Un seul d'entre eux sera choisi par réservation.",
                  })
                : t("hosts_description_collective", {
                    defaultValue: "Tous ces hôtes seront ajoutés à chaque réservation.",
                  })}
            </p>
          </div>
        </header>

        {assignAllTeamMembers ? (
          <div className="border-subtle text-subtle rounded-md border p-3 text-sm">
            {t("auto_assign_active", {
              defaultValue:
                "L'assignation automatique de tous les membres est active — la liste manuelle est ignorée.",
            })}
          </div>
        ) : (
          <>
            <ul className="bg-default border-subtle divide-subtle overflow-hidden rounded-md border divide-y">
              {fields.length === 0 ? (
                <li className="text-subtle px-4 py-6 text-center text-sm">
                  {t("no_hosts_yet", { defaultValue: "Aucun hôte. Ajoutez-en un ci-dessous." })}
                </li>
              ) : null}
              {fields.map((field, index) => {
                const member = memberByUserId.get(field.userId);
                return (
                  <li key={field.id} className="flex items-center gap-3 px-4 py-3">
                    <Avatar
                      size="sm"
                      alt={member?.name ?? `User ${field.userId}`}
                      imageSrc={member?.avatar ?? null}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-emphasis truncate text-sm font-medium">
                        {member?.name ?? member?.username ?? `User ${field.userId}`}
                      </p>
                      <p className="text-subtle truncate text-xs">{member?.email ?? ""}</p>
                    </div>

                    {isRoundRobin ? (
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={field.isFixed}
                          onChange={(e) =>
                            update(index, { ...field, isFixed: e.target.checked })
                          }
                        />
                        {t("fixed", { defaultValue: "Fixe" })}
                      </label>
                    ) : null}

                    {showWeights && !field.isFixed ? (
                      <label className="flex items-center gap-1 text-xs">
                        {t("weight", { defaultValue: "Poids" })}
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={field.weight}
                          onChange={(e) =>
                            update(index, { ...field, weight: Math.max(1, Number(e.target.value) || 1) })
                          }
                          className="border-subtle bg-default w-16 rounded-md border px-2 py-1 text-xs"
                        />
                      </label>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="text-error text-xs underline-offset-2 hover:underline">
                      {t("remove", { defaultValue: "Retirer" })}
                    </button>
                  </li>
                );
              })}
            </ul>

            {availableMembers.length > 0 ? (
              <div className="border-subtle rounded-md border p-3">
                <p className="text-emphasis mb-2 text-sm font-medium">
                  {t("add_a_host", { defaultValue: "Ajouter un hôte" })}
                </p>
                <select
                  className="border-subtle bg-default w-full rounded-md border px-3 py-2 text-sm"
                  defaultValue=""
                  onChange={(e) => {
                    const userId = Number(e.target.value);
                    if (!userId) return;
                    const host: Host = {
                      userId,
                      isFixed: !isRoundRobin,
                      priority: 2,
                      weight: 100,
                      scheduleId: null,
                      groupId: null,
                    };
                    append(host);
                    e.target.value = "";
                  }}>
                  <option value="" disabled>
                    {t("select_member", { defaultValue: "Choisir un membre…" })}
                  </option>
                  {availableMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name ?? m.username ?? m.email} ({m.email})
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
