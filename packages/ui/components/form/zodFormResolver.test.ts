import type { ResolverOptions } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { zodFormResolver } from "./zodFormResolver";

type FormValues = { email: string; csrfToken: string; totpCode?: string };

const options: ResolverOptions<FormValues> = { fields: {}, shouldUseNativeValidation: false };

describe("zodFormResolver", () => {
  const schema = z.object({ email: z.string().email() }).passthrough();

  it("returns the form's values, including the fields the schema does not list", async () => {
    const resolver = zodFormResolver<FormValues>(schema);

    const result = await resolver({ email: "jane@example.com", csrfToken: "token" }, undefined, options);

    expect(result).toEqual({ values: { email: "jane@example.com", csrfToken: "token" }, errors: {} });
  });

  it("reports the schema's errors on the matching fields", async () => {
    const resolver = zodFormResolver<FormValues>(schema);

    const result = await resolver({ email: "not-an-email", csrfToken: "token" }, undefined, options);

    expect(result.values).toEqual({});
    expect(result.errors.email).toMatchObject({ type: "invalid_string" });
  });

  it("validates async refinements in async mode", async () => {
    const asyncSchema = z.object({
      email: z.string().refine(async (email) => email.endsWith("@example.com"), "Wrong domain"),
    });
    const resolver = zodFormResolver<FormValues>(asyncSchema, { mode: "async" });

    const result = await resolver({ email: "jane@elsewhere.com", csrfToken: "token" }, undefined, options);

    expect(result.errors.email).toMatchObject({ message: "Wrong domain" });
  });
});
