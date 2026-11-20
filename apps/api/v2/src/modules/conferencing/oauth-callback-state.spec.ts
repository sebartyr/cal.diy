import { ConferencingController } from "@/modules/conferencing/controllers/conferencing.controller";
import {
  isAllowedReturnUrl,
  signOAuthCallbackState,
  verifyOAuthCallbackState,
} from "@/modules/conferencing/oauth-callback-state";
import type { ConferencingService } from "@/modules/conferencing/services/conferencing.service";
import type { HttpService } from "@nestjs/axios";
import { BadRequestException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { Request } from "express";

const SECRET = "test-secret";
const state = { accessToken: "token", returnTo: "https://app.example.com/ok", onErrorReturnTo: "https://app.example.com/ko" };

describe("OAuth callback state", () => {
  it("round-trips a signed state", () => {
    const raw = JSON.stringify(signOAuthCallbackState(state, SECRET));
    expect(verifyOAuthCallbackState(raw, SECRET)).toEqual(state);
  });

  it("rejects an unsigned state", () => {
    expect(verifyOAuthCallbackState(JSON.stringify(state), SECRET)).toBeNull();
  });

  it("rejects a state whose redirect was changed after signing", () => {
    const signed = signOAuthCallbackState(state, SECRET);
    const raw = JSON.stringify({ ...signed, onErrorReturnTo: "https://evil.example" });
    expect(verifyOAuthCallbackState(raw, SECRET)).toBeNull();
  });

  it("rejects a state signed with another secret", () => {
    const raw = JSON.stringify(signOAuthCallbackState(state, "other-secret"));
    expect(verifyOAuthCallbackState(raw, SECRET)).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(verifyOAuthCallbackState("not json", SECRET)).toBeNull();
    expect(verifyOAuthCallbackState("null", SECRET)).toBeNull();
  });
});

describe("ConferencingController", () => {
  const conferencingService = {
    connectOauthApps: jest.fn(),
    generateOAuthUrl: jest.fn(async () => ({ url: "https://zoom.example/authorize" })),
    getOAuthClientRedirectUris: jest.fn(async () => ["https://app.example.com"]),
  };
  const config = {
    getOrThrow: (key: string) => (key === "app.baseUrl" ? "https://cal.example.com/" : SECRET),
  } as unknown as ConfigService;
  const controller = new ConferencingController(
    conferencingService as unknown as ConferencingService,
    config,
    {} as HttpService
  );

  beforeEach(() => jest.clearAllMocks());

  it("does not redirect to a forged onErrorReturnTo", async () => {
    const forged = JSON.stringify({ accessToken: "x", onErrorReturnTo: "https://evil.example" });

    await expect(controller.save(forged, "zoom", "code", "access_denied", "denied")).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(conferencingService.connectOauthApps).not.toHaveBeenCalled();
  });

  it("returns to onErrorReturnTo of a signed state when the provider reports an error", async () => {
    const raw = JSON.stringify(signOAuthCallbackState(state, SECRET));

    await expect(controller.save(raw, "zoom", "code", "access_denied", "denied")).resolves.toEqual({
      url: state.onErrorReturnTo,
    });
  });

  it("falls back to onErrorReturnTo when connecting the app fails", async () => {
    conferencingService.connectOauthApps.mockRejectedValue(new Error("Invalid Access token."));
    const raw = JSON.stringify(signOAuthCallbackState(state, SECRET));

    await expect(controller.save(raw, "zoom", "code", undefined, undefined)).resolves.toEqual({
      url: state.onErrorReturnTo,
    });
  });
});

describe("isAllowedReturnUrl", () => {
  const allowed = ["https://cal.example.com", "https://*.customer.example", "https://app.example.com/oauth/done"];

  it.each([
    ["https://cal.example.com/apps/installed", true],
    ["https://tenant.customer.example/settings", true],
    ["https://app.example.com/oauth/done", true],
    ["https://evil.example/", false],
    ["https://cal.example.com.evil.example/", false],
    ["https://evil.example/x.customer.example", false],
    ["https://evil.example/?next=https://a.customer.example", false],
    ["https://app.example.com/oauth/done?x=1", false],
    ["javascript:alert(1)", false],
    ["not a url", false],
  ])("%s -> %s", (url, expected) => {
    expect(isAllowedReturnUrl(url, allowed)).toBe(expected);
  });
});

describe("ConferencingController.redirect", () => {
  const conferencingService = {
    generateOAuthUrl: jest.fn(async () => ({ url: "https://zoom.example/authorize" })),
    getOAuthClientRedirectUris: jest.fn(async () => ["https://app.example.com"]),
  };
  const controller = new ConferencingController(
    conferencingService as unknown as ConferencingService,
    { getOrThrow: (key: string) => (key === "app.baseUrl" ? "https://cal.example.com" : SECRET) } as unknown as ConfigService,
    {} as HttpService
  );
  const request = (origin?: string) => ({ headers: { origin } }) as unknown as Request;

  beforeEach(() => jest.clearAllMocks());

  it("signs destinations on the web app or an allowed redirect URI", async () => {
    await controller.redirect(
      request(),
      "Bearer token",
      "zoom",
      "https://app.example.com/done",
      "https://cal.example.com/error"
    );

    expect(conferencingService.generateOAuthUrl).toHaveBeenCalledWith(
      "zoom",
      expect.objectContaining({ returnTo: "https://app.example.com/done", sig: expect.any(String) })
    );
  });

  it("refuses a destination outside the allowed list", async () => {
    await expect(
      controller.redirect(request(), "Bearer token", "zoom", "https://app.example.com/done", "https://evil.example")
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(conferencingService.generateOAuthUrl).not.toHaveBeenCalled();
  });

  it("refuses a disallowed Origin header used as the default destination", async () => {
    await expect(controller.redirect(request("https://evil.example"), "Bearer token", "zoom")).rejects.toBeInstanceOf(
      BadRequestException
    );
  });
});
