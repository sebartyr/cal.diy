# Audit final cal.diy — Récapitulatif

Branche `master @ 3e50c176fe` — 2026-05-20 — 59 findings.

## SEC — Auth & AuthZ (17)

| ID | Sév. | Titre | Localisation | Effort | Sources |
|----|------|-------|--------------|--------|---------|
| SEC-001 | **P0** | PBAC stub — IDOR team event-types | `trpc/.../eventTypes/util.ts:15-20,159-175` | M | opus SEC-001 |
| SEC-002 | P1 | Timing non-constant OAuth client secret (API v2) | `api/v2/.../api-auth.strategy.ts:184-186` | XS | opus SEC-002 |
| SEC-003 | P1 | `jwt.verify` fallback clé `""` | `features/auth/lib/oAuthAuthorization.ts:9` | XS | opus SEC-011 |
| SEC-004 | P3 | Cookies `sameSite=none` prod | `lib/default-cookies.ts:25-46` | S | opus SEC-003 |
| SEC-005 | P2 | Énumération timing `/auth/login` | `features/auth/lib/next-auth-options.ts:164-187` | XS | opus SEC-004 (+204 dup) |
| SEC-006 | P2 | Politique password ≥ 7 chars | `features/auth/lib/validPassword.ts:1-9` | S | opus SEC-005 |
| SEC-007 | P2 | Reset-password tokens stockés en clair | `app/api/auth/reset-password/route.ts:50-60` | M | opus SEC-006 |
| SEC-008 | P2 | Magic-link `maxAge` = 10h (bug commentaire) | `features/auth/lib/next-auth-options.ts:362` | XS | opus SEC-007 |
| SEC-009 | P2 | Email TOTP + 2FA replay + backup codes chiffrés | `features/auth/lib/verifyEmail.ts:104` ++ | M | codex SEC-007 + opus SEC-008,009 |
| SEC-010 | P3 | `getServerSession` LRU sans TTL | `features/auth/lib/getServerSession.ts:26` | XS | opus SEC-010 |
| SEC-011 | P2 | `disable 2FA` sans password pour users OAuth | `app/api/auth/two-factor/totp/disable/route.ts:43-55` | S | opus SEC-012 |
| SEC-012 | P3 | `bookings.find` publicProc expose `description` | `trpc/.../bookings/_router.tsx:91-98` | S | opus SEC-013 |
| SEC-013 | P3 | `NEXT_PUBLIC_IS_E2E` bypass 2FA/password | `features/auth/lib/next-auth-options.ts:254-257` | XS | opus SEC-014 |
| SEC-014 | P3 | Code impersonation dead-code | `features/auth/lib/getServerSession.ts:127-145` | S | opus SEC-015 |
| SEC-015 | P2 | Avatar base64 sans limite | `trpc/.../updateProfile.schema.ts:89-94` | S | codex SEC-006 |
| SEC-016 | P3 | OAuth state `JSON.parse` non contrôlé | `_utils/oauth/decodeOAuthState.ts:8-13` | XS | codex SEC-008 |
| SEC-017 | P3 | API v2 expose secrets HMAC webhooks | `api/v2/.../webhooks/outputs/webhook.output.ts:42-45` | S | codex SEC-009 |

## SEC — Booking, OAuth, Webhooks, Crypto (10)

| ID | Sév. | Titre | Localisation | Effort | Sources |
|----|------|-------|--------------|--------|---------|
| SEC-100 | P1 | AES-256-CBC sans auth tag | `lib/crypto.ts:1-41` | M | opus SEC-100 + codex SEC-003 |
| SEC-101 | P1 | Confused-deputy OAuth (Stripe, Webex, Basecamp, Dub, Tandem) | `_utils/oauth/decodeOAuthState.ts:6` | S | opus SEC-101 + codex SEC-001 |
| SEC-102 | P2 | OAuth callbacks ignorent `state === undefined` | `app-store/zoomvideo/api/callback.ts:13` ++ | S | opus SEC-102 |
| SEC-103 | P1 | SSRF webhook + bypass IPv4-map IPv6 | `lib/ssrfProtection.ts:137-149` + `webhooks/lib/sendPayload.ts:312` | M | opus SEC-103 + codex SEC-002 |
| SEC-104 | P1 | SSRF CalDAV + ICS-feed | `app-store/caldavcalendar/api/add.ts:12` + `ics-feedcalendar/api/add.ts:13` | S | opus SEC-104 |
| SEC-105 | P2 | Booking event-type `hidden` non bloqué | `bookings/lib/handleNewBooking/getEventTypesFromDB.ts:17-201` | XS | opus SEC-105 |
| SEC-106 | P1 | Spoofing bookerEmail → phishing signé Clever | `bookings/lib/service/RegularBookingService.ts:612-629` | M | opus SEC-106 |
| SEC-107 | P2 | OAuth refresh-token race (DoS intégrations) | `_utils/oauth/updateTokenObject.ts:14-93` | M | opus SEC-107 |
| SEC-108 | P3 | `responses`/`metadata` non bornées | `bookings/lib/bookingCreateBodySchema.ts:20,98-106` | S | opus SEC-108 |
| SEC-109 | P3 | Stripe webhook stub (régression latente) | `pages/api/integrations/stripepayment/webhook.ts:1-12` | XS | opus SEC-109 |

## SEC — Injections, XSS, CSP, files, rate-limit (7)

| ID | Sév. | Titre | Localisation | Effort | Sources |
|----|------|-------|--------------|--------|---------|
| SEC-200 | **P0** | Rate-limit fail-open sans `UNKEY_ROOT_KEY` | `lib/rateLimit.ts:33-42` | M | opus SEC-200 |
| SEC-201 | P1 | CSP appliquée uniquement `/auth/login` | `apps/web/proxy.ts:64-66,165-167` | S | opus SEC-201 + codex SEC-005 |
| SEC-202 | P1 | `postMessage` listeners sans validation `origin` | `embeds/embed-core/src/embed-iframe.ts:559-568` | S | opus SEC-202 |
| SEC-203 | P2 | Markdown `target=_blank` sans `noopener` | `lib/markdownToSafeHTML.ts:27` | XS | opus SEC-203 |
| SEC-204 | P2 | Docker root + `ARG NEXTAUTH_SECRET=secret` | `Dockerfile:10-35,77-94` | S | opus SEC-205 + codex SEC-004 |
| SEC-205 | P2 | CSP `unsafe-inline https:` en prod | `apps/web/lib/csp.ts:19-25` | S | opus SEC-206 |
| SEC-206 | P3 | Email `Info.tsx` mute HTML post-sanitization | `packages/emails/src/components/Info.tsx:26-30` | S | opus SEC-207 |
| SEC-207 | P3 | `NEXT_PUBLIC_HEAD_SCRIPTS` inline | `app/(use-page-wrapper)/layout.tsx:9-37` | M | opus SEC-208 |

## BUG (14)

| ID | Sév. | Titre | Localisation | Effort | Sources |
|----|------|-------|--------------|--------|---------|
| BUG-001 | **P0** | Double-booking race (TOCTOU) | `bookings/lib/service/RegularBookingService.ts:900-960` | M | opus BUG-001 + codex BUG-001 |
| BUG-002 | P2 | Reset-password token race | `app/api/auth/reset-password/route.ts:50-60` | S | codex BUG-002 |
| BUG-003 | P1 | DST `utcOffset` calculé à "maintenant" | `bookings/lib/handleNewBooking/validateBookingTimeIsNotOutOfBounds.ts:41-42` | XS | opus BUG-002 |
| BUG-004 | P2 | DST working hours offset snapshot | `lib/availability.ts:71-84` | S | opus BUG-003 |
| BUG-005 | P1 | Recurring `count` non borné Zod | `prisma/zod-utils.ts:234-243` | XS | opus BUG-004 |
| BUG-006 | P2 | Recurring `await` séquentiel | `bookings/lib/service/RecurringBookingService.ts:74-128` | S | opus BUG-005 |
| BUG-007 | P2 | Catches silencieux callbacks OAuth | `app-store/{nextcloudtalk,webex,jelly,basecamp3}/api/callback.ts` | XS | opus BUG-006 |
| BUG-008 | P3 | `.catch(() => null)` masque Prisma | `tasker/tasks/triggerNoShow/common.ts:116-123` | XS | opus BUG-007 |
| BUG-009 | P1 | Webhook indexes manquants | `prisma/schema.prisma:1142-1170` | XS | opus BUG-008 |
| BUG-010 | P3 | `Booking.eventType` sans `onDelete` explicite | `prisma/schema.prisma:862,964` | XS | opus BUG-009 |
| BUG-011 | P2 | Migrations sans `CREATE INDEX CONCURRENTLY` | `prisma/migrations/*/migration.sql` | S | opus BUG-010 |
| BUG-012 | P3 | `engines.node` absent | `/package.json` | XS | opus BUG-011 |
| BUG-013 | P2 | `idempotencyKey` ne couvre que ACCEPTED | `prisma/extensions/booking-idempotency-key.ts:27-36` | XS | opus BUG-012 |
| BUG-014 | P3 | `rrule` 2.7.1 ancienne version | `node_modules/rrule/package.json` | S | opus BUG-013 |

## PERF (11)

| ID | Sév. | Titre | Localisation | Effort | Sources |
|----|------|-------|--------------|--------|---------|
| PERF-001 | P1 | N+1 `_getUserAvailability` par user | `features/availability/lib/getUserAvailability.ts:785-817` | L | opus PERF-001 |
| PERF-002 | P2 | `logger.silly(JSON.stringify(...))` éval prod | `features/busyTimes/services/getBusyTimes.ts:77-83` ++ | S | opus PERF-002 |
| PERF-003 | P2 | Pas d'ISR pages publiques | `apps/web/app/(booking-page-wrapper)/...` | M | opus PERF-003 |
| PERF-004 | P2 | `EventTeamAssignmentTab` re-render | `event-types/components/tabs/assignment/EventTeamAssignmentTab.tsx:39-50` | S | opus PERF-004 |
| PERF-005 | P2 | `FormBuilder` rerender complet | `event-types/components/tabs/advanced/FormBuilder.tsx:132-136` | M | opus PERF-005 |
| PERF-006 | P3 | `optimizePackageImports` limité | `apps/web/next.config.ts:236-238` | XS | opus PERF-006 |
| PERF-007 | P3 | `framer-motion` eager-loaded | `bookings/Booker/framer-features.tsx` | S | opus PERF-007 |
| PERF-008 | P3 | Booking limit concurrence sous-utilisée | `busyTimes/services/getBusyTimes.ts:425-439` | XS | opus PERF-008 |
| PERF-009 | P2 | `getPublicEvent` N+1 UserRepository | `eventtypes/lib/getPublicEvent.ts:269,298,468...` | L | opus PERF-009 |
| PERF-010 | P2 | Booking index `[eventTypeId,startTime,status]` manquant | `prisma/schema.prisma:918-929` | S | opus PERF-010 |
| PERF-011 | P2 | `/api/logo` fetch + resize sans cap | `app/api/logo/route.ts:191-235` | M | codex PERF-001 |

## Récap par sévérité

- **P0 (3)** : SEC-001, SEC-200, BUG-001
- **P1 (13)** : SEC-002, SEC-003, SEC-100, SEC-101, SEC-103, SEC-104, SEC-106, SEC-201, SEC-202, BUG-003, BUG-005, BUG-009, PERF-001
- **P2 (26)** : SEC-005, SEC-006, SEC-007, SEC-008, SEC-009, SEC-011, SEC-015, SEC-102, SEC-105, SEC-107, SEC-203, SEC-204, SEC-205, BUG-002, BUG-004, BUG-006, BUG-007, BUG-011, BUG-013, PERF-002, PERF-003, PERF-004, PERF-005, PERF-009, PERF-010, PERF-011
- **P3 (17)** : SEC-004, SEC-010, SEC-012, SEC-013, SEC-014, SEC-016, SEC-017, SEC-108, SEC-109, SEC-206, SEC-207, BUG-008, BUG-010, BUG-012, BUG-014, PERF-006, PERF-007, PERF-008
