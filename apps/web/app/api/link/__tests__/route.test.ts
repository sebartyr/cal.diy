import { confirmHandler } from "@calcom/trpc/server/routers/viewer/bookings/confirm.handler";
import type { NextRequest } from "next/server";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockConfirmHandler = confirmHandler as unknown as Mock<typeof confirmHandler>;
const VALID_PAYLOAD = JSON.stringify({ bookingUid: "test-booking-uid", userId: 1 });

vi.mock("app/api/defaultResponderForAppDir", () => ({
  defaultResponderForAppDir:
    (handler: (req: NextRequest) => Promise<Response>) =>
    (req: NextRequest, _context: { params: Promise<Record<string, string>> }) =>
      handler(req),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
  cookies: vi.fn().mockResolvedValue({ getAll: () => [] }),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    redirect: vi.fn((url: string | URL, init?: { status?: number }) => {
      const location = typeof url === "string" ? url : url.toString();
      return {
        status: init?.status ?? 302,
        headers: {
          get: (name: string) => (name.toLowerCase() === "location" ? location : null),
        },
      } as unknown as Response;
    }),
    json: vi.fn((body: unknown, init?: { status?: number }) => {
      return {
        status: init?.status ?? 200,
        json: async () => body,
        headers: { get: () => null },
      } as unknown as Response;
    }),
  },
}));

vi.mock("@calcom/lib/crypto-clever", () => ({
  symmetricDecryptStrictV2: vi.fn(),
}));

vi.mock("@calcom/prisma", () => {
  const mockBookingFindUniqueOrThrow = vi.fn().mockResolvedValue({
    id: 1,
    uid: "test-booking-uid",
    recurringEventId: null,
  });
  const mockUserFindUniqueOrThrow = vi.fn().mockResolvedValue({
    id: 1,
    uuid: "user-uuid",
    email: "test@example.com",
    username: "testuser",
    role: "USER",
    destinationCalendar: null,
  });
  const mockPrismaObj = {
    booking: {
      findUniqueOrThrow: mockBookingFindUniqueOrThrow,
    },
    user: {
      findUniqueOrThrow: mockUserFindUniqueOrThrow,
    },
  };
  return {
    default: mockPrismaObj,
    prisma: mockPrismaObj,
  };
});

vi.mock("@calcom/trpc/server/routers/viewer/bookings/confirm.handler", () => ({
  confirmHandler: vi.fn(),
}));

vi.mock("@calcom/lib/tracing/factory", () => ({
  distributedTracing: {
    createTrace: vi.fn().mockReturnValue({}),
  },
}));

vi.mock("@calcom/features/booking-audit/lib/makeActor", () => ({
  makeUserActor: vi.fn().mockReturnValue({ type: "user", id: "test-uuid" }),
}));

import crypto from "node:crypto";
import { symmetricDecryptStrictV2 } from "@calcom/lib/crypto-clever";
import prisma from "@calcom/prisma";
// Import after mocks are set up
import { GET } from "../route";

const createMockRequest = (url: string): NextRequest => {
  const urlObj = new URL(url);
  return {
    method: "GET",
    url,
    nextUrl: {
      searchParams: urlObj.searchParams,
    },
  } as unknown as NextRequest;
};

// Vitest sets NEXT_PUBLIC_WEBAPP_URL to http://app.cal.local:3000 (see vitest.config.mts)
const EXPECTED_REDIRECT_ORIGIN = "http://app.cal.local:3000";

describe("link route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(symmetricDecryptStrictV2).mockReturnValue(VALID_PAYLOAD);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("GET handler - invalid tokens", () => {
    const TEST_KEY = "12345678901234567890123456789012";

    async function expectUniformRejection(url: string) {
      const res = await GET(createMockRequest(url), { params: Promise.resolve({}) });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ message: "Invalid or expired link" });
      expect(mockConfirmHandler).not.toHaveBeenCalled();
    }

    it("rejects a token that fails decryption", async () => {
      vi.mocked(symmetricDecryptStrictV2).mockImplementation(() => {
        throw new Error("bad decrypt");
      });
      await expectUniformRejection("https://app.example.com/api/link?action=accept&token=00:00");
    });

    it("rejects a token that decrypts to invalid JSON", async () => {
      vi.mocked(symmetricDecryptStrictV2).mockReturnValue("not json");
      await expectUniformRejection("https://app.example.com/api/link?action=accept&token=x");
    });

    it("rejects a token that decrypts to the wrong shape", async () => {
      vi.mocked(symmetricDecryptStrictV2).mockReturnValue(JSON.stringify({ bookingUid: 1 }));
      await expectUniformRejection("https://app.example.com/api/link?action=accept&token=x");
    });

    it("rejects a missing token or unknown action", async () => {
      await expectUniformRejection("https://app.example.com/api/link?action=accept");
      await expectUniformRejection("https://app.example.com/api/link?action=delete&token=x");
    });

    it("rejects a malformed percent-encoded token", async () => {
      await expectUniformRejection("https://app.example.com/api/link?action=accept&token=%25E0%25A4%25A");
    });

    it("rejects a legacy CBC token even when it decrypts correctly", async () => {
      const actual =
        await vi.importActual<typeof import("@calcom/lib/crypto-clever")>("@calcom/lib/crypto-clever");
      vi.mocked(symmetricDecryptStrictV2).mockImplementation(actual.symmetricDecryptStrictV2);
      vi.stubEnv("CALENDSO_ENCRYPTION_KEY", TEST_KEY);
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(TEST_KEY, "latin1"), iv);
      const legacyToken = `${iv.toString("hex")}:${cipher.update(VALID_PAYLOAD, "utf8", "hex")}${cipher.final("hex")}`;

      await expectUniformRejection(
        `https://app.example.com/api/link?action=accept&token=${encodeURIComponent(legacyToken)}`
      );
    });

    it("accepts a v2 token produced by symmetricEncryptV2", async () => {
      const actual =
        await vi.importActual<typeof import("@calcom/lib/crypto-clever")>("@calcom/lib/crypto-clever");
      vi.mocked(symmetricDecryptStrictV2).mockImplementation(actual.symmetricDecryptStrictV2);
      vi.stubEnv("CALENDSO_ENCRYPTION_KEY", TEST_KEY);
      const token = actual.symmetricEncryptV2(VALID_PAYLOAD, TEST_KEY);

      const res = await GET(
        createMockRequest(
          `https://app.example.com/api/link?action=accept&token=${encodeURIComponent(token)}`
        ),
        { params: Promise.resolve({}) }
      );

      expect(res.status).toBe(302);
      expect(mockConfirmHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe("GET handler - redirect URL construction", () => {
    it("should redirect to booking page using WEBAPP_URL (fixes localhost redirect when behind proxy)", async () => {
      const baseUrl = "https://app.example.com/api/link?action=accept&token=encrypted-token";
      const req = createMockRequest(baseUrl);

      const res = await GET(req, { params: Promise.resolve({}) });
      const location = res.headers.get("location");

      expect(location).toBeTruthy();
      const redirectUrl = new URL(location!);

      expect(redirectUrl.origin).toBe(EXPECTED_REDIRECT_ORIGIN);
      expect(redirectUrl.pathname).toBe("/booking/test-booking-uid");
    });

    it("should use WEBAPP_URL for redirects, not request.url (avoids localhost when proxy sends localhost)", async () => {
      const baseUrl = "https://custom-domain.company.com/api/link?action=accept&token=encrypted-token";
      const req = createMockRequest(baseUrl);

      const res = await GET(req, { params: Promise.resolve({}) });
      const location = res.headers.get("location");

      expect(location).toBeTruthy();
      const redirectUrl = new URL(location!);

      expect(redirectUrl.origin).toBe(EXPECTED_REDIRECT_ORIGIN);
      expect(location).not.toContain("localhost");
    });

    it("should use WEBAPP_URL for self-hosted deployments", async () => {
      const baseUrl = "https://calcom.internal.company.net/api/link?action=reject&token=encrypted-token";
      const req = createMockRequest(baseUrl);

      const res = await GET(req, { params: Promise.resolve({}) });
      const location = res.headers.get("location");

      expect(location).toBeTruthy();
      const redirectUrl = new URL(location!);

      expect(redirectUrl.origin).toBe(EXPECTED_REDIRECT_ORIGIN);
      expect(redirectUrl.pathname).toBe("/booking/test-booking-uid");
    });

    it("should construct redirect URLs using WEBAPP_URL regardless of request origin", async () => {
      const testOrigins = [
        "https://app.cal.com",
        "https://acme.cal.com",
        "https://calcom.company.internal",
        "http://192.168.1.100:3000",
      ];

      for (const origin of testOrigins) {
        vi.clearAllMocks();
        const baseUrl = `${origin}/api/link?action=accept&token=encrypted-token`;
        const req = createMockRequest(baseUrl);

        const res = await GET(req, { params: Promise.resolve({}) });
        const location = res.headers.get("location");

        expect(location).toBeTruthy();
        const redirectUrl = new URL(location!);

        expect(redirectUrl.origin).toBe(EXPECTED_REDIRECT_ORIGIN);
        expect(redirectUrl.pathname).toBe("/booking/test-booking-uid");
      }
    });
  });

  describe("GET handler - error handling", () => {
    it("should redirect with error message when confirmHandler throws a TRPCError", async () => {
      const { TRPCError } = await import("@trpc/server");

      mockConfirmHandler.mockRejectedValueOnce(
        new TRPCError({ code: "BAD_REQUEST", message: "Custom error" })
      );

      const baseUrl = "https://app.example.com/api/link?action=accept&token=encrypted-token";
      const req = createMockRequest(baseUrl);

      const res = await GET(req, { params: Promise.resolve({}) });
      const location = res.headers.get("location");

      expect(location).toBeTruthy();
      const redirectUrl = new URL(location!);

      expect(redirectUrl.origin).toBe(EXPECTED_REDIRECT_ORIGIN);
      expect(redirectUrl.pathname).toBe("/booking/test-booking-uid");
      expect(redirectUrl.searchParams.get("error")).toBe("Custom error");
    });

    it("should use WEBAPP_URL for error redirects (not localhost when behind proxy)", async () => {
      const { TRPCError } = await import("@trpc/server");

      mockConfirmHandler.mockRejectedValueOnce(new TRPCError({ code: "INTERNAL_SERVER_ERROR" }));

      const baseUrl = "https://self-hosted.company.org/api/link?action=accept&token=encrypted-token";
      const req = createMockRequest(baseUrl);

      const res = await GET(req, { params: Promise.resolve({}) });
      const location = res.headers.get("location");

      expect(location).toBeTruthy();
      const redirectUrl = new URL(location!);

      expect(redirectUrl.origin).toBe(EXPECTED_REDIRECT_ORIGIN);
      expect(location).not.toContain("localhost");
    });
  });

  describe("confirmHandler flow", () => {
    it("should call confirmHandler with correct arguments for accept action", async () => {
      const baseUrl = "https://app.example.com/api/link?action=accept&token=encrypted-token";
      const req = createMockRequest(baseUrl);

      await GET(req, { params: Promise.resolve({}) });

      expect(mockConfirmHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            bookingId: 1,
            confirmed: true,
            emailsEnabled: true,
          }),
        })
      );
    });

    it("should call confirmHandler with confirmed=false for reject action", async () => {
      const baseUrl = "https://app.example.com/api/link?action=reject&token=encrypted-token";
      const req = createMockRequest(baseUrl);

      await GET(req, { params: Promise.resolve({}) });

      expect(mockConfirmHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            bookingId: 1,
            confirmed: false,
            emailsEnabled: true,
          }),
        })
      );
    });

    it("should call confirmHandler with reason when provided in query params", async () => {
      const baseUrl =
        "https://app.example.com/api/link?action=reject&token=encrypted-token&reason=test-reason";
      const req = createMockRequest(baseUrl);

      await GET(req, { params: Promise.resolve({}) });

      expect(mockConfirmHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            bookingId: 1,
            confirmed: false,
            reason: "test-reason",
            emailsEnabled: true,
          }),
        })
      );
    });

    it("should pass recurringEventId when booking has one", async () => {
      // Update mock to return booking with recurringEventId
      vi.mocked(prisma.booking.findUniqueOrThrow).mockResolvedValueOnce({
        id: 1,
        uid: "test-booking-uid",
        recurringEventId: "recurring-123",
      } as Awaited<ReturnType<typeof prisma.booking.findUniqueOrThrow>>);

      const baseUrl = "https://app.example.com/api/link?action=accept&token=encrypted-token";
      const req = createMockRequest(baseUrl);

      await GET(req, { params: Promise.resolve({}) });

      expect(mockConfirmHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            bookingId: 1,
            recurringEventId: "recurring-123",
            confirmed: true,
          }),
        })
      );
    });

    it("should pass user context to confirmHandler", async () => {
      const baseUrl = "https://app.example.com/api/link?action=accept&token=encrypted-token";
      const req = createMockRequest(baseUrl);

      await GET(req, { params: Promise.resolve({}) });

      expect(mockConfirmHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          ctx: expect.objectContaining({
            user: expect.objectContaining({
              id: 1,
              uuid: "user-uuid",
              email: "test@example.com",
              username: "testuser",
              role: "USER",
            }),
          }),
        })
      );
    });

    it("should pass user context to confirmHandler input", async () => {
      const baseUrl = "https://app.example.com/api/link?action=accept&token=encrypted-token";
      const req = createMockRequest(baseUrl);

      await GET(req, { params: Promise.resolve({}) });

      // After EE removal, actor/actionSource are no longer passed to confirmHandler
      expect(mockConfirmHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            bookingId: 1,
            confirmed: true,
          }),
        })
      );
    });
  });
});
