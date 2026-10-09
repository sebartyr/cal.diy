import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT ${url}`);
});

vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({}) }));
vi.mock("@lib/buildLegacyCtx", () => ({ buildLegacyRequest: () => ({}) }));
vi.mock("@calcom/features/auth/lib/getServerSession", () => ({
  getServerSession: async () => ({ user: { id: 7 } }),
}));
vi.mock("@calcom/features/auth/lib/isSessionActingSystemAdmin", () => ({
  isSessionActingSystemAdmin: async () => true,
}));
vi.mock("@calcom/features/flags/features.repository", () => ({
  FeaturesRepository: class {
    checkIfUserHasFeature = async () => false;
  },
}));
vi.mock("@calcom/features/users/repositories/UserRepository", () => ({ UserRepository: class {} }));
vi.mock("@calcom/prisma", () => ({ prisma: {} }));
vi.mock("app/_utils", () => ({
  _generateMetadata: vi.fn(),
  getTranslate: async () => (key: string) => key,
}));
vi.mock("app/(use-page-wrapper)/(main-nav)/ShellMainAppDir", () => ({ ShellMainAppDir: () => null }));
vi.mock("~/bookings/views/bookings-view", () => ({ default: () => null }));

import Page from "./page";

const renderPage = (searchParams: Record<string, string | string[] | undefined>) =>
  Page({ params: Promise.resolve({ status: "upcoming" }), searchParams: Promise.resolve(searchParams) });

describe("bookings page", () => {
  beforeEach(() => {
    redirect.mockClear();
  });

  it("redirects a URL without list state to My bookings and its filters", async () => {
    await expect(renderPage({ view: "list" })).rejects.toThrow("NEXT_REDIRECT");

    const url = new URL(redirect.mock.calls[0][0], "https://cal.example");
    expect(url.pathname).toBe("/bookings/upcoming");
    expect(url.searchParams.get("segment")).toBe("system_my_bookings");
    expect(url.searchParams.get("activeFilters")).toContain('"data":[7]');
    expect(url.searchParams.get("view")).toBe("list");
  });

  it("renders the explicit state of the URL without redirecting", async () => {
    await expect(renderPage({ segment: "system_all_bookings", scope: "all" })).resolves.toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });
});
