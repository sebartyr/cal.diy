import { symmetricEncrypt } from "@calcom/lib/crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "12345678901234567890123456789012";
const { credentialCreate } = vi.hoisted(() => ({ credentialCreate: vi.fn() }));

vi.mock("@calcom/lib/constants", () => ({
  APP_CREDENTIAL_SHARING_ENABLED: true,
  CREDENTIAL_SYNC_SECRET: "sync-secret",
  CREDENTIAL_SYNC_SECRET_HEADER_NAME: "calcom-credential-sync-secret",
}));
vi.mock("@calcom/app-store/appStoreMetaData", () => ({
  appStoreMetadata: { zoomvideo: { slug: "zoom", type: "zoom_video" } },
}));
vi.mock("@calcom/prisma", () => ({
  default: {
    user: { findUnique: vi.fn(async () => ({ id: 1 })) },
    app: { findUnique: vi.fn(async () => ({ dirName: "zoomvideo" })) },
    credential: { findFirst: vi.fn(async () => null), create: credentialCreate, update: vi.fn() },
  },
}));
vi.mock("app/api/defaultResponderForAppDir", () => ({
  defaultResponderForAppDir: (handler: unknown) => handler,
}));

import { POST } from "./route";

const post = (keys: string) =>
  (POST as unknown as (request: Request) => Promise<Response>)(
    new Request("http://localhost/api/webhook/app-credential", {
      method: "POST",
      headers: { "calcom-credential-sync-secret": "sync-secret" },
      body: JSON.stringify({ userId: 1, appSlug: "zoom", keys }),
    })
  );

describe("POST /api/webhook/app-credential", () => {
  beforeEach(() => {
    vi.stubEnv("CALCOM_APP_CREDENTIAL_ENCRYPTION_KEY", KEY);
    credentialCreate.mockReset();
  });

  it("stores keys sent in the authenticated v2 format", async () => {
    const response = await post(symmetricEncrypt(JSON.stringify({ token: "t" }), KEY));

    expect(response.status).toBe(200);
    expect(credentialCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ key: { token: "t" } }) })
    );
  });

  it("refuses keys in the legacy CBC format", async () => {
    const response = await post("00112233445566778899aabbccddeeff:deadbeef");

    expect(response.status).toBe(500);
    expect(credentialCreate).not.toHaveBeenCalled();
  });
});
