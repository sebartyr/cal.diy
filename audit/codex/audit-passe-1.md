# Audit passe 1 - cal.diy

- Branche analysee : `3e50c176fe`
- Modele de menace : anonyme Internet, utilisateur authentifie A, detenteur d'une cle API/API v2, administrateur self-host, attaquant avec acces ecriture DB limite.
- Hypothese de deploiement : instance self-hosted exposee Internet, PostgreSQL >= 13, secrets fournis par variables d'environnement, plusieurs replicas possibles.

### [SEC-001] OAuth CSRF sur plusieurs integrations exemptes de nonce
- **Sévérité** : P1 (majeur)
- **Catégorie** : security
- **Localisation** : `packages/app-store/_utils/oauth/decodeOAuthState.ts:L6-L16`, `packages/app-store/webex/api/add.ts:L26-L32`, `packages/app-store/webex/api/callback.ts:L13-L17`
- **Description** : `stripe`, `basecamp3`, `dub`, `webex` et `tandem` contournent la verification de nonce OAuth. Webex envoie meme `state: ""`, puis le callback lie le credential a la session courante.
- **Preuve** :
```ts
const NONCE_EXEMPT_APPS = new Set(["stripe", "basecamp3", "dub", "webex", "tandem"]);
if (!state || NONCE_EXEMPT_APPS.has(appName)) return state;
```
Scenario : un attaquant lance son propre OAuth Webex/Stripe, recupere un `code` valide, puis force un utilisateur connecte a visiter le callback cal.diy avec ce `code`. Le serveur echange le code et cree le credential sur le compte victime.
- **Impact concret** : confusion de compte OAuth, liaison d'un compte tiers controle par l'attaquant au compte cal.diy de la victime, puis effets secondaires selon l'integration.
- **Correctif proposé** : supprimer les exemptions, utiliser `encodeOAuthState` partout, stocker le nonce cote serveur avec `userId`, `app`, expiration, et refuser le callback avant tout echange de code si nonce absent ou invalide.
- **Effort** : M
- **Faux positif possible si** : le provider refuse strictement tout callback non initie par la meme session et le code OAuth ne peut pas etre presente par un navigateur tiers; ce n'est pas garanti par le code cal.diy.

### [SEC-002] SSRF webhook permissif en self-host et contournement metadata IPv6-map
- **Sévérité** : P1 (majeur)
- **Catégorie** : security
- **Localisation** : `packages/lib/ssrfProtection.ts:L137-L149`, `packages/trpc/server/routers/viewer/webhook/create.handler.ts:L25-L31`, `packages/features/webhooks/lib/sendPayload.ts:L312-L320`
- **Description** : en self-host, la validation accepte les URL `http(s)` privees apres un blocage limite aux hostnames metadata connus. Les adresses IPv4-map IPv6 comme `http://[::ffff:169.254.169.254]/` ne correspondent pas a la liste metadata et passent avant le controle `isPrivateIP`.
- **Preuve** :
```ts
if (isCloudMetadataEndpoint(url.hostname)) return { isValid: false, error: "..." };
if (IS_SELF_HOSTED) {
  if (url.protocol === "http:" || url.protocol === "https:") return { isValid: true };
}
```
La creation de webhook appelle seulement `validateUrlForSSRFSync`, puis l'envoi effectue `fetch(subscriberUrl, ...)` plus tard.
- **Impact concret** : un utilisateur authentifie peut configurer un webhook vers des endpoints internes ou metadata dans un deploiement cloud self-host, et provoquer des requetes serveur sortantes.
- **Correctif proposé** : bloquer systematiquement link-local/metadata/loopback avant la branche self-host, normaliser IPv4-map IPv6, refaire la resolution DNS juste avant connexion, interdire ou revalider les redirects, et ajouter une allowlist explicite si les LAN webhooks sont necessaires.
- **Effort** : M
- **Faux positif possible si** : l'instance est volontairement isolee sans acces reseau interne ni metadata, ou si seuls des administrateurs entierement fiables peuvent creer des webhooks.

### [SEC-003] Chiffrement AES-CBC sans authentification pour secrets applicatifs
- **Sévérité** : P2 (mineur)
- **Catégorie** : security
- **Localisation** : `packages/lib/crypto.ts:L3-L21`, `packages/lib/crypto.ts:L31-L40`, `packages/lib/CalendarService.ts:L401-L403`
- **Description** : le helper historique chiffre en `aes256`/CBC avec IV aleatoire mais sans tag d'authentification ni HMAC. Des credentials OAuth, secrets 2FA et backup codes passent encore par ce helper.
- **Preuve** :
```ts
const cipher = createCipheriv(ALGORITHM, getKey(), iv);
return `${iv.toString("hex")}:${encrypted}`;
const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
```
Un attaquant avec ecriture DB peut modifier des ciphertexts sans detection cryptographique; les erreurs de padding ou de parsing deviennent le seul signal.
- **Impact concret** : corruption ou malleabilite de secrets stockes; risque accru si une autre primitive expose une difference d'erreur exploitable.
- **Correctif proposé** : migrer vers l'enveloppe AES-256-GCM deja presente dans `packages/lib/crypto/keyring.ts`, versionner les ciphertexts, lire l'ancien format CBC et re-chiffrer en GCM a la prochaine ecriture.
- **Effort** : M
- **Faux positif possible si** : tout acces ecriture DB est considere compromission totale et hors modele; le manque d'integrite reste une faiblesse de defense en profondeur.

### [SEC-004] Secrets runtime requis et exposes au build Docker
- **Sévérité** : P2 (mineur)
- **Catégorie** : security
- **Localisation** : `Dockerfile:L10-L35`, `README.md:L562-L568`
- **Description** : `NEXTAUTH_SECRET` et `CALENDSO_ENCRYPTION_KEY` sont definis comme `ARG` puis `ENV` dans le stage de build. La documentation indique qu'ils doivent correspondre aux variables runtime.
- **Preuve** :
```dockerfile
ARG NEXTAUTH_SECRET=secret
ARG CALENDSO_ENCRYPTION_KEY=secret
ENV NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
ENV CALENDSO_ENCRYPTION_KEY=${CALENDSO_ENCRYPTION_KEY}
```
Dans un build distant ou cache, ces valeurs peuvent apparaitre dans l'historique d'image, les logs ou les metadonnees de build.
- **Impact concret** : fuite de secret NextAuth ou de cle de chiffrement des credentials, rotation plus difficile car elle implique un rebuild.
- **Correctif proposé** : ne pas lire ces secrets pendant `next build`; utiliser des placeholders non sensibles si le build exige une valeur, injecter les vrais secrets uniquement au runtime, ou utiliser BuildKit `--secret` pour les rares lectures inevitables.
- **Effort** : S
- **Faux positif possible si** : l'image est toujours construite localement sur une machine de confiance, sans cache partage, avec secrets jetables.

### [SEC-005] CSP enforcee seulement sur login malgre la plomberie nonce
- **Sévérité** : P2 (mineur)
- **Catégorie** : security
- **Localisation** : `apps/web/proxy.ts:L64-L66`, `apps/web/proxy.ts:L165-L167`, `apps/web/lib/csp.ts:L44-L51`
- **Description** : `shouldEnforceCsp` n'est vrai que pour `/auth/login` et `/login`; le matcher ne couvre qu'un petit ensemble de routes. Les pages publiques de booking/profil ne recoivent donc pas de CSP enforcee.
- **Preuve** :
```ts
const shouldEnforceCsp = pathName.startsWith("/auth/login") || pathName.startsWith("/login");
const header = shouldEnforceCsp ? "Content-Security-Policy" : null;
```
Les helpers de sanitization existent ailleurs; ce finding porte sur l'absence de mitigation navigateur hors login.
- **Impact concret** : une XSS stockee ou reflechie sur une page publique aurait moins de contraintes navigateur que prevu par la presence de `CSP_POLICY`.
- **Correctif proposé** : deployer `Content-Security-Policy-Report-Only` sur les pages publiques, corriger les violations, puis etendre l'enforcement aux routes booking/profil/embed compatibles nonce.
- **Effort** : M
- **Faux positif possible si** : la decision produit est d'enforcer CSP uniquement sur login; cette limitation doit alors etre documentee explicitement.

### [SEC-006] Upload avatar base64 sans limite de taille avant decode et resize
- **Sévérité** : P2 (mineur)
- **Catégorie** : security
- **Localisation** : `packages/trpc/server/routers/viewer/me/updateProfile.schema.ts:L89-L94`, `packages/trpc/server/routers/viewer/me/updateProfile.handler.ts:L157-L167`, `packages/lib/server/resizeBase64Image.ts:L17-L29`
- **Description** : `avatarUrl` est une string sans taille maximale. Le handler accepte `data:image/...;base64`, decode en `Buffer`, puis Jimp lit et redimensionne l'image sans plafond d'octets ou pixels.
- **Preuve** :
```ts
avatarUrl: z.string().nullable().optional()
const buffer = Buffer.from(base64Data, "base64");
const image = await jimp.read(buffer);
```
Un utilisateur authentifie peut envoyer une image tres volumineuse ou a expansion memoire forte.
- **Impact concret** : pic CPU/memoire sur le serveur tRPC, latence ou crash de worker, et stockage DB inutile apres redimensionnement.
- **Correctif proposé** : imposer une limite Zod de longueur base64, verifier la taille decodee avant Jimp, valider les magic bytes, limiter dimensions/pixels et court-circuiter les formats non attendus.
- **Effort** : S
- **Faux positif possible si** : une limite stricte existe en amont du proxy et bloque les corps avant Next.js; elle n'est pas visible dans le repo.

### [SEC-007] Verification email deterministe, rejouable et non liee a une tentative
- **Sévérité** : P2 (mineur)
- **Catégorie** : security
- **Localisation** : `packages/features/auth/lib/verifyEmail.ts:L104-L110`, `packages/features/auth/lib/verifyCodeUnAuthenticated.ts:L17-L24`, `packages/features/bookings/lib/service/RegularBookingService.ts:L612-L623`
- **Description** : le code de verification est un TOTP derive de `md5(email + CALENDSO_ENCRYPTION_KEY)` avec fenetre de 900 secondes. Il n'est pas stocke par tentative, pas consomme, et peut etre reutilise pendant la fenetre.
- **Preuve** :
```ts
const secret = createHash("md5").update(email + key).digest("hex");
totp.options = { step: 900 };
return totp.generate(secret);
```
Le flux booking verifie seulement le code fourni lorsque `requiresBookerEmailVerification` est actif.
- **Impact concret** : un code intercepte ou partage reste valable pour plusieurs actions sur la meme adresse pendant 15 minutes; il n'y a pas de single-use ni de liaison booking/session.
- **Correctif proposé** : creer des tokens aleatoires par objectif (`email`, `purpose`, `expires`, `consumedAt`, compteur d'essais), stocker un hash, et consommer atomiquement en transaction.
- **Effort** : M
- **Faux positif possible si** : l'objectif assume est uniquement anti-typo basique, pas une preuve forte de controle d'adresse.

### [SEC-008] Parsing JSON OAuth state non controle
- **Sévérité** : P3 (info)
- **Catégorie** : security
- **Localisation** : `packages/app-store/_utils/oauth/encodeOAuthState.ts:L7-L11`, `packages/app-store/_utils/oauth/decodeOAuthState.ts:L8-L13`
- **Description** : les helpers OAuth parsant `req.query.state` appellent `JSON.parse` sans `try/catch`. Un `state` malforme provoque une exception avant retour controle.
- **Preuve** :
```ts
const state = req.query.state ? JSON.parse(req.query.state as string) : undefined;
```
Un callback appele avec `state=%7B` peut generer une 500/log noise au lieu d'un 400 propre.
- **Impact concret** : amplification d'erreurs et observabilite degradee sur endpoints OAuth publics; pas de compromission directe.
- **Correctif proposé** : encapsuler le parse, retourner un 400 `Invalid OAuth state`, et ne jamais poursuivre l'echange de code si l'etat est invalide.
- **Effort** : XS
- **Faux positif possible si** : un middleware global transforme deja ces exceptions en 400; je n'ai pas observe cette garantie dans les callbacks.

### [SEC-009] API v2 expose les secrets HMAC des webhooks en sortie
- **Sévérité** : P3 (info)
- **Catégorie** : security
- **Localisation** : `apps/api/v2/src/modules/webhooks/outputs/webhook.output.ts:L42-L45`, `apps/api/v2/src/modules/webhooks/controllers/webhooks.controller.ts:L76-L108`, `apps/api/v2/src/modules/webhooks/guards/is-user-webhook-guard.ts:L25-L34`
- **Description** : le DTO de sortie expose `secret`. Le guard verifie bien le proprietaire, mais toute cle API autorisee pour ce compte peut lister/lire les secrets HMAC des webhooks.
- **Preuve** :
```ts
@Expose()
@ApiProperty()
secret!: string | null;
```
Les routes `GET /webhooks/:id` et liste renvoient ce DTO.
- **Impact concret** : les secrets HMAC se retrouvent dans clients, logs API et caches; une fuite de cle API devient aussi fuite de secrets webhook.
- **Correctif proposé** : masquer `secret` dans les sorties standard, exposer seulement `hasSecret` ou retourner le secret une seule fois a la creation/rotation.
- **Effort** : S
- **Faux positif possible si** : le contrat API documente explicitement que tout detenteur de cle API est autorise a exporter ces secrets.

### [BUG-001] Creation de booking non seated vulnerable au double booking concurrent
- **Sévérité** : P1 (majeur)
- **Catégorie** : bug
- **Localisation** : `packages/features/bookings/lib/service/RegularBookingService.ts:L933-L946`, `packages/features/bookings/lib/service/RegularBookingService.ts:L1705-L1733`, `packages/prisma/schema.prisma:L851-L929`
- **Description** : le flux verifie la disponibilite avant la creation, puis cree le booking plus tard sans lock de slot ni contrainte d'exclusion. Le schema a des index temporels mais pas de contrainte unique/exclusion empechant deux bookings acceptes qui se chevauchent.
- **Preuve** :
```ts
// availability check avant create
await ensureAvailableUsers(...);
// create plus tard
await createBooking(...);
```
Le schema `Booking` contient `@@index([startTime, endTime, status])` et `@@index([userId, status, startTime])`, mais pas de contrainte sur `userId` + intervalle. A l'inverse, le flux seats utilise explicitement `FOR UPDATE` dans `createNewSeat.ts:L44-L48`.
- **Impact concret** : deux requetes concurrentes peuvent reserver le meme creneau pour le meme organisateur, surtout en multi-replica ou sous retry client.
- **Correctif proposé** : introduire un verrou transactionnel par `(organizerId,eventTypeId,start,end)` ou une table de reservations avec expiration; a moyen terme, utiliser une contrainte Postgres d'exclusion sur `tstzrange(startTime,endTime)` pour les bookings acceptes, avec retry transactionnel.
- **Effort** : L
- **Faux positif possible si** : `ensureAvailableUsers` acquiert un verrou cross-instance non visible dans les appels cites; je n'en ai pas trouve dans ce flux.

### [BUG-002] Token reset password consomme apres changement de mot de passe
- **Sévérité** : P2 (mineur)
- **Catégorie** : bug
- **Localisation** : `apps/web/app/api/auth/reset-password/route.ts:L50-L60`, `apps/web/app/api/auth/reset-password/route.ts:L67-L87`, `apps/web/app/api/auth/reset-password/route.ts:L92-L101`
- **Description** : la route lit un reset token valide, met a jour le mot de passe, puis expire le token dans une operation separee. Deux requetes concurrentes avec le meme token peuvent passer la lecture initiale.
- **Preuve** :
```ts
const maybeRequest = await prisma.resetPasswordRequest.findFirstOrThrow({ where: { id, expires: { gt: new Date() } } });
await prisma.user.update(...);
await expireResetPasswordRequest(rawRequestId);
```
- **Impact concret** : un lien de reset reste rejouable pendant une petite fenetre de course; le dernier mot de passe ecrit gagne. Il faut deja connaitre le token, donc ce n'est pas une prise de controle autonome.
- **Correctif proposé** : consommer d'abord avec `updateMany({ where: { id, expires: { gt: now } }, data: { expires: now } })` dans une transaction et exiger `count === 1` avant de changer le mot de passe.
- **Effort** : S
- **Faux positif possible si** : l'infrastructure garantit une serialisation stricte par token au-dessus de Next.js; aucune garantie de ce type n'est dans le repo.

### [PERF-001] Endpoint public logo telecharge et redimensionne a chaque requete sans plafond de taille
- **Sévérité** : P2 (mineur)
- **Catégorie** : performance
- **Localisation** : `apps/web/app/api/logo/route.ts:L191-L235`
- **Description** : `/api/logo` recupere le logo d'equipe, lit tout le corps en `arrayBuffer`, puis redimensionne dynamiquement si necessaire. Il n'y a pas de plafond d'octets avant allocation ni cache persistant du derive redimensionne.
- **Preuve** :
```ts
response = await fetch(filteredLogo, { signal: AbortSignal.timeout(10000) });
const arrayBuffer = await response.arrayBuffer();
const { buffer: outBuffer } = await resizeImage({ buffer, width, height, quality: 100, contentType });
```
Le header `s-maxage=86400` aide les caches compatibles, mais chaque miss ou cache bypass refait fetch + decode + resize.
- **Impact concret** : cout CPU/memoire eleve sur une route publique, avec latence forte si le logo source est lent ou volumineux.
- **Correctif proposé** : imposer une limite `Content-Length` et streaming cap, refuser les formats non images par magic bytes, reduire `quality`, et stocker/cache le rendu redimensionne par hash d'URL/type.
- **Effort** : M
- **Faux positif possible si** : un CDN obligatoire absorbe tous les acces publics et limite les tailles de reponse en amont.

## Notes non retenues

- `packages/features/bookings/lib/checkBookingLimits.ts:L41-L43` retourne `!!Promise.all(...)`, mais les appelants attendent uniquement les exceptions; ce n'est pas un bypass confirme.
- Les exports CSV ont des helpers de sanitization dans le repo; je n'ai pas retenu de finding CSV injection sans chemin vulnerable precis.
- Plusieurs usages `dangerouslySetInnerHTML` passent par `markdownToSafeHTML`; je n'ai pas retenu de XSS generique sans entree non sanitisee prouvee.
