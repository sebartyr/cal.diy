import { describe, expect, it } from "vitest";

import { redactEmails, scrubEvent, SENSITIVE_HEADER_KEYS } from "../scrubEvent";

describe("redactEmails (RGPD-302)", () => {
  it("replaces a single email", () => {
    expect(redactEmails("hello alice@example.com world")).toBe("hello ***@*** world");
  });

  it("replaces multiple emails", () => {
    expect(redactEmails("a@b.co, c@d.io")).toBe("***@***, ***@***");
  });

  it("leaves a non-email string alone", () => {
    expect(redactEmails("no emails here, just words and 3.14")).toBe(
      "no emails here, just words and 3.14"
    );
  });

  it("passes through null / undefined", () => {
    expect(redactEmails(null)).toBeNull();
    expect(redactEmails(undefined)).toBeUndefined();
  });

  it("does not blow up on non-strings", () => {
    expect(redactEmails(42 as unknown as string)).toBe(42);
  });
});

describe("scrubEvent (RGPD-302)", () => {
  it("reduces event.user to its id", () => {
    const out = scrubEvent({
      user: { id: 7, email: "u@example.com", ip_address: "1.2.3.4", username: "u" },
    });
    expect(out.user).toEqual({ id: 7 });
  });

  it("empties user object if no id is present", () => {
    const out = scrubEvent({ user: { email: "u@example.com" } });
    expect(out.user).toEqual({});
  });

  it("strips request.data, request.cookies, and redacts sensitive headers", () => {
    const out = scrubEvent({
      request: {
        data: { bookerEmail: "a@b.com", notes: "private" },
        cookies: { "next-auth.session-token": "secret" },
        headers: {
          Authorization: "Bearer xyz",
          Cookie: "next-auth.session-token=secret",
          "X-Cal-Signature-256": "sig",
          "User-Agent": "Mozilla",
        },
        url: "https://app/api/booking?bookerEmail=a@b.com",
      },
    });
    expect(out.request?.data).toBeUndefined();
    expect(out.request?.cookies).toBeUndefined();
    expect(out.request?.headers).toEqual({
      Authorization: "[redacted]",
      Cookie: "[redacted]",
      "X-Cal-Signature-256": "[redacted]",
      "User-Agent": "Mozilla",
    });
    expect(out.request?.url).toBe("https://app/api/booking?bookerEmail=***@***");
  });

  it("redacts emails in query_string", () => {
    const out = scrubEvent({
      request: { query_string: "uid=42&bookerEmail=foo@bar.com&utm=x" },
    });
    expect(out.request?.query_string).toBe("uid=42&bookerEmail=***@***&utm=x");
  });

  it("redacts emails in top-level message and breadcrumb messages", () => {
    const out = scrubEvent({
      message: "Failed booking for alice@example.com",
      breadcrumbs: [
        { message: "click on alice@example.com profile" },
        { message: "no email here" },
      ],
    });
    expect(out.message).toBe("Failed booking for ***@***");
    expect(out.breadcrumbs?.[0].message).toBe("click on ***@*** profile");
    expect(out.breadcrumbs?.[1].message).toBe("no email here");
  });

  it("is idempotent on an already-scrubbed event", () => {
    const scrubbed = scrubEvent({
      user: { id: 1 },
      message: "hello",
      request: { headers: { "User-Agent": "X" } },
    });
    expect(scrubEvent(scrubbed)).toEqual(scrubbed);
  });

  it("knows about Authorization, Cookie, and X-Cal-* headers", () => {
    expect(SENSITIVE_HEADER_KEYS.has("authorization")).toBe(true);
    expect(SENSITIVE_HEADER_KEYS.has("cookie")).toBe(true);
    expect(SENSITIVE_HEADER_KEYS.has("x-cal-signature-256")).toBe(true);
  });
});
