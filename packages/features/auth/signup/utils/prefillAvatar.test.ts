import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { assertUrlIsSafeForSSRF, uploadAvatar, findUnique } = vi.hoisted(() => ({
  assertUrlIsSafeForSSRF: vi.fn(),
  uploadAvatar: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("@calcom/lib/ssrfProtection", () => ({ assertUrlIsSafeForSSRF }));
vi.mock("@calcom/lib/server/avatar", () => ({ uploadAvatar }));
vi.mock("@calcom/lib/server/resizeBase64Image", () => ({
  resizeBase64Image: vi.fn(async (image: string) => image),
}));
vi.mock("@calcom/prisma", () => ({ default: { user: { findUnique, update: vi.fn() } } }));

import { prefillAvatar } from "./prefillAvatar";

describe("prefillAvatar", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv("AVATARAPI_USERNAME", "user");
    vi.stubEnv("AVATARAPI_PASSWORD", "password");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(async (url: string) =>
      url === "https://avatarapi.com/v2/api.aspx"
        ? { json: async () => ({ Success: true, Image: "http://169.254.169.254/latest/meta-data/" }) }
        : { ok: true, arrayBuffer: async () => new ArrayBuffer(1) }
    );
    findUnique.mockResolvedValue({ id: 1 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("does not download an image URL that fails the SSRF check", async () => {
    assertUrlIsSafeForSSRF.mockRejectedValue(new Error("URL is not allowed"));

    await prefillAvatar({ email: "jane@example.com" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(uploadAvatar).not.toHaveBeenCalled();
  });

  it("downloads an allowed image URL without following redirects", async () => {
    assertUrlIsSafeForSSRF.mockResolvedValue(undefined);

    await prefillAvatar({ email: "jane@example.com" });

    expect(fetchMock).toHaveBeenLastCalledWith("http://169.254.169.254/latest/meta-data/", {
      redirect: "error",
    });
    expect(uploadAvatar).toHaveBeenCalled();
  });
});
