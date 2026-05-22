# Audit final cal.diy (fork Clever Cloud) — Pass 1 consolidée

- **Branche** : `master @ 3e50c176fe`
- **Date** : 2026-05-20
- **Sources** : Pass 1 Codex (12 findings) + Pass 1 Opus (56 findings)
- **Méthodo** : cross-feed dual-model + arbitrage contextuel Clever Cloud (usage interne, données prospects, OAuth Google Workspace + Pipedrive = bijoux de la couronne)
- **Validation dynamique** : 3 P0 confirmés en PoC (cf. `scripts/audit-poc/`) — SEC-001, SEC-200, BUG-001.

## Décompte final

| Sévérité | SEC | BUG | PERF | **Total** |
|----------|-----|-----|------|-----------|
| **P0**   | 2   | 1   | 0    | **3**     |
| **P1**   | 9   | 3   | 1    | **13**    |
| **P2**   | 14  | 6   | 6    | **26**    |
| **P3**   | 9   | 4   | 4    | **17**    |
| **Total**| **34** | **14** | **11** | **59** |

---

## SEC — Authentification & Authorization

### [SEC-001] PBAC bypassée sur eventType d'équipe — `PermissionCheckService` stub no-op
- **Sources** : opus SEC-001
- **Sévérité** : **P0**
- **Localisation** : `packages/trpc/server/routers/viewer/eventTypes/util.ts:15-20, 159-175` + `_router.ts:104,156,170,184,198,212,226` + `heavy/_router.ts:19,29`
- **Preuve** :
  ```ts
  class PermissionCheckService {
    async checkPermission(..._args) { return true; }
    async hasPermission(..._args) { return true; }
  }
  ```
- **Impact** : tout user authentifié peut appeler `eventTypes.delete`, `eventTypes.heavy.update`, `eventTypes.heavy.duplicate`, `eventTypes.get`, `getHostsForAvailability`, `getHostsForAssignment`, `exportHostsForWeights`, `getChildrenForAssignment`, `getHostsWithLocationOptions`, `massApplyHostLocation` sur n'importe quel `eventTypeId` d'équipe — IDs séquentiels énumérables. **Confirmé en PoC** (delete a réussi HTTP 200 cross-tenant).
- **Correctif** : remplacer le stub par un vrai check `Membership` (cf. `viewer/teams/permissions.ts:requireMember`), ou rediriger `createEventPbacProcedure` vers `eventOwnerProcedure`.
- **Effort** : M

### [SEC-002] OAuth client secret comparé en non-constant-time (API v2)
- **Sources** : opus SEC-002
- **Sévérité** : P1
- **Localisation** : `apps/api/v2/src/modules/auth/strategies/api-auth/api-auth.strategy.ts:184-186`
- **Preuve** : `if (client.secret !== oAuthClientSecret) throw new UnauthorizedException(...)`
- **Correctif** : `crypto.timingSafeEqual(Buffer.from(client.secret), Buffer.from(oAuthClientSecret))` + contrôle longueur.
- **Effort** : XS

### [SEC-003] `jwt.verify` avec fallback clé `""` si `CALENDSO_ENCRYPTION_KEY` manque
- **Sources** : opus SEC-011
- **Sévérité** : **P1** (si var manquante en prod), P3 sinon
- **Localisation** : `packages/features/auth/lib/oAuthAuthorization.ts:9`
- **Preuve** : `jwt.verify(token, process.env.CALENDSO_ENCRYPTION_KEY || "") as OAuthTokenPayload;`
- **Impact** : `jsonwebtoken` accepte clé vide → tout JWT HS256 signé clé vide est validé → bypass `/api/auth/oauth/me`.
- **Correctif** : early throw si var absente.
- **Effort** : XS

### [SEC-004] Cookies `sameSite: "none"` en production (embed)
- **Sources** : opus SEC-003
- **Sévérité** : P3
- **Localisation** : `packages/lib/default-cookies.ts:25-46`
- **Impact** : trade-off documenté pour embed iframe. Affaiblit défense CSRF cross-site, compensé par tokens CSRF + SOP.
- **Correctif** : `lax` par défaut, `none` uniquement sur cookies dédiés embed.
- **Effort** : S

### [SEC-005] Énumération de comptes via timing sur `/auth/login`
- **Sources** : opus SEC-004 (+ opus SEC-204 = doublon)
- **Sévérité** : P2
- **Localisation** : `packages/features/auth/lib/next-auth-options.ts:164-187` + `verifyPassword.ts:3-6`
- **Preuve** : fast-path sur `!user`, slow-path ~100ms bcrypt sinon. Rate-limit `hashEmail(user.email)` ne déclenche pas pour emails inexistants.
- **Correctif** : `verifyPassword(credentials.password, DUMMY_HASH)` quand user manquant ; rate-limit par IP avant lookup.
- **Effort** : XS

### [SEC-006] Politique mot de passe ≥ 7 chars (sous NIST)
- **Sources** : opus SEC-005
- **Sévérité** : P2
- **Localisation** : `packages/features/auth/lib/validPassword.ts:1-9`, `packages/lib/auth/isPasswordValid.ts:13`
- **Correctif** : ≥ 12 user, ≥ 15 admin ; HIBP k-anonymity.
- **Effort** : S

### [SEC-007] Reset-password tokens stockés en clair (cuid `ResetPasswordRequest.id`)
- **Sources** : opus SEC-006
- **Sévérité** : P2
- **Localisation** : `apps/web/app/api/auth/reset-password/route.ts:50-60` + `packages/features/auth/lib/passwordResetRequest.ts:26-34`
- **Impact** : fuite DB (backup, replica compromise) → réutilisation tokens actifs.
- **Correctif** : token = `crypto.randomBytes(32).toString("hex")`, stocker `sha256(token)`.
- **Effort** : M (migration)

### [SEC-008] Magic-link `maxAge: 10 * 60 * 60` = 10 heures (commentaire dit 10 min)
- **Sources** : opus SEC-007
- **Sévérité** : P2
- **Localisation** : `packages/features/auth/lib/next-auth-options.ts:362`
- **Preuve** : `maxAge: 10 * 60 * 60, // Magic links are valid for 10 min only` — bug évident, `36000s = 10h`.
- **Correctif** : `maxAge: 10 * 60` (ou `15 * 60`).
- **Effort** : XS

### [SEC-009] Codes de vérification email + 2FA TOTP — anti-replay & stockage faibles
- **Sources** : codex SEC-007 + opus SEC-008 + opus SEC-009
- **Sévérité** : P2
- **Localisation** :
  - Email TOTP : `packages/features/auth/lib/verifyEmail.ts:104-110`, `verifyCodeUnAuthenticated.ts:17-24`, `RegularBookingService.ts:612-623`
  - 2FA TOTP : `packages/lib/totp.ts:15-30` + `next-auth-options.ts:236-242`
  - Backup codes : `apps/web/app/api/auth/two-factor/totp/setup/route.ts:71-79`
- **Preuve** (3 vecteurs distincts) :
  1. Email TOTP `md5(email + key)` step 900s, rejouable ≤ 15 min, pas single-use.
  2. 2FA TOTP `totpAuthenticatorCheck(code, secret)` sans persistance du dernier step accepté → rejouable ≤ 30s.
  3. Backup codes 2FA chiffrés réversibles avec `CALENDSO_ENCRYPTION_KEY` au lieu d'être hashés.
- **Impact** : 3 vecteurs de rejeu/exfiltration sur les preuves de possession d'email & 2FA. Si la clé `CALENDSO_ENCRYPTION_KEY` fuit, tous les backup codes sont récupérables (cumul avec SEC-100).
- **Correctif** :
  - Email : tokens random per-tentative, stocker hash, consommer en transaction.
  - TOTP : stocker `User.twoFactorLastUsedStep`, refuser `step <= last_used_step`.
  - Backup codes : bcrypt/argon2 par code, perdre la capacité de reshow.
- **Effort** : M

### [SEC-010] `getServerSession` LRU cache sans TTL
- **Sources** : opus SEC-010
- **Sévérité** : P3
- **Localisation** : `packages/features/auth/lib/getServerSession.ts:26,57-62,147`
- **Impact** : claim `role` peut rester stale jusqu'à éviction LRU.
- **Correctif** : `ttl: 60_000`.
- **Effort** : XS

### [SEC-011] `disable 2FA` accepte TOTP seul sans password pour users OAuth
- **Sources** : opus SEC-012
- **Sévérité** : P2
- **Localisation** : `apps/web/app/api/auth/two-factor/totp/disable/route.ts:43-55`
- **Correctif** : forcer re-auth IdP ou TOTP+backup.
- **Effort** : S

### [SEC-012] `bookings.find` publicProcedure expose `description` par `bookingUid`
- **Sources** : opus SEC-013
- **Sévérité** : P3
- **Localisation** : `packages/trpc/server/routers/viewer/bookings/_router.tsx:91-98`
- **Impact** : `description` peut contenir PII ; UUID non-énumérable.
- **Correctif** : drop `description` du select.
- **Effort** : S

### [SEC-013] `NEXT_PUBLIC_IS_E2E` bypasse 2FA + password admin
- **Sources** : opus SEC-014
- **Sévérité** : P3
- **Localisation** : `packages/features/auth/lib/next-auth-options.ts:254-257`
- **Impact** : préfixe `NEXT_PUBLIC_*` exposé au client ; si activé en prod, contournement total.
- **Correctif** : renommer `INTERNAL_E2E_TEST_MODE` + guard `NODE_ENV !== "production"`.
- **Effort** : XS

### [SEC-014] Code d'impersonation dead-code (provider EE retiré mais propagation JWT/session restée)
- **Sources** : opus SEC-015
- **Sévérité** : P3
- **Localisation** : `packages/features/auth/lib/getServerSession.ts:127-145`, `next-auth-options.ts:556,746,779`
- **Impact** : surface prête à l'emploi si réintroduction sans gardes.
- **Correctif** : supprimer le code mort.
- **Effort** : S

### [SEC-015] Upload avatar base64 sans limite avant decode/resize
- **Sources** : codex SEC-006
- **Sévérité** : P2
- **Localisation** : `packages/trpc/server/routers/viewer/me/updateProfile.schema.ts:89-94` + `updateProfile.handler.ts:157-167` + `packages/lib/server/resizeBase64Image.ts:17-29`
- **Preuve** : `avatarUrl: z.string()` sans `.max()`, `Buffer.from(b64,"base64")` puis `jimp.read(buffer)` sans plafond.
- **Impact** : pic CPU/mémoire serveur tRPC sur user authentifié.
- **Note** : à vérifier vs body parser Next.js (limite par défaut 1 MB pour API routes — peut atténuer pour tRPC ?).
- **Correctif** : limite Zod longueur base64, vérif taille décodée + magic bytes + pixels.
- **Effort** : S

### [SEC-016] OAuth state — `JSON.parse` non controlé
- **Sources** : codex SEC-008
- **Sévérité** : P3
- **Localisation** : `packages/app-store/_utils/oauth/encodeOAuthState.ts:7-11`, `decodeOAuthState.ts:8-13`
- **Preuve** : `JSON.parse(req.query.state)` sans try/catch.
- **Impact** : 500 + log noise sur endpoints OAuth publics.
- **Correctif** : try/catch → 400 `Invalid OAuth state`.
- **Effort** : XS

### [SEC-017] API v2 expose les secrets HMAC des webhooks en sortie
- **Sources** : codex SEC-009 (trouvaille unique Codex)
- **Sévérité** : P3
- **Localisation** : `apps/api/v2/src/modules/webhooks/outputs/webhook.output.ts:42-45` + `webhooks.controller.ts:76-108` + `is-user-webhook-guard.ts:25-34`
- **Preuve** : DTO `webhook.output.ts` expose `secret!: string | null` via `@Expose() @ApiProperty()`.
- **Impact** : tout détenteur de clé API peut lister les secrets HMAC ; fuite de clé API = fuite de secrets webhook.
- **Correctif** : masquer `secret` dans GET, exposer seulement `hasSecret`, retourner secret une seule fois à la création.
- **Effort** : S

---

## SEC — Booking, OAuth, Webhooks, Crypto

### [SEC-100] AES-256-CBC sans authentification (malléabilité, padding-oracle)
- **Sources** : opus SEC-100 + codex SEC-003
- **Sévérité** : **P1** (override Clever Cloud — credentials Google Workspace + Pipedrive sont bijoux de la couronne)
- **Localisation** : `packages/lib/crypto.ts:1-41`, `packages/lib/CalendarService.ts:401-403`
- **Preuve** :
  ```ts
  const ALGORITHM = "aes256";  // Node mappe → aes-256-cbc
  const cipher = crypto.createCipheriv(ALGORITHM, _key, iv);
  return `${iv.toString("hex")}:${encrypted}`;
  ```
- **Impact** : aucun tag d'auth. Attaquant avec écriture DB peut modifier silencieusement `credential.key` (SendGrid, Close, CalDAV, Google, etc.). Padding-oracle exploitable côté décryption si erreurs distinguables. Cumul avec SEC-009 (backup codes 2FA) augmente la surface.
- **Correctif** : `aes-256-gcm`, format `iv:tag:ciphertext`, préfixe `v2:`, lazy-migrate à chaque décryption.
- **Effort** : M

### [SEC-101] Confused-deputy OAuth — `NONCE_EXEMPT_APPS` (Stripe, Webex, Basecamp, Dub, Tandem)
- **Sources** : opus SEC-101 + codex SEC-001
- **Sévérité** : **P1**
- **Localisation** : `packages/app-store/_utils/oauth/decodeOAuthState.ts:6` + callbacks de `stripepayment`, `basecamp3`, `dub`, `webex`, `tandemvideo`
- **Preuve** :
  ```ts
  const NONCE_EXEMPT_APPS = new Set(["stripe", "basecamp3", "dub", "webex", "tandem"]);
  if (appSlug && NONCE_EXEMPT_APPS.has(appSlug)) return state;
  ```
- **Impact** : attaquant initie OAuth Stripe sur SON compte, force user-victime à visiter callback avec son `code` → credential Stripe attaquant lié à victime → futurs paiements détournés. Idem Webex/Basecamp/Tandem (calendar/video).
- **Correctif** : retirer Stripe immédiatement. Pour les 4 autres, nonce alternatif via cookie HttpOnly server-side (corrélation `oauth_state_<userId>`).
- **Effort** : S

### [SEC-102] OAuth callbacks ignorent `state === undefined`
- **Sources** : opus SEC-102
- **Sévérité** : P2
- **Localisation** : `packages/app-store/{zoomvideo,office365calendar,feishucalendar,larkcalendar,googlecalendar}/api/callback.ts`
- **Preuve** : `decodeOAuthState(req)` retourne `undefined` silencieusement, échange de code suit.
- **Correctif** : abort 400 si `state === undefined` (apps non-exemptes).
- **Effort** : S

### [SEC-103] SSRF webhook outbound — pas de re-validation au send + bypass IPv4-map IPv6
- **Sources** : opus SEC-103 + codex SEC-002
- **Sévérité** : **P1**
- **Localisation** : `packages/lib/ssrfProtection.ts:137-149`, `packages/features/webhooks/lib/sendPayload.ts:312-321`, `handleWebhookScheduledTriggers.ts:67-74`, `viewer/webhook/create.handler.ts:25-31`
- **Preuve** :
  ```ts
  if (isCloudMetadataEndpoint(url.hostname)) return { isValid: false, error: "..." };
  if (IS_SELF_HOSTED) {
    if (url.protocol === "http:" || url.protocol === "https:") return { isValid: true };
  }
  ```
  Validation sync sans DNS lookup à create. Bypass `http://[::ffff:169.254.169.254]/` non normalisé.
- **Impact** : (1) DNS rebinding ; (2) bypass IPv4-map IPv6 vers metadata cloud ; (3) self-host autorise tous les IPs privés.
- **Correctif** : `await validateUrlForSSRF(url)` async avant chaque fetch. Bloquer link-local/metadata/loopback AVANT la branche self-host, normaliser IPv4-map IPv6, fetch par IP avec `Host:` header (pinning anti-DNS-rebinding).
- **Effort** : M

### [SEC-104] SSRF arbitraire — CalDAV `url` et ICS-feed `urls` non validés
- **Sources** : opus SEC-104
- **Sévérité** : **P1**
- **Localisation** : `packages/app-store/caldavcalendar/api/add.ts:12-44` + `packages/app-store/ics-feedcalendar/api/add.ts:13-50` + `ics-feedcalendar/lib/CalendarService.ts:86`
- **Preuve** : `url` body accepté tel quel, puis `dav?.listCalendars()` (HTTP) ou `fetch(this.urls[i])`.
- **Impact** : user authentifié → `http://169.254.169.254/latest/meta-data/iam/...`, scan intranet, exfil metadata cloud.
- **Correctif** : `await validateUrlForSSRF(url)` async + throw 400.
- **Effort** : S

### [SEC-105] Booking d'event-type `hidden` non bloqué
- **Sources** : opus SEC-105
- **Sévérité** : P2
- **Localisation** : `packages/features/bookings/lib/handleNewBooking/getEventTypesFromDB.ts:17-201` (select sans `hidden`)
- **Impact** : attaquant connaissant `eventTypeId` séquentiel peut booker un event masqué (`requiresConfirmation`, `secret-link-only`, `private` passent).
- **Correctif** : ajouter `hidden: true` au select + `HttpError(404)` si `hidden && !hashedLink`.
- **Effort** : XS

### [SEC-106] Spoofing booker email → mail légitime cal.diy vers victime
- **Sources** : opus SEC-106
- **Sévérité** : **P1** (override Clever Cloud — mail signé SPF/DKIM Clever envoyé à prospects/concurrents)
- **Localisation** : `packages/features/bookings/lib/service/RegularBookingService.ts:612-629`
- **Preuve** : `requiresBookerEmailVerification` default OFF, `bookerEmail` accepté tel quel.
- **Impact** : phishing/spam au nom de cal.com Clever depuis nos serveurs, sans contrainte sauf rate-limit IP (contournable TOR).
- **Correctif** : activer `requiresBookerEmailVerification` par défaut sur instance Clever, ou rate-limit par hash(bookerEmail).
- **Effort** : M

### [SEC-107] OAuth refresh-token race sans lock (DoS intégrations)
- **Sources** : opus SEC-107
- **Sévérité** : P2
- **Localisation** : `packages/app-store/_utils/oauth/updateTokenObject.ts:14-93`, `OAuthManager.ts:271-281`
- **Impact** : 2 process parallèles refresh en même temps → 2e perd ; Microsoft Graph/Salesforce (rotation stricte) → intégration tombe.
- **Correctif** : `prisma.$transaction` lock row par `credentialId`, ou single-flight in-memory.
- **Effort** : M

### [SEC-108] Validation `responses`/`metadata` non bornée (DoS, abus stockage)
- **Sources** : opus SEC-108
- **Sévérité** : P3
- **Localisation** : `packages/features/bookings/lib/bookingCreateBodySchema.ts:20,98-106`
- **Preuve** : `metadata: z.record(z.string())`, `email: z.string()`, `notes: z.string().optional()` sans bornes.
- **Correctif** : `.max(2000)` notes/rescheduleReason ; `email().max(254)` ; bornes sur record keys.
- **Effort** : S

### [SEC-109] Stripe webhook stub (community-edition) — risque de régression
- **Sources** : opus SEC-109
- **Sévérité** : P3
- **Localisation** : `apps/web/pages/api/integrations/stripepayment/webhook.ts:1-12`
- **Impact** : endpoint 404 stub. Pas dangereux en l'état mais surface prête.
- **Correctif** : log warning + commentaire explicite sur body brut + `constructEvent`.
- **Effort** : XS

---

## SEC — Injections, XSS, CSP, files, rate-limit

### [SEC-200] Rate-limit fail-open silencieux quand `UNKEY_ROOT_KEY` absent
- **Sources** : opus SEC-200
- **Sévérité** : **P0** (confirmé en PoC : 200/200 POST `/api/auth/callback/credentials` passés, 0 × 429)
- **Localisation** : `packages/lib/rateLimit.ts:33-42`
- **Preuve** :
  ```ts
  if (!UNKEY_ROOT_KEY) {
    return () => ({ success: true, limit: 10, remaining: 999, reset: 0 });
  }
  ```
- **Impact** : self-host sans Unkey (cas par défaut) → brute-force illimité sur 30+ handlers (login, forgot-password, signup, 2FA, cancel booking, send verify email…). À confirmer si `UNKEY_ROOT_KEY` est set sur l'instance Clever — sinon **P0 actif en prod**.
- **Correctif** : refuser le démarrage si var absente en `NODE_ENV=production`, ou fallback in-memory (LRU sliding window) sur endpoints auth.
- **Effort** : M

### [SEC-201] CSP appliquée uniquement sur `/auth/login`, `/login`
- **Sources** : opus SEC-201 + codex SEC-005
- **Sévérité** : P1
- **Localisation** : `apps/web/proxy.ts:64-66, 165-167`
- **Preuve** : `shouldEnforceCsp` retourne `true` uniquement pour login.
- **Impact** : booker public, profils, settings, signup — aucune CSP. Une XSS (cf. SEC-202) sans mitigation. Le nonce + `strict-dynamic` correctement implémenté mais inutile faute de matcher.
- **Correctif** : matcher `/((?!_next/static|_next/image|api|favicon).*)` ; déploiement progressif via `Content-Security-Policy-Report-Only` 48h.
- **Effort** : S

### [SEC-202] `postMessage` listeners sans validation `e.origin` (embed)
- **Sources** : opus SEC-202
- **Sévérité** : P1
- **Localisation** : `packages/embeds/embed-core/src/embed-iframe.ts:559-568`, `embed.ts:1565-1582`
- **Preuve** :
  ```ts
  window.addEventListener("message", (e) => {
    if (data.originator === "CAL" && typeof method === "string") { ... }
  });
  ```
  `originator === "CAL"` est dans le payload contrôlé, pas une vérif d'origine.
- **Impact** : tout site embarquant l'iframe (ou sibling) invoque arbitrairement `interfaceWithParent`.
- **Correctif** : vérifier `e.origin` contre `WEBAPP_URL` / `data-cal-origin` ; ajouter schéma Zod.
- **Effort** : S

### [SEC-203] Liens markdown `target="_blank"` sans `rel="noopener noreferrer"`
- **Sources** : opus SEC-203
- **Sévérité** : P2
- **Localisation** : `packages/lib/markdownToSafeHTML.ts:27`, `markdownToSafeHTMLClient.ts:27`
- **Impact** : reverse tab-nabbing (browsers anciens). Bios + descriptions event-types.
- **Correctif** : ajouter `rel='noopener noreferrer'`.
- **Effort** : XS

### [SEC-204] Dockerfile root + `ARG NEXTAUTH_SECRET=secret` par défaut
- **Sources** : opus SEC-205 + codex SEC-004
- **Sévérité** : P2
- **Localisation** : `Dockerfile:10-35, 77-94`, `README.md:562-568`
- **Preuve** :
  ```dockerfile
  ARG NEXTAUTH_SECRET=secret
  ARG CALENDSO_ENCRYPTION_KEY=secret
  ENV NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
  ```
- **Impact** : (a) container root → escalation post-RCE ; (b) si opérateur oublie `--build-arg`, JWTs signés `secret` ; (c) build cache/registry peut conserver ces secrets dans les layers.
- **Correctif** : retirer défauts `secret` (ARG vide → erreur explicite), `USER calcom` dans runner, BuildKit `--secret` si nécessaire.
- **Effort** : S

### [SEC-205] CSP `script-src` accepte `'unsafe-inline' https:` en prod
- **Sources** : opus SEC-206
- **Sévérité** : P2
- **Localisation** : `apps/web/lib/csp.ts:19-25`
- **Preuve** :
  ```ts
  script-src ${IS_PRODUCTION
    ? `'nonce-${nonce}' 'strict-dynamic' 'self' 'unsafe-inline' https:`
    : "..."};
  ```
- **Impact** : `'unsafe-inline'` annule `'nonce-…'` sur browsers sans `strict-dynamic` ; `https:` permet exfil. Cumul avec SEC-201.
- **Correctif** : retirer `'unsafe-inline' https:`.
- **Effort** : S

### [SEC-206] Email `Info.tsx` mute du HTML sanitizé après coup
- **Sources** : opus SEC-207
- **Sévérité** : P3 (futur)
- **Localisation** : `packages/emails/src/components/Info.tsx:26-30`
- **Impact** : `css` constant statique aujourd'hui → pas exploitable, pattern fragile.
- **Correctif** : classes pré-définies, ne pas muter post-sanitization.
- **Effort** : S

### [SEC-207] `NEXT_PUBLIC_HEAD_SCRIPTS` / `BODY_SCRIPTS` injectés inline
- **Sources** : opus SEC-208
- **Sévérité** : P3 (par design)
- **Localisation** : `apps/web/app/(use-page-wrapper)/layout.tsx:9-37`
- **Impact** : si opérateur place JS tiers, c'est de la RCE client. Trusté par design.
- **Correctif** : restreindre à `<script src="...">` whitelistées, ou documenter trust level.
- **Effort** : M

---

## BUG — Bugs & robustesse

### [BUG-001] Double-booking race — `ensureAvailableUsers` hors transaction
- **Sources** : opus BUG-001 + codex BUG-001
- **Sévérité** : **P0** (override Clever — RDV commerciaux qui se chevauchent = incident client direct ; confirmé en PoC : 7 PENDING simultanés sur même slot)
- **Localisation** : `packages/features/bookings/lib/service/RegularBookingService.ts:900-960,933-946,1705-1733` + `packages/features/bookings/lib/handleNewBooking/createBooking.ts:139-147` + `packages/prisma/schema.prisma:851-929`
- **Preuve** : `ensureAvailableUsers` (lecture availability + busy) appelée HORS transaction. `prisma.$transaction` sans `isolationLevel: "Serializable"`. Pas de `pg_advisory_xact_lock`. Index temporels existent mais pas de contrainte d'exclusion. Le flux seats utilise `FOR UPDATE` (`createNewSeat.ts:44-48`) — preuve que le pattern est connu.
- **Impact** : TOCTOU classique. Deux POST `/api/book/event` concurrents pour le même slot passent tous deux la vérif. L'extension `idempotencyKey` couvre seulement `ACCEPTED` (cf. BUG-013) → PENDING/RR luckyUser différent/seats contournent. Confirmé : 7 bookings PENDING même slot en PoC.
- **Correctif** : envelopper `ensureAvailableUsers` dans la transaction avec `isolationLevel: "Serializable"`, ou `pg_advisory_xact_lock(hash(userId, slotStart))` ; à moyen terme contrainte d'exclusion Postgres sur `tstzrange(startTime,endTime)` pour bookings ACCEPTED.
- **Effort** : M

### [BUG-002] Reset-password token consommé après changement (race)
- **Sources** : codex BUG-002
- **Sévérité** : P2
- **Localisation** : `apps/web/app/api/auth/reset-password/route.ts:50-60,67-87,92-101`
- **Preuve** :
  ```ts
  const maybeRequest = await prisma.resetPasswordRequest.findFirstOrThrow({...});
  await prisma.user.update(...);
  await expireResetPasswordRequest(rawRequestId);
  ```
- **Impact** : 2 requêtes concurrentes même token passent la lecture initiale ; dernier mot de passe écrit gagne. Pré-requis : connaître le token (donc complémentaire à SEC-007).
- **Correctif** : consommer d'abord avec `updateMany({ where: { id, expires: { gt: now } }, data: { expires: now } })` en transaction, exiger `count === 1`.
- **Effort** : S

### [BUG-003] DST : `utcOffset` calculé à "maintenant" pour bookings futurs
- **Sources** : opus BUG-002
- **Sévérité** : P1
- **Localisation** : `packages/features/bookings/lib/handleNewBooking/validateBookingTimeIsNotOutOfBounds.ts:41-42` + `packages/lib/dayjs/index.ts:244-248`
- **Preuve** : `dayjs(date).tz(timeZone).utcOffset()` appelé sans `date` → `now()`.
- **Impact** : client Paris bookant fin mars un slot après passage été → offset hiver → fenêtre validation décalée d'1h.
- **Correctif** : `getUTCOffsetByTimezone(tz, reqBodyStartTime)`.
- **Effort** : XS

### [BUG-004] Working hours — `utcOffset` snapshot pour fenêtre de calcul
- **Sources** : opus BUG-003
- **Sévérité** : P2
- **Localisation** : `packages/lib/availability.ts:71-84`
- **Impact** : disponibilités décalées 1h quinzaine DST.
- **Correctif** : `utcOffset` dépend de la date du slot.
- **Effort** : S

### [BUG-005] Recurring events — `count` non borné côté Zod
- **Sources** : opus BUG-004
- **Sévérité** : P1
- **Localisation** : `packages/prisma/zod-utils.ts:234-243`
- **Preuve** : `count: z.number()` sans `.max()`. `RecurringBookingService.ts:74` boucle sur `data.length`.
- **Impact** : `count: 100000` → DoS 100k itérations séquentielles `createBooking`.
- **Correctif** : `count: z.number().int().min(1).max(52)` + check `data.length`.
- **Effort** : XS

### [BUG-006] Recurring booking — `await` séquentiel dans boucle
- **Sources** : opus BUG-005
- **Sévérité** : P2
- **Localisation** : `packages/features/bookings/lib/service/RecurringBookingService.ts:74-128`
- **Impact** : latence = N × unitaire ; amplifie BUG-005.
- **Correctif** : `Promise.all` batched (5 parallèle), 1re séquentielle pour fixer luckyUser RR.
- **Effort** : S

### [BUG-007] Catches silencieux dans callbacks OAuth
- **Sources** : opus BUG-006
- **Sévérité** : P2
- **Localisation** : `packages/app-store/{nextcloudtalk,webex,jelly,basecamp3}/api/callback.ts`
- **Preuve** : `} catch (e) {}` vides.
- **Correctif** : `logger.warn("...", e)`.
- **Effort** : XS

### [BUG-008] `.catch(() => null)` masque erreurs Prisma
- **Sources** : opus BUG-007
- **Sévérité** : P3
- **Localisation** : `packages/features/tasker/tasks/triggerNoShow/common.ts:116-123`
- **Impact** : erreurs DB transitoires comptent comme "guest pas trouvé" → faux no-show triggers.
- **Correctif** : catch uniquement `PrismaClientKnownRequestError` ciblé.
- **Effort** : XS

### [BUG-009] Webhook — index manquants `userId/teamId/eventTypeId`
- **Sources** : opus BUG-008
- **Sévérité** : P1 (perf-critical)
- **Localisation** : `packages/prisma/schema.prisma:1142-1170`
- **Preuve** : seul `@@index([active])`. `WHERE userId = ? OR teamId = ? OR eventTypeId = ?` seq scan à chaque trigger.
- **Correctif** :
  ```prisma
  @@index([userId])
  @@index([teamId])
  @@index([eventTypeId])
  @@index([platformOAuthClientId])
  ```
  Déployer en `CREATE INDEX CONCURRENTLY`.
- **Effort** : XS

### [BUG-010] `Booking.eventType` / `Availability.eventType` sans `onDelete` explicite
- **Sources** : opus BUG-009
- **Sévérité** : P3
- **Localisation** : `packages/prisma/schema.prisma:862,964`
- **Impact** : Prisma applique `SetNull` par défaut sur FK optionnel ; probablement intentionnel Booking, à vérifier Availability.
- **Correctif** : annoter `onDelete: SetNull` explicitement.
- **Effort** : XS

### [BUG-011] Migrations sans `CREATE INDEX CONCURRENTLY`
- **Sources** : opus BUG-010
- **Sévérité** : P2
- **Localisation** : `packages/prisma/migrations/*/migration.sql`
- **Impact** : déploiement bloquant grandes tables.
- **Correctif** : script séparé `CREATE INDEX CONCURRENTLY` + `--no-transaction` pour futures migrations hot.
- **Effort** : S

### [BUG-012] `engines.node` absent du `package.json` racine
- **Sources** : opus BUG-011
- **Sévérité** : P3
- **Localisation** : `/package.json`
- **Correctif** : `"node": ">=20.0.0"`.
- **Effort** : XS

### [BUG-013] `idempotencyKey` extension ne couvre que `ACCEPTED`
- **Sources** : opus BUG-012
- **Sévérité** : P2
- **Localisation** : `packages/prisma/extensions/booking-idempotency-key.ts:27-36`
- **Impact** : retries client sur `requiresConfirmation=true` créent N bookings PENDING → spam (cf. PoC BUG-001, 7 PENDING).
- **Correctif** : générer pour ACCEPTED + PENDING ; reset sur CANCELLED/REJECTED.
- **Effort** : XS

### [BUG-014] `rrule` 2.7.1 — ancienne version, pas de borne `count` au parse
- **Sources** : opus BUG-013
- **Sévérité** : P3
- **Localisation** : `node_modules/rrule/package.json` ; utilisé dans `packages/lib/parse-dates.ts`, `packages/emails/lib/generateIcsString.ts`
- **Correctif** : bump 2.8.x ; `count: Math.min(input.count, 366)` avant expand.
- **Effort** : S

---

## PERF — Performance

### [PERF-001] N+1 `_getUserAvailability` par user en équipe
- **Sources** : opus PERF-001
- **Sévérité** : P1
- **Localisation** : `packages/features/availability/lib/getUserAvailability.ts:785-817,361-500`
- **Preuve** : `Promise.all(users.map(user => this._getUserAvailability(...)))`. Par user : ~5 round-trips DB (getEventType, getCurrentSeats, getTimezoneFromDelegatedCalendars, oooRepo.findUserOOODays, calculateHolidayBlockedDates, busy fetch). Le `log.warn("High-load warning")` (L787) trahit le problème connu.
- **Impact** : équipe 50 hosts → ~250 round-trips DB parallèles, sat pool Prisma.
- **Correctif** : batch fetch — un `findMany` OOO/holiday/event-type pour tous les userIds, dispatch en mémoire.
- **Effort** : L

### [PERF-002] `logger.silly(JSON.stringify(...))` éval même en prod
- **Sources** : opus PERF-002
- **Sévérité** : P2
- **Localisation** : `packages/features/busyTimes/services/getBusyTimes.ts:77-83,186-189,227-230,285-288,345-350,373`
- **Impact** : sérialisation busyTimes (MBs possibles) à chaque check d'availability → CPU/GC pressure.
- **Correctif** : guard `if (logger.settings.minLevel <= 0)` ou supprimer.
- **Effort** : S

### [PERF-003] Pas de cache HTTP / ISR sur pages publiques
- **Sources** : opus PERF-003
- **Sévérité** : P2
- **Localisation** : `apps/web/app/(booking-page-wrapper)/{[user]/[type]/page.tsx, [user]/page.tsx, team/[slug]/page.tsx}`
- **Impact** : chaque visite anonyme = SSR complet.
- **Correctif** : `export const revalidate = 60;` + invalidate via `revalidateTag` sur update EventType.
- **Effort** : M

### [PERF-004] `EventTeamAssignmentTab` — multiples `form.watch()` top-level
- **Sources** : opus PERF-004
- **Sévérité** : P2
- **Localisation** : `apps/web/modules/event-types/components/tabs/assignment/EventTeamAssignmentTab.tsx:39-50`
- **Impact** : re-render à chaque keystroke ; lag sur grandes équipes.
- **Correctif** : `useWatch({ control, name: [...] })` avec selectors fins.
- **Effort** : S

### [PERF-005] `FormBuilder` rerender complet à chaque keystroke
- **Sources** : opus PERF-005
- **Sévérité** : P2
- **Localisation** : `apps/web/modules/event-types/components/tabs/advanced/FormBuilder.tsx:132-136`
- **Correctif** : sous-composant `<FieldRow>` mémoïsé, `useWatch` ciblé par index.
- **Effort** : M

### [PERF-006] `optimizePackageImports` limité à `@calcom/ui`
- **Sources** : opus PERF-006
- **Sévérité** : P3
- **Localisation** : `apps/web/next.config.ts:236-238`
- **Correctif** : ajouter `lodash`, `dayjs`, `@radix-ui/react-icons`, `framer-motion`.
- **Effort** : XS

### [PERF-007] Booker — `framer-motion` `domAnimation` eager-loaded
- **Sources** : opus PERF-007
- **Sévérité** : P3
- **Localisation** : `packages/features/bookings/Booker/framer-features.tsx`
- **Correctif** : `LazyMotion` avec `loadFeatures` dynamic import.
- **Effort** : S

### [PERF-008] Booking limit fetch — concurrence sous-utilisée
- **Sources** : opus PERF-008
- **Sévérité** : P3
- **Localisation** : `packages/features/busyTimes/services/getBusyTimes.ts:425-439`
- **Correctif** : `MAX_CONCURRENT_LIMIT_CHECK_BATCHES` à 10 ou retirer.
- **Effort** : XS

### [PERF-009] `getPublicEvent` — chaîne de `UserRepository` multiples
- **Sources** : opus PERF-009
- **Sévérité** : P2
- **Localisation** : `packages/features/eventtypes/lib/getPublicEvent.ts:269,298,468,479,496,510,694,711`
- **Impact** : 4-8 round-trips DB par page publique (cf. PERF-003).
- **Correctif** : repo `getPublicEventBundle` avec includes profonds + enrich unique.
- **Effort** : L

### [PERF-010] Booking — index `[eventTypeId, startTime, status]` manquant
- **Sources** : opus PERF-010
- **Sévérité** : P2
- **Localisation** : `packages/prisma/schema.prisma:918-929`
- **Preuve** : existants `[startTime,endTime,status]`, `[eventTypeId,status]`, `[userId,status,startTime]`. Pas `[eventTypeId,startTime]`.
- **Impact** : `getBusyTimesForLimitChecks` planner sous-optimal + filter heap.
- **Correctif** : `@@index([eventTypeId, startTime, status])`.
- **Effort** : S

### [PERF-011] Endpoint public logo `/api/logo` — fetch + resize sans cap
- **Sources** : codex PERF-001
- **Sévérité** : P2
- **Localisation** : `apps/web/app/api/logo/route.ts:191-235`
- **Preuve** :
  ```ts
  response = await fetch(filteredLogo, { signal: AbortSignal.timeout(10000) });
  const arrayBuffer = await response.arrayBuffer();
  const { buffer: outBuffer } = await resizeImage({ buffer, width, height, quality: 100 });
  ```
  `s-maxage=86400` aide mais chaque miss refait fetch + decode + resize.
- **Impact** : CPU/mémoire élevé sur route publique.
- **Correctif** : limite `Content-Length`, streaming cap, magic bytes, `quality` réduit, cache derivé par hash URL+type.
- **Effort** : M

---

## Annexe — Findings écartés et raisons

| Finding source | Raison |
|----------------|--------|
| Opus SEC-204 (timing enum login) | Doublon explicite avec opus SEC-004 → consolidé en SEC-005. |
| Codex "Notes non retenues" `checkBookingLimits` `!!Promise.all` | Codex lui-même l'écarte (pas de bypass confirmé) — non retenu. |
| Codex "Notes non retenues" exports CSV injection | Codex lui-même n'identifie pas de chemin vulnérable — non retenu. |
| Codex "Notes non retenues" XSS `dangerouslySetInnerHTML` | Codex confirme passage par `markdownToSafeHTML` — non retenu (mais SEC-203 + SEC-206 couvrent les patterns fragiles). |
