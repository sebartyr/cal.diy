import { Logger, ISettingsParam } from "tslog";

import { IS_PRODUCTION } from "./constants";

export const loggerConfig: ISettingsParam<unknown> = {
  minLevel: parseInt(process.env.NEXT_PUBLIC_LOGGER_LEVEL || "4"),
  maskValuesOfKeys: ["password", "passwordConfirmation", "credentials", "credential"],
  prettyLogTimeZone: IS_PRODUCTION ? "UTC" : "local",
  prettyErrorStackTemplate: "  • {{fileName}}\t{{method}}\n\t{{filePathWithLine}}", // default
  prettyErrorTemplate: "\n{{errorName}} {{errorMessage}}\nerror stack:\n{{errorStack}}", // default
  prettyLogTemplate: "{{hh}}:{{MM}}:{{ss}}:{{ms}} [{{logLevelName}}] ", // default with exclusion of `{{filePathWithLine}}`
  stylePrettyLogs: !IS_PRODUCTION,
  prettyLogStyles: {
    name: "yellow",
    dateIsoStr: "blue",
  },
  type: IS_PRODUCTION ? "json" : "pretty",
};

const logger = new Logger(loggerConfig);

/**
 * PERF-002 (Sprint 4): cheap check for whether `silly` will actually emit.
 * Call sites that build expensive payloads (JSON.stringify on deeply nested
 * objects, base64 dumps, credential surveys) should wrap the call:
 *
 *   if (isSillyEnabled(log)) log.silly("msg", safeStringify(...));
 *
 * tslog levels are: silly=0, trace=1, debug=2, info=3, warn=4, error=5, fatal=6.
 * Default `minLevel` is 4 so silly stringification is wasted work in prod.
 */
export function isSillyEnabled(log: Pick<Logger<unknown>, "settings">): boolean {
  return (log.settings?.minLevel ?? 4) <= 0;
}

export default logger;
