import type { ArgumentsHost } from "@nestjs/common";
import { z, type ZodError } from "zod";

import { ZodExceptionFilter } from "./zod-exception.filter";

function getZodError(schema: z.ZodTypeAny, input: unknown): ZodError {
  const result = schema.safeParse(input);
  if (result.success) throw new Error("Expected the schema to reject the input");
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

// The real Nest console logger is used on purpose: it formats metadata with util.inspect (depth 5), which
// is what used to throw on ZodError instances. Only its output is silenced.
describe("ZodExceptionFilter", () => {
  beforeEach(() => {
    jest.spyOn(process.stdout, "write").mockImplementation(() => true);
    jest.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => jest.restoreAllMocks());

  it("answers 400 with the validation issues", () => {
    const { host, response, json } = createHost();

    new ZodExceptionFilter().catch(getZodError(z.object({ origin: z.string() }), { origin: null }), host);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "error",
        error: expect.objectContaining({ message: "origin - Expected string, received null, " }),
      })
    );
  });

  it("answers 400 for a union error whose issues nest other ZodErrors", () => {
    const { host, response } = createHost();
    const error = getZodError(z.object({ value: z.union([z.string(), z.number()]) }), { value: null });

    new ZodExceptionFilter().catch(error, host);

    expect(response.status).toHaveBeenCalledWith(400);
  });
});
