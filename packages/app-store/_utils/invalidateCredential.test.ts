import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("@calcom/prisma", () => ({
  default: { credential: { findUnique: mocks.findUnique, update: mocks.update } },
}));

vi.mock("@calcom/lib/logger", () => ({
  default: { getSubLogger: () => ({ warn: mocks.warn }) },
}));

import { invalidateCredential } from "./invalidateCredential";

describe("invalidateCredential", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks the credential invalid and logs which integration stopped", async () => {
    mocks.findUnique.mockResolvedValue({
      id: 126,
      type: "pipedrive-crm_crm",
      appId: "pipedrive-crm",
      userId: 20,
      teamId: null,
      key: { access_token: "secret" },
    });

    await invalidateCredential(126);

    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 126 }, data: { invalid: true } });
    expect(mocks.warn).toHaveBeenCalledWith("Credential marked invalid", {
      credentialId: 126,
      type: "pipedrive-crm_crm",
      appId: "pipedrive-crm",
      userId: 20,
      teamId: null,
    });
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain("secret");
  });

  it("does nothing for a credential that no longer exists", async () => {
    mocks.findUnique.mockResolvedValue(null);

    await invalidateCredential(999);

    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.warn).not.toHaveBeenCalled();
  });
});
