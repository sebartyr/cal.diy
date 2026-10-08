import * as shouldChargeModule from "@calcom/features/bookings/lib/payment/shouldChargeNoShowCancellationFee";
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BookingActionsDropdown } from "../actions/BookingActionsDropdown";
import { BookingActionsStoreProvider } from "../actions/BookingActionsStoreProvider";
import CancelBooking from "../CancelBooking";
import { buildBookingLoggedInUser, isActingAsBookingHost } from "../loggedInUser";
import type { BookingItemProps } from "../types";

const { cancelDialogProps } = vi.hoisted(() => ({
  cancelDialogProps: [] as { isHost: boolean }[],
}));

vi.mock("@calcom/embed-core/embed-iframe", () => ({ sdkActionManager: null }));

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

vi.mock("@calcom/lib/hooks/useRefreshData", () => ({ useRefreshData: () => vi.fn() }));

vi.mock("next/router", () => ({ useRouter: () => ({ push: vi.fn(), query: {} }) }));

vi.mock("@calcom/features/bookings/lib/payment/shouldChargeNoShowCancellationFee", () => ({
  shouldChargeNoShowCancellationFee: vi.fn(),
}));

vi.mock("@calcom/trpc/react", () => {
  const mutation = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isLoading: false });
  // Any trpc path resolves to an object exposing the hooks the dropdown and dialogs use.
  const proxy: unknown = new Proxy(() => undefined, {
    get: (_target, key) => {
      if (key === "useMutation") return mutation;
      if (key === "useUtils") return () => proxy;
      if (key === "useQuery") return () => ({ data: undefined, isPending: false });
      if (key === "invalidate") return vi.fn();
      return proxy;
    },
  });
  return { trpc: proxy };
});

vi.mock("../hooks/useBookingConfirmation", () => ({
  useBookingConfirmation: () => ({
    bookingConfirm: vi.fn(),
    handleReject: vi.fn(),
    rejectionDialogIsOpen: false,
    setRejectionDialogIsOpen: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("@components/dialog/CancelBookingDialog", () => ({
  CancelBookingDialog: (props: { isHost: boolean }) => {
    cancelDialogProps.push(props);
    return null;
  },
}));

vi.mock("@components/dialog/AddGuestsDialog", () => ({ AddGuestsDialog: () => null }));
vi.mock("@components/dialog/ChargeCardDialog", () => ({ ChargeCardDialog: () => null }));
vi.mock("@components/dialog/EditLocationDialog", () => ({ EditLocationDialog: () => null }));
vi.mock("@components/dialog/ReassignDialog", () => ({ ReassignDialog: () => null }));
vi.mock("@components/dialog/RejectionReasonDialog", () => ({ RejectionReasonDialog: () => null }));
vi.mock("@components/dialog/ReportBookingDialog", () => ({ ReportBookingDialog: () => null }));
vi.mock("@components/dialog/RescheduleDialog", () => ({ RescheduleDialog: () => null }));
vi.mock("@components/dialog/WrongAssignmentDialog", () => ({ WrongAssignmentDialog: () => null }));

const originalScrollIntoView = Element.prototype.scrollIntoView;

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterAll(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView;
});

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  cancelDialogProps.length = 0;
});

const ADMIN_ID = 1;
const ORGANIZER_ID = 2;

const viewer = (isSystemAdmin: boolean) =>
  buildBookingLoggedInUser({
    userId: ADMIN_ID,
    userTimeZone: "UTC",
    userTimeFormat: 24,
    userEmail: "admin@example.com",
    isSystemAdmin,
  });

function someoneElsesBooking(loggedInUser: BookingItemProps["loggedInUser"]): BookingItemProps {
  const inOneDay = Date.now() + 24 * 60 * 60 * 1000;
  return {
    id: 10,
    uid: "booking-uid",
    title: "Meeting",
    status: "ACCEPTED",
    startTime: new Date(inOneDay).toISOString(),
    endTime: new Date(inOneDay + 30 * 60 * 1000).toISOString(),
    recurringEventId: null,
    fromReschedule: null,
    location: "integrations:daily",
    paid: false,
    isRecorded: false,
    report: null,
    payment: [],
    attendees: [],
    seatsReferences: [],
    userPrimaryEmail: "organizer@example.com",
    user: { id: ORGANIZER_ID, name: "Organizer", email: "organizer@example.com", timeZone: "UTC" },
    eventType: {
      id: 3,
      disableCancelling: false,
      disableRescheduling: false,
      disableGuests: true,
      schedulingType: null,
      hostGroups: [],
      parentId: null,
      recurringEvent: null,
      team: null,
      metadata: {},
      minimumRescheduleNotice: null,
      allowReschedulingPastBookings: false,
    },
    listingStatus: "upcoming",
    recurringInfo: undefined,
    loggedInUser,
    isToday: false,
  } as unknown as BookingItemProps;
}

describe("admin cancellation dialog", () => {
  // The list rows and the details sheet both build their viewer with buildBookingLoggedInUser and
  // render the same dropdown, respectively with the "list" and "details" contexts.
  it.each([
    "list",
    "details",
  ] as const)("treats a system admin as the host of someone else's booking (%s)", (context) => {
    render(
      <BookingActionsStoreProvider>
        <BookingActionsDropdown booking={someoneElsesBooking(viewer(true))} context={context} />
      </BookingActionsStoreProvider>
    );

    expect(cancelDialogProps.at(-1)?.isHost).toBe(true);
  });

  it.each(["list", "details"] as const)("keeps a regular viewer as a guest (%s)", (context) => {
    render(
      <BookingActionsStoreProvider>
        <BookingActionsDropdown booking={someoneElsesBooking(viewer(false))} context={context} />
      </BookingActionsStoreProvider>
    );

    expect(cancelDialogProps.at(-1)?.isHost).toBe(false);
  });

  it("propagates isSystemAdmin through the viewer builder", () => {
    expect(viewer(true).isSystemAdmin).toBe(true);
    expect(isActingAsBookingHost(someoneElsesBooking(viewer(true)))).toBe(true);
    expect(isActingAsBookingHost(someoneElsesBooking(viewer(false)))).toBe(false);
  });
});

describe("cancel form for a system admin acting as host", () => {
  const baseProps: ComponentProps<typeof CancelBooking> = {
    booking: {
      uid: "booking-uid",
      title: "Meeting",
      id: 10,
      startTime: new Date(Date.now() + 30 * 60 * 1000),
      payment: { amount: 1000, currency: "usd", appId: "stripe" },
    },
    profile: { name: "Organizer", slug: "organizer" },
    recurringEvent: null,
    setIsCancellationMode: vi.fn(),
    theme: "light",
    allRemainingBookings: false,
    currentUserEmail: "admin@example.com",
    bookingCancelledEventProps: {
      booking: {},
      organizer: { name: "Organizer", email: "organizer@example.com", timeZone: "UTC" },
      eventType: {},
    },
    isHost: isActingAsBookingHost(someoneElsesBooking(viewer(true))),
    internalNotePresets: [],
    renderContext: "dialog",
    eventTypeMetadata: {
      apps: {
        stripe: {
          autoChargeNoShowFeeIfCancelled: true,
          autoChargeNoShowFeeTimeValue: 1,
          autoChargeNoShowFeeTimeUnit: "hours",
          paymentOption: "HOLD",
        },
      },
    },
  };

  beforeEach(() => {
    // Within the fee window: a guest would have to acknowledge the no-show fee.
    vi.mocked(shouldChargeModule.shouldChargeNoShowCancellationFee).mockReturnValue(true);
  });

  it("requires a reason, as the server does for the host (MANDATORY_HOST_ONLY by default)", () => {
    render(<CancelBooking {...baseProps} />);

    expect(screen.getByTestId("confirm_cancel")).toBeDisabled();
  });

  it("does not ask the admin to acknowledge a no-show fee the server will not charge", () => {
    render(<CancelBooking {...baseProps} />);

    expect(screen.queryByText("cancel_booking_acknowledge_no_show_fee")).not.toBeInTheDocument();
  });

  it("still asks a guest to acknowledge the fee (reference behaviour)", () => {
    render(<CancelBooking {...baseProps} isHost={false} />);

    expect(screen.getByText("cancel_booking_acknowledge_no_show_fee")).toBeInTheDocument();
  });
});
