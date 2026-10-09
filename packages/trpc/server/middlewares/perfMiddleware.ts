import logger from "@calcom/lib/logger";
import { middleware } from "../trpc";

// A local timer instead of global performance marks: shared "Start"/"End" marks were never cleared
// (unbounded growth of the perf_hooks buffer) and got mixed up between concurrent requests.
const perfMiddleware = middleware(async ({ path, type, next }) => {
  const start = performance.now();
  const result = await next();
  const durationInSeconds = (performance.now() - start) / 1000;
  logger.debug(`[${result.ok ? "OK" : "ERROR"}][${durationInSeconds.toFixed(4)}s] ${type} '${path}'`);
  return result;
});

export default perfMiddleware;
