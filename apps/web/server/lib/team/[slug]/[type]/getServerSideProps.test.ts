import type { GetServerSidePropsContext } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTeamTypeServerSideProps } from "./getServerSideProps";

const { mockGetPublicEvent, mockGetServerSession, mockTeamFindFirst } = vi.hoisted(() => ({
  mockGetPublicEvent: vi.fn(),
  mockGetServerSession: vi.fn(),
  mockTeamFindFirst: vi.fn(),
}));

vi.mock("@calcom/features/eventtypes/repositories/EventRepository", () => ({
  EventRepository: { getPublicEvent: mockGetPublicEvent },
}));

vi.mock("@calcom/features/auth/lib/getServerSession", () => ({
  getServerSession: mockGetServerSession,
}));

vi.mock("@calcom/features/bookings/lib/get-booking", () => ({
  getBookingForReschedule: vi.fn(),
  getBookingForSeatedEvent: vi.fn(),
}));

vi.mock("@calcom/prisma", () => ({
  prisma: { team: { findFirst: mockTeamFindFirst } },
}));

const contextFor = (query: Record<string, string>) => ({ query }) as unknown as GetServerSidePropsContext;

describe("getTeamTypeServerSideProps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue(null);
  });

  it("starts the event, session and team lookups together", async () => {
    let resolveEvent: (value: unknown) => void = () => {};
    mockGetPublicEvent.mockReturnValue(
      new Promise((resolve) => {
        resolveEvent = resolve;
      })
    );
    mockTeamFindFirst.mockResolvedValue({ id: 3, hideBranding: true });

    const pending = getTeamTypeServerSideProps(contextFor({ slug: "team", type: "intro" }));
    await Promise.resolve();

    expect(mockGetServerSession).toHaveBeenCalledTimes(1);
    expect(mockTeamFindFirst).toHaveBeenCalledWith({
      where: { slug: "team", isOrganization: false },
      select: { id: true, hideBranding: true },
    });

    resolveEvent({ hidden: false });
    const result = await pending;
    expect(result).toEqual({
      props: expect.objectContaining({ teamId: 3, isBrandingHidden: true, isSEOIndexable: true }),
    });
  });

  it("falls back to defaults when the team row is missing", async () => {
    mockGetPublicEvent.mockResolvedValue({ hidden: true });
    mockTeamFindFirst.mockResolvedValue(null);

    const result = await getTeamTypeServerSideProps(contextFor({ slug: "team", type: "intro" }));

    expect(result).toEqual({
      props: expect.objectContaining({ teamId: 0, isBrandingHidden: false, isSEOIndexable: false }),
    });
  });

  it("returns notFound when the event does not exist", async () => {
    mockGetPublicEvent.mockResolvedValue(null);
    mockTeamFindFirst.mockResolvedValue({ id: 3, hideBranding: false });

    const result = await getTeamTypeServerSideProps(contextFor({ slug: "team", type: "missing" }));

    expect(result).toEqual({ notFound: true });
  });
});
