import { getEventTypeAppData } from "@calcom/app-store/_utils/getEventTypeAppData";
import { appStoreMetadata } from "@calcom/app-store/bookerAppsMetaData";
import type { Tag } from "@calcom/app-store/types";
import { sdkActionManager } from "@calcom/lib/sdk-event";
import type { AppMeta } from "@calcom/types/App";
import Script from "next/script";
import type { appDataSchemas } from "./apps.schemas.generated";

const PushEventPrefix = "cal_analytics_app_";

// AnalyticApp has appData.tag always set
type AnalyticApp = Omit<AppMeta, "appData"> & {
  appData: Omit<NonNullable<AppMeta["appData"]>, "tag"> & {
    tag: NonNullable<NonNullable<AppMeta["appData"]>["tag"]>;
  };
};

const getPushEventScript = ({ tag, appId }: { tag: Tag; appId: string }) => {
  if (!tag.pushEventScript) {
    return tag.pushEventScript;
  }

  return {
    ...tag.pushEventScript,
    // In case of complex pushEvent implementations, we could think about exporting a pushEvent function from the analytics app maybe but for now this should suffice
    content: tag.pushEventScript?.content?.replace("$pushEvent", `${PushEventPrefix}_${appId}`),
  };
};

// Only support UpperCase,_and numbers in template variables. This prevents accidental replacement of other strings.
const TEMPLATE_VARIABLE_REGEX = /\{([A-Z_\d]+)\}/g;
const SAFE_TEMPLATE_VALUE_REGEX = /^[A-Za-z0-9_.:/-]+$/;
const SAFE_URL_TEMPLATE_VALUE_REGEX = /^[A-Za-z0-9_.:/\-?=&%~+#]+$/;

const isUrlTemplateVariable = (variableName: string) =>
  variableName.endsWith("_URL") || variableName === "API_HOST";

/**
 * Template values come from event type metadata, which any event type owner controls, and end up
 * inside inline <script> content and script src attributes on the public booking page. A strict
 * allowlist keeps them from breaking out of the JS string literals they are interpolated into.
 */
export function isSafeTemplateValue(variableName: string, value: unknown): boolean {
  if (typeof value !== "string" && typeof value !== "number") return false;
  const stringValue = String(value);

  if (!isUrlTemplateVariable(variableName)) {
    return SAFE_TEMPLATE_VALUE_REGEX.test(stringValue);
  }

  if (!SAFE_URL_TEMPLATE_VALUE_REGEX.test(stringValue)) return false;
  try {
    const { protocol } = new URL(stringValue);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

export function hasUnsafeTemplateValues(templates: (string | undefined)[], appData: Record<string, unknown>) {
  return templates.some((template) => {
    if (!template) return false;
    const regex = new RegExp(TEMPLATE_VARIABLE_REGEX.source, "g");
    let match: RegExpExecArray | null = regex.exec(template);
    while (match) {
      const variableName = match[1];
      const value = appData[variableName];
      // Falsy values are left as-is by parseValue, so they never reach the script.
      if (value && !isSafeTemplateValue(variableName, value)) return true;
      match = regex.exec(template);
    }
    return false;
  });
}

function getAnalyticsApps(eventType: Parameters<typeof getEventTypeAppData>[0]) {
  return Object.entries(appStoreMetadata).reduce(
    (acc, entry) => {
      const [appId, app] = entry;
      const eventTypeAppData = getEventTypeAppData(eventType, appId as keyof typeof appDataSchemas);

      if (!eventTypeAppData || !app.appData?.tag) {
        return acc;
      }

      acc[appId] = {
        meta: app as AnalyticApp,
        eventTypeAppData: eventTypeAppData,
      };
      return acc;
    },
    {} as Record<
      string,
      {
        meta: AnalyticApp;
        eventTypeAppData: ReturnType<typeof getEventTypeAppData>;
      }
    >
  );
}

export function handleEvent(event: { detail: Record<string, unknown> & { type: string } }) {
  const { type: name, ...data } = event.detail;
  // Don't push internal events to analytics apps
  // They are meant for internal use like helping embed make some decisions
  if (name.startsWith("__")) {
    return false;
  }

  Object.entries(window).forEach(([prop, value]) => {
    if (!prop.startsWith(PushEventPrefix) || typeof value !== "function") {
      return;
    }
    // Find the pushEvent if defined by the analytics app
    const pushEvent = window[prop as keyof typeof window];

    pushEvent({
      name,
      data,
    });
  });

  // Support sending all events to opener which is currently used by ReroutingDialog to identify if the booking is successfully rescheduled.
  if (window.opener) {
    window.opener.postMessage(
      {
        type: `CAL:${name}`,
        ...data,
      },
      "*"
    );
  }
  return true;
}

export default function BookingPageTagManager({
  eventType,
}: {
  eventType: Parameters<typeof getEventTypeAppData>[0];
}) {
  const analyticsApps = getAnalyticsApps(eventType);
  return (
    <>
      {Object.entries(analyticsApps).map(([appId, { meta: app, eventTypeAppData }]) => {
        const tag = app.appData.tag;
        const appDataRecord = eventTypeAppData as Record<string, unknown>;
        const pushEventScript = getPushEventScript({ tag, appId });
        const scripts = tag.scripts.concat(pushEventScript ? [pushEventScript] : []);
        const templates = scripts.flatMap((script) => [
          script.src,
          script.content,
          ...Object.values(script.attrs || {}).filter((value): value is string => typeof value === "string"),
        ]);
        if (hasUnsafeTemplateValues(templates, appDataRecord)) {
          return null;
        }

        const parseValue = <T extends string | undefined>(val: T): T => {
          if (!val) {
            return val;
          }

          const regex = new RegExp(TEMPLATE_VARIABLE_REGEX.source, "g");
          let matches;
          while ((matches = regex.exec(val))) {
            const variableName = matches[1];
            if (appDataRecord[variableName]) {
              // Replace if value is available. It can possible not be a template variable that just matches the regex.
              val = val.replace(
                new RegExp(`{${variableName}}`, "g"),
                String(appDataRecord[variableName])
              ) as NonNullable<T>;
            }
          }
          return val;
        };

        return scripts.map((script, index) => {
          const parsedAttributes: NonNullable<(typeof tag.scripts)[number]["attrs"]> = {};
          const attrs = script.attrs || {};
          Object.entries(attrs).forEach(([name, value]) => {
            if (typeof value === "string") {
              value = parseValue(value);
            }
            parsedAttributes[name] = value;
          });

          return (
            // biome-ignore lint/security/noDangerouslySetInnerHtml: Analytics script injection
            <Script
              data-testid={`cal-analytics-app-${appId}`}
              src={parseValue(script.src)}
              id={`${appId}-${index}`}
              key={`${appId}-${index}`}
              // It is strictly not necessary to disable, but in a future update of react/no-danger this will error.
              // And we don't want it to error here anyways
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{
                __html: parseValue(script.content) || "",
              }}
              {...parsedAttributes}
              defer
            />
          );
        });
      })}
    </>
  );
}

if (typeof window !== "undefined") {
  // Attach listener outside React as it has to be attached only once per page load
  // Setup listener for all events to push to analytics apps
  sdkActionManager?.on("*", handleEvent);
}
