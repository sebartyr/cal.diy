# Cal.diy — fork Clever Cloud — notes de maintenance

Ce document décrit les divergences volontaires entre `cal.diy` (fork
Clever Cloud) et son upstream `cal.com/cal.com`. Il est destiné aux
mainteneurs qui rebasent sur upstream et aux auditeurs.

## Branches

- `master` : tracking direct de `cal.com/main` (ne reçoit pas de
  modifications propres au fork).
- `remediation/audit-fix` : intégration des remédiations issues de
  l'audit dual-model du 2026-05-20. Une fois mergée, c'est la branche
  qui part en prod.
- Tag `pre-remediation-20260520` : état exact du code au moment où
  l'audit a été baseliné.

## Stratégie de minimisation du diff

Quand un changement de sécurité/conformité touche un fichier
fréquemment modifié upstream, on **externalise** la logique dans un
fichier `*-clever.ts` (ou un dossier dédié) et on laisse le fichier
upstream avec un shim minimal (≤ 3 lignes) qui ré-exporte. Ça permet :

- de rebaser un fichier upstream sans conflit
- de versionner notre logique séparément
- de relire en un coup d'œil quelle partie est du fork

### Pattern shim

```ts
// Clever fork: <description> in <fichier-clever>.ts (see FORK-NOTES.md).
export { fooImpl as foo } from "./<fichier-clever>";
```

### Fichiers concernés (shim → impl Clever)

| Fichier upstream | Impl Clever | Raison |
|------------------|-------------|--------|
| `packages/lib/crypto.ts` | `packages/lib/crypto-clever.ts` | AES-256-CBC → AES-256-GCM (SEC-100) |

D'autres candidats potentiels (TBD) : `packages/lib/rateLimit.ts`,
`packages/features/auth/lib/next-auth-options.ts`. À traiter au cas
par cas lorsque le diff dépasse ~30 lignes et que le fichier upstream
bouge.

## Divergences en place (sécurité — Sprint 0/1/2)

| Domaine | Fichiers | Ticket |
|---------|----------|--------|
| Lockdown scripts dev (DB hostname allowlist) | `packages/prisma/seed*.ts`, `scripts/*.ts` | SPRINT0-001 |
| Signup désactivable + allowlist domaines équipes | `apps/web/...signup...`, `packages/trpc/.../teams/create.handler.ts` | SPRINT0-002 |
| Rate-limit fail-closed prod | `packages/lib/rateLimit.ts` | SPRINT0-003 |
| Dockerfile non-root + retrait `ARG=secret` | `Dockerfile` | SPRINT0-004 |
| Boot guard secrets prod | `apps/web/instrumentation.ts` + module pur | SPRINT0-005 |
| PBAC stub → check Membership | `packages/features/pbac/...` | SPRINT1-001 |
| Advisory lock booking | `packages/features/bookings/lib/handleNewBooking.ts` | SPRINT1-002 / 003 |
| Magic-link maxAge | `packages/features/auth/lib/magicLinkMaxAge.ts` | SPRINT2-060 |
| Recurring count cap | `packages/features/bookings/lib/bookingCreateBodySchema.ts`, `packages/prisma/zod-utils.ts` | SPRINT2-061 |
| `bookings.find` drop `description` | `packages/trpc/server/routers/viewer/bookings/find.handler.ts` | SPRINT2-062 |
| AES-256-GCM (v2:) | `packages/lib/crypto.ts` (shim) → `crypto-clever.ts` | SPRINT2-001 |
| Backup codes 2FA bcrypt | `packages/features/auth/lib/backupCodes.ts` + 3 routes | SPRINT2-002 |
| `jwt.verify` exige une clé | `packages/features/auth/lib/oAuthAuthorization.ts` | SPRINT2-003 |
| Stripe OAuth nonce | `packages/app-store/_utils/oauth/decodeOAuthState.ts`, `packages/app-store/stripepayment/api/add.ts` | SPRINT2-010 |
| OAuth callbacks refuse state undefined | `packages/app-store/_utils/oauth/assertOAuthState.ts` + 5 routes | SPRINT2-011 |
| SSRF validation webhook send | `packages/features/webhooks/lib/sendPayload.ts` | SPRINT2-020 |
| SSRF validation CalDAV / ICS-feed | `packages/app-store/caldavcalendar/api/add.ts`, `.../ics-feedcalendar/api/add.ts` | SPRINT2-021 |
| Teams `isPrivate: true` par défaut | `packages/trpc/.../teams/create.handler.ts` | SPRINT2-030 |
| Sentry `beforeSend` PII scrub | `apps/web/lib/sentry/scrubEvent.ts`, `apps/web/sentry.server.config.ts` | SPRINT2-031 |
| Invite email + token consumption | `packages/trpc/.../teams/inviteMember.handler.ts`, `.../acceptOrLeave.handler.ts` | SPRINT2-040 |

## Procédure de rebase (à chaque sync upstream)

1. `git fetch upstream`
2. `git checkout -b sync/upstream-YYYYMMDD master`
3. `git rebase upstream/main`
4. Résoudre conflits — privilégier `git checkout --theirs <upstream-file>` pour
   les fichiers en shim (la logique vit dans le `-clever.ts`).
5. Lancer la suite tests : `TZ=UTC yarn test`.
6. Lancer `yarn type-check:ci --force`.
7. Ouvrir une PR `sync/upstream-YYYYMMDD → master`.
8. Merger `master` dans `remediation/audit-fix` (ne pas rebase pour
   garder l'historique des commits ticket).
9. Re-vérifier l'audit trail des findings : tout fichier touché par le
   rebase qui apparaît dans le tableau « Divergences en place » doit
   être re-testé en priorité.

## Audit

- Audit baseline : `audit/AUDIT_REPORT.md`, `audit/tickets.yaml`, `audit/sprint-plan.md`.
- Statut en cours : `audit/REMEDIATION_STATUS.md`.
- Items ops : `audit/OPS_TODO.md`.
- Ne jamais éditer les fichiers `audit/*.md` sauf `REMEDIATION_STATUS.md`
  et `OPS_TODO.md` — l'audit est figé pour traçabilité.
