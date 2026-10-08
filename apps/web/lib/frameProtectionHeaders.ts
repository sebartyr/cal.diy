// Booking pages (/[user], /team, /d, /booking, /reschedule, /forms, */embed) must stay
// frameable for the embed snippet, so framing is denied through an allow-list of
// authenticated app areas rather than globally. Add new private sections here.
const PRIVATE_APP_PATH_SOURCES = [
  "/settings/:path*",
  "/bookings/:path*",
  "/event-types/:path*",
  "/availability/:path*",
  "/apps/installed/:path*",
  "/apps/installation/:path*",
  "/apps/:slug/setup",
  "/getting-started/:path*",
  "/onboarding/:path*",
  "/workflows/:path*",
  "/teams/:path*",
  "/members/:path*",
  "/insights/:path*",
  "/more",
  "/refer",
  "/upgrade",
  "/enterprise",
] as const;

const FRAME_PROTECTION_HEADERS = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // The proxy only emits a Report-Only CSP on these pages, so an enforced
  // frame-ancestors here does not collide with it; browsers honouring CSP ignore XFO.
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
];

export const getFrameProtectionHeaderRules = () =>
  PRIVATE_APP_PATH_SOURCES.map((source) => ({ source, headers: FRAME_PROTECTION_HEADERS }));
