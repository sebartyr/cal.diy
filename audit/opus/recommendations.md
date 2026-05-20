# Recommandations — Top 10 actions prioritaires

Ordre = ratio (impact × probabilité d'exploitation) / effort. Les 3 premières actions adressent les 3 P0 ; les suivantes consolident les P1 et défaut de défense en profondeur.

---

### 1. [SEC-001] Réparer `PermissionCheckService` — IDOR sur team event-types
**Pourquoi en premier** : exploitable maintenant, sans condition, par tout user authentifié. Surface : 10 procedures tRPC (delete, duplicate, heavy.update, get, getHosts*, massApply…). IDs event-types séquentiels → énumération triviale.

**Action** : remplacer le stub `checkPermission` par un vrai check de `Membership` (cf. pattern `packages/trpc/server/routers/viewer/teams/permissions.ts:requireMember`). Centraliser dans un seul fichier ; supprimer les ~10 stubs dupliqués repérés par grep. Sanity test : depuis un user non-membre, `viewer.eventTypes.delete({ id: <team-event-id> })` doit retourner 403.

**Effort** : M (~4h). **Bloquant prod**.

---

### 2. [SEC-200] Rate-limit fail-open → fallback dur ou refus de démarrage
**Pourquoi** : sans `UNKEY_ROOT_KEY`, brute-force illimité sur login, forgot-password, 2FA setup/disable, signup, cancel booking, send verify email — 30+ handlers. Default config self-host = sans Unkey.

**Action** : dans `packages/lib/rateLimit.ts`, si `UNKEY_ROOT_KEY` absent : (a) en `NODE_ENV !== "test"`, refuser le démarrage avec message clair ; OU (b) fallback in-memory (LRU + sliding window 60s) sur les endpoints d'auth uniquement. (a) est plus simple, (b) plus accommodant.

**Effort** : M (~4h pour (b), XS pour (a)). **Bloquant prod**.

---

### 3. [BUG-001] Double-booking race
**Pourquoi** : exploitable sous charge réelle, perte de slot intégrité — symptôme classique de scheduling.

**Action** : passer `ensureAvailableUsers` + `createBooking` dans une seule transaction avec `isolationLevel: "Serializable"` ; OU poser `pg_advisory_xact_lock(hash(userId, slotStartTimestamp))` au début de la transaction (plus prédictible que Serializable + retry). Étendre l'index `@unique idempotencyKey` (BUG-012) à PENDING pour fermer la fenêtre RR/seats.

**Effort** : M (~6h, tests inclus).

---

### 4. [SEC-100 + SEC-101] Crypto et OAuth confused-deputy — bloc cohérent
Ces deux findings touchent la même chaîne (storage des credentials + leur acquisition).

**Action SEC-100** : migrer `packages/lib/crypto.ts` de `aes256` (CBC sans auth) vers `aes-256-gcm`. Format `iv:tag:ciphertext`. Versionner avec préfixe `v2:` ; lazy-migrer à chaque décryption. **Effort M**.

**Action SEC-101** : retirer `stripe` de `NONCE_EXEMPT_APPS` immédiatement (le risque "argent vers attaquant" est inacceptable). Pour `basecamp3, dub, webex, tandem`, implémenter un nonce alternatif côté cookie HttpOnly server-side (corrélation `oauth_state_<userId>`). **Effort S**.

**Combiné effort** : M + S.

---

### 5. [SEC-103 + SEC-104] SSRF — webhook outbound + CalDAV/ICS
**Action SEC-104** (le plus rapide) : ajouter `await validateUrlForSSRF(url)` (version async avec DNS lookup) dans `packages/app-store/caldavcalendar/api/add.ts:12` et `packages/app-store/ics-feedcalendar/api/add.ts:13`, throw 400 si invalide. **Effort S**.

**Action SEC-103** : dans `packages/features/webhooks/lib/sendPayload.ts:312`, avant chaque `fetch(subscriberUrl)`, refaire `validateUrlForSSRF` (DNS resolve). Idéal : résoudre l'A-record une seule fois et fetcher par IP avec `Host:` header (pinning anti-DNS-rebinding). **Effort M**.

---

### 6. [SEC-007 + SEC-011 + SEC-014] Trio quick-wins auth (1h total)
- **SEC-007** : changer `maxAge: 10 * 60 * 60` → `maxAge: 10 * 60` dans `next-auth-options.ts:362`. **XS**.
- **SEC-011** : early throw si `CALENDSO_ENCRYPTION_KEY` absent dans `oAuthAuthorization.ts:9`. **XS**.
- **SEC-014** : renommer `NEXT_PUBLIC_IS_E2E` → `INTERNAL_E2E_TEST_MODE` + guard `NODE_ENV !== "production"`. **XS**.

Trois changements d'une ligne chacun, à grouper en un seul commit.

---

### 7. [SEC-201 + SEC-206] Étendre CSP à toutes les pages + retirer `'unsafe-inline' https:`
**Pourquoi** : aujourd'hui une seule XSS sur le booker public n'est mitigée nulle part. La CSP existe mais ne couvre que `/auth/login`.

**Action** :
- `apps/web/proxy.ts` matcher : `/((?!_next/static|_next/image|api|favicon).*)`.
- `apps/web/lib/csp.ts:19-25` : retirer `'unsafe-inline' https:` en mode IS_PRODUCTION. Garder `'nonce-…' 'strict-dynamic' 'self'`.
- Tester d'abord en `Content-Security-Policy-Report-Only` pendant 48h pour détecter les casses (analytics, embed parents).

**Effort** : S (logique) + déploiement progressif.

---

### 8. [SEC-202] Embed `postMessage` — validation `origin`
**Pourquoi** : exploitable par tout site embarquant l'iframe, ou iframe-sibling sur un domaine compromis. Surface : toutes les méthodes de `interfaceWithParent`.

**Action** :
- `packages/embeds/embed-core/src/embed-iframe.ts:559` : ajouter `if (!ALLOWED_ORIGINS.has(e.origin)) return;` au top du listener.
- `packages/embeds/embed-core/src/embed.ts:1565` : idem.
- Construire `ALLOWED_ORIGINS` depuis `WEBAPP_URL` côté iframe et depuis le `data-cal-origin` côté parent.
- Ajouter un schéma Zod sur `data` pour typage défensif.

**Effort** : S.

---

### 9. [BUG-008 + PERF-010] Index Prisma manquants — déploiement atomique
**Pourquoi** : Webhook seq scan à chaque trigger ; Booking seq scan partiel sur `getBusyTimesForLimitChecks`. Impact ressenti dès quelques milliers de bookings.

**Action** : une seule migration regroupant :
```prisma
model Webhook {
  // ...
  @@index([userId])
  @@index([teamId])
  @@index([eventTypeId])
  @@index([platformOAuthClientId])
}

model Booking {
  // ...
  @@index([eventTypeId, startTime, status])
}
```
Côté SQL généré, lancer en `CREATE INDEX CONCURRENTLY` (Prisma `--no-transaction`) pour éviter le verrou ACCESS EXCLUSIVE en prod.

**Effort** : XS (Prisma) + précaution sur le déploiement.

---

### 10. [BUG-002 + BUG-003 + BUG-004 + BUG-005] Bloc booking-time-safety
Quatre bugs liés au time-handling et au throughput recurring, traitables en un seul effort cohérent (~1 jour).

- **BUG-002** : `getUTCOffsetByTimezone(tz, reqBodyStartTime)` au lieu de l'appel sans `date`. **XS**.
- **BUG-003** : faire dépendre `utcOffset` de la date du slot dans `availability.ts:71`. **S**.
- **BUG-004** : `count: z.number().int().min(1).max(52)` dans `zod-utils.ts:234`. **XS**.
- **BUG-005** : `Promise.all` batched (5 en parallèle) dans `RecurringBookingService.ts:74`. **S**.

Ces 4 actions ferment la majorité des bugs liés aux time/recurring — à grouper avec leurs tests.

---

## Hors top 10 mais à planifier rapidement

- **SEC-002** : `timingSafeEqual` sur OAuth client secret API v2 (XS, 5 min).
- **SEC-004** : dummy `verifyPassword` quand user inexistant (XS, 15 min). Bloque l'énumération par timing.
- **SEC-205** : Dockerfile USER non-root + retrait ARG default "secret" (S, 30 min).
- **SEC-105** : ajout `hidden: true` au select + check 404 dans `RegularBookingService` (XS).
- **SEC-006** : reset-password token → `sha256` en DB (M, migration séparée).
- **SEC-008/009** : 2FA anti-replay + hash backup codes (S + M).
- **PERF-003** : `revalidate = 60` sur pages publiques (M, gain prod immédiat).
- **PERF-001** : batch fetch dans `getUserAvailability` (L, mais cumul avec PERF-003 transforme la perf).

## Séquencement recommandé

**Sprint 1 (1 semaine)** : top 1 + 2 + 6 (quick-wins) → fermeture des P0 critiques.
**Sprint 2 (1 semaine)** : top 3 + 4 + 5 → race + crypto + SSRF.
**Sprint 3 (1 semaine)** : top 7 + 8 + 9 + 10 → defense in depth + perf wins.
**Sprint 4 (continu)** : P2/P3 par batch trimestriel, audit re-pass à 6 mois.

## Non-actions explicites (décisions assumées)

- **SEC-003 (sameSite=none)** : ne pas changer si l'embed iframe est use-case prioritaire — documenter le trade-off.
- **SEC-013 (bookings.find publicProcedure)** : si la page de confirmation publique est un use-case produit, conserver mais retirer `description` du select.
- **SEC-203 (markdown `_blank` sans noopener)** : risque résiduel sur browsers anciens uniquement, accepter ou patcher en 1 ligne.
