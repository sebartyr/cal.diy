import prismaMock from "@calcom/testing/lib/__mocks__/prisma";
import { getGoogleMeetCredential, TestData } from "@calcom/testing/lib/bookingScenario/bookingScenario";
import { describe, expect, it } from "vitest";
import { JitsiLocationType, MeetLocationType } from "../locations";
import getApps from "../utils";
import { getDefaultLocations } from "./getDefaultLocations";

type User = {
  id: number;
  email: string;
  name?: string;
  metadata: {
    defaultConferencingApp?: {
      appSlug: string;
      appLink: string;
    };
  };
  credentials?: [
    {
      key: {
        expiry_date?: number;
        token_type?: string;
        access_token?: string;
        refresh_token?: string;
        scope: string;
      };
    },
  ];
};
describe("getDefaultLocation ", async () => {
  it("should return location based on user default conferencing app", async () => {
    const user: User = {
      id: 101,
      email: "test@example.com",
      metadata: {
        defaultConferencingApp: {
          appSlug: "google-meet",
          appLink: "https://example.com",
        },
      },
      credentials: [getGoogleMeetCredential()],
    };
    await mockUser(user);
    await addAppsToDb([TestData.apps["google-meet"]]);
    const res = await getDefaultLocations(user);
    expect(res[0]).toEqual({
      link: "https://example.com",
      type: MeetLocationType,
    });
  });
  // The locations array alone proves nothing: EventManager resolves an adapter through
  // getApps(credentials, true) and falls back to FAKE_DAILY_CREDENTIAL when no credential
  // matches, so a fallback that is not global yields a Daily link instead of its own.
  it("resolves the jitsi fallback to a usable adapter with no installation", () => {
    const jitsi = getApps([], true).find((app) => app.slug === "jitsi");

    expect(jitsi?.locationOption?.value).toBe(JitsiLocationType);
    expect(jitsi?.credentials?.[0]?.type).toContain("jitsi");
  });

  it("falls back to jitsi when neither the user nor the deployment picked one", async () => {
    const user: User = {
      id: 101,
      email: "test@example.com",
      metadata: {},
    };
    await mockUser(user);
    await enableAppInDb("jitsi", "jitsivideo");
    const res = await getDefaultLocations(user);
    expect(res[0]).toEqual({ type: JitsiLocationType });
  });

  it("uses the deployment default when the user has not picked one", async () => {
    const user: User = {
      id: 102,
      email: "deployment-default@example.com",
      metadata: {},
    };
    await mockUser(user);
    await enableAppInDb("google-meet", "googlevideo");
    const res = await getDefaultLocations(user, "google-meet");
    expect(res[0]).toEqual({ type: MeetLocationType });
  });

  // A slug that no longer resolves to an app must not yield an empty location list: that is
  // what produced event types with no location and bookings with no meeting URL.
  it("falls back to jitsi when the deployment default names an unknown app", async () => {
    const user: User = {
      id: 103,
      email: "unknown-default@example.com",
      metadata: {},
    };
    await mockUser(user);
    await enableAppInDb("jitsi", "jitsivideo");
    const res = await getDefaultLocations(user, "an-app-that-does-not-exist");
    expect(res[0]).toEqual({ type: JitsiLocationType });
  });

  it("prefers the user pick over the deployment default", async () => {
    const user: User = {
      id: 104,
      email: "user-pick@example.com",
      metadata: {
        defaultConferencingApp: {
          appSlug: "google-meet",
          appLink: "https://example.com",
        },
      },
      credentials: [getGoogleMeetCredential()],
    };
    await mockUser(user);
    await addAppsToDb([TestData.apps["google-meet"]]);
    const res = await getDefaultLocations(user, "jitsi");
    expect(res[0]).toEqual({ link: "https://example.com", type: MeetLocationType });
  });

  // The user picked an app they no longer have a credential for.
  it("falls through to the deployment default when the user pick is not installed", async () => {
    const user: User = {
      id: 105,
      email: "stale-pick@example.com",
      metadata: {
        defaultConferencingApp: {
          appSlug: "google-meet",
          appLink: "https://example.com",
        },
      },
    };
    await mockUser(user);
    await enableAppInDb("jitsi", "jitsivideo");
    const res = await getDefaultLocations(user, "jitsi");
    expect(res[0]).toEqual({ type: JitsiLocationType });
  });

  // createMeeting() throws on a disabled app, so a location pointing at one yields a booking
  // with no meeting URL. An administrator can disable any app after making it the default.
  it("ignores a deployment default whose app is disabled", async () => {
    const user: User = {
      id: 106,
      email: "disabled-default@example.com",
      metadata: {},
    };
    await mockUser(user);
    await prismaMock.app.create({
      data: {
        slug: "google-meet",
        dirName: "googlevideo",
        categories: ["conferencing"],
        enabled: false,
        keys: {},
      } as any,
    });
    await enableAppInDb("jitsi", "jitsivideo");

    const res = await getDefaultLocations(user, "google-meet");
    expect(res[0]).toEqual({ type: JitsiLocationType });
  });

  // No location at all is recoverable: the host is prompted to pick one. A location that cannot
  // produce a link is not, it surfaces as a booking with no meeting URL.
  it("returns no location when every provider is disabled or unseeded", async () => {
    const user: User = {
      id: 107,
      email: "nothing-usable@example.com",
      metadata: {},
    };
    await mockUser(user);

    const res = await getDefaultLocations(user, "google-meet");
    expect(res).toEqual([]);
  });
});

async function mockUser(user: User) {
  const userToCreate: any = {
    ...TestData.users.example,
    ...user,
  };
  if (user.credentials) {
    userToCreate.credentials = {
      createMany: {
        data: user.credentials,
      },
    };
  }
  return await prismaMock.user.create({
    data: userToCreate,
  });
}
async function enableAppInDb(slug: string, dirName: string) {
  await prismaMock.app.create({
    data: { slug, dirName, categories: ["conferencing"], enabled: true, keys: {} } as any,
  });
}

async function addAppsToDb(apps: any[]) {
  await prismaMock.app.createMany({
    data: apps.map((app) => {
      return { ...app, enabled: true };
    }),
  });
}
