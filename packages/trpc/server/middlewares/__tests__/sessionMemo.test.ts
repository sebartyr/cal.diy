import type { NextApiRequest } from "next";
import type { Session } from "next-auth";
import { createMocks } from "node-mocks-http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUserSessionMock } = vi.hoisted(() => ({ getUserSessionMock: vi.fn() }));

vi.mock("@calcom/features/auth/lib/userFromSessionUtils", () => ({
  getUserSession: getUserSessionMock,
}));
vi.mock("@calcom/features/audit-log/adminAuditLog", () => ({
  recordAdminAction: vi.fn(),
  recordAdminDenial: vi.fn(),
}));
vi.mock("@sentry/nextjs", () => ({ setUser: vi.fn() }));

import { createContextInner } from "../../createContext";
import authedProcedure from "../../procedures/authedProcedure";
import { createCallerFactory, router } from "../../trpc";
import { getUserSessionForRequest } from "../sessionMiddleware";

const createCaller = createCallerFactory(
  router({
    first: authedProcedure.query(({ ctx }) => ctx.user.id),
    second: authedProcedure.query(({ ctx }) => ctx.user.id),
  })
);

const session: Session = {
  hasValidLicense: true,
  upId: "usr-3",
  expires: new Date(Date.now() + 60_000).toISOString(),
  user: { id: 3, uuid: "uuid-3", email: "u3@example.com", role: "USER" },
};

function buildReq() {
  return createMocks<NextApiRequest>({ method: "POST" }).req;
}

beforeEach(() => {
  getUserSessionMock.mockReset();
  getUserSessionMock.mockImplementation(async () => ({
    user: { id: 3, email: "u3@example.com", role: "USER" },
    session,
  }));
});

describe("getUserSessionForRequest", () => {
  it("loads the user once for every procedure sharing the same request", async () => {
    const caller = createCaller(await createContextInner({ locale: "en", session: null, req: buildReq() }));

    await expect(Promise.all([caller.first(), caller.second(), caller.first()])).resolves.toEqual([3, 3, 3]);
    expect(getUserSessionMock).toHaveBeenCalledTimes(1);
  });

  it("loads the user again for a different request", async () => {
    const firstCaller = createCaller(
      await createContextInner({ locale: "en", session: null, req: buildReq() })
    );
    const secondCaller = createCaller(
      await createContextInner({ locale: "en", session: null, req: buildReq() })
    );

    await firstCaller.first();
    await secondCaller.first();
    expect(getUserSessionMock).toHaveBeenCalledTimes(2);
  });

  it("does not memoize contexts without a request", async () => {
    const caller = createCaller(await createContextInner({ locale: "en", session }));

    await caller.first();
    await caller.second();
    expect(getUserSessionMock).toHaveBeenCalledTimes(2);
  });

  it("rethrows the same failure to every caller of the request", async () => {
    const failure = new Error("Profile not found or not authorized");
    getUserSessionMock.mockRejectedValue(failure);
    const req = buildReq();

    await expect(getUserSessionForRequest({ req })).rejects.toBe(failure);
    await expect(getUserSessionForRequest({ req })).rejects.toBe(failure);
    expect(getUserSessionMock).toHaveBeenCalledTimes(1);
  });

  it("still answers UNAUTHORIZED to each procedure when there is no session", async () => {
    getUserSessionMock.mockResolvedValue({ user: null, session: null });
    const caller = createCaller(await createContextInner({ locale: "en", session: null, req: buildReq() }));

    await expect(caller.first()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.second()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(getUserSessionMock).toHaveBeenCalledTimes(1);
  });
});
