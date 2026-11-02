import { zodResolver } from "@hookform/resolvers/zod";
import type { FieldValues, Resolver } from "react-hook-form";
import type { z } from "zod";

/**
 * zodResolver for forms whose schema validates only some of their fields (often with `.passthrough()`)
 * or a dynamic set of them. zodResolver types the form from the schema, which would drop every field
 * the schema does not list; this keeps the form's own type, as resolvers before v5 did.
 */
export function zodFormResolver<TFieldValues extends FieldValues>(
  schema: z.ZodType<unknown, FieldValues>,
  resolverOptions?: { mode?: "async" | "sync" }
): Resolver<TFieldValues> {
  // The schema's output is the form's values: it validates some of them and passes the rest through.
  return zodResolver(schema, undefined, resolverOptions) as Resolver<TFieldValues>;
}
