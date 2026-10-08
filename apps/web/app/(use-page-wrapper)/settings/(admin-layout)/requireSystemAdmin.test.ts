import { beforeEach, describe, expect, it, vi } from "vitest";

const { getServerSessionMock, isActiveSystemAdminMock, redirectMock } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
  isActiveSystemAdminMock: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("@calcom/features/auth/lib/getServerSession", () => ({ getServerSession: getServerSessionMock }));
vi.mock("@calcom/features/users/di/UserRoleService.container", () => ({
  getUserRoleService: () => ({ isActiveSystemAdmin: isActiveSystemAdminMock }),
}));
vi.mock("@lib/buildLegacyCtx", () => ({ buildLegacyRequest: () => ({}) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({}) }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import { requireSystemAdmin } from "./requireSystemAdmin";

// getServerSession already exposes min(JWT role, DB role); these cases use the role it would return.
const sessionWithRole = (role: string) => ({ user: { id: 7, role } });

beforeEach(() => {
  getServerSessionMock.mockReset();
  isActiveSystemAdminMock.mockReset();
  redirectMock.mockClear();
});

describe("requireSystemAdmin", () => {
  it("returns the session for JWT ADMIN + DB ADMIN", async () => {
    const session = sessionWithRole("ADMIN");
    getServerSessionMock.mockResolvedValue(session);
    isActiveSystemAdminMock.mockResolvedValue(true);

    await expect(requireSystemAdmin()).resolves.toBe(session);
  });

  it.each([
    ["JWT USER + DB ADMIN", "USER"],
    ["JWT INACTIVE_ADMIN + DB ADMIN", "INACTIVE_ADMIN"],
  ])("redirects for %s without checking further", async (_, sessionRole) => {
    getServerSessionMock.mockResolvedValue(sessionWithRole(sessionRole));
    isActiveSystemAdminMock.mockResolvedValue(true);

    await expect(requireSystemAdmin()).rejects.toThrow("REDIRECT:/settings/my-account/profile");
  });

  it("redirects for JWT ADMIN + DB USER (cached session not yet refreshed)", async () => {
    getServerSessionMock.mockResolvedValue(sessionWithRole("ADMIN"));
    isActiveSystemAdminMock.mockResolvedValue(false);

    await expect(requireSystemAdmin()).rejects.toThrow("REDIRECT:/settings/my-account/profile");
  });

  it("redirects to login without a session", async () => {
    getServerSessionMock.mockResolvedValue(null);
    await expect(requireSystemAdmin()).rejects.toThrow("REDIRECT:/auth/login");
  });
});
