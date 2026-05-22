# Resume findings passe 1

| ID | Sévérité | Catégorie | Titre | Fichier principal | Effort |
| --- | --- | --- | --- | --- | --- |
| SEC-001 | P1 | security | OAuth CSRF sur integrations exemptes de nonce | `packages/app-store/_utils/oauth/decodeOAuthState.ts` | M |
| SEC-002 | P1 | security | SSRF webhook permissif en self-host et metadata IPv6-map | `packages/lib/ssrfProtection.ts` | M |
| SEC-003 | P2 | security | AES-CBC sans authentification pour secrets | `packages/lib/crypto.ts` | M |
| SEC-004 | P2 | security | Secrets runtime exposes au build Docker | `Dockerfile` | S |
| SEC-005 | P2 | security | CSP enforcee seulement sur login | `apps/web/proxy.ts` | M |
| SEC-006 | P2 | security | Upload avatar base64 sans limite avant resize | `packages/trpc/server/routers/viewer/me/updateProfile.handler.ts` | S |
| SEC-007 | P2 | security | Verification email deterministe et rejouable | `packages/features/auth/lib/verifyEmail.ts` | M |
| SEC-008 | P3 | security | Parsing JSON OAuth state non controle | `packages/app-store/_utils/oauth/decodeOAuthState.ts` | XS |
| SEC-009 | P3 | security | API v2 expose les secrets HMAC webhooks | `apps/api/v2/src/modules/webhooks/outputs/webhook.output.ts` | S |
| BUG-001 | P1 | bug | Double booking concurrent possible | `packages/features/bookings/lib/service/RegularBookingService.ts` | L |
| BUG-002 | P2 | bug | Token reset password consomme apres update | `apps/web/app/api/auth/reset-password/route.ts` | S |
| PERF-001 | P2 | performance | Logo public fetch + resize sans plafond/cache persistant | `apps/web/app/api/logo/route.ts` | M |
