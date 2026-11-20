import type { TFunction } from "i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DisabledAppEmail } from "./DisabledAppEmail";

const t = ((key: string, values?: Record<string, string>) =>
  values ? `${key}:${Object.values(values).join(",")}` : key) as unknown as TFunction;

describe("DisabledAppEmail", () => {
  it("renders the event type notice of a non-payment app", () => {
    const html = renderToStaticMarkup(
      <DisabledAppEmail appName="Pipedrive" appType={["crm"]} title="Rendez-vous" eventTypeId={4} t={t} />
    );

    expect(html).toContain("app_disabled_with_event_type:Pipedrive,Rendez-vous");
  });
});
