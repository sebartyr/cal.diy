import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEventTypesPublic } from "./getEventTypesPublic";

const { mockQueryRaw } = vi.hoisted(() => ({
  mockQueryRaw: vi.fn(),
}));

vi.mock("@calcom/prisma", () => ({
  default: { $queryRaw: mockQueryRaw },
}));

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  title: "Intro",
  description: "**Hello**",
  length: 30,
  schedulingType: null,
  recurringEvent: null,
  slug: "intro",
  hidden: false,
  price: 0,
  currency: "usd",
  lockTimeZoneToggleOnBookingPage: false,
  lockedTimeZone: null,
  requiresConfirmation: false,
  requiresBookerEmailVerification: false,
  metadata: null,
  canSendCalVideoTranscriptionEmails: true,
  ...overrides,
});

describe("getEventTypesPublic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filters hidden event types in SQL and looks the user's event types up without joining users", async () => {
    mockQueryRaw.mockResolvedValue([]);

    await getEventTypesPublic(5);

    const [strings, ...values] = mockQueryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    const sql = strings.join("?");
    expect(sql.match(/"EventType"\."hidden" = false/g)).toHaveLength(2);
    expect(sql).not.toContain('INNER JOIN "users"');
    expect(sql).toContain('WHERE "uet1"."B" = ?');
    expect(values).toEqual([5, 5]);
  });

  it("returns an empty metadata object when the stored metadata is null", async () => {
    mockQueryRaw.mockResolvedValue([row({ metadata: null })]);

    const [eventType] = await getEventTypesPublic(5);

    expect(eventType.metadata).toEqual({});
    expect(eventType.descriptionAsSafeHTML).toContain("<strong>Hello</strong>");
  });

  it("keeps the parsed metadata and drops event types with invalid metadata", async () => {
    mockQueryRaw.mockResolvedValue([
      row({ id: 1, metadata: { multipleDuration: [15, 30], unknownKey: true } }),
      row({ id: 2, metadata: { multipleDuration: "not-an-array" } }),
    ]);

    const eventTypes = await getEventTypesPublic(5);

    expect(eventTypes.map((eventType) => eventType.id)).toEqual([1]);
    expect(eventTypes[0].metadata).toEqual({ multipleDuration: [15, 30] });
  });
});
