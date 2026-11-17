import type { CredentialPayload } from "@calcom/types/Credential";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequest } = vi.hoisted(() => ({ mockRequest: vi.fn() }));

vi.mock("../../_utils/oauth/OAuthManager", () => ({
  OAuthManager: class {
    getTokenObjectOrFetch = async () => ({ token: { api_domain: "https://acme.pipedrive.com" } });
    request = mockRequest;
  },
}));
vi.mock("../../_utils/invalidateCredential", () => ({ invalidateCredential: vi.fn() }));
vi.mock("../../_utils/oauth/markTokenAsExpired", () => ({ markTokenAsExpired: vi.fn() }));
vi.mock("../../_utils/oauth/updateTokenObject", () => ({ updateTokenObjectInDb: vi.fn() }));
vi.mock("./getPipedriveAppKeys", () => ({ getPipedriveAppKeys: vi.fn() }));

import BuildCrmService from "./CrmService";

const credential = {
  id: 1,
  type: "pipedrive-crm_crm",
  appId: "pipedrive-crm",
  userId: 1,
  teamId: null,
  invalid: false,
  key: { access_token: "token", api_domain: "https://acme.pipedrive.com" },
} as unknown as CredentialPayload;

const searchResponse = (items: Array<{ id: number; emails: string[] }>) => ({
  json: {
    success: true,
    data: { items: items.map((item) => ({ result_score: 1, item: { ...item, name: "Jane Doe" } })) },
  },
});

describe("Pipedrive CrmService.getContacts", () => {
  beforeEach(() => {
    mockRequest.mockReset();
  });

  it("finds an existing person from the search response `emails` field", async () => {
    mockRequest.mockResolvedValueOnce(searchResponse([{ id: 42, emails: ["Jane@Example.com"] }]));

    const contacts = await BuildCrmService(credential).getContacts({ emails: "jane@example.com" });

    expect(contacts).toEqual([{ id: "42", email: "jane@example.com" }]);
  });

  it("searches with exact_match on the email field", async () => {
    mockRequest.mockResolvedValueOnce(searchResponse([]));

    await BuildCrmService(credential).getContacts({ emails: "jane+test@example.com" });

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://acme.pipedrive.com/api/v1/persons/search?term=jane%2Btest%40example.com&fields=email&exact_match=true",
      })
    );
  });

  it("returns a single contact per email when several persons share it", async () => {
    mockRequest.mockResolvedValueOnce(
      searchResponse([
        { id: 1, emails: ["jane@example.com"] },
        { id: 2, emails: ["other@example.com", "jane@example.com"] },
      ])
    );

    const contacts = await BuildCrmService(credential).getContacts({ emails: ["jane@example.com"] });

    expect(contacts).toEqual([{ id: "1", email: "jane@example.com" }]);
  });

  it("ignores results whose emails do not match", async () => {
    mockRequest.mockResolvedValueOnce(searchResponse([{ id: 7, emails: ["ajane@example.com"] }]));

    const contacts = await BuildCrmService(credential).getContacts({ emails: "jane@example.com" });

    expect(contacts).toEqual([]);
  });

  it("returns only found contacts when searching several emails", async () => {
    mockRequest
      .mockResolvedValueOnce(searchResponse([{ id: 1, emails: ["a@example.com"] }]))
      .mockResolvedValueOnce(searchResponse([]));

    const contacts = await BuildCrmService(credential).getContacts({
      emails: ["a@example.com", "b@example.com"],
    });

    expect(contacts).toEqual([{ id: "1", email: "a@example.com" }]);
  });

  it("returns no contact when the search request fails", async () => {
    mockRequest.mockRejectedValueOnce(new Error("network"));

    const contacts = await BuildCrmService(credential).getContacts({ emails: "jane@example.com" });

    expect(contacts).toEqual([]);
  });
});
