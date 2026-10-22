const mockSentryInit = jest.fn();
jest.mock("@sentry/nestjs", () => ({ init: mockSentryInit, prismaIntegration: jest.fn() }));
jest.mock("@sentry/profiling-node", () => ({ nodeProfilingIntegration: jest.fn() }));

describe("instrument", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    mockSentryInit.mockReset();
    process.env = { ...originalEnv };
    delete process.env.SENTRY_DSN;
    delete process.env.SENTRY_TRACES_SAMPLE_RATE;
    delete process.env.SENTRY_PROFILES_SAMPLE_RATE;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  const loadInstrument = () => jest.isolateModules(() => require("./instrument"));

  it("should not initialize Sentry when SENTRY_DSN is not set", () => {
    loadInstrument();

    expect(mockSentryInit).not.toHaveBeenCalled();
  });

  it("should default both sample rates to 1 when only SENTRY_DSN is set", () => {
    process.env.SENTRY_DSN = "https://key@sentry.example.com/1";

    expect(loadInstrument).not.toThrow();
    expect(mockSentryInit).toHaveBeenCalledWith(
      expect.objectContaining({ tracesSampleRate: 1, profilesSampleRate: 1 })
    );
  });

  it("should pass configured sample rates as numbers", () => {
    process.env.SENTRY_DSN = "https://key@sentry.example.com/1";
    process.env.SENTRY_TRACES_SAMPLE_RATE = "0.2";
    process.env.SENTRY_PROFILES_SAMPLE_RATE = "0";

    loadInstrument();

    expect(mockSentryInit).toHaveBeenCalledWith(
      expect.objectContaining({ tracesSampleRate: 0.2, profilesSampleRate: 0 })
    );
  });
});
