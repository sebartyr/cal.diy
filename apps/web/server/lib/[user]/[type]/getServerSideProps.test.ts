import type { GetServerSidePropsContext } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getServerSideProps } from "./getServerSideProps";

const { mockGetPublicEvent, mockGetServerSession, mockHandleOrgRedirect, mockGetUsersInOrgContext } =
  vi.hoisted(() => ({
    mockGetPublicEvent: vi.fn(),
    mockGetServerSession: vi.fn(),
    mockHandleOrgRedirect: vi.fn(),
    mockGetUsersInOrgContext: vi.fn(),
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

vi.mock("@calcom/features/profile/lib/hideBranding", () => ({
  shouldHideBrandingForUserEvent: vi.fn(() => true),
}));

vi.mock("@lib/handleOrgRedirect", () => ({
  handleOrgRedirect: mockHandleOrgRedirect,
}));

vi.mock("@server/lib/[user]/getServerSideProps", () => ({
  getUsersInOrgContext: mockGetUsersInOrgContext,
}));

vi.mock("@calcom/prisma", () => ({
  prisma: {},
}));

const contextFor = (user: string, type = "intro") =>
  ({ params: { user, type }, query: {}, req: {} }) as unknown as GetServerSidePropsContext;

const deferred = <T>() => {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

describe("[user]/[type] getServerSideProps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ user: { id: 42 } });
    mockHandleOrgRedirect.mockResolvedValue(null);
  });

  describe("dynamic group", () => {
    it("lets getPublicEvent decide the 404 instead of loading the members first", async () => {
      mockGetPublicEvent.mockResolvedValue(null);

      const result = await getServerSideProps(contextFor("alice+bob"));

      expect(result).toEqual({ notFound: true });
      expect(mockGetUsersInOrgContext).not.toHaveBeenCalled();
      expect(mockGetPublicEvent).toHaveBeenCalledWith(
        { username: "alice+bob", eventSlug: "intro", org: null, fromRedirectOfNonOrgLink: false },
        42
      );
    });

    it("starts the session and org redirect lookups together", async () => {
      const redirect = deferred<null>();
      mockHandleOrgRedirect.mockReturnValue(redirect.promise);
      mockGetPublicEvent.mockResolvedValue({ id: 1, metadata: {} });

      const pending = getServerSideProps(contextFor("alice+bob"));
      await Promise.resolve();
      expect(mockGetServerSession).toHaveBeenCalledTimes(1);

      redirect.resolve(null);
      const result = await pending;
      expect(result).toEqual({
        props: expect.objectContaining({
          user: "alice+bob",
          eventData: expect.objectContaining({
            metadata: { multipleDuration: [15, 30, 45, 60, 90] },
          }),
        }),
      });
    });

    it("returns the org redirect without loading the event", async () => {
      const redirect = { redirect: { permanent: false, destination: "/elsewhere" } };
      mockHandleOrgRedirect.mockResolvedValue(redirect);

      await expect(getServerSideProps(contextFor("alice+bob"))).resolves.toBe(redirect);
      expect(mockGetPublicEvent).not.toHaveBeenCalled();
    });
  });

  describe("single user", () => {
    it("loads the user and the event together", async () => {
      const users = deferred<unknown[]>();
      mockGetUsersInOrgContext.mockReturnValue(users.promise);
      mockGetPublicEvent.mockResolvedValue({ id: 7, owner: null });

      const pending = getServerSideProps(contextFor("alice"));
      await vi.waitFor(() => expect(mockGetUsersInOrgContext).toHaveBeenCalledWith(["alice"], null));
      expect(mockGetPublicEvent).toHaveBeenCalledTimes(1);

      users.resolve([{ id: 1, allowSEOIndexing: true }]);
      const result = await pending;
      expect(result).toEqual({
        props: expect.objectContaining({
          user: "alice",
          isBrandingHidden: true,
          isSEOIndexable: true,
          eventData: { id: 7, owner: null },
        }),
      });
    });

    it("returns notFound when the user does not exist, even if the event lookup fails", async () => {
      mockGetUsersInOrgContext.mockResolvedValue([]);
      mockGetPublicEvent.mockRejectedValue(new Error("EventType 7 has no owner or users."));

      await expect(getServerSideProps(contextFor("ghost"))).resolves.toEqual({ notFound: true });
    });

    it("returns notFound when the event does not exist", async () => {
      mockGetUsersInOrgContext.mockResolvedValue([{ id: 1, allowSEOIndexing: true }]);
      mockGetPublicEvent.mockResolvedValue(null);

      await expect(getServerSideProps(contextFor("alice"))).resolves.toEqual({ notFound: true });
    });

    it("rethrows the user lookup error first", async () => {
      const userError = new Error("user lookup failed");
      mockGetUsersInOrgContext.mockRejectedValue(userError);
      mockGetPublicEvent.mockRejectedValue(new Error("event lookup failed"));

      await expect(getServerSideProps(contextFor("alice"))).rejects.toBe(userError);
    });

    it("rethrows the event lookup error when the user exists", async () => {
      const eventError = new Error("event lookup failed");
      mockGetUsersInOrgContext.mockResolvedValue([{ id: 1, allowSEOIndexing: true }]);
      mockGetPublicEvent.mockRejectedValue(eventError);

      await expect(getServerSideProps(contextFor("alice"))).rejects.toBe(eventError);
    });

    it("returns the org redirect without loading the user or the event", async () => {
      const redirect = { redirect: { permanent: false, destination: "/elsewhere" } };
      mockHandleOrgRedirect.mockResolvedValue(redirect);

      await expect(getServerSideProps(contextFor("alice"))).resolves.toBe(redirect);
      expect(mockGetUsersInOrgContext).not.toHaveBeenCalled();
      expect(mockGetPublicEvent).not.toHaveBeenCalled();
    });
  });
});
