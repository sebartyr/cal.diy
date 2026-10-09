import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  createRouterCaller: vi.fn(),
  getTRPCContext: vi.fn(),
  unstableCache: vi.fn(),
  checkOnboardingRedirect: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("@calcom/features/auth/lib/getServerSession", () => ({ getServerSession: mocks.getServerSession }));
vi.mock("@calcom/features/auth/lib/onboardingUtils", () => ({
  checkOnboardingRedirect: mocks.checkOnboardingRedirect,
}));
vi.mock("@calcom/features/filters/lib/getTeamsFiltersFromQuery", () => ({
  getTeamsFiltersFromQuery: () => ({ teamIds: [3] }),
}));
vi.mock("@calcom/trpc/server/routers/viewer/eventTypes/_router", () => ({
  eventTypesRouter: "eventTypesRouter",
}));
vi.mock("@calcom/trpc/server/routers/viewer/availability/_router", () => ({
  availabilityRouter: "availabilityRouter",
}));
vi.mock("@calcom/web/modules/event-types/components/EventTypeWebWrapper", () => ({
  EventTypeWebWrapper: () => null,
}));
vi.mock("~/availability/availability-view", () => ({
  AvailabilityCTA: () => null,
  AvailabilityList: () => null,
}));
vi.mock("../(main-nav)/ShellMainAppDir", () => ({ ShellMainAppDir: () => null }));
vi.mock("../(main-nav)/event-types/EventTypesWrapper", () => ({ EventTypesWrapper: () => null }));
vi.mock("@lib/buildLegacyCtx", () => ({ buildLegacyRequest: () => ({}) }));
vi.mock("app/_trpc/context", () => ({
  createRouterCaller: mocks.createRouterCaller,
  getTRPCContext: mocks.getTRPCContext,
}));
vi.mock("app/_utils", () => ({
  _generateMetadata: vi.fn(),
  getTranslate: async () => (key: string) => key,
}));
vi.mock("next/cache", () => ({ unstable_cache: mocks.unstableCache }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({}) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import AvailabilityPage from "../(main-nav)/availability/page";
import EventTypesPage from "../(main-nav)/event-types/page";
import EventTypeEditPage from "../event-types/[type]/page";

type ElementWithProps = { props: Record<string, unknown> };

const session = { user: { id: 7, profile: { organizationId: null } } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getServerSession.mockResolvedValue(session);
  mocks.checkOnboardingRedirect.mockResolvedValue(null);
  mocks.getTRPCContext.mockResolvedValue({ ctx: true });
});

describe("App Router pages calling tRPC procedures per request", () => {
  it("event type edit page fetches the event type for every request without unstable_cache", async () => {
    const eventTypeData = { eventType: { id: 12, createdAt: new Date("2026-01-01T00:00:00Z") } };
    const get = vi.fn().mockResolvedValue(eventTypeData);
    mocks.createRouterCaller.mockResolvedValue({ get });

    const props = { params: Promise.resolve({ type: "12" }), searchParams: Promise.resolve({}) };
    const first = (await EventTypeEditPage(props)) as unknown as ElementWithProps;
    await EventTypeEditPage({ ...props, params: Promise.resolve({ type: "12" }) });

    expect(get).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenCalledWith({ id: 12 });
    expect(mocks.createRouterCaller).toHaveBeenCalledWith("eventTypesRouter", { ctx: true });
    expect(first.props.data).toBe(eventTypeData);
    expect(first.props.id).toBe(12);
    expect(mocks.unstableCache).not.toHaveBeenCalled();
  });

  it("event type edit page still throws when the event type is missing", async () => {
    mocks.createRouterCaller.mockResolvedValue({ get: vi.fn().mockResolvedValue({ eventType: null }) });

    await expect(
      EventTypeEditPage({ params: Promise.resolve({ type: "12" }), searchParams: Promise.resolve({}) })
    ).rejects.toThrow("This event type does not exist");
  });

  it("event types list page fetches the groups with the query filters on every request", async () => {
    const groups = { eventTypeGroups: [], profiles: [] };
    const getUserEventGroups = vi.fn().mockResolvedValue(groups);
    mocks.createRouterCaller.mockResolvedValue({ getUserEventGroups });

    const props = { params: Promise.resolve({}), searchParams: Promise.resolve({ teamIds: "3" }) };
    const element = (await EventTypesPage(props)) as unknown as ElementWithProps;
    await EventTypesPage({ ...props, searchParams: Promise.resolve({ teamIds: "3" }) });

    expect(getUserEventGroups).toHaveBeenCalledTimes(2);
    expect(getUserEventGroups).toHaveBeenCalledWith({ filters: { teamIds: [3] } });
    expect(element.props.userEventGroupsData).toBe(groups);
    expect(mocks.unstableCache).not.toHaveBeenCalled();
  });

  it("availability page passes the schedules with Date values through on every request", async () => {
    const startTime = new Date("1970-01-01T09:00:00Z");
    const schedules = {
      schedules: [
        {
          id: 1,
          name: "Working hours",
          isDefault: true,
          timeZone: "UTC",
          availability: [
            {
              id: 1,
              userId: 7,
              startTime,
              endTime: new Date("1970-01-01T17:00:00Z"),
              eventTypeId: null,
              date: null,
              days: [1],
              scheduleId: 1,
            },
          ],
        },
      ],
    };
    const list = vi.fn().mockResolvedValue(schedules);
    mocks.createRouterCaller.mockResolvedValue({ list });

    const props = { params: Promise.resolve({}), searchParams: Promise.resolve({}) };
    const element = (await AvailabilityPage(props)) as unknown as ElementWithProps;
    await AvailabilityPage({ ...props, searchParams: Promise.resolve({}) });

    expect(list).toHaveBeenCalledTimes(2);
    expect(mocks.createRouterCaller).toHaveBeenCalledWith("availabilityRouter", { ctx: true });
    const listElement = element.props.children as ElementWithProps;
    const availabilities = listElement.props.availabilities as typeof schedules;
    expect(availabilities.schedules[0].availability[0].startTime).toBeInstanceOf(Date);
    expect(availabilities.schedules[0].availability[0].startTime.getTime()).toBe(startTime.getTime());
    expect(mocks.unstableCache).not.toHaveBeenCalled();
  });

  it("redirects to login before calling tRPC when there is no session", async () => {
    mocks.getServerSession.mockResolvedValue(null);

    await expect(
      AvailabilityPage({ params: Promise.resolve({}), searchParams: Promise.resolve({}) })
    ).rejects.toThrow("REDIRECT:/auth/login");
    expect(mocks.createRouterCaller).not.toHaveBeenCalled();
  });
});
