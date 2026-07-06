import type { CalendarEvent } from "@calcom/types/Calendar";
import type { CredentialPayload } from "@calcom/types/Credential";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OpenVisioVideoApiAdapter from "./VideoApiAdapter";

vi.mock("./getOpenVisioAppKeys", () => ({
  getOpenVisioAppKeys: vi.fn().mockResolvedValue({
    apiBaseUrl: "https://visio.clever.cloud",
    clientId: "client-id",
    clientSecret: "client-secret",
    meetingUrlPattern: "{apiBaseUrl}/{slug}",
  }),
}));

const jsonResponse = (body: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
  }) as unknown as Response;

const buildCredential = (email?: string): CredentialPayload =>
  ({
    id: 1,
    type: "openvisio_video",
    key: {},
    userId: 1,
    teamId: null,
    appId: "openvisio",
    invalid: false,
    user: email ? { email } : null,
  }) as unknown as CredentialPayload;

const buildEvent = (organizerEmail: string): CalendarEvent =>
  ({
    title: "Intro call",
    type: "intro",
    organizer: { email: organizerEmail, name: "Org", timeZone: "UTC", language: { locale: "en" } },
    attendees: [],
  }) as unknown as CalendarEvent;

describe("OpenVisioVideoApiAdapter", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("mints a delegated token then creates a room and returns its data", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "jwt-123", token_type: "Bearer", expires_in: 3600 })
      )
      .mockResolvedValueOnce(jsonResponse({ id: "1", slug: "abcdef1234", pin_code: "0000", url: null }));

    const adapter = OpenVisioVideoApiAdapter(buildCredential("owner@acme.eu"));
    const result = await adapter.createMeeting(buildEvent("organizer@acme.eu"));

    expect(result).toEqual({
      type: "openvisio_video",
      id: "abcdef1234",
      password: "0000",
      url: "https://visio.clever.cloud/abcdef1234",
    });

    // token exchange is scoped to the organizer's email
    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe("https://visio.clever.cloud/external-api/v1.0/application/token/");
    expect(JSON.parse(tokenInit.body)).toMatchObject({
      scope: "organizer@acme.eu",
      grant_type: "client_credentials",
    });

    // room creation carries the bearer token
    const [roomUrl, roomInit] = fetchMock.mock.calls[1];
    expect(roomUrl).toBe("https://visio.clever.cloud/external-api/v1.0/rooms/");
    expect(roomInit.method).toBe("POST");
    expect(roomInit.headers.Authorization).toBe("Bearer jwt-123");
  });

  it("prefers the url returned by the API over the fallback pattern", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "jwt-456", token_type: "Bearer", expires_in: 3600 })
      )
      .mockResolvedValueOnce(
        jsonResponse({ id: "2", slug: "zzz", pin_code: null, url: "https://visio.clever.cloud/custom/zzz" })
      );

    const adapter = OpenVisioVideoApiAdapter(buildCredential("owner2@acme.eu"));
    const result = await adapter.createMeeting(buildEvent("organizer2@acme.eu"));

    expect(result.url).toBe("https://visio.clever.cloud/custom/zzz");
    expect(result.password).toBe("");
  });

  it("deletes the room by slug using the credential owner email", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "jwt-789", token_type: "Bearer", expires_in: 3600 })
      )
      .mockResolvedValueOnce(jsonResponse({}, 204));

    const adapter = OpenVisioVideoApiAdapter(buildCredential("owner3@acme.eu"));
    await adapter.deleteMeeting("abcdef1234");

    const [deleteUrl, deleteInit] = fetchMock.mock.calls[1];
    expect(deleteUrl).toBe("https://visio.clever.cloud/external-api/v1.0/rooms/abcdef1234/");
    expect(deleteInit.method).toBe("DELETE");
  });

  it("skips deletion when the credential has no owner email", async () => {
    const adapter = OpenVisioVideoApiAdapter(buildCredential());
    await adapter.deleteMeeting("abcdef1234");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never throws from deleteMeeting when the API fails", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "jwt-err", token_type: "Bearer", expires_in: 3600 })
      )
      .mockResolvedValueOnce(jsonResponse({ detail: "not found" }, 404));

    const adapter = OpenVisioVideoApiAdapter(buildCredential("owner4@acme.eu"));
    await expect(adapter.deleteMeeting("missing")).resolves.toBeUndefined();
  });
});
