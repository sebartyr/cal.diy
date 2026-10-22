import { faker } from "@faker-js/faker";
import { describe, expect, it, vi } from "vitest";

import {
  getLocation,
  getVideoCallPassword,
  getVideoCallUrlFromCalEvent,
} from "../CalEventParser";
import { buildCalendarEvent, buildVideoCallData } from "./builder";

vi.mock("@calcom/lib/constants", () => ({
  WEBAPP_URL: "http://localhost:3000",
  APP_NAME: "Cal.diy",
}));

vi.mock("short-uuid", () => ({
  __esModule: true,
  default: () => ({ fromUUID: () => "FAKE_UUID" }),
}));

describe("getLocation", () => {
  it("should return a meetingUrl for video call meetings", () => {
    const calEvent = buildCalendarEvent({
      videoCallData: buildVideoCallData({
        type: "jitsi_video",
      }),
    });

    expect(getLocation(calEvent)).toEqual(getVideoCallUrlFromCalEvent(calEvent));
  });
  it("should return an integration provider name from event", () => {
    const provideName = "Cal.diy";
    const calEvent = buildCalendarEvent({
      videoCallData: undefined,
      location: `integrations:${provideName}`,
    });

    expect(getLocation(calEvent)).toEqual(provideName);
  });
  it("should return a real-world location from event", () => {
    const calEvent = buildCalendarEvent({
      videoCallData: undefined,
      location: faker.location.streetAddress({ useFullAddress: true }),
    });

    expect(getLocation(calEvent)).toEqual(calEvent.location);
  });
});

describe("getVideoCallUrl", () => {
  it("should return the meeting url stored by the video app", () => {
    const calEvent = buildCalendarEvent({
      videoCallData: buildVideoCallData({
        type: "jitsi_video",
      }),
    });

    expect(getVideoCallUrlFromCalEvent(calEvent)).toEqual(calEvent.videoCallData?.url);
  });
});

describe("getVideoCallPassword", () => {
  it("should return the original password of the video call", () => {
    const calEvent = buildCalendarEvent();

    expect(getVideoCallPassword(calEvent.videoCallData)).toEqual(calEvent?.videoCallData?.password);
  });

  it("should return an empty password when there is no video call", () => {
    expect(getVideoCallPassword(undefined)).toEqual("");
  });
});
