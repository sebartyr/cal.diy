import { describe, expect, it } from "vitest";
import { isActingSystemAdmin } from "./isActingSystemAdmin";

describe("isActingSystemAdmin", () => {
  const session = { user: {} };

  it("grants an admin with a regular session", () => {
    expect(isActingSystemAdmin({ role: "ADMIN", session })).toBe(true);
  });

  it("refuses non-admin roles", () => {
    expect(isActingSystemAdmin({ role: "USER", session })).toBe(false);
    expect(isActingSystemAdmin({ role: "INACTIVE_ADMIN", session })).toBe(false);
    expect(isActingSystemAdmin({ role: undefined, session })).toBe(false);
  });

  it("refuses an admin acting through an impersonated session", () => {
    expect(isActingSystemAdmin({ role: "ADMIN", session: { user: { impersonatedBy: { id: 7 } } } })).toBe(
      false
    );
  });

  it("refuses when no session is available to rule impersonation out", () => {
    expect(isActingSystemAdmin({ role: "ADMIN", session: undefined })).toBe(false);
    expect(isActingSystemAdmin({ role: "ADMIN", session: null })).toBe(false);
  });
});
