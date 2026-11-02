import type { Request, Response } from "express";

const mockCreate = jest.fn();

jest.mock("@nestjs/core", () => ({ NestFactory: { create: (...args: unknown[]) => mockCreate(...args) } }));
jest.mock("./app.module", () => ({ AppModule: class AppModule {} }));
jest.mock("./bootstrap", () => ({ bootstrap: jest.fn() }));

type Handler = (req: Request, res: Response) => Promise<void>;

function fakeNestApp(server: jest.Mock) {
  return {
    set: jest.fn(),
    init: jest.fn().mockResolvedValue(undefined),
    getHttpAdapter: () => ({ getInstance: () => server }),
  };
}

function fakeResponse(): Response {
  return { statusCode: 200, end: jest.fn() } as unknown as Response;
}

function loadHandler(): Handler {
  let handler: Handler | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    handler = require("./main").default;
  });
  if (!handler) throw new Error("main.ts has no default export");
  return handler;
}

describe("main.ts default handler (API v2 served by the web app)", () => {
  const previousEnableApiV2 = process.env.ENABLE_API_V2;

  beforeAll(() => {
    // Keeps main.ts from starting its own server on import.
    process.env.ENABLE_API_V2 = "true";
  });

  afterAll(() => {
    process.env.ENABLE_API_V2 = previousEnableApiV2;
  });

  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("creates a single Nest app for concurrent first requests", async () => {
    const server = jest.fn();
    mockCreate.mockImplementation(
      () => new Promise((resolve) => setImmediate(() => resolve(fakeNestApp(server))))
    );
    const handler = loadHandler();

    await Promise.all(
      Array.from({ length: 8 }, () => handler({ url: "/v2/me" } as Request, fakeResponse()))
    );

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(server).toHaveBeenCalledTimes(8);
  });

  it("retries the initialisation on the next request after a failure", async () => {
    const server = jest.fn();
    mockCreate
      .mockRejectedValueOnce(new Error("database unreachable"))
      .mockResolvedValueOnce(fakeNestApp(server));
    const handler = loadHandler();

    const failed = fakeResponse();
    await handler({ url: "/v2/me" } as Request, failed);
    expect(failed.statusCode).toBe(500);

    await handler({ url: "/v2/me" } as Request, fakeResponse());
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(server).toHaveBeenCalledTimes(1);
  });
});
