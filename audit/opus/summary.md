# Summary — cal.diy audit pass 1

Branche `master @ 3e50c176fe`, audit 2026-05-20. 56 findings (15 P0/P1 critiques).

## Tableau récap

| ID       | Sévérité | Catégorie    | Titre court                                                              | Fichier principal                                                                            | Effort |
|----------|----------|--------------|--------------------------------------------------------------------------|----------------------------------------------------------------------------------------------|--------|
| SEC-001  | **P0**   | security     | PBAC stub → IDOR sur team event-types                                    | `packages/trpc/server/routers/viewer/eventTypes/util.ts:15-20,159-175`                       | M      |
| SEC-200  | **P0**   | security     | Rate-limit fail-open quand UNKEY_ROOT_KEY absent                         | `packages/lib/rateLimit.ts:33-42`                                                            | M      |
| BUG-001  | **P0**   | bug          | Double-booking race (ensureAvailableUsers hors tx)                       | `packages/features/bookings/lib/service/RegularBookingService.ts:900-960`                    | M      |
| SEC-002  | P1       | security     | OAuth client secret comparé non-constant-time                            | `apps/api/v2/src/modules/auth/strategies/api-auth/api-auth.strategy.ts:184-186`              | XS     |
| SEC-011  | P1       | security     | jwt.verify avec fallback clé ""                                          | `packages/features/auth/lib/oAuthAuthorization.ts:9`                                         | XS     |
| SEC-100  | P1       | security     | AES-256-CBC sans tag d'authentification                                  | `packages/lib/crypto.ts:1-41`                                                                | M      |
| SEC-101  | P1       | security     | OAuth NONCE_EXEMPT_APPS inclut Stripe (confused-deputy)                  | `packages/app-store/_utils/oauth/decodeOAuthState.ts:6`                                      | S      |
| SEC-103  | P1       | security     | SSRF webhook outbound — pas de re-validation au send                     | `packages/features/webhooks/lib/sendPayload.ts:312-321`                                      | M      |
| SEC-104  | P1       | security     | SSRF CalDAV/ICS-feed URL non validée                                     | `packages/app-store/caldavcalendar/api/add.ts:12-44`                                         | S      |
| SEC-201  | P1       | security     | CSP appliquée uniquement sur /auth/login                                 | `apps/web/proxy.ts:64-66,165-167`                                                            | S      |
| SEC-202  | P1       | security     | postMessage listeners sans validation origin                             | `packages/embeds/embed-core/src/embed-iframe.ts:559-568`                                     | S      |
| BUG-002  | P1       | bug          | DST: utcOffset calculé à "maintenant" pour bookings futurs               | `packages/features/bookings/lib/handleNewBooking/validateBookingTimeIsNotOutOfBounds.ts:41`  | XS     |
| BUG-004  | P1       | bug          | Recurring `count` non borné → DoS                                        | `packages/prisma/zod-utils.ts:234-243`                                                       | XS     |
| BUG-008  | P1       | bug          | Webhook sans index sur userId/teamId/eventTypeId                         | `packages/prisma/schema.prisma:1142-1170`                                                    | XS     |
| PERF-001 | P1       | performance  | N+1 `_getUserAvailability` par user en équipe                            | `packages/features/availability/lib/getUserAvailability.ts:785-817`                          | L      |
| SEC-004  | P2       | security     | Énumération comptes via timing /auth/login                               | `packages/features/auth/lib/next-auth-options.ts:164-187`                                    | XS     |
| SEC-005  | P2       | security     | Politique mot de passe ≥ 7 chars (sous NIST)                             | `packages/features/auth/lib/validPassword.ts:1-9`                                            | S      |
| SEC-006  | P2       | security     | Reset-password token stocké en clair en DB                               | `apps/web/app/api/auth/reset-password/route.ts:50-60`                                        | M      |
| SEC-007  | P2       | security     | Magic-link maxAge = 10h (bug commentaire 10min)                          | `packages/features/auth/lib/next-auth-options.ts:362`                                        | XS     |
| SEC-008  | P2       | security     | TOTP sans anti-replay                                                    | `packages/lib/totp.ts:15-30`                                                                 | S      |
| SEC-009  | P2       | security     | Backup codes chiffrés réversibles au lieu de hashés                      | `apps/web/app/api/auth/two-factor/totp/setup/route.ts:71-79`                                 | M      |
| SEC-012  | P2       | security     | disable 2FA accepte TOTP seul pour users OAuth                           | `apps/web/app/api/auth/two-factor/totp/disable/route.ts:43-55`                               | S      |
| SEC-102  | P2       | security     | OAuth callbacks ignorent state === undefined                             | `packages/app-store/zoomvideo/api/callback.ts:13,52-78` et autres                            | S      |
| SEC-105  | P2       | security     | Booking d'event-type `hidden` non bloqué                                 | `packages/features/bookings/lib/handleNewBooking/getEventTypesFromDB.ts:17-201`              | XS     |
| SEC-106  | P2       | security     | Spoofing bookerEmail (verification OFF par défaut)                       | `packages/features/bookings/lib/service/RegularBookingService.ts:612-629`                    | M      |
| SEC-107  | P2       | security     | OAuth refresh-token race sans lock                                       | `packages/app-store/_utils/oauth/updateTokenObject.ts:14-93`                                 | M      |
| SEC-203  | P2       | security     | Markdown links `_blank` sans `noopener`                                  | `packages/lib/markdownToSafeHTML.ts:27`                                                      | XS     |
| SEC-205  | P2       | security     | Dockerfile root + ARG NEXTAUTH_SECRET="secret"                           | `Dockerfile:11-12,77-94`                                                                     | S      |
| SEC-206  | P2       | security     | CSP script-src accepte `'unsafe-inline' https:`                          | `apps/web/lib/csp.ts:19-25`                                                                  | S      |
| BUG-003  | P2       | bug          | Working hours utcOffset snapshot                                         | `packages/lib/availability.ts:71-84`                                                         | S      |
| BUG-005  | P2       | bug          | Recurring booking await séquentiel                                       | `packages/features/bookings/lib/service/RecurringBookingService.ts:74-128`                   | S      |
| BUG-006  | P2       | bug          | Catches silencieux OAuth callbacks                                       | `packages/app-store/{nextcloudtalk,webex,jelly,basecamp3}/api/callback.ts`                   | XS     |
| BUG-010  | P2       | bug          | Migrations sans CREATE INDEX CONCURRENTLY                                | `packages/prisma/migrations/*/migration.sql`                                                 | S      |
| BUG-012  | P2       | bug          | idempotencyKey ne couvre que ACCEPTED                                    | `packages/prisma/extensions/booking-idempotency-key.ts:27-36`                                | XS     |
| PERF-002 | P2       | performance  | `logger.silly(JSON.stringify(...))` éval en prod                         | `packages/features/busyTimes/services/getBusyTimes.ts:77-83 et al.`                          | S      |
| PERF-003 | P2       | performance  | Pas de cache HTTP / ISR sur pages publiques                              | `apps/web/app/(booking-page-wrapper)/...`                                                    | M      |
| PERF-004 | P2       | performance  | EventTeamAssignmentTab — multiples form.watch()                          | `apps/web/modules/event-types/.../EventTeamAssignmentTab.tsx:39-50`                          | S      |
| PERF-005 | P2       | performance  | FormBuilder rerender complet sur keystroke                               | `apps/web/modules/event-types/components/tabs/advanced/FormBuilder.tsx:132-136`              | M      |
| PERF-009 | P2       | performance  | getPublicEvent chaîne de UserRepository calls                            | `packages/features/eventtypes/lib/getPublicEvent.ts`                                         | L      |
| PERF-010 | P2       | performance  | Booking index `[eventTypeId, startTime, status]` manquant                | `packages/prisma/schema.prisma:918-929`                                                      | S      |
| SEC-003  | P3       | security     | sameSite=none cookies (trade-off embed)                                  | `packages/lib/default-cookies.ts:25-46`                                                      | S      |
| SEC-010  | P3       | security     | getServerSession LRU sans TTL                                            | `packages/features/auth/lib/getServerSession.ts:26,57-62`                                    | XS     |
| SEC-013  | P3       | security     | bookings.find publicProcedure expose description                         | `packages/trpc/server/routers/viewer/bookings/_router.tsx:91-98`                             | S      |
| SEC-014  | P3       | security     | NEXT_PUBLIC_IS_E2E bypasse 2FA admin                                     | `packages/features/auth/lib/next-auth-options.ts:254-257`                                    | XS     |
| SEC-015  | P3       | security     | Code impersonation propagé bien que provider EE retiré                   | `packages/features/auth/lib/getServerSession.ts:127-145`                                     | S      |
| SEC-108  | P3       | security     | responses/metadata non bornés                                            | `packages/features/bookings/lib/bookingCreateBodySchema.ts:20,98-106`                        | S      |
| SEC-109  | P3       | security     | Stripe webhook stub (regression-prone)                                   | `apps/web/pages/api/integrations/stripepayment/webhook.ts:1-12`                              | XS     |
| SEC-207  | P3       | security     | Info.tsx mute HTML sanitizé après coup                                   | `packages/emails/src/components/Info.tsx:26-30`                                              | S      |
| SEC-208  | P3       | security     | NEXT_PUBLIC_HEAD_SCRIPTS injectés inline (par design, doc)               | `apps/web/app/(use-page-wrapper)/layout.tsx:9-37`                                            | M      |
| BUG-007  | P3       | bug          | .catch(()=>null) masque erreurs Prisma                                   | `packages/features/tasker/tasks/triggerNoShow/common.ts:116-123`                             | XS     |
| BUG-009  | P3       | bug          | Booking.eventType sans onDelete explicite                                | `packages/prisma/schema.prisma:862,964`                                                      | XS     |
| BUG-011  | P3       | bug          | engines.node absent                                                      | `/package.json`                                                                              | XS     |
| BUG-013  | P3       | bug          | rrule 2.7.1 ancien, pas de borne count                                   | `node_modules/rrule/package.json`                                                            | S      |
| PERF-006 | P3       | performance  | optimizePackageImports limité                                            | `apps/web/next.config.ts:236-238`                                                            | XS     |
| PERF-007 | P3       | performance  | framer-motion domAnimation eager                                         | `packages/features/bookings/Booker/framer-features.tsx`                                      | S      |
| PERF-008 | P3       | performance  | Booking limit fetch concurrence sous-utilisée                            | `packages/features/busyTimes/services/getBusyTimes.ts:425-439`                               | XS     |

## Décompte

| Sévérité | Security | Bug | Perf | Total |
|----------|----------|-----|------|-------|
| P0       | 2        | 1   | 0    | 3     |
| P1       | 8        | 3   | 1    | 12    |
| P2       | 14       | 5   | 5    | 24    |
| P3       | 10       | 4   | 3    | 17    |
| **Total**| 34       | 13  | 9    | 56    |

(SEC-204 = doublon de SEC-004, retiré du décompte.)
