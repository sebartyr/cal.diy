# État de la remédiation cal.diy

- Branche : `remediation/audit-fix` (depuis `audit/baseline-pre-remediation`)
- Tag baseline : `pre-remediation-20260520` (sur `master @ 3e50c176fe`)
- Démarré : 2026-05-20

## Sprint 0 — Lockdown self-host (en cours)

| Ticket | Finding | Statut | Date | Commit | Notes |
|--------|---------|--------|------|--------|-------|
| SPRINT0-001 | SEC-300-FORK + SEC-301-FORK | DONE | 2026-05-20 | `6ed57748f0` | Hostname allowlist + `ALLOW_DEV_DB_HOSTNAME` escape hatch (literal match) + tests 15/15. Exit 1 confirmé sur hostname `*.clever-cloud.com` sans override. |
| SPRINT0-002 | SEC-310-FORK | DONE | 2026-05-20 | `6f40001c54` | Signup déjà géré upstream (`NEXT_PUBLIC_DISABLE_SIGNUP`). Ajout `TEAMS_ALLOWED_EMAIL_DOMAINS` côté `teams.create` + tests 5/5 + doc `.env.example`. |
| SPRINT0-003 | SEC-200 | DONE | 2026-05-20 | `3a6723d4f4` | Fail-closed prod (throw si UNKEY absent), fallback sliding window in-memory dev/test. Tests 6/6. |
| SPRINT0-004 | SEC-204 | DONE | 2026-05-20 | `2dad1c1a40` | Retrait défauts `=secret`, USER calcom (uid 1001) en runner. Validation `docker build` à faire côté infra. |
| SPRINT0-005 | SEC-200 (ops) | DONE | 2026-05-20 | `e72bf6ef61` | Boot check `instrumentation.ts` + module pur testable. Tests 9/9. Vérif UNKEY côté ops → `audit/OPS_TODO.md`. |

## Sprint 1 — P0 confirmés en PoC (à venir)

| Ticket | Finding | Statut | Date | Commit | Notes |
|--------|---------|--------|------|--------|-------|
| SPRINT1-001 | SEC-001 | DONE | 2026-05-20 | `8c57f5f8d2` | Stub remplacé par check Membership réel sur 5 fichiers. Tests 35/35 (8 PermissionCheckService + 27 util). |
| SPRINT1-002 | BUG-001 | DONE | 2026-05-20 | `51f97a480d` | `pg_advisory_xact_lock(int4, int4)` sur `(userId, slotStart_sec)` + re-check overlap dans transaction. Couvre ACCEPTED uniquement (PENDING = queue intentionnelle, cf. BUG-013). Tests 5/5. |
| SPRINT1-003 | BUG-013 | DONE | 2026-05-20 | `69352e3127` | Étendu à PENDING avec bookerEmail folded-in (case-insensitive). Permet queue legitime, bloque retries same-email. Tests 8/8. |

## Sprint 2 — P1 critiques (en cours)

| Ticket | Finding | Statut | Date | Commit | Notes |
|--------|---------|--------|------|--------|-------|
| SPRINT2-060 | SEC-008 | DONE | 2026-05-20 | `a6f71df645` | `MAGIC_LINK_MAX_AGE_SECONDS=600s` extrait dans `packages/features/auth/lib/magicLinkMaxAge.ts`. Tests 4/4. |
| SPRINT2-061 | BUG-005 | DONE | 2026-05-20 | `74368fbd8e` | `recurringCount` plafonné à 52 côté booking-body + `recurringEventType` event-type. Tests 10/10. |
| SPRINT2-062 | SEC-012 | DONE | 2026-05-20 | `ea1bbe62f5` | Drop `description` du select `bookings.find` (public procedure). Aucun caller régressé. Tests 4/4. |
| SPRINT2-001 | SEC-100 | DONE | 2026-05-20 | `1746dfc950` | AES-256-CBC → AES-256-GCM avec préfixe `v2:`. Décodeur auto-détecte legacy (lazy re-encrypt). Tests 18/18. |
| SPRINT2-002 | SEC-009 | DONE | 2026-05-20 | `37654aba05` | Backup codes 2FA bcrypt'd. Helper avec lazy upgrade depuis legacy plaintext. 3 call-sites mis à jour. Tests 12/12. |
| SPRINT2-003 | SEC-003 | DONE | 2026-05-20 | `b1ed578896` | `jwt.verify` throw si `CALENDSO_ENCRYPTION_KEY` absent (au lieu de silently return null). Tests 6/6. |
| SPRINT2-010 | SEC-101 | DONE | 2026-05-20 | `a3c3d65417` | Stripe retiré de `NONCE_EXEMPT_APPS`. `encodeOAuthState` wiré dans `stripepayment/api/add.ts`. Tests 6/6. |
| SPRINT2-011 | SEC-102 | DONE | 2026-05-20 | `35c3190db2` | 5 callbacks (zoom, o365, google, feishu, lark) refusent un state undefined via `assertOAuthState`. Tests 3/3. |
| SPRINT2-020 | SEC-103 | DONE | 2026-05-20 | `f54f9cc44b` | `validateUrlForSSRF` (async, DNS-aware) avant fetch webhook. Pinning DNS reporté Sprint 3 (OPS_TODO). Tests 6/6. |
| SPRINT2-021 | SEC-104 | DONE | 2026-05-20 | `f7ce027b0c` | CalDAV `add.ts` + ICS-feed `add.ts` valident l'URL via SSRF. Tests 7/7. |
| SPRINT2-030 | SEC-307+308-FORK | DONE | 2026-05-20 | `193987a79b` | `teams.create` force `isPrivate: true` (application layer). Migration `User.allowSEOIndexing` → OPS_TODO Sprint 4. Tests 7/7. |
| SPRINT2-031 | RGPD-302 | DONE | 2026-05-20 | `c934beb78c` | Sentry `beforeSend` scrub PII (cookies, auth headers, emails redacted). Guard runtime Node-only sur prismaIntegration/httpIntegration → fix warning edge. Tests 12/12. |
| SPRINT2-040 | SEC-302-FORK + BUG-100-FORK | DONE | 2026-05-20 | `d5964b9a20` | `inviteMember` envoie l'email (via `sendTeamInviteEmail`). `acceptOrLeave` consomme le `inviteToken` atomiquement (optionnel). Tests 7/7. |
| SPRINT2-032 | RGPD-300-FORK | OPS | — | — | DPIA côté DPO Clever, suivi dans `audit/OPS_TODO.md`. |
| SPRINT2-050 | SEC-106 | DEFERRED | — | — | `requiresBookerEmailVerification` default → PM decision. |
| SPRINT2-051 | SEC-202 | DEFERRED | — | — | Embed iframe origin check → PM decision. |
| SPRINT2-052 | SEC-105 | DEFERRED | — | — | Booking event-type `hidden` 404 → PM decision. |

## Sprints 3/4 — à venir

Voir `audit/sprint-plan.md` et `audit/tickets.yaml` pour la liste complète.

## Conventions

- Une ligne par ticket clos, mise à jour au moment du commit.
- `Statut` : `TODO` / `IN PROGRESS` / `BLOCKED` / `DONE` / `DEFERRED`.
- `Commit` : SHA court du commit qui ferme le ticket.
- `Notes` : blocages, dépendances ops, décisions produit en attente.
