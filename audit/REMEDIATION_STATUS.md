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
| SPRINT1-001 | SEC-001 | TODO | — | — | PBAC stub → vrai check Membership |
| SPRINT1-002 | BUG-001 | TODO | — | — | Double-booking pg_advisory_xact_lock |
| SPRINT1-003 | BUG-013 | TODO | — | — | idempotencyKey ACCEPTED + PENDING |

## Sprints 2/3/4 — à venir

Voir `audit/sprint-plan.md` et `audit/tickets.yaml` pour la liste complète.

## Conventions

- Une ligne par ticket clos, mise à jour au moment du commit.
- `Statut` : `TODO` / `IN PROGRESS` / `BLOCKED` / `DONE` / `DEFERRED`.
- `Commit` : SHA court du commit qui ferme le ticket.
- `Notes` : blocages, dépendances ops, décisions produit en attente.
