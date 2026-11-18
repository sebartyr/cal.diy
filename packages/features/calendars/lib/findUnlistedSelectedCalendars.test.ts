import { describe, expect, it } from "vitest";
import { findUnlistedSelectedCalendars } from "./findUnlistedSelectedCalendars";

const listedExternalIds = new Set(["me@new.example", "team@group.calendar.google.com"]);

const defaults = {
  listedExternalIds,
  credentialId: 31,
  integrationType: "google_calendar",
  isFirstCredentialOfType: true,
};

describe("findUnlistedSelectedCalendars", () => {
  it("returns a selected calendar the provider no longer lists", () => {
    const selectedCalendars = [
      { externalId: "me@new.example", integration: "google_calendar", credentialId: 31 },
      { externalId: "me@old.example", integration: "google_calendar", credentialId: 31 },
    ];

    expect(findUnlistedSelectedCalendars({ ...defaults, selectedCalendars })).toEqual([
      { externalId: "me@old.example", integration: "google_calendar", credentialId: 31 },
    ]);
  });

  it("attaches a selection without credential to the first credential of its type", () => {
    const selectedCalendars = [
      { externalId: "me@old.example", integration: "google_calendar", credentialId: null },
    ];

    expect(findUnlistedSelectedCalendars({ ...defaults, selectedCalendars })).toHaveLength(1);
    expect(
      findUnlistedSelectedCalendars({ ...defaults, selectedCalendars, isFirstCredentialOfType: false })
    ).toEqual([]);
  });

  it("treats a selection loaded without its credentialId like a legacy one", () => {
    const selectedCalendars = [{ externalId: "me@old.example", integration: "google_calendar" }];

    expect(findUnlistedSelectedCalendars({ ...defaults, selectedCalendars })).toHaveLength(1);
  });

  it("ignores selections that belong to another credential", () => {
    const selectedCalendars = [
      { externalId: "other@old.example", integration: "google_calendar", credentialId: 42 },
    ];

    expect(findUnlistedSelectedCalendars({ ...defaults, selectedCalendars })).toEqual([]);
  });

  it("ignores selections of another integration", () => {
    const selectedCalendars = [
      { externalId: "me@old.example", integration: "office365_calendar", credentialId: 31 },
    ];

    expect(findUnlistedSelectedCalendars({ ...defaults, selectedCalendars })).toEqual([]);
  });

  it("returns each unlisted calendar once", () => {
    const selectedCalendars = [
      { externalId: "me@old.example", integration: "google_calendar", credentialId: 31 },
      { externalId: "me@old.example", integration: "google_calendar", credentialId: null },
    ];

    expect(findUnlistedSelectedCalendars({ ...defaults, selectedCalendars })).toHaveLength(1);
  });
});
