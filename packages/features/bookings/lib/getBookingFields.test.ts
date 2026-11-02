import { describe, expect, it } from "vitest";
import { getBookingFieldsWithSystemFields } from "./getBookingFields";

const defaults: Pick<
  Parameters<typeof getBookingFieldsWithSystemFields>[0],
  "disableGuests" | "customInputs" | "metadata"
> = {
  disableGuests: false,
  customInputs: [],
  metadata: {},
};

describe("getBookingFieldsWithSystemFields", () => {
  // Stored fields may omit `required`/`editable` (API v2 2024-04-15 accepts them without). The system
  // field's values must then apply, rather than schema defaults filled in before the merge.
  it("keeps a system field's own settings when the stored field omits them", () => {
    const fields = getBookingFieldsWithSystemFields({
      ...defaults,
      bookingFields: [{ name: "name", type: "name", label: "Full name" }],
    });

    const name = fields.find((field) => field.name === "name");
    expect(name).toMatchObject({ label: "Full name", required: true, editable: "system" });
  });

  it("still applies an explicit `required: false` from the stored field", () => {
    const fields = getBookingFieldsWithSystemFields({
      ...defaults,
      bookingFields: [
        { name: "name", type: "name" },
        { name: "email", type: "email", required: false },
      ],
    });

    expect(fields.find((field) => field.name === "email")?.required).toBe(false);
  });
});
