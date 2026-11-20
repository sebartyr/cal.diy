import type { RescheduleHistoryEntry } from "@calcom/features/bookings/lib/rescheduleHistory";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import classNames from "@calcom/ui/classNames";
import Link from "next/link";
import { useMemo } from "react";

type RescheduleSlot = RescheduleHistoryEntry["from"];

export function RescheduleHistoryTimeline({
  entries,
  isLoading,
  currentBookingUid,
  timeZone,
  timeFormat,
}: {
  entries: RescheduleHistoryEntry[] | undefined;
  isLoading: boolean;
  currentBookingUid: string;
  timeZone?: string;
  timeFormat?: number;
}) {
  const {
    t,
    i18n: { language },
  } = useLocale();

  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(language, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone,
        hour12: timeFormat === 12,
      }),
    [language, timeZone, timeFormat]
  );

  if (isLoading) {
    return <p className="text-sm text-subtle">{t("loading")}</p>;
  }

  if (!entries?.length) {
    return <p className="text-sm text-subtle">{t("reschedule_history_empty")}</p>;
  }

  return (
    <ol className="flex flex-col gap-5 border-subtle border-l pl-4" data-testid="reschedule-history">
      {entries.map((entry) => (
        <li key={`${entry.type}-${entry.from.uid}`} className="relative flex flex-col gap-2">
          <span className="absolute top-1.5 -left-[21px] h-2 w-2 rounded-full bg-emphasis" />
          <div className="flex flex-col">
            <span className="font-medium text-emphasis text-sm">
              {entry.type === "rescheduled"
                ? t("reschedule_history_rescheduled")
                : t("reschedule_history_requested")}
            </span>
            {entry.timestamp && (
              <span className="text-subtle text-xs">{formatter.format(entry.timestamp)}</span>
            )}
          </div>

          <SlotLine
            label={t("reschedule_history_from")}
            slot={entry.from}
            isCurrent={entry.from.uid === currentBookingUid}
            formatter={formatter}
            struck={entry.type === "rescheduled"}
          />
          {entry.to && (
            <SlotLine
              label={t("reschedule_history_to")}
              slot={entry.to}
              isCurrent={entry.to.uid === currentBookingUid}
              formatter={formatter}
            />
          )}

          <Field label={t("by")}>{entry.actor ?? t("reschedule_history_unknown_actor")}</Field>
          <Field label={t("reason")}>
            {entry.reason ? (
              <span className="whitespace-pre-wrap">{entry.reason}</span>
            ) : (
              <span className="text-subtle">{t("reschedule_history_no_reason")}</span>
            )}
          </Field>
        </li>
      ))}
    </ol>
  );
}

function SlotLine({
  label,
  slot,
  isCurrent,
  formatter,
  struck = false,
}: {
  label: string;
  slot: RescheduleSlot;
  isCurrent: boolean;
  formatter: Intl.DateTimeFormat;
  struck?: boolean;
}) {
  const { t } = useLocale();
  const text = formatter.formatRange(slot.startTime, slot.endTime);

  return (
    <Field label={label}>
      <span className={classNames(struck && "line-through opacity-70")}>{text}</span>{" "}
      {isCurrent ? (
        <span className="text-subtle text-xs">({t("reschedule_history_current")})</span>
      ) : (
        <Link href={`/booking/${slot.uid}`} className="text-default text-xs underline">
          {t("view_booking")}
        </Link>
      )}
    </Field>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium text-subtle text-xs">{label}</span>
      <span className="text-emphasis text-sm">{children}</span>
    </div>
  );
}
