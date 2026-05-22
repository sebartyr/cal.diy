# Plan de sprints cal.diy fork Clever Cloud — remédiation audit

## Cadrage

- **Effort estimé total** : ~25-30 jours.homme répartis sur 4 sprints + nettoyage continu
- **Bloquant prod** : Sprint 0 (Lockdown self-host)
- **Threat model intégré** : insider Clever + supply chain + threat externe Internet
- **Pass 2 Codex appliquée** : drops (SEC-109, SEC-206 final = ex-Info.tsx, PERF-005) + requalif (PERF-004 → investigate, BUG-014 fusion dans BUG-005)

---

## Sprint 0 — Lockdown self-host (BLOQUANT mise en service)
**Durée cible** : 3 jours.homme · **Ne pas exposer l'instance avant clôture.**

| Ticket | ID(s) finding | Sévérité | Owner | Effort |
|--------|---------------|----------|-------|--------|
| `SPRINT0-001` Lockdown scripts dev (allowlist DB) | SEC-300-FORK + SEC-301-FORK | P1 | presales-eng (Sébastien) | S |
| `SPRINT0-002` Signup désactivé + allowlist email domain | SEC-310-FORK | P3→P1 (contextuel) | backend | S |
| `SPRINT0-003` Rate-limit fail-closed en prod | SEC-200 | P0/P1 | backend-security | M |
| `SPRINT0-004` Dockerfile retrait ARG=secret + USER non-root | SEC-204 | P2→P1 (contextuel) | infra | S |
| `SPRINT0-005` Vérif `UNKEY_ROOT_KEY` set en config Clever | SEC-200 (ops) | n/a | ops | XS |

**Acceptance criteria globale Sprint 0** :
- Tentative de seed/dev-grant contre la DB Clever (hostname `*.clever-cloud.com`) → **REFUS** avec message clair.
- Tentative `POST /api/auth/signup` → 404.
- 200 requêtes login en parallèle sur user inexistant → ≥ 1 × 429 dans la fenêtre 60s.
- `docker history cal-diy:latest | grep -i secret` → vide.
- Sébastien + ops valident côté staging.

---

## Sprint 1 — P0 confirmés en PoC (compromission directe)
**Durée cible** : 4 jours.homme · Cible : fermer les findings exploitables démontrés.

| Ticket | ID | Sévérité | Owner | Effort |
|--------|----|----------|-------|--------|
| `SPRINT1-001` PBAC stub → `requireMember` réel | SEC-001 | P0 | backend-security | M |
| `SPRINT1-002` Double-booking — `pg_advisory_xact_lock` + e2e PoC | BUG-001 | P0 | backend | M |
| `SPRINT1-003` Booking PENDING idempotency | BUG-013 | P2 (couplé) | backend | XS |

**Acceptance criteria Sprint 1** :
- Re-run PoC SEC-001 → HTTP 403 sur `eventTypes.delete` cross-tenant.
- Re-run PoC BUG-001 (10 concurrent, `requiresConfirmation=true`) → exactement 1 booking PENDING en DB (autres en 409).
- Tests unitaires ajoutés couvrant les 2 scenarios.

---

## Sprint 2 — P1 critiques (chaîne credentials + RGPD)
**Durée cible** : 10 jours.homme · Fermeture des chaînes 2 et 3.

### Bloc Crypto & Auth (3.5 j)
| Ticket | ID | Owner | Effort |
|--------|----|-------|--------|
| `SPRINT2-001` Migration AES-256-GCM avec `v2:` prefix + lazy re-encrypt | SEC-100 | backend-security | M |
| `SPRINT2-002` Backup codes 2FA bcrypt | SEC-009 (sub) | backend-security | M |
| `SPRINT2-003` jwt.verify early throw si `CALENDSO_ENCRYPTION_KEY` absent | SEC-003 | backend | XS |

### Bloc OAuth (1.5 j)
| Ticket | ID | Owner | Effort |
|--------|----|-------|--------|
| `SPRINT2-010` Retirer Stripe de `NONCE_EXEMPT_APPS` + nonce cookie 4 autres | SEC-101 | backend-security | S |
| `SPRINT2-011` OAuth callbacks reject `state === undefined` (5 apps) | SEC-102 | backend | S |

### Bloc SSRF (2 j)
| Ticket | ID | Owner | Effort |
|--------|----|-------|--------|
| `SPRINT2-020` `validateUrlForSSRF` async + DNS pinning sur webhook send | SEC-103 | backend-security | M |
| `SPRINT2-021` Validate URL sur CalDAV `add` + ICS-feed `add` | SEC-104 | backend | S |

### Bloc RGPD (2 j)
| Ticket | ID | Owner | Effort |
|--------|----|-------|--------|
| `SPRINT2-030` Default `isPrivate: true` + `isSEOIndexable=false` flag | SEC-307-FORK + SEC-308-FORK | backend | XS |
| `SPRINT2-031` Vérif région Sentry (EU ou désactivation) | RGPD-302-FORK | ops | XS |
| `SPRINT2-032` DPIA déclenché DPO | RGPD-300-FORK | dpo | — |

### Bloc Fork features incomplete (1 j)
| Ticket | ID | Owner | Effort |
|--------|----|-------|--------|
| `SPRINT2-040` `inviteMember` — envoi email + consumption token | SEC-302-FORK + BUG-100-FORK | backend | M |

### Bloc Produit-decision required (parallel discussion)
| Ticket | ID | Statut | Note |
|--------|----|--------|------|
| `SPRINT2-050` `requiresBookerEmailVerification` default ON | SEC-106 | requires_pm_decision | trade-off UX vs phishing signé Clever |
| `SPRINT2-051` Embed iframe — origin check OU désactivation | SEC-202 | requires_pm_decision | dépend de l'usage embed |
| `SPRINT2-052` Booking event-type `hidden` → 404 | SEC-105 | requires_pm_decision | sémantique "hidden" à clarifier produit |

### Trio quick-wins (XS chacun, 0.5 j cumulé)
| Ticket | ID | Owner | Effort |
|--------|----|-------|--------|
| `SPRINT2-060` Magic-link `maxAge` 10 min (bug commentaire) | SEC-008 | backend | XS |
| `SPRINT2-061` Recurring `count` borné `max(52)` | BUG-005 | backend | XS |
| `SPRINT2-062` `bookings.find` drop `description` du select | SEC-012 | backend | XS |

**Acceptance criteria Sprint 2** :
- Aucun secret OAuth lisible en clair après le re-encrypt (sample 10 credentials).
- Tentative SSRF `http://[::ffff:169.254.169.254]/` sur webhook → 400.
- Nouvelle team créée → `isPrivate=true`, page publique 404 ou liste vide.
- Email d'invitation envoyé visible en MailHog/staging.
- DPIA en cours côté DPO.

---

## Sprint 3 — Defense in depth + perf + fork strategy
**Durée cible** : 7 jours.homme

### Bloc CSP (1.5 j)
| Ticket | ID | Owner | Effort |
|--------|----|-------|--------|
| `SPRINT3-001` Étendre CSP matcher à tout (sauf `_next/static/...`) en `Report-Only` 48h | SEC-201 | frontend | S |
| `SPRINT3-002` Retrait `'unsafe-inline' https:` du `script-src` en prod | SEC-205 | frontend | S |

### Bloc Indexes Prisma (1 j, avec EXPLAIN avant migration)
| Ticket | ID | Owner | Effort | Notes |
|--------|----|-------|--------|-------|
| `SPRINT3-010` `EXPLAIN` sur Webhook trigger queries en staging | BUG-009 | backend-security | S | requires_explain |
| `SPRINT3-011` Migration `Webhook @@index([userId/teamId/eventTypeId/platformOAuthClientId])` CONCURRENTLY | BUG-009 | backend | S | |
| `SPRINT3-012` Migration `Booking @@index([eventTypeId, startTime, status])` CONCURRENTLY | PERF-010 | backend | S | requires_explain |

### Bloc Bugs DST + idempotency (1 j)
| Ticket | ID | Owner | Effort |
|--------|----|-------|--------|
| `SPRINT3-020` DST `utcOffset` calculé à la date du slot | BUG-003 | backend | XS |
| `SPRINT3-021` `idempotencyKey` extension couvre ACCEPTED + PENDING | BUG-013 (couvert Sprint 1?) | backend | XS |

### Bloc Fork strategy (1.5 j)
| Ticket | ID | Owner | Effort |
|--------|----|-------|--------|
| `SPRINT3-030` Externaliser `canManageEventType` (réduire couplage upstream) | FORK-300-FORK | backend | S |
| `SPRINT3-031` Créer `FORK-NOTES.md` racine + procédure rebase | FORK-301-FORK | presales-eng | XS |
| `SPRINT3-032` Pinner strict Radix + activer Renovate | SEC-309-FORK | infra | S |
| `SPRINT3-033` Semgrep + CodeQL en CI | FORK-302-FORK | infra | S |

### Bloc Audit trail + 2FA admin (2 j)
| Ticket | ID | Owner | Effort |
|--------|----|-------|--------|
| `SPRINT3-040` Audit trail actions admin (log structuré minimum) | SEC-305-FORK | backend-security | M |
| `SPRINT3-041` 2FA imposé pour `UserPermissionRole.ADMIN` | RGPD §9 / nouveau | backend-security | S |

---

## Sprint 4 — P2/P3 continu + RGPD continu
**Durée cible** : 5-6 jours.homme étalés

### P2 restants (~3 j)
- SEC-005 (pwd ≥ 7 chars) → ≥ 12
- SEC-006 (pwd policy)
- SEC-007 (reset token clair → sha256 hash + migration)
- SEC-011 (disable 2FA sans password pour OAuth)
- SEC-015 (avatar base64 sans limite)
- SEC-102 (si pas couvert Sprint 2)
- SEC-107 (OAuth refresh race lock)
- SEC-203 (markdown `_blank` noopener)
- SEC-303-FORK (teams.create quota)
- SEC-304-FORK (image field size)
- SEC-306-FORK (adminDelete check bookings actifs)
- BUG-002 (reset password race)
- BUG-004 (DST working hours)
- BUG-006 (recurring await sequential)
- BUG-007 (catches OAuth silencieux)
- BUG-011 (migrations CONCURRENTLY pattern)
- BUG-101-FORK (adminList pagination)
- BUG-102-FORK (requireMember synthetic id -1)
- PERF-002 (logger.silly guard)
- PERF-003 (ISR public pages)
- PERF-009 (getPublicEvent bundle repo)
- PERF-011 (logo route cap)

### P3 batched (Epic `cleanup-p3-batch-Q3`)
- SEC-004, SEC-010, SEC-013, SEC-014, SEC-016, SEC-017, SEC-108, SEC-207
- BUG-008, BUG-010, BUG-012, BUG-014
- PERF-006, PERF-007, PERF-008
- PERF-100-FORK

### Bloc DPO/Ops continu
| Ticket | ID | Owner | Effort |
|--------|----|-------|--------|
| `SPRINT4-100` DPIA finalisé + page `/privacy` + liste sous-traitants | RGPD checklist §10 | dpo + frontend | L |
| `SPRINT4-101` Cron purge `VerificationToken` expirés | RGPD-301-FORK | backend | S |
| `SPRINT4-102` Politique rétention `Booking` + cron de purge | RGPD-301-FORK | backend + dpo | M |
| `SPRINT4-103` Procédure breach notification < 72h | gouvernance | ops + dpo | — |

### Investigations (pas tickets de fix direct)
| Ticket | ID | Owner | Note |
|--------|----|-------|------|
| `INVEST-001` Mesure PERF-004 React Profiler équipe 50 hosts | PERF-004 | frontend | requires_explain |
| `INVEST-002` Reproduction DST BUG-002 ciblée | BUG-002 | backend | |
| `INVEST-003` PERF-001 mesure pool Prisma équipe 50+ hosts | PERF-001 | backend | requires_explain |

---

## Findings écartés (Codex Pass 2)

| ID | Décision | Justification |
|----|----------|---------------|
| SEC-109 | DROP | Stripe webhook stub 404 — pas de vuln actuelle, simple note mainteneur |
| SEC-206 (Info.tsx) | DROP | CSS constant, pas d'entrée utilisateur — pattern fragile mais non-exploitable |
| PERF-005 | DROP/INVESTIGATE | `useFieldArray` ≠ rerender keystroke — preuve insuffisante |
| BUG-014 (rrule) | FUSION → BUG-005 | Bump rrule géré dans le ticket recurring count |

---

## Timeline indicative

```
S0   Sprint 0 ████ (Lockdown — bloquant prod, 3 j)
S1   Sprint 1 ████ (P0 confirmés, 4 j)
S2   Sprint 2 ██████████ (Chaînes 2+3, 10 j) — peut chevaucher S1 partiellement
S3   Sprint 3 ███████ (DefDepth + perf, 7 j)
S4   Sprint 4 +++++++ (P2/P3 continu, 5-6 j étalés sur 2-4 semaines)
```

**Mise en service publique possible** : fin Sprint 2 (chaînes critiques fermées). Avant fin Sprint 2 = accès VPN/IP-allowlist uniquement.

## Dépendances

- `SPRINT2-001` (AES-GCM) bloque `SPRINT2-002` partiellement (backup codes utilisent la même clé).
- `SPRINT2-040` (invite email) requiert le `EmailService` upstream — vérifier qu'il est opérationnel sur Clever.
- `SPRINT3-040` (audit trail) dépend du schema — possible sans migration (logs structurés stdout suffisent en MVP).
- `SPRINT4-100` (DPIA + privacy) requiert finalisation côté DPO — démarrer ASAP.
