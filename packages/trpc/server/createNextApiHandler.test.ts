import { captureException } from "@sentry/nextjs";
import type { AnyRouter } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import type { NextApiRequest, NextApiResponse } from "next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ZodIssue } from "zod";
import { ZodError } from "zod";
import { createNextApiHandler } from "./createNextApiHandler";
import { errorFormatter } from "./errorFormatter";
import { onErrorHandler } from "./onErrorHandler";

vi.mock("./createContext", () => {
  return {
    createContext: vi.fn(),
  };
});

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

const trpcAdapterHandler = vi.fn();
vi.mock("@trpc/server/adapters/next", () => ({
  createNextApiHandler: () => trpcAdapterHandler,
}));

describe("createNextApiHandler", () => {
  const mockRouter = {
    createCaller: vi.fn(),
    _def: {
      procedures: {},
      middleware: [],
      contextOptions: {},
    },
  } as unknown as AnyRouter;

  const mockReq = {
    method: "POST",
    url: "/api/trpc/test",
  } as NextApiRequest;

  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.clearAllMocks();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe("error formatting", () => {
    it("should format ZodError as BAD_REQUEST", () => {
      const zodError = new ZodError([
        {
          path: ["name"],
          message: "Required",
          code: "invalid_type",
          expected: "string",
          received: "undefined",
        } as ZodIssue,
      ]);

      const error = new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal Server Error",
        cause: zodError,
      });

      const result = errorFormatter({
        shape: {
          message: "Internal Server Error",
          code: 500,
          data: {
            code: "INTERNAL_SERVER_ERROR",
            httpStatus: 500,
            path: "test",
          },
        },
        error,
        type: "query",
        path: "test",
        input: undefined,
        ctx: undefined,
      });

      expect(result).toEqual({
        message: "Invalid input",
        code: 400,
        data: {
          code: "BAD_REQUEST",
          httpStatus: 400,
          path: "test",
          zodError: {
            formErrors: [],
            fieldErrors: {
              name: ["Required"],
            },
          },
        },
      });
    });

    it("should not modify non-ZodError errors", () => {
      const baseError = new Error("Database connection failed");
      const error = new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal Server Error",
        cause: baseError,
      });

      const shape = {
        message: "Internal Server Error",
        code: 500,
        data: {
          code: "INTERNAL_SERVER_ERROR",
          httpStatus: 500,
          path: "test",
        },
      };

      const result = errorFormatter({
        shape,
        error,
        type: "query",
        path: "test",
        input: undefined,
        ctx: undefined,
      });

      expect(result).toEqual(shape);
    });
  });

  describe("error handling", () => {
    it("should handle TRPC errors correctly", () => {
      const handler = createNextApiHandler(mockRouter);
      const error = new TRPCError({ code: "BAD_REQUEST", message: "Invalid input" });

      onErrorHandler({
        error,
        req: mockReq,
      });

      expect(captureException).not.toHaveBeenCalled();
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it("should handle internal server errors correctly", () => {
      const handler = createNextApiHandler(mockRouter);
      const baseError = new Error("Database connection failed");
      const error = new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal Server Error",
        cause: baseError,
      });

      onErrorHandler({
        error,
        req: mockReq,
      });

      expect(consoleSpy).toHaveBeenCalledWith("Something went wrong", error);
      expect(captureException).toHaveBeenCalledWith(error);
    });

    it("should not log client errors", () => {
      const handler = createNextApiHandler(mockRouter);
      const error = new TRPCError({ code: "BAD_REQUEST", message: "Invalid input" });

      onErrorHandler({
        error,
        req: mockReq,
      });

      expect(consoleSpy).not.toHaveBeenCalled();
      expect(captureException).not.toHaveBeenCalled();
    });
  });

  describe("CSRF protection", () => {
    const createRes = () => {
      const res = { status: vi.fn(), json: vi.fn() };
      res.status.mockReturnValue(res);
      return res as unknown as NextApiResponse & {
        status: ReturnType<typeof vi.fn>;
        json: ReturnType<typeof vi.fn>;
      };
    };

    it("rejects a cross-site text/plain mutation with 403 without reaching tRPC", async () => {
      const handler = createNextApiHandler(mockRouter);
      const res = createRes();
      const req = {
        method: "POST",
        url: "/api/trpc/me/updateProfile",
        headers: { "content-type": "text/plain", origin: "https://evil.example", host: "app.example.com" },
      } as unknown as NextApiRequest;

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ data: { code: "FORBIDDEN", httpStatus: 403 } }),
        })
      );
      expect(trpcAdapterHandler).not.toHaveBeenCalled();
    });

    it("forwards same-origin JSON mutations to tRPC", async () => {
      const handler = createNextApiHandler(mockRouter);
      const res = createRes();
      const req = {
        method: "POST",
        url: "/api/trpc/me/updateProfile",
        headers: {
          "content-type": "application/json",
          origin: "https://app.example.com",
          host: "app.example.com",
        },
      } as unknown as NextApiRequest;

      await handler(req, res);

      expect(res.status).not.toHaveBeenCalled();
      expect(trpcAdapterHandler).toHaveBeenCalledWith(req, res);
    });

    it("forwards queries regardless of origin", async () => {
      const handler = createNextApiHandler(mockRouter, true);
      const res = createRes();
      const req = {
        method: "GET",
        url: "/api/trpc/public/session",
        headers: { origin: "https://evil.example" },
      } as unknown as NextApiRequest;

      await handler(req, res);

      expect(trpcAdapterHandler).toHaveBeenCalledWith(req, res);
    });
  });
});
