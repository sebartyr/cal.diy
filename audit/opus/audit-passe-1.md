# Audit pass 1 — cal.diy `master @ 3e50c176fe`

Date : 2026-05-20. Branche `master` (anciennement `feat/team-booking-mit`). Méthode : 4 agents Explore parallèles (auth/authZ, booking+OAuth+webhooks+crypto, injections+XSS+CSP+files+rate-limit, bugs+perf) + vérification manuelle des P0/P1.

Findings : 15 SEC (auth), 10 SEC (booking/OAuth/crypto), 9 SEC (injections/XSS/CSP/files), 13 BUG, 10 PERF. Numérotation : SEC-001..015 (auth), SEC-100..109 (booking/OAuth/crypto), SEC-200..208 (injections/XSS/CSP), BUG-001..013, PERF-001..010.

---

## SEC — Authentification & Authorization

### [SEC-001] PBAC bypassée sur eventType.update/delete/duplicate d'équipe — `PermissionCheckService` est un stub no-op
- **Sévérité** : P0
- **Localisation** : `packages/trpc/server/routers/viewer/eventTypes/util.ts:15-20, 159-175` + `packages/trpc/server/routers/viewer/eventTypes/_router.ts:104, 156, 170, 184, 198, 212, 226` + `heavy/_router.ts:19, 29`
- **Preuve** :
  ```ts
  class PermissionCheckService {
    constructor(_prisma?: unknown) {}
    async checkPermission(..._args: unknown[]) { return true; }
    async hasPermission(..._args: unknown[]) { return true; }
    async getTeamIdsWithPermission(..._args: unknown[]): Promise<number[]> { return []; }
  }
  // ... ligne 161 dans createEventPbacProcedure :
  const permissionCheckService = new PermissionCheckService();
  const hasPermission = await permissionCheckService.checkPermission({
    userId: ctx.user.id, teamId: event.teamId, permission, fallbackRoles,
  });
  if (!hasPermission) { throw new TRPCError({ code: "FORBIDDEN" }); } // jamais atteint
  ```
- **Impact** : tout utilisateur authentifié, sans être membre d'une équipe, peut appeler `viewer.eventTypes.delete`, `viewer.eventTypes.heavy.update`, `viewer.eventTypes.heavy.duplicate`, `viewer.eventTypes.get`, `getHostsForAvailability`, `getHostsForAssignment`, `exportHostsForWeights`, `getChildrenForAssignment`, `getHostsWithLocationOptions`, `massApplyHostLocation` sur **n'importe quel `eventTypeId` d'équipe**, IDs énumérables (séquentiels). Inclut : exfiltration des hôtes/poids/priorités, suppression d'event-types d'autres équipes, duplication arbitraire. Risque équivalent IDOR direct.
- **Correctif** : remplacer le stub par un check réel de `Membership` (cf. `packages/trpc/server/routers/viewer/teams/permissions.ts:requireMember`) ; ou rediriger `createEventPbacProcedure` vers `eventOwnerProcedure` (qui, lui, vérifie correctement la membership L65-77). Test critique : un appel `viewer.eventTypes.delete({ id: <team-event-id> })` depuis un user non-membre doit retourner 403.
- **Effort** : M (centralisation dans 1 fichier).
- **Faux positif possible si** : non — confirmé par lecture, vérification dynamique vivement recommandée.

### [SEC-002] OAuth client secret comparé en non-constant-time (API v2 platform)
- **Sévérité** : P1
- **Localisation** : `apps/api/v2/src/modules/auth/strategies/api-auth/api-auth.strategy.ts:184-186`
- **Preuve** : `if (client.secret !== oAuthClientSecret) throw new UnauthorizedException(...)`
- **Impact** : timing attack distante sur le secret client OAuth de la plateforme — l'auth `X-Cal-Secret-Key` repose dessus.
- **Correctif** : `crypto.timingSafeEqual(Buffer.from(client.secret), Buffer.from(oAuthClientSecret))` avec contrôle de longueur préalable.
- **Effort** : XS
- **Faux positif possible si** : non.

### [SEC-003] Cookies `csrfToken` + session — `sameSite: "none"` en production (embed compat)
- **Sévérité** : P3
- **Localisation** : `packages/lib/default-cookies.ts:25-46`
- **Preuve** : `sameSite: useSecureCookies ? "none" : "lax"` — en HTTPS, SameSite=None.
- **Impact** : trade-off documenté pour l'embed iframe. Affaiblit la défense CSRF cross-site (compensé par tokens CSRF dédiés et SOP) ; reste un facteur amplificateur en cas de sous-domaine compromis.
- **Correctif** : `lax` par défaut, `none` uniquement sur cookies dédiés au flow embed.
- **Effort** : S
- **Faux positif possible si** : embed iframe est use-case prioritaire.

### [SEC-004] `verifyPassword` skip quand user inconnu → énumération par timing
- **Sévérité** : P2
- **Localisation** : `packages/features/auth/lib/next-auth-options.ts:164-187` + `verifyPassword.ts:3-6`
- **Preuve** :
  ```ts
  if (!user) { throw new Error(ErrorCode.IncorrectEmailPassword); }  // fast path
  ...
  if (!user.password?.hash) { throw new Error(...); }
  const isCorrectPassword = await verifyPassword(...);  // slow path (~100ms bcrypt)
  ```
- **Impact** : différence de timing fast/slow permet d'énumérer les comptes existants. Le `checkRateLimitAndThrowError(hashEmail(user.email))` arrive APRÈS la lookup user et ne déclenche jamais sur les emails inexistants.
- **Correctif** : appeler un `verifyPassword(credentials.password, DUMMY_HASH)` quand `!user` ou `!user.password?.hash`. Mettre le rate-limit avant la lookup user (par IP hashée).
- **Effort** : XS
- **Faux positif possible si** : non.

### [SEC-005] Politique mot de passe ≥ 7 chars (en-dessous NIST)
- **Sévérité** : P2
- **Localisation** : `packages/features/auth/lib/validPassword.ts:1-9`, `packages/lib/auth/isPasswordValid.ts:13`
- **Preuve** : `if (password.length < 7) return false;`
- **Impact** : entropie faible ; reste compensée par bcrypt côté hash mais hors-norme NIST SP 800-63B (≥ 8, blocklist).
- **Correctif** : `>= 12` user, `>= 15` admin ; HIBP k-anonymity.
- **Effort** : S
- **Faux positif possible si** : exigence produit UX.

### [SEC-006] Reset-password tokens stockés en clair (= cuid de `ResetPasswordRequest.id`)
- **Sévérité** : P2
- **Localisation** : `apps/web/app/api/auth/reset-password/route.ts:50-60` + `packages/features/auth/lib/passwordResetRequest.ts:26-34`
- **Preuve** : URL = `${WEBAPP_URL}/auth/forgot-password/${request.id}`. `request.id` est un cuid stocké tel quel en DB.
- **Impact** : fuite DB en lecture seule (backup, replica compromise) → réutilisation des tokens actifs et reset de comptes.
- **Correctif** : token = `crypto.randomBytes(32).toString("hex")`, stocker `sha256(token)` en DB.
- **Effort** : M (migration schema).
- **Faux positif possible si** : modèle de menace exclut le vol de DB.

### [SEC-007] Magic-link `maxAge: 10 * 60 * 60` = 10 heures (commentaire dit 10 minutes)
- **Sévérité** : P2
- **Localisation** : `packages/features/auth/lib/next-auth-options.ts:362`
- **Preuve** :
  ```ts
  maxAge: 10 * 60 * 60, // Magic links are valid for 10 min only
  ```
  `10 * 60 * 60 = 36000s = 10h`. **Bug évident** — le commentaire ne match pas la valeur.
- **Impact** : interception du lien (Referer, log proxy, archives Slack/Slack threads, exports email) reste exploitable 10 h.
- **Correctif** : `maxAge: 10 * 60` (10 min) ou `15 * 60`.
- **Effort** : XS
- **Faux positif possible si** : non — bug évident, vérifié.

### [SEC-008] TOTP 2FA sans protection anti-replay
- **Sévérité** : P2
- **Localisation** : `packages/lib/totp.ts:15-30` + `next-auth-options.ts:236-242`
- **Preuve** : `totpAuthenticatorCheck(code, secret)` sans persistance du dernier step accepté.
- **Impact** : un code TOTP intercepté (phishing temps réel, MITM) reste rejouable ≤ 30 s.
- **Correctif** : stocker `User.twoFactorLastUsedStep`, refuser `step <= last_used_step`.
- **Effort** : S

### [SEC-009] Backup codes 2FA chiffrés (réversibles) au lieu d'être hashés
- **Sévérité** : P2
- **Localisation** : `apps/web/app/api/auth/two-factor/totp/setup/route.ts:71-79`
- **Preuve** : `backupCodes: symmetricEncrypt(JSON.stringify(backupCodes), CALENDSO_ENCRYPTION_KEY)`
- **Impact** : si `CALENDSO_ENCRYPTION_KEY` fuit (.env, IaC), tous les backup codes de tous les users sont récupérables. Cumul avec SEC-100 (AES sans auth tag) augmente la surface.
- **Correctif** : bcrypt/argon2 sur chaque code, perdre la capacité de "reshow".
- **Effort** : M
- **Faux positif possible si** : produit veut pouvoir afficher les codes (mauvaise pratique).

### [SEC-010] `getServerSession` — LRU cache sans TTL
- **Sévérité** : P3
- **Localisation** : `packages/features/auth/lib/getServerSession.ts:26, 57-62, 147`
- **Preuve** : `new LRUCache<string, Session>({ max: 1000 })` sans `ttl`.
- **Impact** : session figée jusqu'à éviction LRU même après changement de rôle / suppression compte. Mitigé par `findUnique(user)` côté DB mais le claim `role` reste stale.
- **Correctif** : `ttl: 60_000`.
- **Effort** : XS

### [SEC-011] `jwt.verify` avec fallback clé `""` quand `CALENDSO_ENCRYPTION_KEY` manque
- **Sévérité** : P1 si var manquante en prod, P3 sinon
- **Localisation** : `packages/features/auth/lib/oAuthAuthorization.ts:9`
- **Preuve** : `jwt.verify(token, process.env.CALENDSO_ENCRYPTION_KEY || "") as OAuthTokenPayload;`
- **Impact** : `jsonwebtoken` accepte une clé vide → tout JWT HS256 signé avec clé vide est validé → bypass total `/api/auth/oauth/me`.
- **Correctif** : early throw si var absente, pas de fallback `""`.
- **Effort** : XS

### [SEC-012] `disable 2FA` accepte TOTP seul sans password pour users OAuth
- **Sévérité** : P2
- **Localisation** : `apps/web/app/api/auth/two-factor/totp/disable/route.ts:43-55`
- **Impact** : si session OAuth (Google/Azure) compromise, attaquant peut tenter d'épuiser TOTP/backup codes et désactiver 2FA sans re-auth IdP.
- **Correctif** : forcer re-auth IdP ou TOTP+backup.
- **Effort** : S

### [SEC-013] `bookings.find` publicProcedure expose `description` par `bookingUid`
- **Sévérité** : P3
- **Localisation** : `packages/trpc/server/routers/viewer/bookings/_router.tsx:91-98`
- **Impact** : `description` peut contenir PII ; nécessite connaissance d'un UUID (non-énumérable).
- **Correctif** : drop `description` du select ou gate par email signé.
- **Effort** : S

### [SEC-014] `NEXT_PUBLIC_IS_E2E` bypasse 2FA + password admin
- **Sévérité** : P3
- **Localisation** : `packages/features/auth/lib/next-auth-options.ts:254-257`
- **Preuve** : préfixe `NEXT_PUBLIC_*` exposé au build client ; si activé en prod (erreur de config), admins contournent toute exigence security.
- **Correctif** : renommer `INTERNAL_E2E_TEST_MODE` (sans `NEXT_PUBLIC_`), ajouter `&& NODE_ENV !== "production"`.
- **Effort** : XS

### [SEC-015] Code d'impersonation propagé dans JWT/session bien que provider EE retiré
- **Sévérité** : P3 (info / dette)
- **Localisation** : `packages/features/auth/lib/getServerSession.ts:127-145`, `next-auth-options.ts:556,746,779`
- **Impact** : aucun chemin actuel ne set `token.impersonatedBy`, mais le code de propagation existe — surface prête à l'emploi si un endpoint réintroduit la mise à jour sans gardes.
- **Correctif** : supprimer le code mort jusqu'à réintégration explicite avec rôle ADMIN + `disableImpersonation` flag.
- **Effort** : S

---

## SEC — Booking, OAuth, Webhooks, Crypto

### [SEC-100] AES-256-CBC sans authentification (malléabilité, padding-oracle)
- **Sévérité** : P1
- **Localisation** : `packages/lib/crypto.ts:1-41`
- **Preuve** :
  ```ts
  const ALGORITHM = "aes256";  // Node mappe → aes-256-cbc
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, _key, iv);
  ```
- **Impact** : aucun tag d'authentification. Un attaquant avec accès écrire sur `credential.key` (SQLi, backup compromise, replica) peut modifier silencieusement les secrets chiffrés (SendGrid, Close, CalDAV/Exchange/ICS). Padding-oracle exploitable côté décryption si erreurs sont distinguables.
- **Correctif** : passer en `aes-256-gcm`, format `iv:tag:ciphertext`, versioning préfixe `v2:` pour migration progressive.
- **Effort** : M
- **Faux positif possible si** : un HMAC séparé est appliqué — aucun trouvé.

### [SEC-101] Confused-deputy OAuth — `NONCE_EXEMPT_APPS` inclut Stripe
- **Sévérité** : P1
- **Localisation** : `packages/app-store/_utils/oauth/decodeOAuthState.ts:6` + `packages/app-store/{stripepayment,basecamp3,dub,webex,tandemvideo}/api/callback.ts`
- **Preuve** :
  ```ts
  const NONCE_EXEMPT_APPS = new Set(["stripe", "basecamp3", "dub", "webex", "tandem"]);
  if (appSlug && NONCE_EXEMPT_APPS.has(appSlug)) return state;  // skip CSRF check
  ```
- **Impact** : un attaquant initie un flow OAuth sur SON compte Stripe, fait cliquer un user authentifié sur `…/callback?code=<attaquant>` → le credential Stripe de l'attaquant est lié au user-victime → futurs paiements vers le compte attaquant. Idem Basecamp/Webex/Tandem (calendar/video integrations détournées). Stripe est particulièrement grave.
- **Correctif** : retirer Stripe de `NONCE_EXEMPT_APPS` ; pour les 4 autres, implémenter un nonce alternatif (cookie HttpOnly server-side correlation) si le `state` natif ne peut pas porter le HMAC.
- **Effort** : S
- **Faux positif possible si** : un middleware additionnel vérifie le CSRF — aucun trouvé sur ces callbacks.

### [SEC-102] OAuth callbacks ignorent `state === undefined`
- **Sévérité** : P2
- **Localisation** : `packages/app-store/zoomvideo/api/callback.ts:13,52-78`, `office365calendar/api/callback.ts:18-188`, `feishucalendar`, `larkcalendar`, `googlecalendar`
- **Preuve** : `const state = decodeOAuthState(req);` — code OAuth ensuite échangé sans vérifier `state !== undefined`.
- **Impact** : variante du confused-deputy ; un attaquant peut détourner un flow OAuth via CSRF GET.
- **Correctif** : abort 400 si `state === undefined` pour les apps non-exemptes.
- **Effort** : S

### [SEC-103] SSRF webhook outbound — pas de re-validation au send (DNS rebinding)
- **Sévérité** : P1
- **Localisation** : `packages/features/webhooks/lib/sendPayload.ts:312-321`, `handleWebhookScheduledTriggers.ts:67-74`, `service/WebhookService.ts:98-115`
- **Preuve** : `validateUrlForSSRFSync` (sync, sans DNS lookup) appelée seulement à create/edit ; aucun re-validate au send.
- **Impact** : (1) DNS rebinding — `evil.com` résout en IP publique au create, puis en `169.254.169.254` au send (AWS metadata) ; (2) URLs créées avant l'ajout de la protection SSRF restent exploitables ; (3) self-hosted autorise tous les IPs privés à la création.
- **Correctif** : avant chaque `fetch(subscriberUrl)`, appeler `await validateUrlForSSRF(url)` (async, DNS lookup) ; idéalement résoudre A-record une seule fois et fetcher par IP avec `Host:` header (pinning).
- **Effort** : M
- **Faux positif possible si** : un egress proxy filtre — pas trouvé.

### [SEC-104] SSRF arbitraire — CalDAV `url` et ICS-feed `urls` non validés
- **Sévérité** : P1
- **Localisation** : `packages/app-store/caldavcalendar/api/add.ts:12-44` + `packages/app-store/ics-feedcalendar/api/add.ts:13-50` + `ics-feedcalendar/lib/CalendarService.ts:86`
- **Preuve** :
  ```ts
  const { username, password, url } = req.body;
  // pas de validateUrlForSSRF
  await dav?.listCalendars();  // requête HTTP vers url
  ```
  Et `fetch(this.urls[i])` côté ICS-feed.
- **Impact** : user authentifié peut viser `http://169.254.169.254/latest/meta-data/iam/security-credentials/` ou intranet `http://10.0.0.5:8080/` ; réponse observable (succès/échec, parfois contenu via message d'erreur). Exfiltration cloud metadata, scan interne.
- **Correctif** : `await validateUrlForSSRF(url)` (async) dans les deux handlers, throw 400 si invalide.
- **Effort** : S

### [SEC-105] Booking d'event-type `hidden` non bloqué
- **Sévérité** : P2
- **Localisation** : `packages/features/bookings/lib/handleNewBooking/getEventTypesFromDB.ts:17-201` (select sans `hidden`) + `RegularBookingService.ts` (pas de check)
- **Impact** : attaquant connaissant `eventTypeId` (IDs séquentiels énumérables) peut booker un event masqué (`hidden=true`) — contournement de "ressource cachée". Pour les events payants, paiement enforced ; mais `requiresConfirmation`, `secret-link-only`, `private` passent.
- **Correctif** : ajouter `hidden: true` au select + throw `HttpError(404)` si `hidden && !hashedLink`.
- **Effort** : XS

### [SEC-106] Spoofing email host → victime (verification booker par défaut OFF)
- **Sévérité** : P2
- **Localisation** : `packages/features/bookings/lib/service/RegularBookingService.ts:612-629`
- **Preuve** : `requiresBookerEmailVerification` default OFF, `bookerEmail` accepté tel quel.
- **Impact** : n'importe qui peut booker avec `bookerEmail=victim@gmail.com` → cal.diy envoie un mail légitime (SPF/DKIM) depuis son domaine à la victime. Vecteur phishing/spam. Le rate-limit par-IP est contournable (TOR, proxies).
- **Correctif** : activer `requiresBookerEmailVerification` par défaut, ou rate-limit par hash(bookerEmail).
- **Effort** : M

### [SEC-107] OAuth refresh-token race sans lock (DoS sur intégrations)
- **Sévérité** : P2
- **Localisation** : `packages/app-store/_utils/oauth/updateTokenObject.ts:14-93`, `OAuthManager.ts:271-281`
- **Preuve** : pas de `SELECT…FOR UPDATE`, pas de mutex applicatif, pas de single-flight cache.
- **Impact** : deux processus parallèles refreshent en même temps → le 2e perd ; sur Microsoft Graph / Salesforce (rotation stricte du refresh_token), l'intégration tombe.
- **Correctif** : `prisma.$transaction` avec lock row sur `credentialId`, ou single-flight in-memory keyed par credentialId.
- **Effort** : M

### [SEC-108] Validation `responses`/`metadata` non bornée (DoS, abus stockage)
- **Sévérité** : P3
- **Localisation** : `packages/features/bookings/lib/bookingCreateBodySchema.ts:20, 98-106`
- **Preuve** :
  ```ts
  metadata: z.record(z.string()),  // aucune borne
  email: z.string(),               // pas .email()
  notes: z.string().optional(),    // pas de max
  ```
- **Impact** : booking avec `notes` = 10 MB stocké, propagé en webhook/email/ICS/calendriers externes — amplification possible.
- **Correctif** : `.max(2000)` sur notes/rescheduleReason ; `z.record(z.string().max(512))` borné en nombre de clés ; `email().max(254)`.
- **Effort** : S

### [SEC-109] Stripe webhook stub (community-edition) — risque de regression
- **Sévérité** : P3 (info)
- **Localisation** : `apps/web/pages/api/integrations/stripepayment/webhook.ts:1-12`
- **Impact** : endpoint retourne 404 stub. Pas dangereux en l'état mais aucun garde-fou si un dev réintroduit la logique sans `stripe.webhooks.constructEvent`.
- **Correctif** : log warning, commenter explicitement la nécessité du body brut + signature.
- **Effort** : XS

---

## SEC — Injections, XSS, CSP, files, rate-limit

### [SEC-200] Rate-limit fail-open silencieux quand `UNKEY_ROOT_KEY` absent
- **Sévérité** : P0
- **Localisation** : `packages/lib/rateLimit.ts:33-42`
- **Preuve** :
  ```ts
  if (!UNKEY_ROOT_KEY) {
    if (!warned) { log.warn("Disabled because the UNKEY_ROOT_KEY environment variable was not found."); warned = true; }
    return () => ({ success: true, limit: 10, remaining: 999, reset: 0 }) as RatelimitResponse;
  }
  ```
- **Impact** : sur toute install self-host sans Unkey (cas par défaut documenté comme "optionnel"), `checkRateLimitAndThrowError()` retourne **toujours** succès. Brute-force illimité sur : `/api/auth/callback/credentials` (cf. `next-auth-options.ts:174`), `/api/auth/forgot-password`, signup, 2FA setup/disable, cancel booking, send verify email. 30+ handlers concernés.
- **Correctif** : fallback in-memory/Redis (LRU + sliding window) côté lib, ou refuser le démarrage en prod si var absente. Au minimum : `success: false` sur les endpoints auth.
- **Effort** : M
- **Faux positif possible si** : déploiement obligatoire avec Unkey — ce n'est pas le cas.

### [SEC-201] CSP appliquée uniquement sur `/auth/login`, `/login`
- **Sévérité** : P1
- **Localisation** : `apps/web/proxy.ts:64-66, 165-167`
- **Preuve** :
  ```ts
  const shouldEnforceCsp = (url: URL) => url.pathname.startsWith("/auth/login") || url.pathname.startsWith("/login");
  ```
- **Impact** : booker public, profils, settings, signup — aucune CSP. Une XSS (cf. SEC-202/204) n'est mitigée nulle part. Le nonce + `strict-dynamic` correctement implémenté est inutile faute de matcher.
- **Correctif** : étendre `matcher` à `/((?!_next/static|_next/image|api|favicon).*)` et faire `shouldEnforceCsp` retourner `true` partout.
- **Effort** : S

### [SEC-202] `postMessage` listeners sans validation `e.origin` (embed)
- **Sévérité** : P1
- **Localisation** : `packages/embeds/embed-core/src/embed-iframe.ts:559-568`, `embed.ts:1565-1582`
- **Preuve** :
  ```ts
  window.addEventListener("message", (e) => {
    const data: Message = e.data;
    if (data.originator === "CAL" && typeof method === "string") {
      interfaceWithParent[method]?.(data.arg as never);
    }
  });
  ```
  `originator === "CAL"` est dans le payload contrôlé par l'expéditeur, pas une vérification d'origine.
- **Impact** : tout site embarquant l'iframe (ou iframe sibling) peut invoquer arbitrairement les méthodes de `interfaceWithParent` ; côté parent, déclencher actions dans `actionsManagers`. Vecteur defacement / déclenchement d'événements analytics frauduleux / manipulation UI.
- **Correctif** : vérifier `e.origin` contre `embedStore.allowedOrigins` (i.e. `WEBAPP_URL`) ; ajouter un schéma Zod typé pour le payload.
- **Effort** : S

### [SEC-203] Liens markdown `target="_blank"` sans `rel="noopener noreferrer"`
- **Sévérité** : P2
- **Localisation** : `packages/lib/markdownToSafeHTML.ts:27`, `markdownToSafeHTMLClient.ts:27`
- **Preuve** :
  ```ts
  .replace(/<a\s+href=/g, "<a target='_blank' class='text-blue-500 hover:text-blue-600' href=");
  ```
- **Impact** : reverse tab-nabbing sur browsers anciens (les modernes appliquent implicitement `noopener`). Bios + descriptions event-types contiennent du markdown utilisateur.
- **Correctif** : ajouter `rel='noopener noreferrer'`.
- **Effort** : XS

### [SEC-204] Énumération de comptes via timing sur `/auth/login`
Doublon SEC-004 (déjà documenté ci-dessus). Conserver SEC-004 comme référence canonique.

### [SEC-205] Dockerfile : root + `ARG NEXTAUTH_SECRET=secret` par défaut
- **Sévérité** : P2
- **Localisation** : `Dockerfile:11-12, 77-94`
- **Preuve** :
  ```dockerfile
  ARG NEXTAUTH_SECRET=secret
  ARG CALENDSO_ENCRYPTION_KEY=secret
  ...
  FROM node:20 AS runner
  # pas de USER non-root
  ```
- **Impact** : (a) container en root → escalation post-RCE facilitée ; (b) si l'opérateur oublie `--build-arg`, la build embarque `NEXTAUTH_SECRET=secret` qui signe les JWTs si l'env runtime n'est pas surchargée.
- **Correctif** : retirer les défauts "secret" (laisser ARG vide → erreur build explicite) ; `RUN useradd -u 1001 -m calcom && USER calcom` dans stage runner.
- **Effort** : S

### [SEC-206] CSP `script-src` accepte `'unsafe-inline' https:` en prod
- **Sévérité** : P2
- **Localisation** : `apps/web/lib/csp.ts:19-25`
- **Preuve** :
  ```ts
  script-src ${IS_PRODUCTION
    ? `'nonce-${nonce}' 'strict-dynamic' 'self' 'unsafe-inline' https:`
    : "..."};
  ```
- **Impact** : `'unsafe-inline'` annule `'nonce-…'` sur browsers sans support `strict-dynamic` ; `https:` permet l'exfil vers tout domaine HTTPS en cas de XSS. Cumul avec SEC-201 = compounding.
- **Correctif** : retirer `'unsafe-inline' https:` (browsers <6% du marché tombent sur `'self'`, sain).
- **Effort** : S

### [SEC-207] Email `Info.tsx` mute du HTML sanitizé après coup
- **Sévérité** : P3 (futur)
- **Localisation** : `packages/emails/src/components/Info.tsx:26-30`
- **Impact** : `css` constant statique aujourd'hui → pas exploitable, mais pattern fragile à la régression.
- **Correctif** : stylisation via classes pré-définies, ne pas muter du HTML post-sanitization.
- **Effort** : S

### [SEC-208] `NEXT_PUBLIC_HEAD_SCRIPTS` / `BODY_SCRIPTS` injectés inline
- **Sévérité** : P3 (par design, à documenter)
- **Localisation** : `apps/web/app/(use-page-wrapper)/layout.tsx:9-37`
- **Impact** : si opérateur place du JS contrôlé par un tiers dans ces vars (CMS partagé), c'est de la RCE client. Trusté par design.
- **Correctif** : restreindre à `<script src="...">` whitelistées, ou documenter explicitement le niveau de trust requis.
- **Effort** : M

---

## BUG — Bugs & robustesse

### [BUG-001] Double-booking race — `ensureAvailableUsers` hors transaction
- **Sévérité** : P0
- **Localisation** : `packages/features/bookings/lib/service/RegularBookingService.ts:900-960` + `packages/features/bookings/lib/handleNewBooking/createBooking.ts:139-147`
- **Preuve** : `ensureAvailableUsers` (lecture availability + busy) est appelé HORS de la transaction `createBooking`. `prisma.$transaction` n'a pas d'`isolationLevel: "Serializable"`. Pas de `pg_advisory_xact_lock` (grep "Serializable|advisory" → 0 hit). L'extension `idempotencyKey` ne couvre que `ACCEPTED` (cf. BUG-012).
- **Impact** : TOCTOU classique. Deux POST `/api/book/event` concurrents pour le même slot passent tous deux la vérif avant qu'aucun `Booking` ne soit committed. Cas observable en production sous charge. PENDING, collective/seats/round-robin avec `luckyUser` différent contournent toutes l'unicité.
- **Correctif** : envelopper `ensureAvailableUsers` dans la transaction avec `isolationLevel: "Serializable"`, ou poser `pg_advisory_xact_lock(hash(userId, slotStart))` avant la création.
- **Effort** : M

### [BUG-002] DST : `utcOffset` calculé à "maintenant" pour bookings futurs
- **Sévérité** : P1
- **Localisation** : `packages/features/bookings/lib/handleNewBooking/validateBookingTimeIsNotOutOfBounds.ts:41-42` + `packages/lib/dayjs/index.ts:244-248`
- **Preuve** :
  ```ts
  return dayjs(date).tz(timeZone).utcOffset();  // date = undefined ⇒ now()
  ```
  Appel sans paramètre `date` → l'offset reflète l'heure actuelle, pas celle du slot.
- **Impact** : client Paris bookant fin mars un slot après passage été → offset hiver appliqué → fenêtre validation décalée d'1 h, refus/acceptation erronés autour des transitions DST (mars/octobre EU, mars/novembre US).
- **Correctif** : `getUTCOffsetByTimezone(tz, reqBodyStartTime)`.
- **Effort** : XS

### [BUG-003] Working hours — `utcOffset` snapshot pour la fenêtre de calcul
- **Sévérité** : P2
- **Localisation** : `packages/lib/availability.ts:71-84`
- **Impact** : disponibilités décalées d'1 h pendant la quinzaine autour d'une transition DST.
- **Correctif** : faire dépendre `utcOffset` de la date du slot dans la boucle appelante.
- **Effort** : S

### [BUG-004] Recurring events — `count` non borné côté Zod
- **Sévérité** : P1
- **Localisation** : `packages/prisma/zod-utils.ts:234-243`
- **Preuve** : `count: z.number()` sans `.max()`. `RecurringBookingService.ts:74` boucle sur `data.length` reçu directement de la requête.
- **Impact** : `count: 100000` → 100k itérations séquentielles de `createBooking` (CPU + DB writes) → DoS.
- **Correctif** : `count: z.number().int().min(1).max(52)` ; `data.length <= maxAllowed` dans `handleNewRecurringBooking`.
- **Effort** : XS

### [BUG-005] Recurring booking — `await` séquentiel dans boucle
- **Sévérité** : P2
- **Localisation** : `packages/features/bookings/lib/service/RecurringBookingService.ts:74-128`
- **Impact** : latence = N × latence unitaire ; amplifie BUG-004.
- **Correctif** : `Promise.all` batched (5 en parallèle), conserver la 1re itération séquentielle pour fixer le luckyUser RR.
- **Effort** : S

### [BUG-006] Catches silencieux dans callbacks OAuth
- **Sévérité** : P2
- **Localisation** : `packages/app-store/{nextcloudtalk,webex,jelly,basecamp3}/api/callback.ts` — `} catch (e) {}` vides.
- **Impact** : impossible de tracer les échecs OAuth ; UX dégradée.
- **Correctif** : `} catch (e) { logger.warn("…", e); }`.
- **Effort** : XS

### [BUG-007] `.catch(() => null)` masque erreurs Prisma
- **Sévérité** : P3
- **Localisation** : `packages/features/tasker/tasks/triggerNoShow/common.ts:116-123`
- **Impact** : erreurs DB transitoires comptent comme "guest pas trouvé" → faux no-show triggers, faux webhooks `NO_SHOW`.
- **Correctif** : ne catcher que `PrismaClientKnownRequestError` ciblé.
- **Effort** : XS

### [BUG-008] Webhook — index manquants sur `userId/teamId/eventTypeId`
- **Sévérité** : P1 (perf-critical)
- **Localisation** : `packages/prisma/schema.prisma:1142-1170`
- **Preuve** : seul `@@index([active])`. `WHERE userId = ? OR teamId = ? OR eventTypeId = ?` exécuté à chaque trigger.
- **Impact** : seq scan sur Webhook à chaque booking confirmé/annulé ; table pouvant atteindre dizaines de milliers de lignes en organisation.
- **Correctif** : `@@index([userId]) @@index([teamId]) @@index([eventTypeId]) @@index([platformOAuthClientId])`.
- **Effort** : XS (migration).

### [BUG-009] `Booking.eventType` / `Availability.eventType` sans `onDelete` explicite
- **Sévérité** : P3
- **Localisation** : `packages/prisma/schema.prisma:862, 964`
- **Impact** : Prisma applique `SetNull` par défaut sur FK optionnel. Probablement intentionnel pour Booking (historique), à vérifier pour Availability.
- **Correctif** : annoter `onDelete: SetNull` explicitement.
- **Effort** : XS

### [BUG-010] Migrations sans `CREATE INDEX CONCURRENTLY`
- **Sévérité** : P2
- **Localisation** : `packages/prisma/migrations/*/migration.sql` (échantillon multiple).
- **Impact** : déploiement bloquant sur grandes tables (`Booking`, `EventType`) — verrou ACCESS EXCLUSIVE.
- **Correctif** : pour futures migrations sur tables hot, script séparé `CREATE INDEX CONCURRENTLY` + `--no-transaction`.
- **Effort** : S

### [BUG-011] `engines.node` absent du `package.json` racine
- **Sévérité** : P3
- **Localisation** : `/package.json` — seul `"npm": ">=7.0.0"` et `"yarn": ">=4.12.0"`.
- **Impact** : dev sur Node < 20 crash silencieusement à l'exec.
- **Correctif** : `"node": ">=20.0.0"`.
- **Effort** : XS

### [BUG-012] `idempotencyKey` extension ne couvre que `ACCEPTED`
- **Sévérité** : P2
- **Localisation** : `packages/prisma/extensions/booking-idempotency-key.ts:27-36`
- **Impact** : retries client sur EventType `requiresConfirmation=true` créent N bookings PENDING → spam d'approbation host.
- **Correctif** : générer pour ACCEPTED + PENDING, reset sur CANCELLED/REJECTED.
- **Effort** : XS

### [BUG-013] `rrule` 2.7.1 — version ancienne, pas de borne `count` au parse
- **Sévérité** : P3
- **Localisation** : `node_modules/rrule/package.json` ; utilisée dans `packages/lib/parse-dates.ts`, `packages/emails/lib/generateIcsString.ts`.
- **Correctif** : bump 2.8.x ; `count: Math.min(input.count, 366)` avant expand.
- **Effort** : S

---

## PERF — Performance

### [PERF-001] N+1 `_getUserAvailability` par user en équipe
- **Sévérité** : P1
- **Localisation** : `packages/features/availability/lib/getUserAvailability.ts:785-817` + `:361-500`
- **Preuve** : `Promise.all(users.map(user => this._getUserAvailability(...)))`. Par user : `getEventType`, `getCurrentSeats`, `getTimezoneFromDelegatedCalendars`, `oooRepo.findUserOOODays`, `calculateHolidayBlockedDates`, busy calendar fetch — soit ~5 round-trips DB. Le `log.warn("High-load warning")` à L787 trahit le problème connu.
- **Impact** : équipe 50 hosts → ~250 round-trips DB parallèles, saturation pool Prisma.
- **Correctif** : batch fetch — un `findMany` OOO/holiday/event-type pour tous les userIds, dispatch en mémoire.
- **Effort** : L

### [PERF-002] `logger.silly(JSON.stringify(...))` éval même en prod
- **Sévérité** : P2
- **Localisation** : `packages/features/busyTimes/services/getBusyTimes.ts:77-83, 186-189, 227-230, 285-288, 345-350, 373`
- **Impact** : sérialisation de busyTimes (MBs possibles) à chaque check d'availability → CPU/GC pressure.
- **Correctif** : guard `if (logger.settings.minLevel <= 0)` ou supprimer ces logs.
- **Effort** : S

### [PERF-003] Pas de cache HTTP / ISR sur pages publiques
- **Sévérité** : P2
- **Localisation** : `apps/web/app/(booking-page-wrapper)/{[user]/[type]/page.tsx, [user]/page.tsx, team/[slug]/page.tsx}`
- **Impact** : chaque visite anonyme = SSR complet (`getPublicEvent` + N findUnique/findMany).
- **Correctif** : `export const revalidate = 60;` ou middleware `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`, invalidate via `revalidateTag` sur update EventType.
- **Effort** : M

### [PERF-004] `EventTeamAssignmentTab` — multiples `form.watch()` top-level
- **Sévérité** : P2
- **Localisation** : `apps/web/modules/event-types/components/tabs/assignment/EventTeamAssignmentTab.tsx:39-50`
- **Impact** : `watch()` sans selector → re-render du composant à chaque keystroke ; lag visible sur grandes équipes. Note : la mémoïsation `HostRow` ajoutée dans l'audit interne mitige côté row, mais le parent ré-render quand même.
- **Correctif** : `useWatch({ control, name: [...] })` avec selectors fins.
- **Effort** : S

### [PERF-005] `FormBuilder` rerender complet à chaque keystroke
- **Sévérité** : P2
- **Localisation** : `apps/web/modules/event-types/components/tabs/advanced/FormBuilder.tsx:132-136`
- **Correctif** : sous-composant `<FieldRow>` mémoïsé, `useWatch` ciblé par index.
- **Effort** : M

### [PERF-006] `optimizePackageImports` limité à `@calcom/ui`
- **Sévérité** : P3
- **Localisation** : `apps/web/next.config.ts:236-238`
- **Correctif** : ajouter `lodash`, `dayjs`, `@radix-ui/react-icons`, `framer-motion`.
- **Effort** : XS

### [PERF-007] Booker — `framer-motion` `domAnimation` eager-loaded
- **Sévérité** : P3
- **Localisation** : `packages/features/bookings/Booker/framer-features.tsx`
- **Correctif** : `LazyMotion` avec `loadFeatures` dynamic import.
- **Effort** : S
- **Faux positif possible si** : déjà wrappé en `LazyMotion` en amont — à vérifier.

### [PERF-008] Booking limit fetch — concurrence sous-utilisée
- **Sévérité** : P3
- **Localisation** : `packages/features/busyTimes/services/getBusyTimes.ts:425-439`
- **Impact** : vagues séquentielles inutiles pour 500 users.
- **Correctif** : passer `MAX_CONCURRENT_LIMIT_CHECK_BATCHES` à 10 ou retirer.
- **Effort** : XS

### [PERF-009] `getPublicEvent` — chaîne de `UserRepository` calls multiples
- **Sévérité** : P2
- **Localisation** : `packages/features/eventtypes/lib/getPublicEvent.ts:269, 298, 468, 479, 496, 510, 694, 711`
- **Impact** : 4-8 round-trips DB par page publique, sans cache (cf. PERF-003).
- **Correctif** : repository `getPublicEventBundle` avec includes profonds + enrich unique sur l'union des userIds.
- **Effort** : L

### [PERF-010] Booking — index `[eventTypeId, startTime, status]` manquant
- **Sévérité** : P2
- **Localisation** : `packages/prisma/schema.prisma:918-929`
- **Preuve** : existants `[startTime, endTime, status]`, `[eventTypeId, status]`, `[userId, status, startTime]`. Pas de `[eventTypeId, startTime]`.
- **Impact** : `getBusyTimesForLimitChecks` filtre `eventTypeId IN (...) AND startTime BETWEEN ?` → planner peut tomber sur index sous-optimal + filter heap.
- **Correctif** : `@@index([eventTypeId, startTime, status])`.
- **Effort** : S
