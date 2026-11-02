import logger from "@calcom/lib/logger";
import { isApiV2Enabled, loadApiV2Handler, toApiV2Url } from "@lib/embeddedApiV2";
import type { NextApiRequest, NextApiResponse } from "next";

const log = logger.getSubLogger({ prefix: ["embedded-api-v2"] });

export const config = {
  api: {
    // NestJS parses bodies itself, including the raw ones it verifies webhook signatures with.
    bodyParser: false,
    externalResolver: true,
    responseLimit: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isApiV2Enabled()) {
    res.status(404).json({ message: "Not found" });
    return;
  }

  const apiV2 = await loadApiV2Handler().catch((error: unknown) => {
    log.error("Could not load the embedded API v2", error);
    return null;
  });
  if (!apiV2) {
    res.status(503).json({ message: "API v2 is unavailable" });
    return;
  }

  req.url = toApiV2Url(req.url ?? "/");
  // Next stores the parsed query, catch-all `path` param included, as an own property that would
  // hide Express 5's `req.query` getter, which parses the URL with the API's own query parser.
  Reflect.deleteProperty(req, "query");
  await apiV2(req, res);
}
