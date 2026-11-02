import { describe, expect, it } from "vitest";
import { z } from "zod";

import { TRPCError } from "@trpc/server";

import { errorFormatter } from "./errorFormatter";

// Built through a real parse: unlike a hand-built `new z.ZodError()`, zod 4's parse errors are Error
// instances, which TRPCError keeps as its cause.
function zodErrorFrom(schema: z.ZodType, input: unknown): z.ZodError {
  const result = schema.safeParse(input);
  if (result.success) throw new Error("Expected the input to be invalid");
  return result.error;
}

describe("errorFormatter", () => {
  const baseShape = {
    message: "Internal Server Error",
    code: 500,
    data: {
      code: "INTERNAL_SERVER_ERROR",
      httpStatus: 500,
      path: "test",
    },
  };

  it("should format ZodError as BAD_REQUEST", () => {
    const zodError = zodErrorFrom(z.object({ name: z.string({ error: "Required" }) }), {});

    const error = new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal Server Error",
      cause: zodError,
    });

    const result = errorFormatter({
      shape: baseShape,
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

  it("should handle nested ZodError", () => {
    const schema = z.object({
      user: z.object({
        name: z.string(),
        age: z.number().min(18, "Number must be greater than or equal to 18"),
      }),
    });

    const zodError = zodErrorFrom(schema, { user: { name: "Jane", age: 10 } });

    const error = new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal Server Error",
      cause: zodError,
    });

    const result = errorFormatter({
      shape: baseShape,
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
            user: ["Number must be greater than or equal to 18"],
          },
        },
      },
    });
  });

  it("should handle multiple ZodError issues", () => {
    const zodError = zodErrorFrom(
      z.object({
        name: z.string({ error: "Required" }),
        age: z.number().min(18, "Number must be greater than or equal to 18"),
      }),
      { age: 10 }
    );

    const error = new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal Server Error",
      cause: zodError,
    });

    const result = errorFormatter({
      shape: baseShape,
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
            age: ["Number must be greater than or equal to 18"],
          },
        },
      },
    });
  });

  it("should not modify TRPCError", () => {
    const error = new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid input",
    });

    const result = errorFormatter({
      shape: baseShape,
      error,
      type: "query",
      path: "test",
      input: undefined,
      ctx: undefined,
    });

    expect(result).toEqual(baseShape);
  });

  it("should not modify generic Error", () => {
    const baseError = new Error("Database connection failed");
    const error = new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal Server Error",
      cause: baseError,
    });

    const result = errorFormatter({
      shape: baseShape,
      error,
      type: "query",
      path: "test",
      input: undefined,
      ctx: undefined,
    });

    expect(result).toEqual(baseShape);
  });

  it("should handle empty ZodError", () => {
    // No parse yields an empty ZodError, so empty a real one.
    const zodError = zodErrorFrom(z.string(), 1);
    zodError.issues.splice(0);
    const error = new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal Server Error",
      cause: zodError,
    });

    const result = errorFormatter({
      shape: baseShape,
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
          fieldErrors: {},
        },
      },
    });
  });
});
