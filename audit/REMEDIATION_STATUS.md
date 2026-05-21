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

## Sprint 3 — Defense in depth + perf + fork strategy (en cours)

| Ticket | Finding | Statut | Date | Commit | Notes |
|--------|---------|--------|------|--------|-------|
| SPRINT3-031 | FORK-301-FORK | DONE | 2026-05-21 | `35decb9fda` | `FORK-NOTES.md` racine + tableau des divergences + procédure rebase. |
| SPRINT3-020 | BUG-003 | DONE | 2026-05-21 | `f2697bdf61` | `getUTCOffsetByTimezone(tz, slot)` au lieu de `(tz)` autour des transitions DST. Tests 3/3. |
| SPRINT3-001 | SEC-201 | DONE | 2026-05-21 | `64620fc914` | CSP `Report-Only` sur toutes les page-paths via tri-state `cspModeFor`. Matcher élargi (sauf `_next/static/...`). Tests proxy 21/21. |
| SPRINT3-002 | SEC-205 | DONE | 2026-05-21 | `7337bc91d1` | `script-src` prod = `'nonce-X' 'strict-dynamic'` (drop `'unsafe-inline' https:`). Trade-off legacy browsers documenté. Tests CSP 5/5. |
| SPRINT3-030 | FORK-300-FORK | DONE | 2026-05-21 | `5251e0f358` | Helpers extraits dans `authorization-clever.ts` (`canManageEventType`, `isTeamAdminOrOwner`, `assertCanAccessWebhook`). Diff `util.ts` vs upstream ~5 lignes structurelles. Tests 15/15. |
| SPRINT3-040 | SEC-305-FORK | DONE | 2026-05-21 | `01a8c16c02` | `recordAdminAction` / `recordAdminDenial` + intégration `isAdminMiddleware` + 3 handlers destructifs (lockUserAccount, removeTwoFactor, sendPasswordReset). Tests 3/3. |
| SPRINT3-041 | nouveau (RGPD §9) | DONE | 2026-05-21 | `aff95153c5` | `REQUIRE_2FA_FOR_ADMIN` opt-in via env. Refuse `FORBIDDEN` + denial trail si admin sans 2FA. Tests 5/5. |
| SPRINT3-032 | SEC-309-FORK | DONE | 2026-05-21 | `0f3be798f8` | Caret retirés sur @radix-ui (apps/web + packages/ui), `renovate.json` racine (grouping radix, vulnerability alerts, semantic commits). |
| SPRINT3-033 | FORK-302-FORK | DONE | 2026-05-21 | `2327502dcd` | Workflows `semgrep.yml` (OWASP/TS/React/secrets, SARIF upload) + `codeql.yml` (security-extended) sur PRs ready + push master/remediation + cron hebdo. |
| SPRINT3-010 | BUG-009 | OPS | — | — | `requires_explain` — EXPLAIN webhook trigger queries reporté `audit/OPS_TODO.md`. |
| SPRINT3-011 | BUG-009 | OPS | — | — | Migration index Webhook `@@index([userId,teamId,eventTypeId,platformOAuthClientId])` CONCURRENTLY après EXPLAIN. |
| SPRINT3-012 | PERF-010 | OPS | — | — | Migration index Booking `@@index([eventTypeId,startTime,status])` CONCURRENTLY après EXPLAIN. |
| SPRINT3-021 | BUG-013 | DONE | — | — | Déjà couvert Sprint 1 (`51f97a480d` + `69352e3127`). |

## Sprint 4 — P2/P3 continu (en cours)

| Ticket | Finding | Statut | Date | Commit | Notes |
|--------|---------|--------|------|--------|-------|
| SPRINT4-001 | SEC-005 | DONE | 2026-05-21 | `0119f3d7f5` | Min password length 7 → 12. Strict (admin) inchangé. Tests 6/6. |
| SPRINT4-018 | BUG-102-FORK | DONE | 2026-05-21 | `17ae14b89d` | `requireMember` retourne `RequireMemberResult` union avec `id: null` + `isSyntheticAdmin: true` au lieu de `id: -1`. Tests 6/6. |
| SPRINT4-008 | SEC-203 | DONE | 2026-05-21 | `0c767e3e6c` | `rel='noopener noreferrer'` ajouté sur les `<a>` rendus par markdown (server + client). Tests 3/3. |
| SPRINT4-019 | PERF-002 | DONE | 2026-05-21 | `86f3c63b9f` | `isSillyEnabled(log)` helper + guards sur 8 call-sites (EventManager + getBusyTimes). Tests 4/4. |
| SPRINT4-015 | BUG-007 | DONE | 2026-05-21 | `1def8611c4` | Catches OAuth/credential : `logger.warn`/`error` ajouté (larkcalendar, feishucalendar, webex). |
| SPRINT4-014 | BUG-006 | DONE | 2026-05-21 | `791ab6655c` | Recurring booking 1er slot séquentiel puis Promise.all batches de 5. Tests 1/1 + scenario test inchangé. |
| SPRINT4-012 | BUG-002 | DONE | 2026-05-21 | `d02f67765e` | Reset-password consume atomique via `updateMany` (id + expires>now → expires=now). |
| SPRINT4-011 | SEC-306-FORK | DONE | 2026-05-21 | `59d19f8bcf` | `adminDelete` refuse si bookings actifs futurs sauf `force=true`. Tests 6/6. |
| SPRINT4-017 | BUG-101-FORK | DONE | 2026-05-21 | `59d19f8bcf` | `adminList` paginé (cursor + limit). Tests 6/6. |
| SPRINT4-009 | SEC-303-FORK | DONE | 2026-05-21 | `fa24c476ad` | Quota teams.create via `MAX_TEAMS_PER_USER` (default 50). Tests 3/3. |

## Sprint 4 — reste à traiter

Voir `audit/sprint-plan.md` et `audit/tickets.yaml` pour la liste complète.

## Conventions

- Une ligne par ticket clos, mise à jour au moment du commit.
- `Statut` : `TODO` / `IN PROGRESS` / `BLOCKED` / `DONE` / `DEFERRED`.
- `Commit` : SHA court du commit qui ferme le ticket.
- `Notes` : blocages, dépendances ops, décisions produit en attente.
