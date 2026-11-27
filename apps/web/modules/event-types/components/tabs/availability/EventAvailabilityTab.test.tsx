import type { EventTypeSetup, FormValues } from "@calcom/features/eventtypes/lib/types";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { EventAvailabilityTab, type ScheduleQueryData } from "./EventAvailabilityTab";

vi.mock("@calcom/atoms/hooks/useIsPlatform", () => ({ useIsPlatform: () => false }));
vi.mock("@formkit/auto-animate/react", () => ({ useAutoAnimate: () => [vi.fn()] }));

const hostSchedulesQuery = vi.fn(() => ({
  data: {
    schedules: [{ id: 11, name: "Working Hours", isDefault: true, userId: 7, readOnly: true }],
  },
  isPending: false,
}));

const hostScheduleDetails = {
  id: 11,
  timeZone: "Europe/Paris",
  isTimeZoneSet: true,
  isManaged: false,
  readOnly: true,
  schedule: [
    {
      days: [1],
      startTime: new Date("1970-01-01T09:00:00.000Z"),
      endTime: new Date("1970-01-01T17:00:00.000Z"),
    },
  ],
} as unknown as ScheduleQueryData;

const buildEventType = (timeZone: string | null = null) =>
  ({
    schedule: null,
    restrictionScheduleId: null,
    schedulingType: "ROUND_ROBIN",
    timeZone,
  }) as unknown as EventTypeSetup;

const Wrapper = ({ children }: { children: ReactNode }) => {
  const methods = useForm<FormValues>({
    defaultValues: {
      schedule: null,
      hosts: [{ userId: 7, isFixed: false, priority: 2, weight: 100, scheduleId: null }],
    } as unknown as FormValues,
  });
  return <FormProvider {...methods}>{children}</FormProvider>;
};

const renderTab = (
  useHostScheduleDetails?: (args: { scheduleId: number }) => unknown,
  eventTimeZone: string | null = null
) =>
  render(
    <Wrapper>
      <EventAvailabilityTab
        isTeamEvent
        eventType={buildEventType(eventTimeZone)}
        teamMembers={[{ id: 7, name: "Ada Lovelace", avatar: "" }]}
        hostSchedulesQuery={hostSchedulesQuery as never}
        useHostScheduleDetails={useHostScheduleDetails as never}
        user={{ timeFormat: 24, weekStart: "Monday" }}
      />
    </Wrapper>
  );

describe("EventAvailabilityTab host schedule details", () => {
  it("shows a host's hours read-only once expanded", () => {
    const useHostScheduleDetails = vi.fn(() => ({
      data: hostScheduleDetails,
      isPending: false,
      isError: false,
    }));
    renderTab(useHostScheduleDetails);

    expect(useHostScheduleDetails).not.toHaveBeenCalled();

    const toggle = screen.getByRole("button", { name: "show_host_schedule_hours_for" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(toggle.getAttribute("aria-controls") ?? "")).not.toBeNull();

    expect(useHostScheduleDetails).toHaveBeenCalledWith({ scheduleId: 11 });
    expect(screen.getByText("Europe/Paris")).toBeInTheDocument();
    expect(screen.getByText(/^0?9:00$/)).toBeInTheDocument();
    expect(screen.getByText("17:00")).toBeInTheDocument();
    expect(screen.queryByText("edit_availability")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("hide_host_schedule_hours"));
    expect(screen.queryByText("Europe/Paris")).not.toBeInTheDocument();
  });

  it("labels a schedule without its own time zone with the event type's", () => {
    const useHostScheduleDetails = vi.fn(() => ({
      data: { ...hostScheduleDetails, timeZone: "America/New_York", isTimeZoneSet: false },
      isPending: false,
      isError: false,
    }));
    renderTab(useHostScheduleDetails, "Asia/Tokyo");

    fireEvent.click(screen.getByText("show_host_schedule_hours"));

    expect(screen.getByText("Asia/Tokyo")).toBeInTheDocument();
    expect(screen.queryByText("America/New_York")).not.toBeInTheDocument();
  });

  it("keeps the host's time zone when the event type has none", () => {
    const useHostScheduleDetails = vi.fn(() => ({
      data: { ...hostScheduleDetails, timeZone: "America/New_York", isTimeZoneSet: false },
      isPending: false,
      isError: false,
    }));
    renderTab(useHostScheduleDetails);

    fireEvent.click(screen.getByText("show_host_schedule_hours"));

    expect(screen.getByText("America/New_York")).toBeInTheDocument();
  });

  it("shows an error instead of an empty week when the hours fail to load", () => {
    const useHostScheduleDetails = vi.fn(() => ({ data: undefined, isPending: false, isError: true }));
    renderTab(useHostScheduleDetails);

    fireEvent.click(screen.getByText("show_host_schedule_hours"));

    expect(screen.getByRole("alert")).toHaveTextContent("host_schedule_hours_load_error");
    expect(screen.queryByText("unavailable")).not.toBeInTheDocument();
  });

  it("hides the toggle when no details hook is provided", () => {
    renderTab(undefined);

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.queryByText("show_host_schedule_hours")).not.toBeInTheDocument();
  });
});
