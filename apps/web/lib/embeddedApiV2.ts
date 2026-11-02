import type { IncomingMessage, ServerResponse } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

type ApiV2Handler = (req: IncomingMessage, res: ServerResponse) => unknown;

// `nest build` output, relative to apps/web where `next start` runs.
const DEFAULT_API_V2_ENTRY = "../api/v2/dist/apps/api/v2/src/main.js";

function hasDefaultHandler(mod: unknown): mod is { default: ApiV2Handler } {
  return typeof mod === "object" && mod !== null && "default" in mod && typeof mod.default === "function";
}

let handlerPromise: Promise<ApiV2Handler> | null = null;

export function isApiV2Enabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.ENABLE_API_V2 === "true";
}

/** The API's controllers are mounted under /v2, the web app exposes them under /api/v2. */
export function toApiV2Url(url: string): string {
  return url.replace(/^\/api(?=\/v2(?:[/?]|$))/, "");
}

/**
 * Loads the compiled NestJS app at runtime instead of bundling it: Turbopack does not handle Nest's
 * decorator metadata and optional requires, and `nest build` already produces runnable CommonJS.
 * The module's default export initialises Nest once, on the first request.
 */
export function loadApiV2Handler(
  entry: string = process.env.API_V2_ENTRY ?? path.resolve(process.cwd(), DEFAULT_API_V2_ENTRY)
): Promise<ApiV2Handler> {
  handlerPromise ??= Promise.resolve()
    .then(() => {
      const mod: unknown = createRequire(entry)(entry);
      if (!hasDefaultHandler(mod)) {
        throw new Error(
          `API v2 entry ${entry} has no default request handler; is it the \`nest build\` output?`
        );
      }
      return mod.default;
    })
    .catch((error: unknown) => {
      // Let the next request retry instead of caching the failure for the life of the process.
      handlerPromise = null;
      throw error;
    });
  return handlerPromise;
}
