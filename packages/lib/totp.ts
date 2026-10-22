import { stringToBytes, verifySync } from "otplib";

type TotpCheckOptions = {
  /** Time step in seconds. Default: 30 */
  step?: number;
  /** Number of past and future steps considered valid, either one value or `[past, future]`. Default: `[1, 0]` */
  window?: number | [number, number];
};

// otplib 13 throws on malformed input (e.g. a non-numeric token typed by the user) where
// otplib 12 returned false; keep returning false so callers answer "invalid code", not 500.
const verifyOrFalse = (options: Parameters<typeof verifySync>[0]) => {
  try {
    return verifySync(options).valid;
  } catch {
    return false;
  }
};

const toEpochTolerance = (step: number, window: number | [number, number]): [number, number] => {
  const [past, future] = typeof window === "number" ? [window, window] : window;
  return [past * step, future * step];
};

/**
 * Checks the validity of a TOTP token using a base32-encoded secret.
 *
 * @param token - The token.
 * @param secret - The base32-encoded shared secret.
 * @param opts.step - Time step in seconds. Default: 30
 * @param opts.window - The amount of past and future tokens considered valid. Either a single value or array of `[past, future]`. Default: `[1, 0]`
 */
export const totpAuthenticatorCheck = (token: string, secret: string, opts: TotpCheckOptions = {}) => {
  const { step = 30, window = [1, 0] } = opts;
  return verifyOrFalse({ secret, token, period: step, epochTolerance: toEpochTolerance(step, window) });
};

/**
 * Checks the validity of a TOTP token using a raw secret.
 *
 * @param token - The token.
 * @param secret - The raw shared secret; its characters are used as the key bytes, as otplib 12 did.
 * @param opts.step - Time step in seconds. Default: 30
 * @param opts.window - The amount of past and future tokens considered valid. Either a single value or array of `[past, future]`. Default: `[1, 0]`
 */
export const totpRawCheck = (token: string, secret: string, opts: TotpCheckOptions = {}) => {
  const { step = 30, window = [1, 0] } = opts;
  return verifyOrFalse({
    secret: stringToBytes(secret),
    token,
    period: step,
    epochTolerance: toEpochTolerance(step, window),
  });
};
