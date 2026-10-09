import { beforeEach, describe, expect, it, vi } from "vitest";

const { getEventTypesFromDB, getBookingFieldsWithSystemFields, getDefaultEvent } = vi.hoisted(() => ({
  getEventTypesFromDB: vi.fn(),
  getBookingFieldsWithSystemFields: vi.fn(),
  getDefaultEvent: vi.fn(),
}));

vi.mock("../getEventTypesFromDB", () => ({ getEventTypesFromDB }));
vi.mock("../../getBookingFields", () => ({ getBookingFieldsWithSystemFields }));
vi.mock("@calcom/features/eventtypes/lib/defaultEvents", () => ({ getDefaultEvent }));
vi.mock("@calcom/lib/sentryWrapper", () => ({
  withReporting: <T extends unknown[], R>(fn: (...args: T) => R) => fn,
}));

import { getEventType } from "../getEventType";

describe("getEventType", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the DB event type as is, without recomputing its booking fields", async () => {
    const dbEventType = { id: 1, team: { parentId: 2 }, bookingFields: [{ name: "name" }] };
    getEventTypesFromDB.mockResolvedValue(dbEventType);

    const result = await getEventType({ eventTypeId: 1 });

    expect(result).toBe(dbEventType);
    expect(getEventTypesFromDB).toHaveBeenCalledWith(1);
    expect(getBookingFieldsWithSystemFields).not.toHaveBeenCalled();
  });

  it("adds the system booking fields to the dynamic event", async () => {
    const defaultEvent = { id: 0, team: null, bookingFields: [] };
    const fieldsWithSystemFields = [{ name: "name" }, { name: "email" }];
    getDefaultEvent.mockReturnValue(defaultEvent);
    getBookingFieldsWithSystemFields.mockReturnValue(fieldsWithSystemFields);

    const result = await getEventType({ eventTypeId: 0, eventTypeSlug: "15" });

    expect(getEventTypesFromDB).not.toHaveBeenCalled();
    expect(getBookingFieldsWithSystemFields).toHaveBeenCalledWith({ ...defaultEvent, isOrgTeamEvent: false });
    expect(result).toEqual({ ...defaultEvent, bookingFields: fieldsWithSystemFields });
  });

  it("rejects when neither an id nor a slug is given", async () => {
    await expect(getEventType({ eventTypeId: 0 })).rejects.toThrow(
      "Either eventTypeId or eventTypeSlug must be provided"
    );
  });
});
