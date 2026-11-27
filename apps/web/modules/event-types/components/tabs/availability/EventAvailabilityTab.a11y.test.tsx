import type { EventTypeSetup, FormValues } from "@calcom/features/eventtypes/lib/types";
import { render, screen } from "@testing-library/react";
import i18next from "i18next";
import type { ReactNode } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { EventAvailabilityTab } from "./EventAvailabilityTab";

// A real i18next instance with its default escaping, unlike the global useLocale mock that returns keys.
const i18n = i18next.createInstance();

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({ t: i18n.t.bind(i18n), i18n, isLocaleReady: true }),
}));
vi.mock("@calcom/atoms/hooks/useIsPlatform", () => ({ useIsPlatform: () => false }));
vi.mock("@formkit/auto-animate/react", () => ({ useAutoAnimate: () => [vi.fn()] }));

const Wrapper = ({ children }: { children: ReactNode }) => {
  const methods = useForm<FormValues>({
    defaultValues: {
      schedule: null,
      hosts: [{ userId: 7, isFixed: false, priority: 2, weight: 100, scheduleId: null }],
    } as unknown as FormValues,
  });
  return <FormProvider {...methods}>{children}</FormProvider>;
};

describe("EventAvailabilityTab host hours toggle accessible name", () => {
  beforeAll(async () => {
    await i18n.init({
      lng: "en",
      resources: {
        en: {
          translation: {
            show_host_schedule_hours: "Show hours",
            show_host_schedule_hours_for: "Show hours of {{name}}",
          },
        },
      },
    });
  });

  it("keeps apostrophes and ampersands of the host name unescaped", () => {
    render(
      <Wrapper>
        <EventAvailabilityTab
          isTeamEvent
          eventType={
            {
              schedule: null,
              restrictionScheduleId: null,
              schedulingType: "ROUND_ROBIN",
              timeZone: null,
            } as unknown as EventTypeSetup
          }
          teamMembers={[{ id: 7, name: "Léa O'Connor & Co", avatar: "" }]}
          hostSchedulesQuery={
            (() => ({
              data: {
                schedules: [{ id: 11, name: "Working Hours", isDefault: true, userId: 7, readOnly: true }],
              },
              isPending: false,
            })) as never
          }
          useHostScheduleDetails={(() => ({ data: undefined, isPending: true, isError: false })) as never}
          user={{ timeFormat: 24, weekStart: "Monday" }}
        />
      </Wrapper>
    );

    const toggle = screen.getByRole("button", { name: "Show hours of Léa O'Connor & Co" });
    expect(toggle.getAttribute("aria-label")).not.toContain("&#39;");
    expect(toggle.getAttribute("aria-label")).not.toContain("&amp;");
  });
});
