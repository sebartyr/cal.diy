import { cleanup, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { ANALYTICS_APP_POLICIES, isAllowedScriptUrl } from "./_utils/analyticsScriptPolicy";
import BookingPageTagManager, {
  handleEvent,
  hasUnsafeTemplateValues,
  isSafeTemplateValue,
} from "./BookingPageTagManager";
import { appStoreMetadata } from "./bookerAppsMetaData";

// NOTE:  We don't intentionally mock appStoreMetadata as that also tests config.json and generated files for us for no cost. If it becomes a pain in future, we could just start mocking it.

vi.mock("next/script", () => {
  return {
    default: ({ ...props }) => {
      return <div {...props} />;
    },
  };
});

const windowProps: string[] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setOnWindow(prop: any, value: any) {
  window[prop] = value;
  windowProps.push(prop);
}

afterEach(() => {
  vi.unstubAllEnvs();
  windowProps.forEach((prop) => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //@ts-expect-error
    delete window[prop];
  });
  windowProps.splice(0);
  cleanup();
});

describe("BookingPageTagManager", () => {
  it("GTM App when enabled should have its scripts added with appropriate trackingID and $pushEvent replacement", () => {
    vi.stubEnv("NEXT_PUBLIC_ANALYTICS_ALLOW_GTM", "true");
    const GTM_CONFIG = {
      enabled: true,
      trackingId: "GTM-123",
    };
    render(
      <BookingPageTagManager
        eventType={{
          metadata: {
            apps: {
              gtm: GTM_CONFIG,
            },
          },
          price: 0,
          currency: "USD",
        }}
      />
    );
    const scripts = screen.getAllByTestId("cal-analytics-app-gtm");
    const trackingScript = scripts[0];
    const pushEventScript = scripts[1];
    expect(trackingScript.innerHTML).toContain(GTM_CONFIG.trackingId);
    expect(pushEventScript.innerHTML).toContain("cal_analytics_app__gtm");
  });

  it("GTM App when disabled should not have its scripts added", () => {
    const GTM_CONFIG = {
      enabled: false,
      trackingId: "GTM-123",
    };
    render(
      <BookingPageTagManager
        eventType={{
          metadata: {
            apps: {
              gtm: GTM_CONFIG,
            },
          },
          price: 0,
          currency: "USD",
        }}
      />
    );
    const scripts = screen.queryAllByTestId("cal-analytics-app-gtm");
    expect(scripts.length).toBe(0);
  });

  it("should not add scripts for an app that doesnt have tag defined(i.e. non-analytics app)", () => {
    render(
      <BookingPageTagManager
        eventType={{
          metadata: {
            apps: {
              zoomvideo: {
                enabled: true,
              },
            },
          },
          price: 0,
          currency: "USD",
        }}
      />
    );
    const scripts = screen.queryAllByTestId("cal-analytics-app-zoomvideo");
    expect(scripts.length).toBe(0);
  });

  it("should not crash for an app that doesnt exist", () => {
    render(
      <BookingPageTagManager
        eventType={{
          metadata: {
            apps: {
              //@ts-expect-error Testing for non-existent app
              nonexistentapp: {
                enabled: true,
              },
            },
          },
          price: 0,
          currency: "USD",
        }}
      />
    );
    const scripts = screen.queryAllByTestId("cal-analytics-app-zoomvideo");
    expect(scripts.length).toBe(0);
  });
});

describe("BookingPageTagManager template value sanitization", () => {
  type EventTypeMetadata = Parameters<typeof BookingPageTagManager>[0]["eventType"]["metadata"];
  // Values deliberately bypass the per-app zod schemas, as a crafted update or legacy row would.
  const renderWithApps = (apps: Record<string, unknown>) =>
    render(
      <BookingPageTagManager
        eventType={{
          metadata: { apps } as unknown as EventTypeMetadata,
          price: 0,
          currency: "USD",
        }}
      />
    );

  it("does not inject GA4 scripts when trackingId tries to break out of the JS string", () => {
    renderWithApps({ ga4: { enabled: true, trackingId: "x');fetch('https://evil.example')//" } });
    expect(screen.queryAllByTestId("cal-analytics-app-ga4")).toHaveLength(0);
    expect(document.body.innerHTML).not.toContain("evil.example");
  });

  it("does not inject scripts when a value contains a closing script tag", () => {
    renderWithApps({ fathom: { enabled: true, trackingId: "</script><script>alert(1)</script>" } });
    expect(screen.queryAllByTestId("cal-analytics-app-fathom")).toHaveLength(0);
  });

  it("does not inject Umami when SCRIPT_URL is a javascript: URL", () => {
    renderWithApps({ umami: { enabled: true, SITE_ID: "abc", SCRIPT_URL: "javascript:alert(1)" } });
    expect(screen.queryAllByTestId("cal-analytics-app-umami")).toHaveLength(0);
  });

  it("does not inject Matomo when MATOMO_URL contains a quote", () => {
    renderWithApps({
      matomo: { enabled: true, SITE_ID: "1", MATOMO_URL: "https://m.example.com/';alert(1);//" },
    });
    expect(screen.queryAllByTestId("cal-analytics-app-matomo")).toHaveLength(0);
  });

  it("still injects other apps when one app is rejected", () => {
    renderWithApps({
      ga4: { enabled: true, trackingId: "x'+alert(1)+'" },
      fathom: { enabled: true, trackingId: "ABCDEF" },
    });
    expect(screen.queryAllByTestId("cal-analytics-app-ga4")).toHaveLength(0);
    expect(screen.getAllByTestId("cal-analytics-app-fathom")[0].getAttribute("data-site")).toBe("ABCDEF");
  });

  it("injects legitimate URL and ID values", () => {
    vi.stubEnv("NEXT_PUBLIC_ANALYTICS_ALLOWED_SCRIPT_ORIGINS", "https://matomo.example.com");
    renderWithApps({
      matomo: { enabled: true, SITE_ID: "7", MATOMO_URL: "https://matomo.example.com/sub" },
      umami: {
        enabled: true,
        SITE_ID: "4fb7fa4c-5b46-438d-94b3-3a8fb9bc2e8b",
        SCRIPT_URL: "https://cloud.umami.is/script.js",
      },
    });
    const matomoScripts = screen.getAllByTestId("cal-analytics-app-matomo");
    expect(matomoScripts[0].getAttribute("src")).toBe("https://matomo.example.com/sub/matomo.js");
    expect(matomoScripts[1].innerHTML).toContain("var u='https://matomo.example.com/sub/'");
    expect(matomoScripts[1].innerHTML).toContain("'setSiteId', '7'");
    const umamiScript = screen.getAllByTestId("cal-analytics-app-umami")[0];
    expect(umamiScript.getAttribute("src")).toBe("https://cloud.umami.is/script.js");
    expect(umamiScript.getAttribute("data-website-id")).toBe("4fb7fa4c-5b46-438d-94b3-3a8fb9bc2e8b");
  });
});

describe("BookingPageTagManager script source policy", () => {
  type EventTypeMetadata = Parameters<typeof BookingPageTagManager>[0]["eventType"]["metadata"];
  const renderWithApps = (apps: Record<string, unknown>) =>
    render(
      <BookingPageTagManager
        eventType={{
          metadata: { apps } as unknown as EventTypeMetadata,
          price: 0,
          currency: "USD",
        }}
      />
    );
  const ATTACKER_SCRIPT = "https://attacker.example/steal-session.js";

  it("does not inject Umami when SCRIPT_URL is a valid https URL on an attacker origin", () => {
    renderWithApps({ umami: { enabled: true, SITE_ID: "abc", SCRIPT_URL: ATTACKER_SCRIPT } });
    expect(screen.queryAllByTestId("cal-analytics-app-umami")).toHaveLength(0);
    expect(document.body.innerHTML).not.toContain("attacker.example");
  });

  it("does not inject Matomo when MATOMO_URL is a valid https URL on an attacker origin", () => {
    renderWithApps({ matomo: { enabled: true, SITE_ID: "1", MATOMO_URL: ATTACKER_SCRIPT } });
    expect(screen.queryAllByTestId("cal-analytics-app-matomo")).toHaveLength(0);
    expect(document.body.innerHTML).not.toContain("attacker.example");
  });

  it("does not inject PostHog when API_HOST points to an attacker origin loading array.js", () => {
    renderWithApps({
      posthog: { enabled: true, TRACKING_ID: "phc_abc", API_HOST: "https://attacker.example" },
    });
    expect(screen.queryAllByTestId("cal-analytics-app-posthog")).toHaveLength(0);
  });

  it.each([
    ["plausible", { PLAUSIBLE_URL: ATTACKER_SCRIPT, trackingId: "example.com" }],
    ["databuddy", { DATABUDDY_SCRIPT_URL: ATTACKER_SCRIPT, CLIENT_ID: "abc" }],
  ])("does not inject %s when its script URL is on an attacker origin", (appId, data) => {
    renderWithApps({ [appId]: { enabled: true, ...data } });
    expect(screen.queryAllByTestId(`cal-analytics-app-${appId}`)).toHaveLength(0);
  });

  it("does not inject Umami when SCRIPT_URL is missing and the src would stay a template", () => {
    renderWithApps({ umami: { enabled: true, SITE_ID: "abc" } });
    expect(screen.queryAllByTestId("cal-analytics-app-umami")).toHaveLength(0);
  });

  it("rejects attacker URLs disguised with userinfo or a lookalike subdomain", () => {
    renderWithApps({
      umami: { enabled: true, SITE_ID: "abc", SCRIPT_URL: "https://cloud.umami.is.attacker.example/s.js" },
      posthog: { enabled: true, TRACKING_ID: "phc_abc", API_HOST: "https://attackerposthog.com" },
    });
    expect(screen.queryAllByTestId("cal-analytics-app-umami")).toHaveLength(0);
    expect(screen.queryAllByTestId("cal-analytics-app-posthog")).toHaveLength(0);
  });

  it("rejects http URLs even on an allowed host", () => {
    renderWithApps({
      umami: { enabled: true, SITE_ID: "abc", SCRIPT_URL: "http://cloud.umami.is/script.js" },
    });
    expect(screen.queryAllByTestId("cal-analytics-app-umami")).toHaveLength(0);
  });

  it("injects apps whose scripts come from the default vendor origins", () => {
    renderWithApps({
      umami: { enabled: true, SITE_ID: "abc", SCRIPT_URL: "https://cloud.umami.is/script.js" },
      plausible: {
        enabled: true,
        PLAUSIBLE_URL: "https://plausible.io/js/script.js",
        trackingId: "example.com",
      },
      matomo: { enabled: true, SITE_ID: "3", MATOMO_URL: "https://acme.matomo.cloud" },
      posthog: { enabled: true, TRACKING_ID: "phc_abc", API_HOST: "https://eu.i.posthog.com" },
      databuddy: {
        enabled: true,
        CLIENT_ID: "abc",
        DATABUDDY_SCRIPT_URL: "https://cdn.databuddy.cc/databuddy.js",
        DATABUDDY_API_URL: "https://basket.databuddy.cc",
      },
      ga4: { enabled: true, trackingId: "G-ABC123" },
      fathom: { enabled: true, trackingId: "ABCDEF" },
      metapixel: { enabled: true, trackingId: "1234567890" },
      insihts: { enabled: true, SITE_ID: "abc" },
      twipla: { enabled: true, SITE_ID: "abc-123" },
    });
    for (const appId of [
      "umami",
      "plausible",
      "matomo",
      "posthog",
      "databuddy",
      "ga4",
      "fathom",
      "metapixel",
      "insihts",
      "twipla",
    ]) {
      expect(screen.queryAllByTestId(`cal-analytics-app-${appId}`).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByTestId("cal-analytics-app-matomo")[0].getAttribute("src")).toBe(
      "https://acme.matomo.cloud/matomo.js"
    );
  });

  it("injects a self-hosted origin only once the deployment allows it", () => {
    const apps = {
      umami: { enabled: true, SITE_ID: "abc", SCRIPT_URL: "https://stats.example.org/script.js" },
    };
    renderWithApps(apps);
    expect(screen.queryAllByTestId("cal-analytics-app-umami")).toHaveLength(0);
    cleanup();

    vi.stubEnv(
      "NEXT_PUBLIC_ANALYTICS_ALLOWED_SCRIPT_ORIGINS",
      " https://other.example , https://stats.example.org "
    );
    renderWithApps(apps);
    expect(screen.getAllByTestId("cal-analytics-app-umami")[0].getAttribute("src")).toBe(
      "https://stats.example.org/script.js"
    );
  });

  it("supports wildcard subdomain entries in the deployment allowlist", () => {
    vi.stubEnv("NEXT_PUBLIC_ANALYTICS_ALLOWED_SCRIPT_ORIGINS", "https://*.example.org");
    renderWithApps({ matomo: { enabled: true, SITE_ID: "1", MATOMO_URL: "https://matomo.example.org" } });
    expect(screen.getAllByTestId("cal-analytics-app-matomo")).toHaveLength(2);
  });

  it("does not inject GTM by default because containers can run arbitrary custom HTML", () => {
    renderWithApps({
      gtm: { enabled: true, trackingId: "GTM-123" },
      ga4: { enabled: true, trackingId: "G-1" },
    });
    expect(screen.queryAllByTestId("cal-analytics-app-gtm")).toHaveLength(0);
    expect(screen.getAllByTestId("cal-analytics-app-ga4").length).toBeGreaterThan(0);
  });

  it("injects GTM when the deployment opts in", () => {
    vi.stubEnv("NEXT_PUBLIC_ANALYTICS_ALLOW_GTM", "true");
    renderWithApps({ gtm: { enabled: true, trackingId: "GTM-123" } });
    expect(screen.getAllByTestId("cal-analytics-app-gtm")[0].innerHTML).toContain("'GTM-123'");
  });

  it("does not let GA4 load a GTM container through gtag.js", () => {
    renderWithApps({ ga4: { enabled: true, trackingId: "GTM-123" } });
    expect(screen.queryAllByTestId("cal-analytics-app-ga4")).toHaveLength(0);
  });

  it("has an explicit policy for every analytics app", () => {
    const tagApps = Object.entries(appStoreMetadata)
      .filter(([, app]) => app.appData?.tag && !app.isTemplate)
      .map(([appId]) => appId);
    expect(tagApps.length).toBeGreaterThan(0);
    for (const appId of tagApps) {
      expect(ANALYTICS_APP_POLICIES).toHaveProperty(appId);
    }
  });
});

describe("isAllowedScriptUrl", () => {
  it("matches wildcard entries on subdomains only", () => {
    expect(isAllowedScriptUrl("posthog", "https://us.i.posthog.com")).toBe(true);
    expect(isAllowedScriptUrl("posthog", "https://posthog.com")).toBe(false);
  });

  it("ignores non-https and malformed deployment entries", () => {
    vi.stubEnv("NEXT_PUBLIC_ANALYTICS_ALLOWED_SCRIPT_ORIGINS", "http://plain.example,not a url,https://");
    expect(isAllowedScriptUrl("umami", "http://plain.example/s.js")).toBe(false);
    expect(isAllowedScriptUrl("umami", "https://plain.example/s.js")).toBe(false);
  });

  it("rejects URLs with credentials and apps without a policy", () => {
    expect(isAllowedScriptUrl("umami", "https://user:pw@cloud.umami.is/script.js")).toBe(false);
    expect(isAllowedScriptUrl("unknown", "https://cloud.umami.is/script.js")).toBe(false);
  });
});

describe("isSafeTemplateValue", () => {
  it.each([
    ["TRACKING_ID", "G-ABC123"],
    ["TRACKING_ID", "GTM-XYZ"],
    ["SITE_ID", "4fb7fa4c-5b46-438d-94b3-3a8fb9bc2e8b"],
    ["SITE_ID", 42],
    ["TRACKING_EVENT", "Lead"],
    ["SCRIPT_URL", "https://cloud.umami.is/script.js"],
    ["MATOMO_URL", "http://matomo.example.com/sub"],
    ["API_HOST", "https://us.i.posthog.com"],
    ["DATABUDDY_SCRIPT_URL", "https://cdn.example.com/x.js?v=1&a=b"],
  ])("accepts %s=%s", (name, value) => {
    expect(isSafeTemplateValue(name, value)).toBe(true);
  });

  it.each([
    ["TRACKING_ID", "x');alert(1)//"],
    ["TRACKING_ID", 'x"'],
    ["TRACKING_ID", "a b"],
    ["TRACKING_ID", "a\\u0027"],
    ["SITE_ID", "<script>"],
    ["TRACKING_ID", { toString: (): string => "G-1" }],
    ["SCRIPT_URL", "javascript:alert(1)"],
    ["SCRIPT_URL", "data:text/javascript,alert(1)"],
    ["SCRIPT_URL", "//evil.example/x.js"],
    ["API_HOST", "https://x.example/'+alert(1)+'"],
    ["MATOMO_URL", "https://x.example/\nalert(1)"],
  ])("rejects %s=%s", (name, value) => {
    expect(isSafeTemplateValue(name, value)).toBe(false);
  });
});

describe("hasUnsafeTemplateValues", () => {
  it("ignores variables without a value and values not referenced by any template", () => {
    expect(hasUnsafeTemplateValues(["id={TRACKING_ID}", undefined], { OTHER: "';alert(1)//" })).toBe(false);
  });

  it("flags a referenced unsafe value", () => {
    expect(hasUnsafeTemplateValues(["gtag('{TRACKING_ID}')"], { TRACKING_ID: "');alert(1)//" })).toBe(true);
  });
});

describe("handleEvent", () => {
  it("should not push internal events to analytics apps", () => {
    expect(
      handleEvent({
        detail: {
          // Internal event
          type: "__abc",
        },
      })
    ).toBe(false);

    expect(
      handleEvent({
        detail: {
          // Not an internal event
          type: "_abc",
        },
      })
    ).toBe(true);
  });

  it("should call the function on window with the event name and data", () => {
    const pushEventXyz = vi.fn();
    const pushEventAnything = vi.fn();
    const pushEventRandom = vi.fn();
    const pushEventNotme = vi.fn();

    setOnWindow("cal_analytics_app__xyz", pushEventXyz);
    setOnWindow("cal_analytics_app__anything", pushEventAnything);
    setOnWindow("cal_analytics_app_random", pushEventRandom);
    setOnWindow("cal_analytics_notme", pushEventNotme);

    handleEvent({
      detail: {
        type: "abc",
        key: "value",
      },
    });

    expect(pushEventXyz).toHaveBeenCalledWith({
      name: "abc",
      data: {
        key: "value",
      },
    });

    expect(pushEventAnything).toHaveBeenCalledWith({
      name: "abc",
      data: {
        key: "value",
      },
    });

    expect(pushEventRandom).toHaveBeenCalledWith({
      name: "abc",
      data: {
        key: "value",
      },
    });

    expect(pushEventNotme).not.toHaveBeenCalled();
  });

  it("should not error if accidentally the value is not a function", () => {
    const pushEventNotAfunction = "abc";
    const pushEventAnything = vi.fn();
    setOnWindow("cal_analytics_app__notafun", pushEventNotAfunction);
    setOnWindow("cal_analytics_app__anything", pushEventAnything);

    handleEvent({
      detail: {
        type: "abc",
        key: "value",
      },
    });

    // No error for cal_analytics_app__notafun and pushEventAnything is called
    expect(pushEventAnything).toHaveBeenCalledWith({
      name: "abc",
      data: {
        key: "value",
      },
    });
  });
});
