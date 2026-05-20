# Checklist RGPD cal.diy fork Clever Cloud

État de conformité par item. **Périmètre** : diff fork + interactions avec données prospects/employés.
**Légende** : ✅ implémenté · 🟡 partiel · ❌ absent · ❓ non vérifiable depuis le code (à confirmer côté ops)

---

## 1. Bases légales & finalités

| Item | Statut | Notes |
|------|--------|-------|
| Base légale documentée pour le traitement des emails de prospects dans les bookings | ❓ | Aucun document détecté dans le repo (`/legal/`, `/docs/legal/`, ROOT/PRIVACY.md absent). À documenter côté DPO. |
| Base légale pour l'annuaire interne publié (`team-public-view`) | ❌ | Publication par défaut **non opt-in** (cf. RGPD-300-FORK + SEC-308-FORK). Intérêt légitime à motiver explicitement OU passer en opt-in. |
| Finalité explicite affichée à l'utilisateur au moment du booking | ❓ | À vérifier : le formulaire de booking upstream affiche-t-il une mention "vos données seront utilisées pour…" ? |
| Consentement explicite recueilli si finalité commerciale | ❌ | Pas de checkbox `responses.consent` dans `bookingCreateBodySchema`. |

## 2. Minimisation des données

| Item | Statut | Notes |
|------|--------|-------|
| `responses` du booking limités au strict nécessaire | 🟡 | `notes` non borné (SEC-108 upstream — `audit-final.md`). `email`, `name` sont nécessaires. |
| Pas de champs en clair évitables (téléphone obligatoire ?) | ❓ | Dépend de la config par event-type. À vérifier que les event-types Clever ne demandent que ce qui est nécessaire. |
| Pas de collecte d'IP côté booking sans nécessité | ❓ | Upstream loggue probablement l'IP côté Sentry/Webhook. À auditer. |
| Logos/banners base64 stockés en DB (RGPD ?) | 🟡 | Pas RGPD strict, mais bloat DB cf. SEC-304-FORK. |

## 3. Droit à l'effacement (Art. 17)

| Item | Statut | Notes |
|------|--------|-------|
| Endpoint `DELETE /api/users/me/delete` opérationnel | ❓ | À vérifier upstream — pas modifié par le fork. |
| Suppression user → cascade sur bookings, hosts, memberships | ❓ | Le schema upstream a des `onDelete: Cascade` sur Membership ; à confirmer pour Booking. |
| Suppression user → purge des secrets webhook créés par lui | ❓ | Cf. cleanup webhooks orphelins (BUG-009 upstream). |
| Effacement des `VerificationToken` après expiration | ❌ | Aucun cron de purge détecté. Cf. RGPD-301-FORK + BUG-100-FORK. |
| Effacement à la demande dans logs Sentry | ❌ | Pas de mécanisme — Sentry SaaS conserve les events 90 jours par défaut. |
| Effacement dans webhook subscribers tiers (déjà partis) | ❌ | Données partent vers tiers (`subscriberUrl`) — impossible à rappeler. À mitiger par minimisation préventive. |

## 4. Droit d'accès et de portabilité (Art. 15, 20)

| Item | Statut | Notes |
|------|--------|-------|
| Endpoint export des données user | ❓ | À vérifier upstream. |
| Format machine-readable (JSON) | ❓ | Upstream a `apps/web/pages/api/me/...` ? |

## 5. Rétention & purge automatique

| Item | Statut | Notes |
|------|--------|-------|
| Politique de rétention écrite (combien de temps les bookings sont gardés) | ❌ | Aucun document dans le repo. À définir avec DPO. |
| Cron de purge `Booking` après N jours | ❌ | Aucun cron détecté. cron `cron-bookingReminder.yml` existe mais ne purge pas. |
| Cron de purge `VerificationToken` expiré | ❌ | Cf. RGPD-301-FORK. |
| Cron de purge `Webhook` orphelin / inactif | ❌ | À ajouter. |
| Logs applicatifs : rotation + purge | ❓ | Dépend de l'infra Clever (cycle Sentry, logs containers). |

## 6. Sous-traitants & DPA

| Item | Statut | Notes |
|------|--------|-------|
| DPA Google (Workspace / Calendar API) | ❓ | Côté Clever Cloud — à confirmer. |
| DPA Pipedrive | ❓ | Idem. |
| DPA Daily.co (vidéo) | ❓ | Si utilisé. |
| DPA Sentry (US/EU) | ❌ | Cf. RGPD-302-FORK — Sentry SaaS par défaut = US. Activer Sentry EU OU désactiver. |
| Liste des sous-traitants publiée (article 13 RGPD) | ❌ | Pas de page `/privacy/processors` dans le repo. |

## 7. Transferts hors UE

| Item | Statut | Notes |
|------|--------|-------|
| Sentry events restent en UE | ❌ | Voir RGPD-302-FORK. À vérifier côté ops. |
| Daily.co (US) — DPA + SCCs en place | ❓ | Si utilisé. |
| Google Calendar (US/UE selon plan) | ❓ | DPA Google Workspace = SCCs standard. |
| Webhooks Clever → endpoints internes Clever uniquement | ❓ | Dépend de la config — `SEC-103` upstream pose le risque inverse (SSRF). |

## 8. Cookies & consentement

| Item | Statut | Notes |
|------|--------|-------|
| Bannière cookies sur pages publiques | ❓ | À vérifier sur l'instance live. Upstream cal.com en a une ; le fork ne l'a pas désactivée. |
| Cookies session strictement nécessaires (sans consentement) | ✅ | `next-auth.session-token`, `csrf-token` = strictement nécessaires. |
| Pas de cookie analytics sans opt-in | ❓ | Vérifier `NEXT_PUBLIC_GTM_ID`, `NEXT_PUBLIC_HEAD_SCRIPTS` (cf. SEC-207 upstream). |
| `SameSite=none` cookies (SEC-003 upstream) | 🟡 | Trade-off documenté pour embed iframe — risque CSRF amoindri par tokens CSRF mais à arbitrer. |

## 9. Sécurité (Art. 32)

| Item | Statut | Notes |
|------|--------|-------|
| Mots de passe hashés (bcrypt) | ✅ | `hashPassword` utilise bcrypt côté upstream. |
| 2FA disponible | ✅ | Upstream — voir SEC-009 audit-final pour les faiblesses anti-replay. |
| 2FA imposé pour admins Clever | ❌ | Pas de check `if (role === ADMIN && !twoFactorEnabled) throw`. À ajouter. |
| Chiffrement secrets OAuth (calendriers etc.) | 🟡 | AES-256-CBC sans auth tag — cf. SEC-100 audit-final. P1 en contexte Clever (bijoux de la couronne). |
| Rate-limit sur endpoints d'authentification | ❌ | Fail-open silencieux sans `UNKEY_ROOT_KEY` — cf. SEC-200 audit-final P0. **À confirmer pour l'instance Clever** : si `UNKEY_ROOT_KEY` n'est pas set, redescendre tout flow auth en P0 actif. |
| Audit trail des actions admin | ❌ | Cf. SEC-305-FORK. Indispensable pour démontrer la conformité ISO/SOC2 et l'application du principe d'imputabilité RGPD. |
| Backup chiffrés | ❓ | Côté ops Clever. |

## 10. Documentation & gouvernance

| Item | Statut | Notes |
|------|--------|-------|
| Registre des traitements à jour | ❓ | Document côté DPO Clever. |
| DPIA réalisé pour l'instance cal.diy | ❌ | À déclencher — la publication par défaut de l'annuaire (RGPD-300-FORK) et l'utilisation pour des prospects externes nécessitent une analyse d'impact. |
| Politique de confidentialité accessible | ❓ | À publier sur `/privacy` (route à créer). |
| Procédure incident / breach notification < 72h | ❓ | Côté ops + DPO. |
| Délégué à la protection des données identifié | ❓ | Côté gouvernance Clever. |

---

## Résumé d'action prioritaire

| # | Action | Effort | Échéance recommandée |
|---|--------|--------|----------------------|
| 1 | Défaut `isPrivate: true` pour teams (SEC-308-FORK + RGPD-300-FORK) | XS | Immédiat |
| 2 | `isSEOIndexable` par défaut `false` sauf flag (SEC-307-FORK) | XS | Immédiat |
| 3 | Confirmer région Sentry (RGPD-302-FORK) | XS | Cette semaine |
| 4 | Cron purge `VerificationToken` expirés (RGPD-301-FORK) | S | Sprint courant |
| 5 | Politique rétention `Booking` écrite + cron de purge | M | Sprint+1 |
| 6 | Audit trail actions admin (SEC-305-FORK) | M | Sprint+1 |
| 7 | DPIA déclenché par DPO sur l'instance interne | — | Sprint+1 |
| 8 | 2FA imposé pour `UserPermissionRole.ADMIN` | S | Sprint+1 |
| 9 | Page `/privacy` + liste sous-traitants | M | Sprint+2 |
| 10 | Procédure incident breach formalisée | — | Gouvernance |

## Hypothèses à confirmer côté ops Clever

- `UNKEY_ROOT_KEY` set en prod ? (sinon SEC-200 = P0 actif)
- Sentry EU ou US ? (RGPD-302-FORK)
- DPA Google Workspace + Pipedrive en place ?
- Liste des emails dans la table `User` filtrée à `@clever-cloud.com` uniquement ?
- Backups DB chiffrés et conservés où ?
