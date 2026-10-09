import { TooltipProvider } from "@radix-ui/react-tooltip";
import { act, cleanup, render, screen } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { type ReactNode, useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDefaultBookingsListUrl } from "../lib/defaultBookingsListUrl";

const ME = 7;
const bookingsGetInputs: Array<{ filters: Record<string, unknown> }> = [];
const me = { data: undefined as { id: number; timeZone: string } | undefined };

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/bookings/upcoming",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ status: "upcoming" }),
}));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: ME } } }) }));
vi.mock("@calcom/trpc/react/hooks/useMeQuery", () => ({ default: () => me }));
vi.mock("@calcom/trpc/react", () => {
  const query = { data: undefined, isPending: true, error: null };
  const procedure = (path: string[]): unknown =>
    new Proxy(() => {}, {
      get: (_target, key: string) => {
        if (key === "useQuery") {
          return (input: { filters: Record<string, unknown> }) => {
            if (path.join(".") === "viewer.bookings.get") bookingsGetInputs.push(input);
            return query;
          };
        }
        if (key === "useInfiniteQuery") return () => ({ ...query, fetchNextPage: vi.fn() });
        if (key === "useMutation") return () => ({ mutate: vi.fn(), isPending: false });
        if (key === "useUtils" || key === "useContext") return () => procedure(["utils"]);
        return procedure([...path, key]);
      },
    });
  return { trpc: procedure([]) };
});
vi.mock("~/bookings/hooks/useFacetedUniqueValues", () => ({
  useFacetedUniqueValues: () => () => new Map(),
  useAdminUserFilterOptions: vi.fn(),
  useAdminTeamFilterOptions: vi.fn(),
}));
vi.mock("../components/BookingList", () => ({ BookingList: () => null }));
vi.mock("../components/BookingDetailsSheet", () => ({ BookingDetailsSheet: () => null }));
vi.mock("../components/ViewToggleButton", () => ({ ViewToggleButton: () => null }));
vi.mock("@calcom/web/components/apps/wipemycalother/wipeMyCalActionButton", () => ({
  WipeMyCalActionButton: () => null,
}));

import Bookings from "./bookings-view";

// With hasMemory, NuqsTestingAdapter puts its initial URL back from its own mount effect, which runs
// after the page's: URL updates queued while mounting are lost. That is what the Next.js app router does
// in production when it replaces the history entry with its canonical URL.
function MountAfterAdapter({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <>{children}</> : null;
}

function BookingsPage({
  isSystemAdmin,
  searchParams = "",
  urlResetAfterMount,
}: {
  isSystemAdmin: boolean;
  searchParams?: string;
  urlResetAfterMount: boolean;
}) {
  const page = (
    <Bookings
      status="upcoming"
      userId={ME}
      permissions={{ canReadOthersBookings: false }}
      isSystemAdmin={isSystemAdmin}
      bookingsV3Enabled={false}
      bookingAuditEnabled={false}
    />
  );
  return (
    <NuqsTestingAdapter searchParams={searchParams} hasMemory>
      <TooltipProvider>
        {urlResetAfterMount ? page : <MountAfterAdapter>{page}</MountAfterAdapter>}
      </TooltipProvider>
    </NuqsTestingAdapter>
  );
}

const lastFilters = () => bookingsGetInputs[bookingsGetInputs.length - 1].filters;
const serverDefaultSearch = () =>
  new URL(
    getDefaultBookingsListUrl({ pathname: "/bookings/upcoming", userId: ME, searchParams: {} }) ?? "",
    "https://cal.example"
  ).search;

describe("bookings page default segment", () => {
  beforeEach(() => {
    bookingsGetInputs.length = 0;
    me.data = { id: ME, timeZone: "UTC" };
  });
  afterEach(() => {
    cleanup();
  });

  for (const isSystemAdmin of [false, true]) {
    describe(`system admin: ${isSystemAdmin}`, () => {
      // Documents why the page redirects blank URLs on the server: the client-only default does not
      // survive the URL being put back. Drop this case if the client default is ever made reliable.
      it("client-only default: loses the My bookings filters when the URL is put back after mount", () => {
        render(<BookingsPage isSystemAdmin={isSystemAdmin} urlResetAfterMount />);

        expect(screen.getByTestId("filter-segment-select").textContent).toContain("my_bookings");
        expect(lastFilters().userIds).toBeUndefined();
      });

      it("keeps the My bookings filters when the URL is put back after mount, from the server default URL", () => {
        render(
          <BookingsPage
            isSystemAdmin={isSystemAdmin}
            searchParams={serverDefaultSearch()}
            urlResetAfterMount
          />
        );

        expect(screen.getByTestId("filter-segment-select").textContent).toContain("my_bookings");
        expect(lastFilters().userIds).toEqual([ME]);
        expect(lastFilters()).not.toHaveProperty("scope");
      });

      it("still applies My bookings on the client once the validator is ready, with a blank URL", () => {
        me.data = undefined;
        const { rerender } = render(
          <BookingsPage isSystemAdmin={isSystemAdmin} urlResetAfterMount={false} />
        );

        me.data = { id: ME, timeZone: "UTC" };
        act(() => {
          rerender(<BookingsPage isSystemAdmin={isSystemAdmin} urlResetAfterMount={false} />);
        });

        expect(lastFilters().userIds).toEqual([ME]);
      });
    });
  }
});
