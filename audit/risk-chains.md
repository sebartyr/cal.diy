# Chaînes de risque cal.diy fork Clever — narratif decision-maker

Trois scénarios d'exploitation concrets, chacun combinant 2-5 findings indépendants en un incident plausible. Format : storyline → étapes techniques → impact business → contre-mesures.

---

## Chain 1 — `backdoor-admin` : prise de contrôle total post-déploiement

**Scénario** : opérateur exécute par mégarde un script de seed contre la DB hosted Clever lors d'un onboarding, ou laisse le rate-limit fail-open en prod. Internet ou collaborateur quelconque devient admin du système.

### Storyline
1. Sébastien (ou tout dev avec accès repo) prépare la mise en service. Le `.env` pointe sur la DB Clever Cloud (`b???-postgresql.services.clever-cloud.com`).
2. Le dev veut tester rapidement : lance `npx tsx scripts/seed-test-team.ts` pour peupler des données factices. **Aucun garde-fou** — la regex `prod|production` du seed script ne matche pas `clever-cloud.com` (SEC-301-FORK).
3. Le script crée un compte `admin@local.dev` avec password trivial `admin` + `UserPermissionRole.ADMIN`. Idem 4 comptes membres avec passwords `member1..4`.
4. Le `UNKEY_ROOT_KEY` n'a pas été provisionné — c'est documenté comme optionnel (SEC-200). `rateLimit()` retourne `success: true` systématiquement sur tous les endpoints d'auth.
5. Un attaquant Internet (ou un collaborateur curieux) qui sait que c'est un fork cal.diy tente le login `admin@local.dev / admin` — succès. Aucun lockout. Confirmé en PoC : 200/200 requêtes login passent en 46 secondes.
6. L'attaquant est désormais admin système. Via `teams.adminList` + `teams.adminDelete`, il peut détruire toutes les équipes. Via la PBAC bypass (SEC-001), il peut delete/duplicate/exfiltrer tous les event-types d'équipes — y compris ceux d'autres collaborateurs. Aucun audit trail (SEC-305-FORK) — l'incident ne sera pas tracé.

### Findings combinés
| ID | Rôle dans la chaîne |
|----|---------------------|
| **SEC-301-FORK** | Vecteur d'entrée (seed sans guard) |
| **SEC-300-FORK** | Vecteur alternatif (dev-grant-password regex faible) |
| **SEC-200** | Pas de protection brute-force |
| **SEC-310-FORK** | Pas de désactivation signup → recrutement de comptes externes |
| **SEC-001** | Privilège escalation horizontale (PBAC bypass) |
| **SEC-305-FORK** | Pas de détection post-mortem |
| **SEC-204** | (amplificateur) Dockerfile ARG=secret → JWT signés `secret` si oubli |

### Impact business
- Compromission totale de l'instance dès J+0 si l'un des scripts est lancé par erreur.
- Données accessibles : credentials OAuth Google Workspace Clever, credentials Pipedrive, emails de tous les prospects/clients dans les bookings, contenu des RDV (RH/M&A/partenariats).
- Pas de trace post-mortem → impossible de scope l'incident pour notification RGPD < 72h.

### Contre-mesures (Sprint 0 — bloquant avant prod)
1. Allowlist `DATABASE_URL` dur dans les scripts seed et dev-grant — refuser sauf `localhost`/`127.0.0.1`.
2. Refus de démarrage si `UNKEY_ROOT_KEY` absent ET `NODE_ENV=production` (fallback in-memory rate-limit acceptable comme alternative).
3. `SIGNUP_DISABLED=true` côté API + UI + middleware.
4. Retrait des valeurs par défaut `ARG NEXTAUTH_SECRET=secret` dans le Dockerfile.
5. (Sprint 1) Fix PBAC stub (SEC-001) — supprime la latéralisation post-compromission.
6. (Sprint 3) Audit trail (SEC-305-FORK) — minimum viable de traçabilité.

---

## Chain 2 — `oauth-creds-leak` : exfiltration des credentials Google Workspace + Pipedrive

**Scénario** : un attaquant authentifié (insider Clever ou compte externe via signup non-désactivé) combine plusieurs vecteurs pour récupérer les bijoux de la couronne : tokens OAuth Google Workspace et Pipedrive stockés en DB.

### Storyline
1. **Vecteur initial — confused deputy OAuth Stripe** : l'attaquant initie un flow OAuth Stripe sur SON propre compte Stripe. Récupère un `code` valide. Force la victime (collaborateur Clever connecté) à visiter `https://cal.clever-cloud.com/api/integrations/stripepayment/callback?code=<attacker_code>` (lien dans email, page web, Slack DM). `NONCE_EXEMPT_APPS.has("stripe") === true` (SEC-101) → le state n'est pas vérifié → le credential Stripe attaquant est lié au compte de la victime.
2. **Vecteur d'exfiltration — SSRF webhook** : l'attaquant crée un webhook sur son propre compte cal.diy (signup public actif, cf. SEC-310-FORK) avec `subscriberUrl: http://[::ffff:169.254.169.254]/latest/meta-data/iam/security-credentials/` (bypass IPv4-map IPv6, SEC-103). Au prochain trigger, le serveur cal.diy fait une requête sortante vers l'AWS/GCP metadata endpoint. Réponse loguée côté webhook log → exfiltration des credentials IAM/instance role.
3. **Si Sentry US actif** (RGPD-302-FORK) : les payloads d'erreurs incluent parfois des extraits de tokens. Sentry US devient un canal d'exfiltration tiers, hors UE.
4. **Pivot DB — AES-CBC** : si l'attaquant obtient un accès en lecture DB (via la chaîne 1 ou via une faille tierce), il peut modifier silencieusement les `credential.key` chiffrés (SEC-100). Aucun tag d'auth → le décryptage retourne des secrets attaquant-contrôlés sans erreur.

### Findings combinés
| ID | Rôle |
|----|------|
| **SEC-101** | Confused deputy OAuth (Stripe + 4 autres apps) |
| **SEC-103** | SSRF webhook DNS rebinding + IPv4-map bypass |
| **SEC-104** | SSRF CalDAV/ICS (vecteur alternatif) |
| **SEC-100** | AES-CBC sans auth tag → corruption silencieuse |
| **SEC-009** | Backup codes 2FA réversibles avec `CALENDSO_ENCRYPTION_KEY` |
| **SEC-310-FORK** | Signup public → recrutement comptes attaquant |
| **RGPD-302-FORK** | Sentry US → canal d'exfiltration latéral |

### Impact business
- Compromission des accès Google Workspace Clever Cloud (Drive, Gmail, Calendar de tous les comptes liés).
- Compromission Pipedrive (CRM B2B — pipeline commercial complet).
- Notification RGPD < 72h obligatoire, notification clients impactés, notification CNIL.
- Coût de rotation des secrets : invalidation de toutes les sessions, regénération des OAuth grants, communication clients.

### Contre-mesures (Sprint 2 — P1 critique)
1. Retirer Stripe de `NONCE_EXEMPT_APPS` immédiatement (SEC-101).
2. Implémenter `validateUrlForSSRF` async + DNS pinning + normalisation IPv4-map IPv6 (SEC-103, SEC-104).
3. Migrer crypto vers AES-256-GCM avec préfixe `v2:` (SEC-100).
4. Bcrypt/argon2 sur les backup codes 2FA (SEC-009).
5. Vérifier que Sentry est sur région EU OU désactivé (RGPD-302-FORK).
6. Désactiver signup public (SEC-310-FORK — déjà couvert dans Chain 1).

---

## Chain 3 — `internal-directory-leak` : publication non-consentie de l'annuaire Clever

**Scénario** : par défaut, toute team créée publie l'annuaire de ses membres sur Internet et l'expose à l'indexation Google. Sans action explicite, un mois après mise en service, "site:clever-cloud.com inurl:/team/" expose les noms + photos de tous les collaborateurs membres d'une team.

### Storyline
1. Un collaborateur crée une team `support-revente-h1` via `/settings/teams/new`. Le handler `createHandler` set `isPrivate: false` par défaut (SEC-308-FORK).
2. La page `/team/support-revente-h1` est immédiatement publique. `getServerSideProps` retourne `isSEOIndexable: true` hardcodé (SEC-307-FORK). Aucune meta `robots: noindex`.
3. La page liste `members[].{ id, name, username, avatarUrl }` — annuaire interne complet (RGPD-300-FORK).
4. Googlebot indexe la page. Quelques jours plus tard, `site:cal.clever-cloud.com inurl:/team/` retourne la liste.
5. Concurrent ou recruteur tiers : récupère trivialement la liste nominative des membres d'une équipe sensible (revente, RH, M&A).
6. Aucune base légale documentée pour cette publication, aucun consentement employé recueilli.

### Findings combinés
| ID | Rôle |
|----|------|
| **SEC-308-FORK** | Default `isPrivate: false` |
| **SEC-307-FORK** | `isSEOIndexable: true` hardcodé |
| **RGPD-300-FORK** | Pas de base légale documentée |
| **RGPD-301-FORK** | Pas de purge → résiste à l'effacement après départ |
| **SEC-203** | (amplificateur) bios markdown sans `noopener` — phishing depuis page indexée |

### Impact business
- Atteinte à la vie privée des collaborateurs (Art. 5 RGPD — minimisation + finalité).
- Risque réputationnel + risque IS RH.
- Si découvert par la CNIL après plainte d'un employé : amende possible (jusqu'à 4 % du CA) + injonction de mise en conformité.
- Difficulté de désindexation (Google cache, archives Wayback).

### Contre-mesures (Sprint 2 — RGPD)
1. Défaut `isPrivate: true` dans `createHandler` — opt-in explicite par admin team pour publier.
2. `isSEOIndexable` par défaut `false` sauf flag d'instance.
3. DPIA déclenché par DPO avant exposition publique.
4. Cron de purge `Booking` + `VerificationToken` après N jours.
5. Politique de confidentialité accessible `/privacy` + liste sous-traitants.

---

## Synthèse executive

| Chaîne | Probabilité | Impact | Sprint mitigation |
|--------|-------------|--------|-------------------|
| `backdoor-admin` | **Élevée** (erreur opérationnelle banale) | Critique — compromission totale | Sprint 0 (BLOQUANT) |
| `oauth-creds-leak` | Moyenne (insider compétent OU compte externe + ingénierie sociale) | Critique — bijoux de la couronne | Sprint 2 |
| `internal-directory-leak` | **Très élevée** (comportement par défaut) | Élevé — RGPD + RH | Sprint 2 |

**Recommandation de séquencement** : aucune mise en service publique avant clôture du Sprint 0 (Lockdown). Les Sprints 1-2 peuvent se dérouler avec accès restreint (VPN Clever / allowlist IP) le temps de fermer les chaînes 2 et 3.
