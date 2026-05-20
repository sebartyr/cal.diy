# Audit fork Clever Cloud — findings spécifiques au diff

- Périmètre strict : ce que le fork Clever Cloud ajoute/modifie vs upstream `cal.com/main`.
- Threat model par défaut : **insider Clever Cloud authentifié et compétent**.
- Numérotation continuant la consolidation : suffixe `-FORK`.
- Findings **purement upstream** déjà audités dans `audit-final.md` ne sont **pas** ré-énumérés ici. Ceux qui sont **amplifiés** par le diff sont signalés.

## Décompte

| Sévérité | Security | Bug | Perf | Fork-strategy | RGPD | **Total** |
|----------|----------|-----|------|---------------|------|-----------|
| P0 | 0 | 0 | 0 | 0 | 0 | **0** |
| P1 | 2 | 1 | 0 | 0 | 1 | **4** |
| P2 | 5 | 1 | 0 | 2 | 2 | **10** |
| P3 | 3 | 1 | 1 | 1 | 1 | **7** |
| **Total** | **10** | **3** | **1** | **3** | **4** | **21** |

---

## SEC — Security (insider + supply chain)

### [SEC-300-FORK] `scripts/dev-grant-password.ts` — guard "prod" regex trop faible
- **Sévérité** : P1
- **Catégorie** : security
- **Origine** : clever-fork
- **Localisation** : `scripts/dev-grant-password.ts:19-26`
- **Description** : le script écrase le password d'un user existant, retire 2FA, vide les backup codes, force `identityProvider: CAL`. Le seul garde-fou est :
  ```ts
  const looksLikeProd = /\b(prod|production)\b/i.test(dbUrl) || process.env.NODE_ENV === "production";
  ```
- **Preuve** : un `DATABASE_URL` Clever Cloud type `postgresql://u_xxx:p@bxxx-postgresql.services.clever-cloud.com:5432/bxxx` ne contient ni `prod` ni `production`. La regex ne matche pas → script s'exécute → password du user devient celui passé en arg + 2FA désactivée.
- **Impact concret (insider)** : un dev qui exécute ce script en pointant accidentellement vers la DB hosted Clever (.env mal chargé, mauvais shell) désactive 2FA et redéfinit le mot de passe d'un compte. Récupération difficile (la 2FA et les backup codes ne sont pas réversibles depuis le script).
- **Correctif** :
  - Allowlist explicite : refuser sauf `DATABASE_URL=localhost`/`127.0.0.1`/`postgres://...@db:5432/...` typés dev.
  - Refuser si le User cible a `role = ADMIN` sans confirmation interactive.
  - Refuser si le hostname résout vers une IP non-RFC1918.
  - Demander interactivement `confirm: y` même avec `I_KNOW_WHAT_IM_DOING=yes`.
- **Effort** : S

### [SEC-301-FORK] `scripts/seed-test-team.ts` — aucun guard "non-prod"
- **Sévérité** : P1
- **Catégorie** : security
- **Origine** : clever-fork
- **Localisation** : `scripts/seed-test-team.ts:1-272`
- **Description** : aucune vérification de l'environnement avant d'exécuter le seed. Le script crée `admin@local.dev` avec password trivial `admin` (constant en clair dans le code) et `UserPermissionRole.ADMIN`. Plus 4 membres avec passwords devinables (`member1`…`member4`).
- **Preuve** : extrait `seed-test-team.ts` — `upsertUser({ email: "admin@local.dev", password: "admin", ... })`. Pas de `looksLikeProd` check.
- **Impact concret (insider)** : exécution accidentelle contre la DB Clever → compte admin avec password `admin` créé. Tout utilisateur Internet ayant l'URL de l'instance peut tenter `admin@local.dev` / `admin` → admin total. Cumulé avec SEC-200 (rate-limit fail-open), aucun obstacle au brute-force du login admin connu.
- **Correctif** : ajouter le même guard que `dev-grant-password.ts` (renforcé selon SEC-300-FORK), refuser au boot si NODE_ENV=production ou si le hostname DB ne match pas une allowlist.
- **Effort** : XS

### [SEC-302-FORK] `teams.inviteMember` — token créé sans email envoyé (`TODO`)
- **Sévérité** : P1
- **Catégorie** : security
- **Origine** : clever-fork
- **Localisation** : `packages/trpc/server/routers/viewer/teams/inviteMember.handler.ts:62-66`
- **Description** : le handler crée une `Membership(accepted=false)` ET une `VerificationToken` pour l'invitee dans une transaction, **mais l'email de notification n'est pas envoyé** (commentaire `// TODO: send the invitation email containing token`). L'invitee n'est jamais notifié.
- **Preuve** :
  ```ts
  await prisma.$transaction([
    prisma.verificationToken.create({ data: { identifier, token, expires, teamId } }),
    prisma.membership.create({ data: { userId, teamId, role, accepted: false } }),
  ]);
  // TODO: send the invitation email containing `token`. The token is kept
  // server-side; never return it to the client.
  ```
- **Impact concret (insider)** : un team admin peut « inviter » silencieusement n'importe quel user existant. La `Membership` apparaît dans `listMembers` (qui ne filtre pas `accepted`), et `getMembershipbyUser` retourne l'invitation. L'invitee découvrira (au mieux) la team dans ses settings après login ; pire, peut accepter sans contexte légitime, donnant accès au team admin à des artefacts liés (event-types, bookings, webhook secrets cf. BUG-009 fork).
- **Correctif** : implémenter l'envoi d'email (transactional via le tasker existant `EmailService`), OU bloquer le handler tant que l'email n'est pas envoyé (mieux : ne pas créer la Membership avant que l'email parte). À court terme, ajouter une `Notification` interne visible côté invitee.
- **Effort** : M

### [SEC-303-FORK] `teams.create` sans quota / sans allowlist domaine
- **Sévérité** : P2
- **Catégorie** : security
- **Origine** : clever-fork
- **Localisation** : `packages/trpc/server/routers/viewer/teams/create.handler.ts:1-60`
- **Description** : n'importe quel user authentifié peut créer un nombre illimité de teams. Pas de check de domaine d'email (un user avec email externe peut créer une team). Pas de soft quota par user.
- **Impact concret (insider)** :
  - DB bloat trivial (spam de teams).
  - Activation latérale de features réservées aux team event-types (instant meetings, COLLECTIVE/ROUND_ROBIN/MANAGED), bypass de quotas user.
  - Si l'instance accepte des emails hors `@clever-cloud.com` (cf. SEC-310-FORK), un externe peut auto-provisionner une team Clever-branded.
- **Correctif** :
  - Limite `N teams créées` par user (DB constraint + check côté handler).
  - Allowlist email domain optionnelle (`TEAMS_ALLOWED_EMAIL_DOMAIN=clever-cloud.com`).
  - Rate-limit applicatif (1 team/min/user).
- **Effort** : S

### [SEC-304-FORK] Aucune limite supérieure sur `teams.create` payload (`name`, `slug`)
- **Sévérité** : P3
- **Catégorie** : security
- **Origine** : clever-fork
- **Localisation** : `packages/trpc/server/routers/viewer/teams/schemas.ts:6-9`
- **Description** : `ZCreateInput` limite `name.max(80)` + `slug.max(64)`. Bien borné côté create. **Mais** `ZUpdateInput.bio.max(8_000)` est OK, et `ZUpdateInput.{logoUrl,bannerUrl}.max(1_048_576)` = 1 MB chacun → 2 MB par team possibles, stockés en DB (colonnes texte).
- **Impact** : sur N teams créées (cf. SEC-303-FORK), la DB peut gonfler de ~2 MB par team via les data URLs base64 du logo/banner.
- **Correctif** : ne pas stocker les images en data URL — uploader vers stockage objet (S3/Cellar), stocker l'URL. À défaut, baisser `MAX_IMAGE_FIELD_LENGTH` à 256 KB et limiter le nombre total de teams par user.
- **Effort** : M (refactor stockage) / XS (réduire la limite)

### [SEC-305-FORK] Aucun audit trail sur les actions admin teams
- **Sévérité** : P2
- **Catégorie** : security
- **Origine** : clever-fork
- **Localisation** : `packages/trpc/server/routers/viewer/teams/{adminDelete,delete,removeMember,changeMemberRole,inviteMember,update}.handler.ts`
- **Description** : aucune action sensible (delete team, kick member, promote/demote, invite, update branding) n'écrit dans un audit log. Pas de table `TeamAuditEvent` ni log structuré `logger.info("team.delete", { actorId, teamId })`.
- **Impact concret (insider)** : un système-admin (UserPermissionRole.ADMIN) peut supprimer une team via `adminDelete` ou rétrograder le dernier owner d'une team — aucune trace post-mortem pour identifier l'acteur et la date. Conformité ISO 27001 / SOC2 difficile à démontrer.
- **Correctif** :
  - Logger structuré sur chaque mutation (`actorUserId`, `actorRole`, `targetTeamId`, `action`, `before`, `after`, `at`). Sortir dans Sentry breadcrumbs + stdout JSON pour les SIEM aval.
  - À moyen terme : table `AuditEvent { id, actorId, actorRole, scope, scopeId, action, payload Json, createdAt }` avec rétention.
- **Effort** : M

### [SEC-306-FORK] `adminDelete` — hard-delete sans `BAD_REQUEST` si team contient membres ou bookings actifs
- **Sévérité** : P2
- **Catégorie** : security
- **Origine** : clever-fork
- **Localisation** : `packages/trpc/server/routers/viewer/teams/adminDelete.handler.ts:18-23`
- **Description** : `prisma.team.delete({ where: { id } })` direct, pas de check préalable des bookings ACCEPTED futurs ou des membres acceptés. Cascade FK déclenche `SetNull`/`Cascade` selon le schema upstream — peut être destructif sur des bookings clients en cours.
- **Impact concret (insider)** : un admin (potentiellement malveillant ou maladroit) peut détruire en un appel toute l'activité d'une team commerciale Clever (RDV en attente, event-types, hosts). Aucune sauvegarde/rollback côté handler.
- **Correctif** :
  - Bloquer si `_count.bookings { status: ACCEPTED, startTime > now } > 0` sauf `force: true` explicite.
  - Soft-delete via `Team.deletedAt` (nécessite migration — hors strict scope MIT mais recommandé).
- **Effort** : S

### [SEC-307-FORK] `getTeamServerSideProps` — `isSEOIndexable: true` hardcodé sur teams non-orgs
- **Sévérité** : P2
- **Catégorie** : security
- **Origine** : clever-fork
- **Localisation** : `apps/web/server/lib/team/[slug]/getServerSideProps.ts:91`
- **Description** : la page publique `/team/<slug>` retourne toujours `isSEOIndexable: true` (sauf pour les teams unpublished). Aucune option d'opt-out par team, aucune dépendance sur `team.isPrivate` ou un flag d'instance.
- **Impact** :
  - **RGPD** : un nom + avatar d'un membre Clever exposé est indexé Google.
  - **Insider** : un admin Clever ne peut pas empêcher l'indexation d'une team sensible (RH, M&A).
- **Correctif** :
  - `isSEOIndexable = !team.isPrivate && process.env.TEAMS_PUBLIC_INDEXABLE === "true"`.
  - Par défaut `false` sur l'instance interne Clever — pas d'indexation Google.
- **Effort** : XS

### [SEC-308-FORK] `getTeamServerSideProps` — fuite annuaire interne quand `team.isPrivate=false` (défaut)
- **Sévérité** : P2 (P1 en contexte Clever insider — voir RGPD-300-FORK)
- **Catégorie** : security
- **Origine** : clever-fork
- **Localisation** : `apps/web/server/lib/team/[slug]/getServerSideProps.ts:80-86` + `create.handler.ts:39`
- **Description** : `createHandler` crée toute team avec `isPrivate: false` par défaut. La page publique liste alors `members[].{id, name, username, avatarUrl}`. Sur instance Clever, cela publie l'annuaire interne par défaut.
- **Impact** : énumération des collaborateurs (nom complet, username = email-derivé) accessible sans auth.
- **Correctif** : changer le default `isPrivate: true` dans `createHandler`, exposer un opt-in via `update`.
- **Effort** : XS (single-line)

### [SEC-309-FORK] Radix dependencies pinnées en `^1.1.x` (drift supply chain)
- **Sévérité** : P3
- **Catégorie** : security
- **Origine** : clever-fork
- **Localisation** : `apps/web/package.json:68-75`, `packages/ui/package.json:91`
- **Description** : `@radix-ui/react-dialog: "^1.1.15"`, `@radix-ui/react-dropdown-menu: "^2.1.16"`, etc. Upstream pinne strictement (`1.0.4`). Le `^` permet à un futur `yarn install` de tirer une patch version compromise sans rebuild explicite.
- **Impact (supply chain)** : faible mais existant — si Radix publie une version patch malicieuse (ou s'il y a un takeover npm), un déploiement automatique l'embarque.
- **Correctif** : pinner strict (`"1.1.15"` au lieu de `"^1.1.15"`) après validation. Activer Yarn `yarn.lock` integrity check en CI (déjà en place via `--frozen-lockfile` ?). Configurer Renovate/Dependabot pour ouvrir des PRs explicites à chaque bump.
- **Effort** : XS

### [SEC-310-FORK] Aucune désactivation effective du signup public
- **Sévérité** : P3
- **Catégorie** : security
- **Origine** : clever-fork
- **Localisation** : *absence de code* (le fork ne désactive pas `apps/web/pages/auth/signup` ni `/api/auth/signup`)
- **Description** : aucune modification du flow signup. Si l'instance est exposée à Internet, n'importe qui peut créer un compte, puis créer des teams (cf. SEC-303-FORK), inviter d'autres comptes externes, etc.
- **Impact (insider scope élargi)** : sur instance Clever publique, contournement de la frontière "interne Clever uniquement".
- **Correctif** :
  - Variable `SIGNUP_DISABLED=true` checkée côté API (déjà existe upstream ? à vérifier) + UI 404 sur la page signup.
  - Allowlist email domain au signup (`clever-cloud.com`).
- **Effort** : S

---

## BUG — Robustesse / fonctionnel

### [BUG-100-FORK] `teams.inviteMember` — `VerificationToken.token` jamais consommé
- **Sévérité** : P2
- **Catégorie** : bug
- **Origine** : clever-fork
- **Localisation** : `inviteMember.handler.ts:53-66` + (absence de) handler de consommation
- **Description** : un `VerificationToken` est créé (expires 7j) avec `identifier=email`, `teamId`. Pas de handler `acceptInvitationViaToken` qui le consomme. Le flow d'acceptation (`acceptOrLeave`) ne référence pas le token — il accepte directement via `userId+teamId`.
- **Impact** : pile de `VerificationToken` orphelins qui s'accumulent en DB pendant 7 jours. Pas critique mais signe que le flow d'invitation est à moitié implémenté (cumul avec SEC-302-FORK).
- **Correctif** :
  - Soit consommer le token côté `acceptOrLeave` quand `accept=true` (atomique avec l'update de la membership).
  - Soit retirer la création du token jusqu'à ce que l'email soit câblé.
- **Effort** : S

### [BUG-101-FORK] `teams.adminList` — `take: 200` sans pagination
- **Sévérité** : P3
- **Catégorie** : bug
- **Origine** : clever-fork
- **Localisation** : `adminList.handler.ts:43`
- **Description** : `take: 200` dur, pas de `skip`, pas de `cursor`. L'UI affiche silencieusement les 200 premiers (ordonnés `createdAt: desc`) sans signaler qu'il y en a plus.
- **Impact** : sur instance Clever future qui atteint > 200 teams, les anciennes deviennent invisibles depuis l'admin UI.
- **Correctif** : cursor pagination + UI "Load more". À défaut, monter à 1000 et logger un warning si truncated.
- **Effort** : S

### [BUG-102-FORK] `requireMember` — synthetic OWNER membership a `id: -1`
- **Sévérité** : P1
- **Catégorie** : bug
- **Origine** : clever-fork
- **Localisation** : `permissions.ts:42-58`
- **Description** : quand le caller est `UserPermissionRole.ADMIN` mais n'a PAS de Membership réelle, `requireMember` retourne un objet synthétique `{ id: -1, userId, teamId, role: OWNER, accepted: true, ... }`. Si un handler downstream utilise ce `id` comme PK Membership (par exemple, pour faire `prisma.membership.update({ where: { id: -1 } })`), Prisma soit échoue (record not found) soit pire si une autre Membership de `id=-1` existe (improbable mais non garanti).
- **Preuve** : `updateHandler` n'utilise pas `m.id`, mais `update.handler.ts` retourne via `requireMember(...)` puis fait `prisma.team.update`. Pas d'usage immédiat de `m.id`. **Mais** futurs handlers pourraient le faire sans s'en rendre compte.
- **Impact** :
  - Risque latent — si un handler est ajouté demain qui passe ce `m.id` en input Prisma, il génère un comportement non-déterministe.
  - `listMembers` retourne le synthetic id `-1` dans le payload UI ? Non, ce flow utilise `prisma.membership.findMany` directement. OK.
- **Correctif** :
  - Soit un type `SyntheticMembership` distinct, soit `m.id: null` (forcer le caller à gérer le cas), soit créer une vraie Membership shadow pour l'admin.
  - **Minimum** : ajouter un test unitaire qui vérifie qu'aucun handler ne propage `m.id` quand `m.id === -1`.
- **Effort** : S

---

## PERF

### [PERF-100-FORK] `EventTeamAssignmentTab` re-render sur grandes équipes
- **Sévérité** : P3
- **Catégorie** : performance
- **Origine** : clever-fork
- **Localisation** : `apps/web/modules/event-types/components/tabs/assignment/EventTeamAssignmentTab.tsx:39-50`
- **Description** : restauration du tab depuis le stub upstream `() => null`. Comme noté dans `audit-final.md:PERF-004`, multiples `form.watch()` top-level rendent à chaque keystroke. **Le fork hérite directement de ce pattern dans son code restauré**.
- **Impact** : déjà mentionné dans PERF-004 upstream — applicable à 100 % au fork puisque c'est du nouveau code Clever.
- **Correctif** : voir PERF-004 (sélecteurs fins `useWatch({ control, name: [...] })`).
- **Effort** : S

---

## FORK-STRATEGY — Couplage upstream / maintenance

### [FORK-300-FORK] Refactor invasif dans `webhook/util.ts` — futur conflit upstream garanti
- **Sévérité** : P2
- **Catégorie** : fork-strategy
- **Origine** : clever-fork
- **Localisation** : `packages/trpc/server/routers/viewer/webhook/util.ts:1-81`
- **Description** : la fonction `createWebhookProcedure` a été ré-écrite (+50 lignes) pour autoriser team admins. Tout patch upstream sur ce fichier (sécurité, perf) crée un conflit non-trivial à résoudre, avec risque de régression silencieuse.
- **Correctif** :
  - Externaliser la logique d'autorisation dans `packages/trpc/server/routers/viewer/webhook/canManageEventType.ts` (Clever-specific) importé par `util.ts` modifié minimalement.
  - Documenter explicitement le delta dans `FORK-NOTES.md` à la racine.
- **Effort** : S

### [FORK-301-FORK] Aucun process documenté de récupération des CVE patches upstream
- **Sévérité** : P2
- **Catégorie** : fork-strategy
- **Origine** : clever-fork
- **Localisation** : *absence de doc — aucun `FORK-NOTES.md`, `SECURITY.md` interne, ni README de procédure*
- **Description** : pas de procédure écrite "comment cherry-picker un fix CVE upstream", pas de mention de la cadence de rebase, pas d'abonnement documenté aux advisories Cal.com.
- **Impact (long terme)** : risque de retard sur les patches critiques upstream. Si Cal.com publie un fix CVE demain, personne n'a la responsabilité opérationnelle dans le repo.
- **Correctif** :
  - `FORK-NOTES.md` à la racine listant : (a) commits Clever-only, (b) fichiers upstream patches, (c) procédure de rebase.
  - `SECURITY-UPSTREAM-WATCH.md` listant les watchers (Github advisories, Dependabot, Renovate) + ownership.
- **Effort** : XS (juste docs) — voir `fork-strategy.md`.

### [FORK-302-FORK] CI security audit limité à `yarn npm audit` — pas de SAST
- **Sévérité** : P3
- **Catégorie** : fork-strategy
- **Origine** : clever-fork (héritage upstream, mais le fork ne l'a pas renforcé)
- **Localisation** : `.github/workflows/security-audit.yml:17-19`
- **Description** : seul `yarn npm audit --severity critical` est en bloquant. Pas de Semgrep, pas de CodeQL, pas de Renovate (vérification absente d'un `renovate.json` / `.github/dependabot.yml`).
- **Impact** : les bugs trouvés dans cet audit (timing attack, fail-open, IDOR) n'auraient pas été détectés par un simple `yarn audit`. Un fork interne devrait renforcer le pipeline.
- **Correctif** : voir `fork-strategy.md` — ajout Semgrep en `report-only` puis `fail` après stabilisation.
- **Effort** : S

---

## RGPD — Données prospects / employés

### [RGPD-300-FORK] Annuaire interne exposé publiquement par défaut
- **Sévérité** : P1
- **Catégorie** : rgpd
- **Origine** : clever-fork
- **Localisation** : `create.handler.ts:39` (`isPrivate: false`) + `getTeamServerSideProps.ts:80-86` (liste membres non-privés)
- **Description** : couplé à SEC-307-FORK et SEC-308-FORK — par défaut une team est publique et indexable. La page `/team/<slug>` liste `{ id, name, username, avatarUrl }` des membres. Sur instance interne Clever, cela publie l'annuaire collaborateurs.
- **Base légale** : intérêt légitime employeur ↔ proportionnalité — la publication systématique de l'annuaire complet sans opt-in est difficilement défendable au regard de la CNIL.
- **Correctif** :
  - Défaut `isPrivate: true` (SEC-308-FORK).
  - `isSEOIndexable` par défaut `false` sauf flag (SEC-307-FORK).
  - DPIA explicite si exposition publique souhaitée.
- **Effort** : XS (côté code) + M (documentation conformité)

### [RGPD-301-FORK] Aucune rétention configurée pour Booking / VerificationToken / responses
- **Sévérité** : P2
- **Catégorie** : rgpd
- **Origine** : clever-fork
- **Localisation** : *absence de purge job* — pas de cron `cron-purgeStaleBookings`, pas de delete sur `VerificationToken` expirés
- **Description** : les `Booking.responses` contiennent emails + notes saisis par les prospects/clients externes. Les `VerificationToken` créés par `inviteMember` (cf. BUG-100-FORK) restent 7 jours mais ne sont pas re-purgés. Aucune politique de rétention écrite.
- **Impact RGPD** :
  - Droit à l'effacement (Art. 17 RGPD) non opérationnel — pas de mécanisme automatique.
  - Minimisation (Art. 5.1.c) non démontrable.
- **Correctif** :
  - Cron de purge `VerificationToken.expires < now()`.
  - Cron de purge `Booking` < X mois (X défini par DPO Clever).
  - Endpoint `/api/users/me/delete` upstream — vérifier qu'il purge bien tous les artefacts liés à l'user (à valider dans une pass séparée).
- **Effort** : M

### [RGPD-302-FORK] PII potentiellement transmise hors UE (Sentry US)
- **Sévérité** : P2
- **Catégorie** : rgpd
- **Origine** : clever-fork (héritage upstream)
- **Localisation** : `apps/web/package.json` dépendance `@sentry/nextjs: 10.33.0`
- **Description** : Sentry est inclus upstream. Si le fork Clever l'active (variable `NEXT_PUBLIC_SENTRY_DSN` set), les events Sentry partent vers les serveurs Sentry. Sentry.io = stockage US par défaut sauf compte payant EU. Les events peuvent contenir des emails / IDs / payload tRPC partiels.
- **Correctif** :
  - Vérifier que l'instance Clever utilise un Sentry EU (sentry.clever-cloud.com ou Sentry SaaS région EU) — sinon, désactiver.
  - Activer le scrubbing PII Sentry (`beforeSend` filter).
- **Effort** : S (config) — **à vérifier par l'opérateur**

### [RGPD-303-FORK] `markdownToSafeHTML` sur `team.bio` rendu sur page publique
- **Sévérité** : P3
- **Catégorie** : rgpd
- **Origine** : clever-fork
- **Localisation** : `getTeamServerSideProps.ts:77`
- **Description** : `team.bio` (saisi par admin team) est rendu en HTML public. Pas une faille de sécu (déjà sanitizé), mais un admin peut y mettre des données personnelles non-pertinentes (téléphone, adresse). Pas de garde-fou éditorial.
- **Correctif** : avertissement UI "ne pas saisir de données personnelles d'autrui ici" + checkbox de consentement avant publish.
- **Effort** : XS

---

## Findings écartés (raisons documentées)

| Candidat | Raison |
|----------|--------|
| Modif `apps/web/app/layout.tsx` (`suppressHydrationWarning`) | Aucun impact security. Cosmétique React. |
| Modif `useEvent.ts` (`useApiV2` default tRPC) | Pas de finding — utilise déjà des procedures auth correctes. |
| Modif `Dialog.tsx` (sr-only Title) | Pure a11y, pas d'incidence security. |
| Modif `SettingsLayoutAppDirClient.tsx` | UI navigation, pas de security. |
| Restauration `EventInstantTab` | Pas de nouveau handler — n'expose pas de procedure non auditée. |
| Modif `webhook/util.ts` (refactor team admin) | Le refactor **améliore** la couverture d'autorisation (avant : team event-types non gérables). Sécurité gainée. Risque de couplage upstream traité dans FORK-300-FORK. |
| `acceptOrLeave` accept silencieux | Légitime si l'invitee a vraiment été invité — la racine du problème est SEC-302-FORK (pas d'email d'invitation). |
| `getActiveUserBreakdown` groupBy aggregate | Bien optimisé (single query). Pas de finding perf. |
| `addMembersToEventTypes` validation cross-team | Vérifie correctement teamId+eventTypeIds+memberships. ✓ |
