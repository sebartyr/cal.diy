import type { PrismaClient } from "@calcom/prisma";
import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setInstanceDefaultConferencingAppHandler } from "./setInstanceDefaultConferencingApp.handler";

const mockSetDefaultConferencingAppSlug = vi.fn();
const mockGetAppFromSlug = vi.fn();

vi.mock("@calcom/features/deployment/repositories/DeploymentRepository", () => ({
  DeploymentRepository: vi.fn().mockImplementation(function () {
    return { setDefaultConferencingAppSlug: mockSetDefaultConferencingAppSlug };
  }),
}));

vi.mock("@calcom/app-store/utils", () => ({
  getAppFromSlug: (slug: string) => mockGetAppFromSlug(slug),
}));

const mockAppFindUnique = vi.fn();

const ctx = {
  user: { id: 1 } as never,
  prisma: { app: { findUnique: mockAppFindUnique } } as unknown as PrismaClient,
};

const conferencingApp = {
  slug: "jitsi",
  variant: "conferencing",
  categories: ["conferencing"],
  isGlobal: true,
  appData: { location: { type: "integrations:jitsi", linkType: "dynamic" } },
};

describe("setInstanceDefaultConferencingAppHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAppFindUnique.mockResolvedValue({ enabled: true });
  });

  it("stores the slug of a conferencing app", async () => {
    mockGetAppFromSlug.mockReturnValue(conferencingApp);

    await expect(
      setInstanceDefaultConferencingAppHandler({ ctx, input: { slug: "jitsi" } })
    ).resolves.toEqual({ slug: "jitsi" });
    expect(mockSetDefaultConferencingAppSlug).toHaveBeenCalledWith("jitsi");
  });

  // createMeeting() throws "is either disabled or not seeded at all" on a disabled app, which
  // reaches the user as a booking with no meeting URL. The admin panel can disable any app.
  it("rejects a disabled app", async () => {
    mockGetAppFromSlug.mockReturnValue(conferencingApp);
    mockAppFindUnique.mockResolvedValue({ enabled: false });

    await expect(setInstanceDefaultConferencingAppHandler({ ctx, input: { slug: "jitsi" } })).rejects.toThrow(
      /is disabled/
    );
    expect(mockSetDefaultConferencingAppSlug).not.toHaveBeenCalled();
  });

  it("rejects an app with no App row on this instance", async () => {
    mockGetAppFromSlug.mockReturnValue(conferencingApp);
    mockAppFindUnique.mockResolvedValue(null);

    await expect(setInstanceDefaultConferencingAppHandler({ ctx, input: { slug: "jitsi" } })).rejects.toThrow(
      /not installed on this instance/
    );
    expect(mockSetDefaultConferencingAppSlug).not.toHaveBeenCalled();
  });

  it("clears the default without looking up any app", async () => {
    await expect(setInstanceDefaultConferencingAppHandler({ ctx, input: { slug: null } })).resolves.toEqual({
      slug: null,
    });
    expect(mockGetAppFromSlug).not.toHaveBeenCalled();
    expect(mockSetDefaultConferencingAppSlug).toHaveBeenCalledWith(null);
  });

  it("rejects an unknown app", async () => {
    mockGetAppFromSlug.mockReturnValue(undefined);

    await expect(setInstanceDefaultConferencingAppHandler({ ctx, input: { slug: "ghost" } })).rejects.toThrow(
      TRPCError
    );
    expect(mockSetDefaultConferencingAppSlug).not.toHaveBeenCalled();
  });

  it("rejects an app outside the conferencing category", async () => {
    mockGetAppFromSlug.mockReturnValue({
      slug: "google-calendar",
      variant: "calendar",
      categories: ["calendar"],
      appData: {},
    });

    await expect(
      setInstanceDefaultConferencingAppHandler({ ctx, input: { slug: "google-calendar" } })
    ).rejects.toThrow(/not a conferencing app/);
    expect(mockSetDefaultConferencingAppSlug).not.toHaveBeenCalled();
  });

  // Signal, WhatsApp, Telegram and Discord are conferencing apps but expect a URL typed in
  // per event type. This setting stores a slug only, so the location would carry no link.
  it("rejects a static-link app", async () => {
    mockGetAppFromSlug.mockReturnValue({
      slug: "signal",
      variant: "conferencing",
      categories: ["conferencing"],
      isGlobal: true,
      appData: { location: { type: "integrations:signal_video", linkType: "static" } },
    });

    await expect(
      setInstanceDefaultConferencingAppHandler({ ctx, input: { slug: "signal" } })
    ).rejects.toThrow(/needs a link entered per event type/);
    expect(mockSetDefaultConferencingAppSlug).not.toHaveBeenCalled();
  });

  // EventManager drops non-global apps with no Credential row and then falls back to Cal
  // Video, so a non-global default would silently hand hosts a different provider.
  it("rejects an app that is not globally installed", async () => {
    mockGetAppFromSlug.mockReturnValue({
      slug: "zoom",
      variant: "conferencing",
      categories: ["conferencing"],
      isGlobal: false,
      appData: { location: { type: "integrations:zoom", linkType: "dynamic" } },
    });

    await expect(setInstanceDefaultConferencingAppHandler({ ctx, input: { slug: "zoom" } })).rejects.toThrow(
      /not globally installed/
    );
    expect(mockSetDefaultConferencingAppSlug).not.toHaveBeenCalled();
  });

  // An app with no location type would resolve to no location at all, which is what produced
  // event types with no location and bookings with no meeting URL.
  it("rejects a conferencing app that declares no location type", async () => {
    mockGetAppFromSlug.mockReturnValue({
      slug: "weird",
      variant: "conferencing",
      categories: ["conferencing"],
      isGlobal: true,
      appData: {},
    });

    await expect(setInstanceDefaultConferencingAppHandler({ ctx, input: { slug: "weird" } })).rejects.toThrow(
      /declares no location type/
    );
    expect(mockSetDefaultConferencingAppSlug).not.toHaveBeenCalled();
  });
});
