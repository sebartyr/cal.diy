import { beforeEach, describe, expect, it, vi } from "vitest";

const { getTokenMock, startImpersonationMock, stopImpersonationMock, findProfilesMock } = vi.hoisted(() => ({
  getTokenMock: vi.fn(),
  startImpersonationMock: vi.fn(),
  stopImpersonationMock: vi.fn(),
  findProfilesMock: vi.fn(),
}));

vi.mock("next-auth/jwt", () => ({ getToken: getTokenMock }));

vi.mock("@calcom/features/impersonation/di/ImpersonationService.container", () => ({
  getImpersonationService: () => ({
    startImpersonation: startImpersonationMock,
    stopImpersonation: stopImpersonationMock,
  }),
}));

vi.mock("@calcom/features/profile/repositories/ProfileRepository", () => ({
  ProfileRepository: { findAllProfilesForUserIncludingMovedUser: findProfilesMock },
}));

import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { authorizeImpersonation, getImpersonationActorFromHeaders } from "./ImpersonationProvider";

const NOW_SECONDS = Math.floor(Date.now() / 1000);

const target = {
  id: 2,
  uuid: "target-uuid",
  username: "target",
  name: "Target",
  email: "target@example.com",
  role: "USER",
  locked: false,
  locale: "en",
  twoFactorEnabled: false,
};

const admin = { ...target, id: 1, uuid: "admin-uuid", username: "admin", role: "ADMIN" };

const cookieHeaders = { cookie: "next-auth.session-token=abc" };

beforeEach(() => {
  getTokenMock.mockReset();
  startImpersonationMock.mockReset();
  stopImpersonationMock.mockReset();
  findProfilesMock.mockReset();
  findProfilesMock.mockResolvedValue([{ id: null, upId: "usr-2", username: "target" }]);
});

describe("getImpersonationActorFromHeaders", () => {
  it("returns null without a session cookie", async () => {
    expect(await getImpersonationActorFromHeaders({})).toBeNull();
    expect(await getImpersonationActorFromHeaders(undefined)).toBeNull();
    expect(getTokenMock).not.toHaveBeenCalled();
  });

  it("returns null when the token cannot be decoded", async () => {
    getTokenMock.mockResolvedValue(null);
    expect(await getImpersonationActorFromHeaders(cookieHeaders)).toBeNull();
  });

  it("maps a regular admin token", async () => {
    getTokenMock.mockResolvedValue({ sub: "1", role: "ADMIN" });
    expect(await getImpersonationActorFromHeaders(cookieHeaders)).toEqual({
      userId: 1,
      sessionRole: "ADMIN",
      impersonatedById: null,
    });
  });

  it("maps an impersonated token", async () => {
    getTokenMock.mockResolvedValue({
      sub: "2",
      role: "USER",
      impersonatedBy: { id: 1, uuid: "admin-uuid", role: "ADMIN" },
      impersonationExpiresAt: NOW_SECONDS + 60,
    });
    expect(await getImpersonationActorFromHeaders(cookieHeaders)).toEqual({
      userId: 2,
      sessionRole: "USER",
      impersonatedById: 1,
    });
  });

  it("ignores an expired impersonated token", async () => {
    getTokenMock.mockResolvedValue({
      sub: "2",
      role: "USER",
      impersonatedBy: { id: 1, uuid: "admin-uuid", role: "ADMIN" },
      impersonationExpiresAt: NOW_SECONDS - 1,
    });
    expect(await getImpersonationActorFromHeaders(cookieHeaders)).toBeNull();
  });
});

describe("authorizeImpersonation", () => {
  it("starts an impersonation and returns the target with impersonatedBy", async () => {
    getTokenMock.mockResolvedValue({ sub: "1", role: "ADMIN" });
    startImpersonationMock.mockResolvedValue({
      user: target,
      impersonatedBy: { id: 1, uuid: "admin-uuid", role: "ADMIN" },
    });

    const user = await authorizeImpersonation({ username: "target" }, cookieHeaders);

    expect(startImpersonationMock).toHaveBeenCalledWith({
      actor: { userId: 1, sessionRole: "ADMIN", impersonatedById: null },
      usernameOrEmail: "target",
    });
    expect(user).toMatchObject({
      id: 2,
      email: "target@example.com",
      role: "USER",
      profile: { upId: "usr-2" },
      impersonatedBy: { id: 1, uuid: "admin-uuid", role: "ADMIN" },
    });
  });

  it("passes a null actor when there is no session so the service refuses", async () => {
    startImpersonationMock.mockRejectedValue(new ErrorWithCode(ErrorCode.Unauthorized, "no session"));

    await expect(authorizeImpersonation({ username: "target" }, {})).rejects.toThrow("no session");
    expect(startImpersonationMock).toHaveBeenCalledWith({ actor: null, usernameOrEmail: "target" });
  });

  it("propagates refusals from the service", async () => {
    getTokenMock.mockResolvedValue({ sub: "1", role: "ADMIN" });
    startImpersonationMock.mockRejectedValue(
      new ErrorWithCode(ErrorCode.Forbidden, "Administrators cannot be impersonated.")
    );

    await expect(authorizeImpersonation({ username: "other-admin" }, cookieHeaders)).rejects.toThrow(
      "Administrators cannot be impersonated."
    );
  });

  it("returns to the admin without impersonatedBy when returnToId is given", async () => {
    getTokenMock.mockResolvedValue({
      sub: "2",
      role: "USER",
      impersonatedBy: { id: 1, uuid: "admin-uuid", role: "ADMIN" },
      impersonationExpiresAt: NOW_SECONDS + 60,
    });
    stopImpersonationMock.mockResolvedValue({ user: admin });

    const user = await authorizeImpersonation({ returnToId: "1" }, cookieHeaders);

    expect(stopImpersonationMock).toHaveBeenCalledWith({
      actor: { userId: 2, sessionRole: "USER", impersonatedById: 1 },
      returnToId: 1,
    });
    expect(startImpersonationMock).not.toHaveBeenCalled();
    expect(user).toMatchObject({ id: 1, role: "ADMIN" });
    expect(user).not.toHaveProperty("impersonatedBy");
  });

  it("rejects a malformed returnToId before reaching the service", async () => {
    await expect(authorizeImpersonation({ returnToId: "abc" }, cookieHeaders)).rejects.toThrow();
    expect(stopImpersonationMock).not.toHaveBeenCalled();
    expect(startImpersonationMock).not.toHaveBeenCalled();
  });
});
