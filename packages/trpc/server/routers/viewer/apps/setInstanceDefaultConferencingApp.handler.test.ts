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

const ctx = {
  user: { id: 1 } as never,
  prisma: {} as PrismaClient,
};

const conferencingApp = {
  slug: "jitsi",
  variant: "conferencing",
  categories: ["conferencing"],
  appData: { location: { type: "integrations:jitsi" } },
};

describe("setInstanceDefaultConferencingAppHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores the slug of a conferencing app", async () => {
    mockGetAppFromSlug.mockReturnValue(conferencingApp);

    await expect(
      setInstanceDefaultConferencingAppHandler({ ctx, input: { slug: "jitsi" } })
    ).resolves.toEqual({ slug: "jitsi" });
    expect(mockSetDefaultConferencingAppSlug).toHaveBeenCalledWith("jitsi");
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

  // An app with no location type would resolve to no location at all, which is what produced
  // event types with no location and bookings with no meeting URL.
  it("rejects a conferencing app that declares no location type", async () => {
    mockGetAppFromSlug.mockReturnValue({
      slug: "weird",
      variant: "conferencing",
      categories: ["conferencing"],
      appData: {},
    });

    await expect(setInstanceDefaultConferencingAppHandler({ ctx, input: { slug: "weird" } })).rejects.toThrow(
      /declares no location type/
    );
    expect(mockSetDefaultConferencingAppSlug).not.toHaveBeenCalled();
  });
});
