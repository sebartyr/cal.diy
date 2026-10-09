import { afterEach, describe, expect, it, vi } from "vitest";

const { debugMock } = vi.hoisted(() => ({ debugMock: vi.fn() }));

vi.mock("@calcom/lib/logger", () => ({
  default: { debug: debugMock, getSubLogger: () => ({ debug: vi.fn(), error: vi.fn(), warn: vi.fn() }) },
}));

import { createContextInner } from "../../createContext";
import publicProcedure from "../../procedures/publicProcedure";
import { createCallerFactory, router } from "../../trpc";

const createCaller = createCallerFactory(
  router({
    ok: publicProcedure.query(() => "ok"),
    fails: publicProcedure.query(() => {
      throw new Error("boom");
    }),
  })
);

afterEach(() => {
  debugMock.mockReset();
  vi.restoreAllMocks();
});

describe("perfMiddleware", () => {
  it("logs the duration and outcome without leaving entries on the global performance timeline", async () => {
    const markSpy = vi.spyOn(performance, "mark");
    const measureSpy = vi.spyOn(performance, "measure");
    const caller = createCaller(await createContextInner({ locale: "en" }));

    await expect(caller.ok()).resolves.toBe("ok");
    await expect(caller.fails()).rejects.toThrow("boom");

    expect(markSpy).not.toHaveBeenCalled();
    expect(measureSpy).not.toHaveBeenCalled();
    expect(debugMock).toHaveBeenCalledWith(expect.stringMatching(/^\[OK\]\[\d+\.\d{4}s\] query 'ok'$/));
    expect(debugMock).toHaveBeenCalledWith(expect.stringMatching(/^\[ERROR\]\[\d+\.\d{4}s\] query 'fails'$/));
  });
});
