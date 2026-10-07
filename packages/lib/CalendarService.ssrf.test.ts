import http from "node:http";
import https from "node:https";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@calcom/lib/crypto", () => ({
  symmetricDecrypt: vi.fn().mockImplementation((text) => JSON.stringify(text)),
}));

vi.mock("node:dns/promises", () => ({
  default: { lookup: vi.fn().mockResolvedValue([{ address: "93.184.215.14", family: 4 }]) },
}));

import BaseCalendarService from "./CalendarService";

const SERVER_URL = "https://caldav.example.com/";
const METADATA_URL = "http://169.254.169.254/latest/meta-data/";

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

type Scenario = {
  wellKnownLocation?: string;
  principalHref: string;
  homeHref: string;
  calendarHref: string;
};

const SAFE_SCENARIO: Scenario = {
  principalHref: "/principals/test/",
  homeHref: "/calendars/test/",
  calendarHref: "/calendars/test/work/",
};

const multistatus = (responses: string) =>
  `<?xml version="1.0" encoding="utf-8"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">${responses}</d:multistatus>`;

const propstat = (href: string, prop: string) =>
  `<d:response><d:href>${href}</d:href><d:propstat><d:prop>${prop}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;

/**
 * tsdav sends its requests through cross-fetch, i.e. node-fetch on top of http(s).request.
 * Every outgoing request is recorded with its original target and served by a local fake
 * CalDAV server, so nothing ever leaves the process even if a hostile URL were requested.
 */
describe("CalendarService - SSRF through CalDAV discovery responses (real tsdav)", () => {
  let server: http.Server;
  let port: number;
  let scenario: Scenario = SAFE_SCENARIO;
  const requests: string[] = [];
  const originalHttpRequest = http.request;

  const respond = (req: http.IncomingMessage, res: http.ServerResponse) => {
    const target = req.headers["x-original-target"];
    if (typeof target !== "string" || !target.startsWith(SERVER_URL)) {
      res.writeHead(404).end();
      return;
    }
    const path = new URL(target).pathname;
    const xml = (body: string) => {
      res.writeHead(207, { "content-type": "application/xml; charset=utf-8" }).end(multistatus(body));
    };

    if (path === "/.well-known/caldav") {
      if (scenario.wellKnownLocation) {
        res.writeHead(301, { location: scenario.wellKnownLocation }).end();
      } else {
        res.writeHead(404).end();
      }
      return;
    }
    if (path === "/") {
      xml(
        propstat(
          "/",
          `<d:current-user-principal><d:href>${scenario.principalHref}</d:href></d:current-user-principal>`
        )
      );
      return;
    }
    if (path === "/principals/test/") {
      xml(
        propstat(
          "/principals/test/",
          `<c:calendar-home-set><d:href>${scenario.homeHref}</d:href></c:calendar-home-set>`
        )
      );
      return;
    }
    if (path === "/calendars/test/") {
      xml(
        propstat("/calendars/test/", "<d:resourcetype><d:collection/></d:resourcetype>") +
          propstat(
            scenario.calendarHref,
            '<d:displayname>Work</d:displayname><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><c:supported-calendar-component-set><c:comp name="VEVENT"/><c:comp name="VTODO"/></c:supported-calendar-component-set>'
          )
      );
      return;
    }
    res.writeHead(404).end();
  };

  const intercept =
    (protocol: "http:" | "https:") =>
    (options: http.RequestOptions, callback?: (res: http.IncomingMessage) => void) => {
      const target = `${protocol}//${options.hostname}${options.port ? `:${options.port}` : ""}${options.path}`;
      requests.push(`${options.method} ${target}`);
      return originalHttpRequest(
        {
          method: options.method,
          path: options.path,
          protocol: "http:",
          hostname: "127.0.0.1",
          port,
          headers: { ...options.headers, "x-original-target": target },
        },
        callback
      );
    };

  beforeAll(async () => {
    server = http.createServer(respond);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
    vi.spyOn(http, "request").mockImplementation(intercept("http:") as typeof http.request);
    vi.spyOn(https, "request").mockImplementation(intercept("https:") as typeof https.request);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    requests.length = 0;
    scenario = SAFE_SCENARIO;
  });

  const metadataRequests = () => requests.filter((r) => r.includes("169.254.169.254"));
  const listCalendarsError = (): Promise<unknown> =>
    new CalDavCalendarService().listCalendars().then(
      () => null,
      (error: unknown) => error
    );

  it("lists calendars from a well-behaved server", async () => {
    const calendars = await new CalDavCalendarService().listCalendars();

    expect(calendars).toEqual([
      expect.objectContaining({
        externalId: "https://caldav.example.com/calendars/test/work/",
        name: "Work",
        integration: "caldav_calendar",
      }),
    ]);
    expect(requests).toEqual([
      "PROPFIND https://caldav.example.com/.well-known/caldav",
      "PROPFIND https://caldav.example.com/",
      "PROPFIND https://caldav.example.com/principals/test/",
      "PROPFIND https://caldav.example.com/calendars/test/",
    ]);
  });

  it("does not follow a current-user-principal href pointing at cloud metadata", async () => {
    scenario = { ...SAFE_SCENARIO, principalHref: METADATA_URL };

    const error = await listCalendarsError();

    expect(metadataRequests()).toEqual([]);
    expect(error).toEqual(expect.objectContaining({ message: "URL is not allowed" }));
  });

  it("does not follow a calendar-home-set href pointing at cloud metadata", async () => {
    scenario = { ...SAFE_SCENARIO, homeHref: METADATA_URL };

    const error = await listCalendarsError();

    expect(metadataRequests()).toEqual([]);
    expect(error).toEqual(expect.objectContaining({ message: "URL is not allowed" }));
  });

  it("does not follow a .well-known redirect pointing at cloud metadata", async () => {
    scenario = { ...SAFE_SCENARIO, wellKnownLocation: METADATA_URL };

    const error = await listCalendarsError();

    expect(metadataRequests()).toEqual([]);
    expect(error).toEqual(expect.objectContaining({ message: "URL is not allowed" }));
  });

  it("does not query a calendar href pointing at cloud metadata", async () => {
    scenario = { ...SAFE_SCENARIO, calendarHref: METADATA_URL };

    const error = await listCalendarsError();

    expect(metadataRequests()).toEqual([]);
    expect(error).toEqual(expect.objectContaining({ message: "URL is not allowed" }));
  });
});
