import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { describe, expect, it } from "vitest";
import { getFrameProtectionHeaderRules } from "./frameProtectionHeaders";

const rules = getFrameProtectionHeaderRules();
// Next.js matches `headers()` sources with these options, see load-custom-routes.
const matchers = rules.map((rule) => getPathMatch(rule.source, { removeUnnamedParams: true, strict: true }));
const isProtected = (pathname: string) => matchers.some((match) => match(pathname) !== false);

describe("getFrameProtectionHeaderRules", () => {
  it("sends both X-Frame-Options and frame-ancestors on every rule", () => {
    for (const rule of rules) {
      expect(rule.headers).toEqual([
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
      ]);
    }
  });

  it.each([
    "/settings",
    "/settings/my-account/profile",
    "/settings/admin/users",
    "/bookings/upcoming",
    "/event-types",
    "/event-types/42",
    "/availability",
    "/availability/troubleshoot",
    "/apps/installed/calendar",
    "/apps/installation/accounts",
    "/apps/google-calendar/setup",
    "/getting-started/connected-calendar",
    "/workflows/12",
    "/teams",
    "/insights",
    "/more",
    "/upgrade",
  ])("protects private page %s", (pathname) => {
    expect(isProtected(pathname)).toBe(true);
  });

  it.each([
    "/embed/embed.js",
    "/john",
    "/john/30min",
    "/john/30min/embed",
    "/team/sales",
    "/team/sales/demo/embed",
    "/d/abc123/30min",
    "/booking/uid123",
    "/booking/uid123/embed",
    "/reschedule/uid123/embed",
    "/forms/form-id",
    "/apps",
    "/apps/google-calendar",
    "/payment/uid123",
    "/video/uid123",
  ])("leaves embeddable or public page %s frameable", (pathname) => {
    expect(isProtected(pathname)).toBe(false);
  });
});
