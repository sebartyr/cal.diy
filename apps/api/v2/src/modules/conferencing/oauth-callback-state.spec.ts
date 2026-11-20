import { ConferencingController } from "@/modules/conferencing/controllers/conferencing.controller";
import { signOAuthCallbackState, verifyOAuthCallbackState } from "@/modules/conferencing/oauth-callback-state";
import type { ConferencingService } from "@/modules/conferencing/services/conferencing.service";
import type { HttpService } from "@nestjs/axios";
import { BadRequestException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";

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

describe("ConferencingController.save", () => {
  const conferencingService = { connectOauthApps: jest.fn() };
  const controller = new ConferencingController(
    conferencingService as unknown as ConferencingService,
    { getOrThrow: () => SECRET } as unknown as ConfigService,
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
