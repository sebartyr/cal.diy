/**
 * SEC-008: magic-link / passwordless email link lifetime.
 *
 * The previous value in `next-auth-options.ts` was `10 * 60 * 60` seconds
 * (10 hours) while the comment claimed "10 min only". A 10-hour window means
 * a leaked email or intercepted link stays exploitable across a full work day.
 * Reset to 10 minutes (600s).
 *
 * Kept in its own module so unit tests can assert on it without importing
 * the full NextAuth wiring.
 */
export const MAGIC_LINK_MAX_AGE_SECONDS = 10 * 60;
