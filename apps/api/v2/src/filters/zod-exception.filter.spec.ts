import type { ArgumentsHost } from "@nestjs/common";
import { Logger } from "@nestjs/common";
import { inspect } from "node:util";
import { z, ZodError } from "zod";

import { ZodExceptionFilter } from "./zod-exception.filter";

function createZodError(): ZodError {
  const result = z.object({ origin: z.string() }).safeParse({ origin: null });
  if (result.success) throw new Error("Expected the schema to reject a null origin");
  return result.error;
}

function createHost() {
  const json = jest.fn();
  const response = { setHeader: jest.fn(), status: jest.fn().mockReturnValue({ json }) };
  const request = { headers: {}, body: {}, url: "/v2/calendars/office365/save", method: "GET" };
  const host = {
    switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }),
  } as unknown as ArgumentsHost;
  return { host, response, json };
}

describe("ZodExceptionFilter", () => {
  afterEach(() => jest.restoreAllMocks());

  it("answers 400 with the validation issues", () => {
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const { host, response, json } = createHost();

    new ZodExceptionFilter().catch(createZodError(), host);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "error",
        error: expect.objectContaining({ message: "origin - Expected string, received null, " }),
      })
    );
  });

  it("logs metadata that util.inspect can format", () => {
    const errorSpy = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const { host } = createHost();

    new ZodExceptionFilter().catch(createZodError(), host);

    const metadata = errorSpy.mock.calls[0][1];
    expect(() => inspect(metadata)).not.toThrow();
    expect(metadata).toEqual(expect.objectContaining({ issues: createZodError().issues }));
  });
});
