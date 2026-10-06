import { cleanup, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import BookingPageTagManager, {
  handleEvent,
  hasUnsafeTemplateValues,
  isSafeTemplateValue,
} from "./BookingPageTagManager";

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
      gtm: { enabled: true, trackingId: "GTM-123" },
    });
    expect(screen.queryAllByTestId("cal-analytics-app-ga4")).toHaveLength(0);
    expect(screen.getAllByTestId("cal-analytics-app-gtm")[0].innerHTML).toContain("GTM-123");
  });

  it("injects legitimate URL and ID values", () => {
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
    ["TRACKING_ID", { toString: () => "G-1" }],
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
