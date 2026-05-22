import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@calcom/lib/logger", () => {
  const info = vi.fn();
  return {
    __infoMock: info,
    default: {
      getSubLogger: () => ({ info }),
    },
  };
});

// Access the mock after vi.mock is hoisted.
const loggerModule = await import("@calcom/lib/logger");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const infoMock = (loggerModule as any).__infoMock as ReturnType<typeof vi.fn>;

import { recordAdminAction, recordAdminDenial } from "../adminAuditLog";

beforeEach(() => {
  infoMock.mockReset();
});

describe("recordAdminAction", () => {
  it("emits a single structured info log under the 'admin-audit' sublogger", () => {
    recordAdminAction({
      actorUserId: 1,
      actorEmail: "alice@example.com",
      path: "viewer.admin.lockUserAccount",
      outcome: "granted",
      context: { targetUserId: 42, locked: true },
    });
    expect(infoMock).toHaveBeenCalledTimes(1);
    const [msg, payload] = infoMock.mock.calls[0];
    expect(msg).toBe("admin-action");
    expect(payload).toMatchObject({
      actorUserId: 1,
      actorEmail: "alice@example.com",
      path: "viewer.admin.lockUserAccount",
      outcome: "granted",
      context: { targetUserId: 42, locked: true },
    });
    expect(typeof payload.at).toBe("string");
    expect(new Date(payload.at).toString()).not.toBe("Invalid Date");
  });

  it("supports omitting context and email", () => {
    recordAdminAction({
      actorUserId: 1,
      path: "viewer.admin.toggleFeatureFlag",
      outcome: "granted",
    });
    expect(infoMock).toHaveBeenCalledTimes(1);
    const [, payload] = infoMock.mock.calls[0];
    expect(payload.context).toBeUndefined();
    expect(payload.actorEmail).toBeUndefined();
  });
});

describe("recordAdminDenial", () => {
  it("emits outcome=denied with reason", () => {
    recordAdminDenial({
      actorUserId: 1,
      path: "viewer.admin.listPaginated",
      reason: "non-admin role attempted to call admin route",
    });
    expect(infoMock).toHaveBeenCalledTimes(1);
    const [, payload] = infoMock.mock.calls[0];
    expect(payload.outcome).toBe("denied");
    expect(payload.reason).toBe("non-admin role attempted to call admin route");
  });
});
