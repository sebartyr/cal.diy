# Hypothèses & axes non couverts

## Versionnage

- Branche analysée : `master`, HEAD = `3e50c176fe` (2026-05-20).
- L'audit inclut les 10 derniers commits de divergence MIT (équipes, dialog Radix 1.1, webhooks team admin, etc.) ainsi que les fixes du dernier audit interne (`6b5fb1982f`).
- Pas d'analyse comparée vs upstream cal.com — le fork a divergé suffisamment pour qu'une diff line-by-line ne soit pas pertinente.

## Threat model retenu

- **Attaquant principal** : utilisateur authentifié quelconque cherchant à élever ses privilèges, énumérer les comptes, accéder aux ressources d'autres tenants, ou détourner des intégrations OAuth.
- **Attaquant secondaire** : visiteur anonyme cherchant à énumérer les profils publics, exploiter les pages de booking, ou empoisonner les emails sortants.
- **Attaquant tertiaire** : compromission d'un site tiers qui embarque l'iframe Cal (impact SEC-202).
- **Hors scope** : attaquant ayant un accès RCE/shell sur le serveur, attaque physique, compromission d'un dépendance externe (sauf CVEs documentées).

## Déploiement supposé

- **Self-host** sans Unkey (configuration documentée comme "optionnel") — c'est ce qui rend SEC-200 P0. Avec Unkey configuré, la sévérité tombe à P3.
- Postgres 13+ (compatible avec `pg_advisory_xact_lock` pour BUG-001).
- Pas de WAF/proxy filtrant le trafic sortant (impact SEC-103/104).
- Node 20 (cf. Dockerfile `FROM node:20`).
- Pas de CDN avec règles de cache custom (impact PERF-003).

## Critères de sévérité

- **P0** : exploitable sans condition particulière par un attaquant avec compte (ou anonyme), impact critique (compromission cross-tenant, fuite massive de données, DoS systémique).
- **P1** : exploitable avec conditions raisonnables (var d'env donnée, app spécifique installée, modèle de menace courant), impact significatif.
- **P2** : défaut de défense en profondeur ou bug avec impact business modéré, exploit demande des conditions plus rares.
- **P3** : info / hardening / dette technique sans exploit immédiat.

## Vérifications dynamiques recommandées

Plusieurs findings P0/P1 méritent une preuve de concept en condition réelle :

1. **SEC-001 (PBAC stub)** : avec un user A non-membre, appeler `trpc.viewer.eventTypes.delete({ id: <team-event-id> })` via fetch direct et confirmer le 200/204. Test critique avant tout autre travail.
2. **SEC-200 (rate-limit fail-open)** : sur une install sans `UNKEY_ROOT_KEY`, scripter 1000 POST `/api/auth/callback/credentials` avec mauvais password ; vérifier qu'aucun 429 ne tombe.
3. **BUG-001 (double-booking race)** : 2 POST `/api/book/event` concurrents (curl in parallèle) sur le même slot, état PENDING ; vérifier création des 2 bookings.
4. **SEC-101 (Stripe NONCE_EXEMPT)** : monter un compte Stripe attaquant, capter un `code` OAuth, fabriquer un URL `/api/integrations/stripepayment/callback?code=…` et faire cliquer un user-victime ; vérifier que le credential Stripe est lié au user-victime.
5. **SEC-103 (SSRF webhook DNS rebinding)** : créer un domaine qui répond initialement avec une IP publique puis bascule en `169.254.169.254` ; vérifier que le webhook outbound touche bien metadata.
6. **SEC-011 (jwt.verify clé vide)** : confirmer le comportement de `jsonwebtoken` (version effective dans le repo) avec `secret=""` — certaines versions throw, d'autres warn et accept.

## Axes NON couverts ou couverts superficiellement

### Pas examinés en profondeur
- **CSRF token implementation** : logique de `validateCsrfToken` (binding session, TTL, source) non inspectée. SEC-003 documente seulement le cookie sameSite.
- **NextAuth `jwt`/`session` callbacks** : claims injection, audience validation, scope check non audités systématiquement.
- **Webhook entrant Stripe en mode payant** (community-edition stub seulement).
- **Path traversal sur `/api/avatar/[uuid]`** : non lu.
- **SAML/BoxyHQ** : provider référencé dans `next-auth-options.ts:537` mais jackson n'est pas dans le fork — code de fallback en place, comportement à confirmer.
- **`handleSeats`** : gestion concurrente des sièges, double-booking par seat — non analysé.
- **`getSafeRedirectUrl`** : open redirect protection — non examiné.
- **Hashed links** sharing (brute-force/timing) — non testé.
- **`loadAndValidateUsers`** dans `handleNewBooking` — peut contenir des contrôles complémentaires non vus.
- **Bot detection / Turnstile** : logique de `checkBotDetection` et possibilité de bypass via headers — non couvert.
- **`getIP(req)`** : trust de `X-Forwarded-For` pour rate-limit by-IP — non analysé.
- **OAuth callbacks restants** : seuls les apps explicitement listées dans SEC-101/102 ont été lus en détail ; intercom, salesforce, pipedrive-crm, hubspot, zohocrm/calendar/bigin, closecom, vital, hitpay, jelly, lyra, dub, huddle01, nextcloudtalk, larkcalendar, feishucalendar, tandemvideo, office365video, webex — survol seulement.
- **iCalUID/sequence collisions cross-tenant** — non examiné.
- **OG image / unfurl endpoint** — non trouvé directement, non audité.
- **`event-type-ownership.guard.ts` et `booking-pbac.guard.ts`** (API v2 Nest) : référencés mais logique interne non lue — à vérifier qu'ils ne dépendent pas eux aussi de `PermissionCheckService` stub.
- **`apps/api/v1`** : n'existe pas dans ce fork (pas de répertoire). Toute mention dans la doc à corriger.
- **tRPC routers** : `viewer/ooo`, `viewer/payments`, `viewer/workflows` — non analysés en détail.
- **Email templates HTML escape** : revue limitée à `Info.tsx`, autres templates non parcourus.
- **CSV export bookings** : aucun handler `text/csv` trouvé via grep — soit absent, soit non détecté.
- **IANA tz DB embarquée par dayjs** : version non vérifiée.
- **Compat Node** : pas grepé exhaustivement `Iterator.prototype`, `Object.groupBy`, `Promise.withResolvers`.
- **`viewer.bookings.get` handler** : non lu, possibilité de N+1 non vérifiée.
- **Indices manquants sur `Host(scheduleId, userId)`** : possiblement OK via PK composite, non confirmé.
- **React-Hook-Form `Booker` form principal** : fichier `Booker.tsx` racine non trouvé (refacto en cours ?).
- **Test coverage** : pas analysé. Le repo a des tests (`__tests__/`) mais l'exhaustivité n'a pas été évaluée.
- **Migration `CREATE INDEX CONCURRENTLY`** : grepé sur échantillon seulement.

### Dépendances / supply chain
- Audit limité aux deps majeures : `next 16.2.3`, `next-auth 4.24.13`, `sharp 0.33.5`, `sanitize-html 2.17.0`, `dompurify 3.3.2`, `jose 4.15.9`, `axios 1.15.0`, `ws 7.5.10` — pas de CVE critique connue à mai 2026.
- `rrule 2.7.1` : version ancienne, pas de CVE connue mais bugs `between()` infini sur certains patterns (BUG-013).
- Pas de `yarn audit` ou `npm audit` exécuté.
- Scripts post-install non analysés.

### Côté production
- Mode embed iframe : si désactivable, plusieurs SEC peuvent être relâchés (SEC-003 sameSite=none, SEC-202 postMessage).
- Présence d'un egress proxy filtrant : invaliderait partiellement SEC-103/104 (SSRF webhook/CalDAV).
- Présence d'un WAF en amont : réduirait l'exploitabilité de SEC-200 (rate-limit fail-open).
- Modèle de menace "vol de DB en lecture seule" exclu → SEC-006 (reset token en clair) tombe à P3.
