import type { CalendarServiceEvent } from "@calcom/types/Calendar";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type RecordedRequest = {
  method: string;
  url: string;
  authorization: string | null;
  body: string | undefined;
  guarded: boolean;
};

/**
 * tsdav binds globalThis.fetch when it is imported, so the fake has to be installed before the
 * import. It records every request and answers through `network.handle`, so nothing ever leaves
 * the process even if a hostile URL were requested. Callers that do not go through the
 * SSRF-protected fetch (which always sends redirect: "manual") get redirects followed like native
 * fetch does, so a forgotten fetch override would show up as a request to the forbidden target.
 */
const network = vi.hoisted(() => {
  const state = {
    requests: [] as RecordedRequest[],
    handle: (_request: RecordedRequest): Response => new Response(null, { status: 404 }),
  };
  const fakeFetch = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    let url = input instanceof Request ? input.url : input.toString();
    for (let hop = 0; hop < 10; hop++) {
      const request: RecordedRequest = {
        method: (init.method ?? "GET").toUpperCase(),
        url,
        authorization: new Headers(init.headers).get("authorization"),
        body: typeof init.body === "string" ? init.body : undefined,
        guarded: init.redirect === "manual",
      };
      state.requests.push(request);
      const response = state.handle(request);
      const location = response.headers.get("location");
      if (init.redirect === "manual" || !location) return response;
      url = new URL(location, url).href;
    }
    throw new Error("Too many redirects in fake fetch");
  };
  globalThis.fetch = fakeFetch as typeof fetch;
  return state;
});

vi.mock("@calcom/lib/crypto", () => ({
  symmetricDecrypt: vi.fn().mockImplementation((text) => JSON.stringify(text)),
}));

vi.mock("node:dns/promises", () => ({
  default: { lookup: vi.fn().mockResolvedValue([{ address: "93.184.215.14", family: 4 }]) },
}));

import BaseCalendarService from "./CalendarService";

const SERVER_URL = "https://caldav.example.com/";
const OTHER_PUBLIC_ORIGIN = "https://caldav-mirror.example.net";
const METADATA_URL = "http://169.254.169.254/latest/meta-data/";
const CALENDAR_PATH = "/calendars/test/work/";
const EVENT_UID = "event-1";

class CalDavCalendarService extends BaseCalendarService {
  constructor() {
    super(
      {
        id: 1,
        type: "caldav_calendar",
        delegationCredentialId: null,
        user: { email: "test@example.com" },
        userId: 1,
        teamId: null,
        appId: "caldav",
        invalid: false,
        key: { username: "test", password: "test", url: SERVER_URL },
        encryptedKey: null,
      },
      "caldav_calendar"
    );
  }
}

type Redirect = { method: string; path?: string; status: number; location: string };

type Scenario = {
  wellKnownLocation?: string;
  principalHref: string;
  homeHref: string;
  calendarHref: string;
  otherCalendarHref?: string;
  omitExpandedCalendarData?: boolean;
  /** Overrides the answer to the REPORTs sent to the calendar */
  calendarReport?: (body: string) => Response;
  /** Status returned to every request of that method on the calendar */
  writeStatus?: { method: string; status: number };
  redirect?: Redirect;
};

const SAFE_SCENARIO: Scenario = {
  principalHref: "/principals/test/",
  homeHref: "/calendars/test/",
  calendarHref: CALENDAR_PATH,
};

const ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//test//EN",
  "BEGIN:VEVENT",
  `UID:${EVENT_UID}`,
  "DTSTAMP:20230101T000000Z",
  "DTSTART:20230101T100000Z",
  "DTEND:20230101T110000Z",
  "SUMMARY:Busy",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const multistatus = (responses: string) =>
  `<?xml version="1.0" encoding="utf-8"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">${responses}</d:multistatus>`;

const xmlResponse = (responses: string) =>
  new Response(multistatus(responses), {
    status: 207,
    headers: { "content-type": "application/xml; charset=utf-8" },
  });

const propstat = (href: string, prop: string) =>
  `<d:response><d:href>${href}</d:href><d:propstat><d:prop>${prop}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;

const notFound = (href: string) =>
  `<d:response><d:href>${href}</d:href><d:status>HTTP/1.1 404 Not Found</d:status></d:response>`;

const calendarEntry = (href: string, name: string) =>
  propstat(
    href,
    `<d:displayname>${name}</d:displayname><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><c:supported-calendar-component-set><c:comp name="VEVENT"/><c:comp name="VTODO"/></c:supported-calendar-component-set>`
  );

const eventEntry = (withData = true) =>
  propstat(
    `${CALENDAR_PATH}${EVENT_UID}.ics`,
    `<d:getetag>"etag-1"</d:getetag>${withData ? `<c:calendar-data><![CDATA[${ICS}]]></c:calendar-data>` : ""}`
  );

const SIBLING_HREF = `${CALENDAR_PATH}sibling.ics`;

// Listed by the expanded query without calendar-data, as servers do for objects they cannot expand
const siblingWithoutData = propstat(SIBLING_HREF, `<d:getetag>"etag-2"</d:getetag>`);

const createMockEvent = (): CalendarServiceEvent => ({
  type: "caldav",
  uid: EVENT_UID,
  title: "Test Event",
  startTime: "2023-01-01T10:00:00Z",
  endTime: "2023-01-01T11:00:00Z",
  organizer: {
    name: "Test",
    email: "test@example.com",
    timeZone: "UTC",
    language: { translate: ((key: string) => key) as never, locale: "en" },
  },
  attendees: [],
  calendarDescription: "Test Description",
});

describe("CalendarService - SSRF through CalDAV responses (real tsdav)", () => {
  let scenario: Scenario = SAFE_SCENARIO;

  const serve = ({ method, url, body = "" }: RecordedRequest): Response => {
    const target = new URL(url);
    if (target.origin !== new URL(SERVER_URL).origin && target.origin !== OTHER_PUBLIC_ORIGIN) {
      return new Response(null, { status: 404 });
    }
    const path = target.pathname;
    const { redirect } = scenario;
    const isRedirected =
      redirect?.method === method &&
      target.origin === new URL(SERVER_URL).origin &&
      (redirect.path === undefined || redirect.path === path);
    if (redirect && isRedirected) {
      return new Response(null, { status: redirect.status, headers: { location: redirect.location } });
    }
    const xml = xmlResponse;

    if (path === "/.well-known/caldav") {
      return scenario.wellKnownLocation
        ? new Response(null, { status: 301, headers: { location: scenario.wellKnownLocation } })
        : new Response(null, { status: 404 });
    }
    if (method === "PROPFIND" && path === "/") {
      return xml(
        propstat(
          "/",
          `<d:current-user-principal><d:href>${scenario.principalHref}</d:href></d:current-user-principal>`
        )
      );
    }
    if (method === "PROPFIND" && path === "/principals/test/") {
      return xml(
        propstat(
          "/principals/test/",
          `<c:calendar-home-set><d:href>${scenario.homeHref}</d:href></c:calendar-home-set>`
        )
      );
    }
    if (method === "PROPFIND" && path === "/calendars/test/") {
      return xml(
        propstat("/calendars/test/", "<d:resourcetype><d:collection/></d:resourcetype>") +
          calendarEntry(scenario.calendarHref, "Work") +
          (scenario.otherCalendarHref ? calendarEntry(scenario.otherCalendarHref, "Home") : "")
      );
    }
    if (method === "REPORT" && path === CALENDAR_PATH) {
      if (scenario.calendarReport) return scenario.calendarReport(body);
      if (body.includes("calendar-multiget")) return xml(eventEntry());
      const expanded = body.includes("expand");
      return xml(eventEntry(expanded && !scenario.omitExpandedCalendarData));
    }
    if (method === "REPORT" && path === scenario.otherCalendarHref) {
      return xml(notFound(`${scenario.otherCalendarHref}${EVENT_UID}.ics`));
    }
    if (scenario.writeStatus?.method === method && path.startsWith(CALENDAR_PATH)) {
      return new Response(null, { status: scenario.writeStatus.status });
    }
    if (method === "PUT" && path.startsWith(CALENDAR_PATH)) return new Response(null, { status: 201 });
    if (method === "DELETE" && path.startsWith(CALENDAR_PATH)) return new Response(null, { status: 204 });
    return new Response(null, { status: 404 });
  };

  beforeEach(() => {
    network.requests.length = 0;
    network.handle = serve;
    scenario = SAFE_SCENARIO;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const requestLines = () => network.requests.map(({ method, url }) => `${method} ${url}`);
  const metadataRequests = () => requestLines().filter((line) => line.includes("169.254.169.254"));
  const errorOf = (promise: Promise<unknown>): Promise<unknown> =>
    promise.then(
      () => null,
      (error: unknown) => error
    );
  const listCalendarsError = () => errorOf(new CalDavCalendarService().listCalendars());
  const getAvailability = () =>
    new CalDavCalendarService().getAvailability({
      dateFrom: "2023-01-01T00:00:00Z",
      dateTo: "2023-01-02T00:00:00Z",
      selectedCalendars: [
        { externalId: `https://caldav.example.com${CALENDAR_PATH}`, integration: "caldav" },
      ],
      mode: "slots",
    });
  const notAllowed = expect.objectContaining({ message: "URL is not allowed" });

  it("lists calendars from a well-behaved server, every request going through the SSRF-protected fetch", async () => {
    const calendars = await new CalDavCalendarService().listCalendars();

    expect(calendars).toEqual([
      expect.objectContaining({
        externalId: "https://caldav.example.com/calendars/test/work/",
        name: "Work",
        integration: "caldav_calendar",
      }),
    ]);
    expect(requestLines()).toEqual([
      "PROPFIND https://caldav.example.com/.well-known/caldav",
      "GET https://caldav.example.com/.well-known/caldav",
      "PROPFIND https://caldav.example.com/",
      "PROPFIND https://caldav.example.com/principals/test/",
      "PROPFIND https://caldav.example.com/calendars/test/",
    ]);
    expect(network.requests.every((request) => request.guarded)).toBe(true);
  });

  it("does not follow a current-user-principal href pointing at cloud metadata", async () => {
    scenario = { ...SAFE_SCENARIO, principalHref: METADATA_URL };

    const error = await listCalendarsError();

    expect(metadataRequests()).toEqual([]);
    expect(error).toEqual(notAllowed);
  });

  it("does not follow a calendar-home-set href pointing at cloud metadata", async () => {
    scenario = { ...SAFE_SCENARIO, homeHref: METADATA_URL };

    const error = await listCalendarsError();

    expect(metadataRequests()).toEqual([]);
    expect(error).toEqual(notAllowed);
  });

  it("does not follow a .well-known redirect pointing at cloud metadata", async () => {
    scenario = { ...SAFE_SCENARIO, wellKnownLocation: METADATA_URL };

    const error = await listCalendarsError();

    expect(metadataRequests()).toEqual([]);
    expect(error).toEqual(notAllowed);
  });

  it("does not query a calendar href pointing at cloud metadata", async () => {
    scenario = { ...SAFE_SCENARIO, calendarHref: METADATA_URL };

    const error = await listCalendarsError();

    expect(metadataRequests()).toEqual([]);
    expect(error).toEqual(notAllowed);
  });

  describe.each([302, 307])("HTTP %i redirect to cloud metadata", (status) => {
    it("is blocked during account discovery", async () => {
      scenario = {
        ...SAFE_SCENARIO,
        redirect: { method: "PROPFIND", path: "/", status, location: METADATA_URL },
      };

      const error = await listCalendarsError();

      expect(metadataRequests()).toEqual([]);
      expect(error).toEqual(notAllowed);
    });

    it("is blocked while listing calendars", async () => {
      scenario = {
        ...SAFE_SCENARIO,
        redirect: { method: "PROPFIND", path: "/calendars/test/", status, location: METADATA_URL },
      };

      const error = await listCalendarsError();

      expect(metadataRequests()).toEqual([]);
      expect(error).toEqual(notAllowed);
    });

    it("is blocked on the availability REPORT, which fails availability", async () => {
      scenario = { ...SAFE_SCENARIO, redirect: { method: "REPORT", status, location: METADATA_URL } };

      const error = await errorOf(getAvailability());

      expect(metadataRequests()).toEqual([]);
      expect(error).toEqual(notAllowed);
    });

    it("is blocked on the REPORT looking up an event by uid", async () => {
      scenario = { ...SAFE_SCENARIO, redirect: { method: "REPORT", status, location: METADATA_URL } };

      const error = await errorOf(new CalDavCalendarService().deleteEvent(EVENT_UID));

      expect(metadataRequests()).toEqual([]);
      expect(error).toEqual(notAllowed);
      expect(requestLines().filter((line) => line.startsWith("DELETE"))).toEqual([]);
    });
  });

  it("blocks a 307 redirect of an event PUT to cloud metadata", async () => {
    scenario = { ...SAFE_SCENARIO, redirect: { method: "PUT", status: 307, location: METADATA_URL } };

    const error = await errorOf(new CalDavCalendarService().createEvent(createMockEvent(), 1));

    expect(metadataRequests()).toEqual([]);
    expect(error).toEqual(notAllowed);
  });

  it("blocks a 307 redirect of an event DELETE to cloud metadata", async () => {
    scenario = { ...SAFE_SCENARIO, redirect: { method: "DELETE", status: 307, location: METADATA_URL } };

    const error = await errorOf(new CalDavCalendarService().deleteEvent(EVENT_UID));

    expect(metadataRequests()).toEqual([]);
    expect(error).toEqual(notAllowed);
  });

  describe.each([301, 302, 303])("event write answered with an HTTP %i", (status) => {
    const writeFailed = (action: string) =>
      expect.objectContaining({ message: `Error ${action} event: CalDAV server answered ${status}` });
    const writes = () => requestLines().filter((line) => /^(PUT|DELETE) /.test(line));
    const EVENT_URL = `https://caldav.example.com${CALENDAR_PATH}${EVENT_UID}.ics`;

    it("rejects the create without replaying the PUT", async () => {
      scenario = { ...SAFE_SCENARIO, redirect: { method: "PUT", status, location: METADATA_URL } };

      const error = await errorOf(new CalDavCalendarService().createEvent(createMockEvent(), 1));

      expect(metadataRequests()).toEqual([]);
      expect(writes()).toEqual([`PUT ${EVENT_URL}`]);
      expect(error).toEqual(writeFailed("creating"));
    });

    it("rejects the update without replaying the PUT", async () => {
      scenario = { ...SAFE_SCENARIO, redirect: { method: "PUT", status, location: METADATA_URL } };

      const error = await errorOf(new CalDavCalendarService().updateEvent(EVENT_UID, createMockEvent()));

      expect(metadataRequests()).toEqual([]);
      expect(writes()).toEqual([`PUT ${EVENT_URL}`]);
      expect(error).toEqual(writeFailed("updating"));
    });

    it("rejects the delete without replaying the DELETE", async () => {
      scenario = { ...SAFE_SCENARIO, redirect: { method: "DELETE", status, location: METADATA_URL } };

      const error = await errorOf(new CalDavCalendarService().deleteEvent(EVENT_UID));

      expect(metadataRequests()).toEqual([]);
      expect(writes()).toEqual([`DELETE ${EVENT_URL}`]);
      expect(error).toEqual(writeFailed("deleting"));
    });
  });

  it("rejects an update the server refuses", async () => {
    scenario = { ...SAFE_SCENARIO, writeStatus: { method: "PUT", status: 412 } };

    const error = await errorOf(new CalDavCalendarService().updateEvent(EVENT_UID, createMockEvent()));

    expect(error).toEqual(
      expect.objectContaining({
        message: expect.stringContaining("Error updating event: CalDAV server answered 412"),
      })
    );
  });

  it.each([404, 410])("treats a DELETE answered with %i as an event already deleted", async (status) => {
    scenario = { ...SAFE_SCENARIO, writeStatus: { method: "DELETE", status } };

    await expect(new CalDavCalendarService().deleteEvent(EVENT_UID)).resolves.toBeUndefined();
  });

  it("follows a redirect to another public origin without sending the credentials there", async () => {
    scenario = {
      ...SAFE_SCENARIO,
      redirect: { method: "PROPFIND", path: "/", status: 307, location: `${OTHER_PUBLIC_ORIGIN}/` },
    };

    const calendars = await new CalDavCalendarService().listCalendars();

    expect(calendars).toHaveLength(1);
    const [original, redirected] = network.requests.filter(
      (request) => request.method === "PROPFIND" && new URL(request.url).pathname === "/"
    );
    expect(original).toEqual(
      expect.objectContaining({ url: SERVER_URL, authorization: expect.stringMatching(/^Basic /) })
    );
    expect(redirected).toEqual(
      expect.objectContaining({
        url: `${OTHER_PUBLIC_ORIGIN}/`,
        authorization: null,
        body: expect.stringContaining("current-user-principal"),
      })
    );
  });

  it("deletes an event held by only one of several calendars", async () => {
    scenario = { ...SAFE_SCENARIO, otherCalendarHref: "/calendars/test/home/" };

    await new CalDavCalendarService().deleteEvent(EVENT_UID);

    expect(requestLines().filter((line) => line.startsWith("DELETE"))).toEqual([
      `DELETE https://caldav.example.com${CALENDAR_PATH}${EVENT_UID}.ics`,
    ]);
  });

  it("falls back to a non-expanded query when the server omits expanded calendar-data", async () => {
    scenario = { ...SAFE_SCENARIO, omitExpandedCalendarData: true };

    const busy = await getAvailability();

    expect(busy).toEqual([{ start: "2023-01-01T10:00:00.000Z", end: "2023-01-01T11:00:00.000Z" }]);
  });

  describe("availability with objects the server does not return in full", () => {
    const BUSY = [{ start: "2023-01-01T10:00:00.000Z", end: "2023-01-01T11:00:00.000Z" }];
    const multigetBodies = () =>
      network.requests
        .filter((request) => request.method === "REPORT" && request.body?.includes("calendar-multiget"))
        .map((request) => request.body ?? "");

    it("keeps the busy event when an expanded sibling without data is gone at the multiget", async () => {
      scenario = {
        ...SAFE_SCENARIO,
        calendarReport: (body) =>
          body.includes("calendar-multiget")
            ? xmlResponse(notFound(SIBLING_HREF))
            : xmlResponse(eventEntry() + siblingWithoutData),
      };

      const busy = await getAvailability();

      expect(busy).toEqual(BUSY);
      const [multiget, ...others] = multigetBodies();
      expect(others).toEqual([]);
      expect(multiget).toContain(SIBLING_HREF);
      expect(multiget).not.toContain(`${EVENT_UID}.ics`);
    });

    it("keeps the busy event fetched by the multiget next to a sibling that is gone", async () => {
      scenario = {
        ...SAFE_SCENARIO,
        calendarReport: (body) =>
          body.includes("calendar-multiget")
            ? xmlResponse(eventEntry() + notFound(SIBLING_HREF))
            : xmlResponse(eventEntry(false) + siblingWithoutData),
      };

      const busy = await getAvailability();

      expect(busy).toEqual(BUSY);
    });

    it("fails availability when the multiget cannot return an object that still exists", async () => {
      scenario = {
        ...SAFE_SCENARIO,
        calendarReport: (body) =>
          body.includes("calendar-multiget")
            ? xmlResponse(
                `<d:response><d:href>${SIBLING_HREF}</d:href><d:status>HTTP/1.1 500 Internal Server Error</d:status></d:response>`
              )
            : xmlResponse(eventEntry() + siblingWithoutData),
      };

      const error = await errorOf(getAvailability());

      expect(error).toEqual(expect.objectContaining({ message: expect.stringContaining("500") }));
    });

    it("fails availability when the multiget leaves an object out", async () => {
      scenario = {
        ...SAFE_SCENARIO,
        calendarReport: (body) =>
          body.includes("calendar-multiget")
            ? xmlResponse("")
            : xmlResponse(eventEntry() + siblingWithoutData),
      };

      const error = await errorOf(getAvailability());

      expect(error).toEqual(expect.objectContaining({ message: expect.stringContaining("0 of 1") }));
    });

    it("falls back to an unexpanded query when the server rejects the expanded one", async () => {
      scenario = {
        ...SAFE_SCENARIO,
        calendarReport: (body) =>
          body.includes("expand") ? new Response(null, { status: 501 }) : xmlResponse(eventEntry()),
      };

      const busy = await getAvailability();

      expect(busy).toEqual(BUSY);
    });

    it("fails availability instead of reporting a free calendar when the calendar cannot be queried", async () => {
      scenario = { ...SAFE_SCENARIO, calendarReport: () => new Response("oops", { status: 500 }) };

      const error = await errorOf(getAvailability());

      expect(error).toEqual(expect.objectContaining({ message: expect.stringContaining("500") }));
    });

    it("reports an empty calendar as free", async () => {
      scenario = { ...SAFE_SCENARIO, calendarReport: () => xmlResponse("") };

      const busy = await getAvailability();

      expect(busy).toEqual([]);
    });
  });
});
