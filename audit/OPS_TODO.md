# Actions ops Clever — à traiter en parallèle de la remédiation

Liste des items que Claude Code **ne peut pas** traiter depuis le repo et qui requièrent une intervention humaine côté infrastructure Clever Cloud.

## Sprint 0 — Bloquant avant exposition publique

- [ ] **UNKEY_ROOT_KEY provisionné** sur l'environnement hosted Clever (`SPRINT0-005`).
  - Confirmer la présence dans la config (sans logger la valeur).
  - Si non provisionné : la modif `SPRINT0-003` fera échouer le boot en production — bloquant.
- [ ] **CALENDSO_ENCRYPTION_KEY** ≥ 32 caractères, généré aléatoirement.
- [ ] **NEXTAUTH_SECRET** ≥ 32 caractères, généré aléatoirement, ≠ `"secret"`.
- [ ] Vérifier que `DATABASE_URL` est masqué dans tous les logs (Sentry, stdout).
- [ ] Vérifier que les backups DB sont chiffrés (Clever Cloud confirmation infra).

## Sprint 2 — Avant mise en service publique

- [ ] **Sentry SDK drift** (préexistant Sprint 0/1) : `sentry.server.config.ts` importe `httpIntegration` / `prismaIntegration` qui n'existent pas dans le build edge `@sentry/nextjs` actuel (Next 16). À traiter en même temps que RGPD-302 (scrubbing) — soit bump SDK, soit guard `NEXT_RUNTIME === "nodejs"`, soit désactiver l'integration edge.
- [ ] **Région Sentry** : EU obligatoire (RGPD-302-FORK). Soit Sentry SaaS EU, soit self-hosted Sentry EU, soit désactivation totale.
- [ ] **DPIA déclenchée** côté DPO Clever (RGPD-300-FORK + SPRINT2-032).
- [ ] **Allowlist IP / VPN** maintenue jusqu'à clôture Sprint 2.
- [ ] Décision produit sur `requiresBookerEmailVerification` default (SPRINT2-050).
- [ ] Décision produit sur embed iframe : conservé ou désactivé (SPRINT2-051).
- [ ] Décision produit sur sémantique `hidden` event-type (SPRINT2-052).

## Sprint 3 — Durcissement opérationnel

- [ ] **Webhook DNS pinning** (SEC-103 follow-up) : `sendPayload` re-valide l'URL juste avant fetch (SPRINT2-020) mais il reste une fenêtre TOCTOU ~ms entre la résolution DNS et le connect. Pour fermer : utiliser `undici.Agent` avec `connect.lookup` custom qui réutilise l'IP résolue par `validateUrlForSSRF`. Reporté Sprint 3 car nécessite une refonte du dispatcher fetch.

- [ ] Création du channel Slack `#cal-clever-security`.
- [ ] Désignation d'un responsable rotatif (1 personne / sprint) pour traiter les advisories upstream.
- [ ] Activation de l'alerting Sentry sur les logs audit trail (SPRINT3-040).
- [ ] Vérification des credentials Google Workspace + Pipedrive — DPAs signés.

## Sprint 4 — Continu

- [ ] **Migration Prisma `User.allowSEOIndexing` default → false** (SEC-308-FORK suite) : SPRINT2-030 a fixé le défaut côté `teams.create` au niveau applicatif (`isPrivate: true`). Pour aller plus loin, changer la valeur par défaut de `User.allowSEOIndexing` dans le schéma Prisma — nécessite migration et validation produit (rétroactif sur les comptes existants ? non-rétroactif via migration limitée aux nouveaux). À discuter avec produit avant d'écrire la migration.

- [ ] DPIA finalisée, page `/privacy` publiée.
- [ ] Procédure breach notification < 72h formalisée (SPRINT4-103).
- [ ] Backups chiffrés rotations vérifiées (cycle mensuel).
- [ ] Rotation périodique des secrets (`CALENDSO_ENCRYPTION_KEY`, `NEXTAUTH_SECRET`) — cycle annuel a minima.

## Vérifications continues

- [ ] Réception correcte des alertes Sentry par l'équipe oncall.
- [ ] Renovate ouvre les PRs sur master (vérif 1 PR/semaine au minimum après Sprint 3).
- [ ] Suivi des CVE upstream cal.com (procédure cherry-pick documentée).
