import { createHmac } from "node:crypto";
import process from "node:process";
import { safeCompareSecret } from "./cron-auth";

// No hard-coded fallback: a public default secret would let anyone forge
// recording download tokens. Without a secret, recording links are disabled.
function getVideoTokenSecret(): string | null {
  return process.env.CAL_VIDEO_RECORDING_TOKEN_SECRET || null;
}

const SIX_MONTHS_IN_MINUTES = 262992;

/**
 * Returns null when CAL_VIDEO_RECORDING_TOKEN_SECRET is not configured, so
 * callers can skip the recording link instead of failing the whole flow.
 */
export function generateVideoToken(
  recordingId: string,
  expiresInMinutes = SIX_MONTHS_IN_MINUTES
): string | null {
  const secret = getVideoTokenSecret();
  if (!secret) return null;

  const expires = Date.now() + expiresInMinutes * 60 * 1000;

  const payload = `${recordingId}:${expires}`;
  const hmac = createHmac("sha256", secret).update(payload).digest("hex");

  return `${payload}:${hmac}`;
}

export function verifyVideoToken(token: string): {
  valid: boolean;
  recordingId?: string;
} {
  try {
    const secret = getVideoTokenSecret();
    if (!secret) return { valid: false };

    const [recordingId, expires, receivedHmac] = token.split(":");
    const expiresAt = Number.parseInt(expires, 10);

    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
      return { valid: false };
    }

    const payload = `${recordingId}:${expires}`;
    const expectedHmac = createHmac("sha256", secret).update(payload).digest("hex");

    if (!safeCompareSecret(receivedHmac, expectedHmac)) {
      return { valid: false };
    }

    return { valid: true, recordingId };
  } catch {
    return { valid: false };
  }
}
