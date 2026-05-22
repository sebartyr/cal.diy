# Rollout checklist cal.diy fork Clever Cloud

Checklist opérationnelle pour la mise en service. Chaque item est verifiable factuellement ; ne pas cocher tant que la preuve n'est pas captured.

---

## Gate 0 — Lockdown (BLOQUANT mise en service publique)

### Code merged & deployed sur staging

- [ ] `SPRINT0-001` — `scripts/dev-grant-password.ts` refuse `*.clever-cloud.com` (test manuel)
- [ ] `SPRINT0-001` — `scripts/seed-test-team.ts` refuse `NODE_ENV=production` ou hostname non-allowlist
- [ ] `SPRINT0-002` — `POST /api/auth/signup` retourne 404 quand `SIGNUP_DISABLED=true`
- [ ] `SPRINT0-002` — `GET /auth/signup` retourne 404
- [ ] `SPRINT0-003` — `rateLimit.ts` refuse le boot en `NODE_ENV=production` sans `UNKEY_ROOT_KEY`
- [ ] `SPRINT0-004` — `docker history cal-diy:latest | grep -i NEXTAUTH_SECRET` → vide
- [ ] `SPRINT0-004` — `docker run --rm cal-diy id` → uid != 0

### Vérifications ops Clever
- [ ] `SPRINT0-005` — `UNKEY_ROOT_KEY` provisionné sur l'env hosted (config vérifiée par ops)
- [ ] `CALENDSO_ENCRYPTION_KEY` ≥ 32 caractères, généré aléatoire
- [ ] `NEXTAUTH_SECRET` ≥ 32 caractères, généré aléatoire (≠ "secret")
- [ ] `DATABASE_URL` masqué dans tous les logs (vérif Sentry, stdout)
- [ ] Backups DB chiffrés (côté Clever Cloud — confirmation infra)
- [ ] Allowlist IP / VPN actif sur l'instance jusqu'à clôture du Sprint 2

### Validation PoC
- [ ] Re-run `scripts/audit-poc/poc-sec-200.sh` → ≥ 1 × 429 dans la fenêtre
- [ ] Re-run `scripts/audit-poc/poc-sec-001.ts` → HTTP 403 sur `eventTypes.delete` cross-tenant
- [ ] Re-run `scripts/audit-poc/poc-bug-001.ts` (avec `requiresConfirmation=true`) → exactement 1 booking, 9 × 409

---

## Gate 1 — Sprint 1 closed

### Vérifications fonctionnelles
- [ ] Test e2e nouveau couvrant SEC-001 (10 procedures × user non-membre = 403)
- [ ] Test e2e nouveau couvrant BUG-001 (concurrent same-slot)
- [ ] Type-check + lint OK (`yarn type-check:ci --force && yarn biome check --write .`)

### Migration data (si applicable)
- [ ] Aucune migration Prisma destructive sur cette ronde
- [ ] Rollback documenté (revert + redeploy ancien tag)

---

## Gate 2 — Sprint 2 closed (mise en service publique possible)

### Crypto & Auth
- [ ] Sample de 10 credentials `decrypt` OK avant + après déploiement SPRINT2-001
- [ ] Aucun credential reste en AES-CBC après 1 semaine de prod (compteur Sentry/log)
- [ ] Backup codes des comptes existants régénérés au prochain login admin
- [ ] Boot fail si `CALENDSO_ENCRYPTION_KEY` absent

### OAuth
- [ ] Test callback Stripe sans state → 400
- [ ] Test callback Webex/Basecamp/Dub/Tandem → vérif cookie nonce
- [ ] Test callback Zoom/Office365/Feishu/Lark/Google avec `state=undefined` → 400

### SSRF
- [ ] POST webhook `subscriberUrl=http://[::ffff:169.254.169.254]/` → 400
- [ ] POST CalDAV `url=http://10.0.0.1/` → 400 (en mode non-self-host)
- [ ] POST ICS-feed même test → 400
- [ ] DNS rebinding test (TTL court) → bloqué au send

### RGPD
- [ ] Nouvelle team via UI → `isPrivate=true` en DB
- [ ] `GET /team/<slug-d-une-team-privée>` → no members list, robots noindex
- [ ] Email d'invitation visible côté staging MailHog/Mailtrap
- [ ] Sentry sur région EU OU désactivé (vérification ops)
- [ ] DPIA en cours côté DPO (statut documenté)

### Décisions produit prises
- [ ] `SPRINT2-050` — décision tranchée pour `requiresBookerEmailVerification` (default ON ou rate-limit alternatif)
- [ ] `SPRINT2-051` — embed iframe : conservé avec origin check OU désactivé
- [ ] `SPRINT2-052` — sémantique `hidden` clarifiée

### Communication
- [ ] Annonce interne (mail/Slack) : "instance bascule en accès public à partir du JJ/MM"
- [ ] Page `/privacy` provisionnelle en place (même si DPIA pas finalisée)

---

## Gate 3 — Sprint 3 closed (durcissement opérationnel)

### CSP
- [ ] Header `Content-Security-Policy-Report-Only` actif 48h, violations triées
- [ ] Passage en `Content-Security-Policy` enforce
- [ ] `'unsafe-inline' https:` retiré du `script-src` en prod
- [ ] Aucune régression UI (test smoke sur 10 pages clés)

### Perf
- [ ] EXPLAIN Webhook trigger avant/après migration index — gain mesuré
- [ ] EXPLAIN getBusyTimesForLimitChecks avant/après — gain mesuré
- [ ] Migrations CONCURRENTLY déployées sans verrou perceptible (vérif sur staging avec table sizeable)

### Fork strategy
- [ ] `FORK-NOTES.md` mergé à la racine
- [ ] `canManageEventType` externalisé dans son propre fichier
- [ ] `package.json` Radix versions strict pinned (sans `^`)
- [ ] `renovate.json` actif (1ère PR de bump observée)
- [ ] Semgrep workflow vert sur master
- [ ] CodeQL workflow vert sur master

### Audit & 2FA admin
- [ ] Logs structurés visibles sur Sentry breadcrumb pour 1 `teams.delete` test
- [ ] Tentative login admin sans 2FA → forcé en setup avant accès admin pages

---

## Gate 4 — Sprint 4 continu

### Suivi mensuel
- [ ] Compteur P3 résolus / mois (objectif : finir epic Q3)
- [ ] Investigations (`INVEST-001..003`) lancées
- [ ] DPIA finalisé + page `/privacy` complète + sous-traitants documentés
- [ ] Cron purges `VerificationToken` + `Booking` actifs

### Audit upstream
- [ ] 1ère sync `upstream/main` réalisée < 15 jours après mise en service
- [ ] Slack `#cal-clever-security` créé + responsable rotatif désigné
- [ ] 1 CVE upstream cherry-pick réalisée (procédure validée)

---

## Rollback plan

### Si incident en Sprint 0 / 1
- `git revert` du commit fautif sur `master`
- Redeploy via tag `pre-sprint-0` (à créer en début de Sprint 0)
- Pas de migration DB destructive — rollback technique trivial

### Si incident Sprint 2 (AES migration ou OAuth)
- AES : le format `v2:` est rétrocompatible (decrypt CBC legacy reste OK) — rollback = simple revert
- OAuth : retirer le nonce check via flag d'urgence `OAUTH_NONCE_BYPASS=true` (à ajouter au ticket si nécessaire)

### Si incident Sprint 3 (CSP)
- Phase Report-Only sans risque (header informatif)
- Si enforce casse une page : retour Report-Only via env `CSP_REPORT_ONLY=true`

### Si migration Prisma fail
- `yarn workspace @calcom/prisma db-rollback` (si script existe) OU revert SQL manuel
- `CREATE INDEX CONCURRENTLY` est idempotent — pas de risque DDL

---

## Critères go/no-go par gate

| Gate | Décideur | Critère go |
|------|----------|------------|
| Gate 0 | presales-eng (Sébastien) + ops | 100% des items cochés, PoC re-runs OK |
| Gate 1 | backend-security | Tests e2e SEC-001 + BUG-001 verts en CI |
| Gate 2 | DPO + presales-eng + ops | DPIA en cours, décisions produit tranchées, RGPD §1-3 + §5-9 OK |
| Gate 3 | presales-eng + infra | CSP enforce sans régression, FORK-NOTES.md mergé |
| Gate 4 | presales-eng | Suivi mensuel — pas un gate dur |

---

## Communications de crise (en cas de breach)

1. **Activer la procédure interne Clever** (à formaliser dans `SPRINT4-103`)
2. **Notification CNIL < 72h** si données personnelles compromises (Art. 33 RGPD)
3. **Notification individus concernés** si risque élevé (Art. 34 RGPD)
4. **Audit trail / logs** : capturer immédiatement (`SPRINT3-040` requis pour faire ce travail efficacement)
5. **Rotation secrets immédiate** : `CALENDSO_ENCRYPTION_KEY`, `NEXTAUTH_SECRET`, tokens OAuth si chaîne 2 active
6. **Invalidation toutes les sessions** : `prisma.session.deleteMany()` + force re-login
7. **Communication interne** (Slack `#cal-clever-security` + ManCom)
8. **Communication externe** si nécessaire (template à préparer dans `SPRINT4-103`)

---

## Définition de "done"

L'instance peut être considérée comme **production-ready public** quand :
- Tous les items de Gate 0 + Gate 1 + Gate 2 sont cochés
- Au moins 80% des items de Gate 3 sont cochés
- DPIA en cours OU finalisée
- 2 personnes ops Clever connaissent la procédure rollback
