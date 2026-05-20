# Pass 2 Codex - review du rapport Opus

Revision revue : `3e50c176fe`. Objectif : challenger les 56 findings Opus, sans ajouter de nouveaux findings.

### [SEC-001] — SÉVÉRITÉ-EXAGÉRÉE
- **Vérification code** : oui. `packages/trpc/server/routers/viewer/eventTypes/util.ts:L15-L20` est bien un stub qui retourne toujours `true`; `_router.ts:L104-L112` et `heavy/_router.ts:L19-L38` utilisent bien `createEventPbacProcedure`.
- **Justification** : le bypass PBAC est réel pour les event-types d'équipe. En revanche P0 est trop fort : l'impact est un IDOR destructif/exfiltrant sur event-types d'équipe, pas une compromission globale de l'instance.
- **Sévérité que tu retiendrais** : P1. Authentifié requis, impact fort sur ressources d'équipe arbitraires si l'ID est connu.
- **Scénario d'exploitation revu** : le wrapper ne rajoute aucune membership check réelle pour `teamId`; `eventOwnerProcedure` est correct mais n'est pas utilisé sur ces routes PBAC. Le scénario tient pour les routes citées, à nuancer selon ce que chaque handler fait ensuite.
- **Recommandation** : valider le finding, downgrade P0 -> P1, tester delete/update/duplicate avec user non-membre.

### [SEC-002] — SÉVÉRITÉ-EXAGÉRÉE
- **Vérification code** : oui. `apps/api/v2/src/modules/auth/strategies/api-auth/api-auth.strategy.ts:L175-L186` compare `client.secret !== oAuthClientSecret`.
- **Justification** : la comparaison n'est pas constant-time. Le scénario timing remote sur secret OAuth haute entropie est fragile sur Node/HTTP et nécessite beaucoup de mesures propres.
- **Sévérité que tu retiendrais** : P3. À corriger en durcissement, mais P1 est exagéré sans oracle local ou réseau extrêmement stable.
- **Scénario d'exploitation revu** : Opus suppose une fuite par timing exploitable à distance; le code le permet théoriquement, mais le bruit réseau et la comparaison JS rendent l'exploitation peu réaliste.
- **Recommandation** : downgrade, patch XS avec `timingSafeEqual`.

### [SEC-003] — NUANCÉ
- **Vérification code** : oui. `packages/lib/default-cookies.ts:L20-L46` met `sameSite: useSecureCookies ? "none" : "lax"` sur session/csrf/pkce/state.
- **Justification** : le constat est exact, mais c'est explicitement lié à la compatibilité iframe/embed. Le risque dépend fortement du reste des protections CSRF.
- **Sévérité que tu retiendrais** : P3.
- **Scénario d'exploitation revu** : SameSite=None seul ne suffit pas à forger des actions si les tokens CSRF sont valides et non lisibles cross-site.
- **Recommandation** : garder comme trade-off à documenter, pas comme vulnérabilité autonome.

### [SEC-004] — CONFIRMÉ
- **Vérification code** : oui. `next-auth-options.ts:L160-L184` retourne vite si user absent, puis appelle `checkRateLimitAndThrowError` et `verifyPassword` seulement après lookup utilisateur.
- **Justification** : la différence de chemin existe; les emails inexistants ne passent pas par bcrypt.
- **Sévérité que tu retiendrais** : P2.
- **Scénario d'exploitation revu** : timing énumérable sous mesures répétées; rate-limit par email n'aide pas les emails inexistants, et peut être fail-open via SEC-200.
- **Recommandation** : valider.

### [SEC-005] — SÉVÉRITÉ-EXAGÉRÉE
- **Vérification code** : oui. `validPassword.ts:L1-L8` et `isPasswordValid.ts:L7-L19` acceptent 7 chars avec majuscule/minuscule/chiffre.
- **Justification** : politique faible et non alignée NIST, mais ce n'est pas une vulnérabilité exploitable seule.
- **Sévérité que tu retiendrais** : P3.
- **Scénario d'exploitation revu** : nécessite attaque de mots de passe; bcrypt et rate-limit restent des mitigations partielles.
- **Recommandation** : downgrade, traiter comme durcissement produit.

### [SEC-006] — NUANCÉ
- **Vérification code** : oui. `passwordResetRequest.ts:L26-L33` met l'ID DB dans l'URL; `reset-password/route.ts:L50-L60` cherche cet ID actif.
- **Justification** : le token est stocké en clair. La sévérité dépend d'un modèle "lecture DB/backup compromise".
- **Sévérité que tu retiendrais** : P2 si fuite DB read-only incluse, sinon P3.
- **Scénario d'exploitation revu** : tient uniquement pour tokens non expirés et base lue; pas exploitable par un attaquant web sans fuite DB.
- **Recommandation** : valider avec menace DB, stocker un hash.

### [SEC-007] — CONFIRMÉ
- **Vérification code** : oui. `next-auth-options.ts:L359-L365` configure `maxAge: 10 * 60 * 60` avec commentaire "10 min".
- **Justification** : bug évident, valeur = 10 h.
- **Sévérité que tu retiendrais** : P2.
- **Scénario d'exploitation revu** : tient si lien magique fuit dans logs, referrers, messagerie ou endpoint tiers.
- **Recommandation** : valider, corriger en `10 * 60`.

### [SEC-008] — NUANCÉ
- **Vérification code** : oui. `packages/lib/totp.ts:L15-L30` vérifie le code sans persistance de step; `next-auth-options.ts:L236-L242` appelle ce check.
- **Justification** : absence anti-replay réelle, mais l'exploitation exige interception temps réel du TOTP.
- **Sévérité que tu retiendrais** : P3 ou P2 si phishing temps réel est dans le modèle prioritaire.
- **Scénario d'exploitation revu** : le code est rejouable dans la fenêtre acceptée, mais seulement avec session/login flow simultané.
- **Recommandation** : garder, severity P2/P3 selon menace phishing.

### [SEC-009] — CONFIRMÉ
- **Vérification code** : oui. `apps/web/app/api/auth/two-factor/totp/setup/route.ts:L71-L81` chiffre les backup codes avec `symmetricEncrypt`.
- **Justification** : les backup codes sont récupérables avec `CALENDSO_ENCRYPTION_KEY`; ils devraient être hashés.
- **Sévérité que tu retiendrais** : P2.
- **Scénario d'exploitation revu** : tient si clé applicative fuit; cumule avec le stockage réversible.
- **Recommandation** : valider.

### [SEC-010] — NUANCÉ
- **Vérification code** : oui. `getServerSession.ts:L26-L62` crée `LRUCache({ max: 1000 })` sans TTL et retourne la session cachée.
- **Justification** : risque de stale session réel mais borné par éviction et par le fait que le cache est clé par token.
- **Sévérité que tu retiendrais** : P3.
- **Scénario d'exploitation revu** : ne permet pas de forger une session; peut retarder la prise en compte de changements serveur.
- **Recommandation** : garder P3.

### [SEC-011] — SÉVÉRITÉ-EXAGÉRÉE
- **Vérification code** : oui. `oAuthAuthorization.ts:L6-L11` fait `jwt.verify(token, process.env.CALENDSO_ENCRYPTION_KEY || "")`.
- **Justification** : fallback mauvais. Mais en prod sans `CALENDSO_ENCRYPTION_KEY`, de nombreuses fonctions crypto échouent; le scénario est surtout une mauvaise config.
- **Sévérité que tu retiendrais** : P2 si endpoint activé et variable absente, P3 sinon.
- **Scénario d'exploitation revu** : tient seulement si l'instance démarre et expose ce flow sans clé; ce prérequis manque dans l'analyse P1.
- **Recommandation** : downgrade, fail-fast si clé absente.

### [SEC-012] — NUANCÉ
- **Vérification code** : oui. `disable/route.ts:L43-L56` demande le mot de passe seulement pour `IdentityProvider.CAL` avec hash; `L80-L120` désactive avec TOTP valide.
- **Justification** : pour OAuth users, la session + TOTP suffit. Ce n'est pas un bypass 2FA; l'attaquant doit encore fournir TOTP ou backup code.
- **Sévérité que tu retiendrais** : P3.
- **Scénario d'exploitation revu** : "session OAuth compromise" ne suffit pas; il faut aussi le facteur courant.
- **Recommandation** : downgrade ou discuter re-auth produit.

### [SEC-013] — CONFIRMÉ
- **Vérification code** : oui. `bookings/_router.tsx:L91-L98` est `publicProcedure`; `find.handler.ts:L16-L30` sélectionne `description`.
- **Justification** : exposition par `bookingUid` réel. UID non énumérable, donc impact limité.
- **Sévérité que tu retiendrais** : P3.
- **Scénario d'exploitation revu** : tient si le booking UID fuit.
- **Recommandation** : valider P3.

### [SEC-014] — CONFIRMÉ
- **Vérification code** : oui. `next-auth-options.ts:L254-L257` saute les exigences admin si `NEXT_PUBLIC_IS_E2E` est défini.
- **Justification** : footgun de configuration, pas vulnérabilité par défaut.
- **Sévérité que tu retiendrais** : P3.
- **Scénario d'exploitation revu** : tient seulement avec variable activée en prod.
- **Recommandation** : valider P3, ajouter garde `NODE_ENV !== "production"`.

### [SEC-015] — NUANCÉ
- **Vérification code** : oui. `getServerSession.ts:L127-L145` propage `impersonatedBy`; `next-auth-options.ts:L556,L746,L779` conserve le claim.
- **Justification** : dette de code réelle, mais Opus dit lui-même qu'aucun chemin actuel ne set le claim.
- **Sévérité que tu retiendrais** : P3 info.
- **Scénario d'exploitation revu** : pas exploitable aujourd'hui sans autre endpoint qui écrit le claim.
- **Recommandation** : garder comme dette, pas priorité sécurité.

### [SEC-100] — SÉVÉRITÉ-EXAGÉRÉE
- **Vérification code** : oui. `packages/lib/crypto.ts:L15-L40` utilise `aes256` CBC avec IV, sans tag/HMAC.
- **Justification** : absence d'intégrité confirmée. Le P1 et "padding-oracle" sont trop forts : l'attaquant doit avoir écriture DB et l'oracle d'erreur n'est pas démontré.
- **Sévérité que tu retiendrais** : P2.
- **Scénario d'exploitation revu** : malleabilité/DoS de secrets tient avec écriture DB; compromission pratique des secrets via padding oracle n'est pas prouvée.
- **Recommandation** : valider, downgrade P1 -> P2, migrer AES-GCM.

### [SEC-101] — CONFIRMÉ
- **Vérification code** : oui. `decodeOAuthState.ts:L6-L16` exempte `stripe`; `stripepayment/api/callback.ts:L13-L42` échange le code et crée le credential pour la session.
- **Justification** : CSRF OAuth réel pour apps exemptes de nonce.
- **Sévérité que tu retiendrais** : P1 pour Stripe, P2 pour les intégrations moins sensibles.
- **Scénario d'exploitation revu** : tient si l'attaquant peut obtenir un code OAuth pour le même client/redirect et le faire consommer par la victime connectée. Stripe Connect ajoute des contraintes provider, mais le code cal.diy ne corrèle pas l'initiation.
- **Recommandation** : valider, tester end-to-end Stripe avant priorisation finale.

### [SEC-102] — NUANCÉ
- **Vérification code** : partielle. Le pattern cité existe : callbacks appellent `decodeOAuthState(req)` et plusieurs continuent sans `state` non-null.
- **Justification** : pour les apps non exemptes, `decodeOAuthState` retourne `undefined` si state absent/invalide. L'impact dépend de chaque callback et de la session requise.
- **Sévérité que tu retiendrais** : P2.
- **Scénario d'exploitation revu** : variante du confused deputy plausible, mais à valider callback par callback.
- **Recommandation** : approfondir les callbacks listés; fail closed globalement.

### [SEC-103] — CONFIRMÉ
- **Vérification code** : oui. `sendPayload.ts:L312-L320`, `handleWebhookScheduledTriggers.ts:L66-L73` et `service/WebhookService.ts:L98-L106` font `fetch(subscriberUrl)` sans revalidation.
- **Justification** : pas de validation DNS au moment de l'envoi; redirects manuels, mais DNS rebinding et anciennes URL restent un risque.
- **Sévérité que tu retiendrais** : P1 en self-host cloud sans egress firewall.
- **Scénario d'exploitation revu** : tient surtout avec DNS rebinding ou URL préexistante; self-host autorise aussi le privé à la création.
- **Recommandation** : valider.

### [SEC-104] — CONFIRMÉ
- **Vérification code** : oui. `caldavcalendar/api/add.ts:L12-L44`, `ics-feedcalendar/api/add.ts:L13-L43`, `ics-feedcalendar/lib/CalendarService.ts:L85-L90` consomment des URL utilisateur sans SSRF guard.
- **Justification** : SSRF authentifié direct.
- **Sévérité que tu retiendrais** : P1.
- **Scénario d'exploitation revu** : tient, au moins pour scan/egress et observation succès/erreur; exfiltration complète dépend du rendu d'erreur.
- **Recommandation** : valider.

### [SEC-105] — NUANCÉ
- **Vérification code** : oui. `getEventTypesFromDB.ts:L17-L201` ne sélectionne pas `hidden`; je n'ai pas vu de check `hidden` dans le flux cité.
- **Justification** : le comportement est réel, mais `hidden` peut signifier "non listé" plutôt que "non bookable".
- **Sévérité que tu retiendrais** : P3, ou P2 si produit promet que hidden bloque le booking sans lien secret.
- **Scénario d'exploitation revu** : nécessite connaître `eventTypeId`; IDs séquentiels aident, mais il faut aussi champs de booking valides.
- **Recommandation** : discuter sémantique produit avant fix.

### [SEC-106] — SÉVÉRITÉ-EXAGÉRÉE
- **Vérification code** : oui. `RegularBookingService.ts:L612-L629` ne vérifie l'email que si `requiresBookerEmailVerification` est actif.
- **Justification** : booking avec email tiers est un comportement classique de calendriers; le risque spam/phishing existe mais n'est pas une compromission.
- **Sévérité que tu retiendrais** : P3.
- **Scénario d'exploitation revu** : tient pour spam depuis cal.diy, pas pour "au nom de la victime" au sens authentification.
- **Recommandation** : downgrade, rate-limit par email.

### [SEC-107] — CONFIRMÉ
- **Vérification code** : oui. Les chemins cités ne montrent ni lock SQL ni single-flight autour des refresh tokens.
- **Justification** : race de refresh plausible pour providers à rotation stricte.
- **Sévérité que tu retiendrais** : P2, plutôt bug de robustesse que sécurité.
- **Scénario d'exploitation revu** : DoS sur intégration plus que compromission.
- **Recommandation** : valider avec catégorie/texte nuancés.

### [SEC-108] — CONFIRMÉ
- **Vérification code** : oui. `bookingCreateBodySchema.ts:L20,L97-L106` contient `z.record(z.string())`, `email: z.string()`, `notes: z.string()` sans bornes.
- **Justification** : abus stockage/amplification confirmé.
- **Sévérité que tu retiendrais** : P3.
- **Scénario d'exploitation revu** : tient si la limite de body en amont est large; elle n'est pas visible ici.
- **Recommandation** : valider.

### [SEC-109] — FAUX POSITIF
- **Vérification code** : oui. `stripepayment/webhook.ts:L1-L10` retourne toujours 404 avec bodyParser false.
- **Justification** : ce n'est pas une vulnérabilité actuelle; c'est une note de régression potentielle.
- **Sévérité que tu retiendrais** : aucune, ou P3 documentation hors audit vuln.
- **Scénario d'exploitation revu** : aucun scénario actuel.
- **Recommandation** : drop du tableau findings, garder en note mainteneur.

### [SEC-200] — SÉVÉRITÉ-EXAGÉRÉE
- **Vérification code** : oui. `packages/lib/rateLimit.ts:L33-L42` retourne toujours `{ success: true }` sans `UNKEY_ROOT_KEY`; `L43-L56` fail-open aussi sur timeout/erreur Unkey.
- **Justification** : fail-open confirmé. P0 est trop haut : il permet brute force/abus, pas une compromission immédiate.
- **Sévérité que tu retiendrais** : P1 pour self-host Internet sans Unkey, P2 si compensé par proxy/WAF.
- **Scénario d'exploitation revu** : tient sur endpoints qui appellent ce helper; l'impact dépend des autres protections par endpoint.
- **Recommandation** : valider, downgrade P0 -> P1.

### [SEC-201] — SÉVÉRITÉ-EXAGÉRÉE
- **Vérification code** : oui. `apps/web/proxy.ts:L64-L66,L165-L167`; `apps/web/lib/csp.ts:L44-L51` ne met aucun header si non enforce.
- **Justification** : couverture CSP très limitée confirmée. Mais absence de CSP est mitigation manquante, pas vulnérabilité exploitable seule.
- **Sévérité que tu retiendrais** : P2.
- **Scénario d'exploitation revu** : dépend d'une XSS séparée; Opus ne prouve pas XSS exploitable ici.
- **Recommandation** : downgrade P1 -> P2.

### [SEC-202] — SÉVÉRITÉ-EXAGÉRÉE
- **Vérification code** : oui. `embed-iframe.ts:L559-L568` et `embed.ts:L1565-L1582` ne vérifient pas `e.origin`.
- **Justification** : origine non vérifiée réelle. P1 est trop haut sans preuve qu'un site hostile peut agir sur autre chose que l'embed qu'il a lui-même inclus.
- **Sévérité que tu retiendrais** : P2, voire P3 si embed désactivé ou limité.
- **Scénario d'exploitation revu** : manipulation UI/analytics plausible; prise d'action sensible non démontrée.
- **Recommandation** : downgrade et approfondir les méthodes exposées.

### [SEC-203] — SÉVÉRITÉ-EXAGÉRÉE
- **Vérification code** : oui. `markdownToSafeHTML.ts:L18-L27` et client `L18-L27` ajoutent `target="_blank"` sans `rel`.
- **Justification** : reverse tabnabbing surtout sur navigateurs anciens; les navigateurs modernes appliquent implicitement `noopener` pour `_blank`.
- **Sévérité que tu retiendrais** : P3.
- **Scénario d'exploitation revu** : tient seulement sur vieux clients ou comportements non standards.
- **Recommandation** : downgrade, patch XS.

### [SEC-204] — FAUX POSITIF
- **Vérification code** : non applicable; Opus le marque comme doublon de SEC-004.
- **Justification** : doublon volontaire, ne doit pas compter comme finding.
- **Sévérité que tu retiendrais** : aucune.
- **Scénario d'exploitation revu** : voir SEC-004.
- **Recommandation** : drop.

### [SEC-205] — CONFIRMÉ
- **Vérification code** : oui. `Dockerfile:L10-L12,L21-L35,L77-L94` définit secrets build par défaut et le runner n'a pas `USER` non-root.
- **Justification** : supply-chain/container hardening réel.
- **Sévérité que tu retiendrais** : P2.
- **Scénario d'exploitation revu** : tient en cas d'oubli env runtime ou RCE container.
- **Recommandation** : valider.

### [SEC-206] — NUANCÉ
- **Vérification code** : oui. `apps/web/lib/csp.ts:L19-L25` inclut `'unsafe-inline' https:` en prod avec nonce/strict-dynamic.
- **Justification** : exact, mais `strict-dynamic` change la sémantique sur navigateurs modernes; et SEC-201 limite déjà la portée.
- **Sévérité que tu retiendrais** : P3 seul, P2 en cumul CSP global.
- **Scénario d'exploitation revu** : exploitable surtout sur navigateurs sans `strict-dynamic`.
- **Recommandation** : garder mais downgrade/lier à SEC-201.

### [SEC-207] — FAUX POSITIF
- **Vérification code** : oui. `Info.tsx:L20-L30` remplace `<p>`/`<li>` par du style constant après sanitization.
- **Justification** : pattern fragile, mais `css` est statique et non contrôlé par l'utilisateur.
- **Sévérité que tu retiendrais** : aucune, ou note P3 hors vuln.
- **Scénario d'exploitation revu** : aucun scénario actuel.
- **Recommandation** : drop du rapport vuln.

### [SEC-208] — NUANCÉ
- **Vérification code** : oui. `layout.tsx:L9-L37` injecte `NEXT_PUBLIC_HEAD_SCRIPTS`/`BODY_SCRIPTS` avec nonce.
- **Justification** : c'est une fonctionnalité d'opérateur, donc trust boundary explicite. Le risque est une mauvaise gouvernance des variables.
- **Sévérité que tu retiendrais** : P3 documentation.
- **Scénario d'exploitation revu** : tient seulement si un tiers non fiable peut contrôler l'environnement.
- **Recommandation** : garder comme doc/hardening.

### [BUG-001] — SÉVÉRITÉ-EXAGÉRÉE
- **Vérification code** : oui. `RegularBookingService.ts:L933-L946` appelle `ensureAvailableUsers` avant `createBooking`; `createBooking.ts:L139-L147` crée en transaction sans isolation explicite ni lock slot.
- **Justification** : TOCTOU confirmé. P0 est trop haut : impact disponibilité/intégrité de planning, pas compromission critique.
- **Sévérité que tu retiendrais** : P1.
- **Scénario d'exploitation revu** : aucun lock subtil trouvé; `rg` ne montre pas d'advisory lock/Serializable dans ce flux.
- **Recommandation** : valider, downgrade P0 -> P1.

### [BUG-002] — NUANCÉ
- **Vérification code** : oui. `validateBookingTimeIsNotOutOfBounds.ts:L41-L42` appelle `getUTCOffsetByTimezone(tz)` sans date; `dayjs/index.ts:L244-L248` utilise donc "now".
- **Justification** : bug DST réel. Impact limité aux validations autour des transitions et dépend des period constraints.
- **Sévérité que tu retiendrais** : P2.
- **Scénario d'exploitation revu** : refus/acceptation erronés plausibles, mais P1 me paraît haut sans reproduction ciblée.
- **Recommandation** : downgrade P1 -> P2, patch XS.

### [BUG-003] — CONFIRMÉ
- **Vérification code** : oui. `availability.ts:L71-L84` prend `dayjs().tz(...).utcOffset()` une fois.
- **Justification** : snapshot d'offset confirmé.
- **Sévérité que tu retiendrais** : P2.
- **Scénario d'exploitation revu** : décalage autour DST plausible.
- **Recommandation** : valider.

### [BUG-004] — CONFIRMÉ
- **Vérification code** : oui. `zod-utils.ts:L234-L243` a `count: z.number()` sans borne; `RecurringBookingService.ts:L74-L128` boucle sur `data.length`.
- **Justification** : absence de borne confirmée.
- **Sévérité que tu retiendrais** : P1 si endpoint accepte directement un gros `allRecurringDates`, sinon P2.
- **Scénario d'exploitation revu** : tient si l'attaquant peut fournir la liste récurrente ou forcer une expansion massive avant service.
- **Recommandation** : valider et ajouter borne serveur.

### [BUG-005] — CONFIRMÉ
- **Vérification code** : oui. `RecurringBookingService.ts:L74-L128` attend chaque `createBooking` dans la boucle.
- **Justification** : latence séquentielle confirmée.
- **Sévérité que tu retiendrais** : P2 en cumul avec BUG-004, P3 seul.
- **Scénario d'exploitation revu** : amplifie surtout une entrée non bornée.
- **Recommandation** : valider avec nuance.

### [BUG-006] — SÉVÉRITÉ-EXAGÉRÉE
- **Vérification code** : oui. `rg` confirme `catch (e) {}` dans `nextcloudtalk`, `webex`, `jelly`, `basecamp3`.
- **Justification** : observabilité mauvaise, mais P2 est haut.
- **Sévérité que tu retiendrais** : P3.
- **Scénario d'exploitation revu** : pas d'exploitation directe, seulement diagnostic/UX.
- **Recommandation** : downgrade.

### [BUG-007] — CONFIRMÉ
- **Vérification code** : oui. `triggerNoShow/common.ts:L116-L123` fait `.catch(() => null)` sur `videoCallGuest.findUnique`.
- **Justification** : erreurs DB masquées.
- **Sévérité que tu retiendrais** : P3.
- **Scénario d'exploitation revu** : faux négatifs guest possibles en panne DB.
- **Recommandation** : valider P3.

### [BUG-008] — SÉVÉRITÉ-EXAGÉRÉE
- **Vérification code** : oui. `schema.prisma:L1142-L1170` n'a que `@@index([active])`; `getWebhooks.ts:L44-L73` filtre OR sur `userId`, `eventTypeId`, `teamId`, `platformOAuthClientId`.
- **Justification** : index manquants réels. P1 perf-critical sans EXPLAIN ni taille table est trop fort.
- **Sévérité que tu retiendrais** : P2.
- **Scénario d'exploitation revu** : seq scan plausible à volume; non démontré sur dataset réel.
- **Recommandation** : valider, downgrade P1 -> P2.

### [BUG-009] — CONFIRMÉ
- **Vérification code** : oui. `schema.prisma:L862,L964` ont relation optionnelle sans `onDelete`.
- **Justification** : ambiguïté Prisma réelle, faible.
- **Sévérité que tu retiendrais** : P3.
- **Scénario d'exploitation revu** : pas exploitable; dette de schéma.
- **Recommandation** : valider P3.

### [BUG-010] — NUANCÉ
- **Vérification code** : oui. Plusieurs migrations contiennent `CREATE INDEX` sans `CONCURRENTLY`; une migration récente utilise toutefois `CONCURRENTLY`.
- **Justification** : risque opérationnel réel pour futures grosses tables; les migrations passées ne se corrigent pas forcément.
- **Sévérité que tu retiendrais** : P3/P2 selon politique de migration prod.
- **Scénario d'exploitation revu** : pas bug runtime; risque de déploiement bloquant.
- **Recommandation** : garder comme recommandation migration, pas bug applicatif prioritaire.

### [BUG-011] — CONFIRMÉ
- **Vérification code** : oui. `package.json` racine a `npm`/`yarn` dans `engines`, pas `node`.
- **Justification** : compatibilité dev/CI faible.
- **Sévérité que tu retiendrais** : P3.
- **Scénario d'exploitation revu** : non sécurité.
- **Recommandation** : valider P3.

### [BUG-012] — CONFIRMÉ
- **Vérification code** : oui. `booking-idempotency-key.ts:L27-L36` génère la clé seulement si `status === ACCEPTED`; `L39-L48` l'efface sur cancel/reject.
- **Justification** : PENDING non couvert confirmé.
- **Sévérité que tu retiendrais** : P2.
- **Scénario d'exploitation revu** : retries sur confirmation requise peuvent créer plusieurs PENDING.
- **Recommandation** : valider.

### [BUG-013] — NUANCÉ
- **Vérification code** : partielle. `node_modules/rrule/package.json` indique `2.7.1`; l'absence de borne count est déjà couverte par BUG-004.
- **Justification** : version ancienne confirmée, mais le finding mélange supply-chain et borne applicative.
- **Sévérité que tu retiendrais** : P3.
- **Scénario d'exploitation revu** : dépend de l'entrée applicative non bornée, pas de `rrule` seul.
- **Recommandation** : garder P3 ou fusionner avec BUG-004.

### [PERF-001] — SÉVÉRITÉ-EXAGÉRÉE
- **Vérification code** : oui. `getUserAvailability.ts:L785-L817` mappe chaque user vers `_getUserAvailability`; `L392-L420` montre des récupérations par user si `initialData` manque.
- **Justification** : risque N+1 réel. P1 sans profilage/EXPLAIN est haut; le code passe aussi de l'`initialData` qui peut précharger certaines données.
- **Sévérité que tu retiendrais** : P2.
- **Scénario d'exploitation revu** : saturation Prisma plausible pour 50 hosts, confirmée par warning; pas quantifiée.
- **Recommandation** : valider, downgrade P1 -> P2.

### [PERF-002] — CONFIRMÉ
- **Vérification code** : oui. `getBusyTimes.ts:L77-L83,L185-L190` construit les `JSON.stringify(...)` avant d'appeler le logger.
- **Justification** : coût CPU/GC réel même si le niveau masque la sortie.
- **Sévérité que tu retiendrais** : P2.
- **Scénario d'exploitation revu** : dépend du volume de busy times.
- **Recommandation** : valider.

### [PERF-003] — CONFIRMÉ
- **Vérification code** : oui. Les pages citées ne déclarent pas `revalidate`, `dynamic`, ni cache headers; `rg` ne trouve pas ces marqueurs.
- **Justification** : SSR public sans cache applicatif visible.
- **Sévérité que tu retiendrais** : P2.
- **Scénario d'exploitation revu** : chaque visite peut refaire le travail serveur si pas de CDN externe.
- **Recommandation** : valider.

### [PERF-004] — SÉVÉRITÉ-EXAGÉRÉE
- **Vérification code** : oui. `EventTeamAssignmentTab.tsx:L39-L50` utilise `form.watch("schedulingType")`, `watch("assignAllTeamMembers")`, `watch("isRRWeightsEnabled")`.
- **Justification** : ce sont des watches ciblés, pas un `watch()` global. "Chaque keystroke" n'est pas prouvé par ces lignes.
- **Sévérité que tu retiendrais** : P3 à creuser.
- **Scénario d'exploitation revu** : lag possible si ces champs changent, mais pas sur tout le formulaire.
- **Recommandation** : downgrade ou demander profilage React.

### [PERF-005] — FAUX POSITIF
- **Vérification code** : oui. `FormBuilder.tsx:L132-L136` montre seulement `useFieldArray`, pas une preuve de rerender à chaque keystroke.
- **Justification** : la localisation citée ne démontre pas le claim.
- **Sévérité que tu retiendrais** : aucune sans profilage ou code complémentaire.
- **Scénario d'exploitation revu** : non établi.
- **Recommandation** : drop ou approfondir avec React Profiler.

### [PERF-006] — NUANCÉ
- **Vérification code** : oui. `next.config.ts:L236-L238` optimise seulement `@calcom/ui`.
- **Justification** : exact, mais ajouter des packages à `optimizePackageImports` n'est pas automatiquement bénéfique/sûr.
- **Sévérité que tu retiendrais** : P3.
- **Scénario d'exploitation revu** : optimisation potentielle, pas bug.
- **Recommandation** : garder comme perf backlog.

### [PERF-007] — CONFIRMÉ
- **Vérification code** : oui. `framer-features.tsx:L1-L3` importe/exporte `domAnimation`; `apps/web/modules/bookings/components/Booker.tsx:L633` l'utilise avec `LazyMotion`.
- **Justification** : `domAnimation` est importé statiquement, donc lazy loading des features n'est pas maximisé.
- **Sévérité que tu retiendrais** : P3.
- **Scénario d'exploitation revu** : impact bundle à mesurer.
- **Recommandation** : valider P3.

### [PERF-008] — CONFIRMÉ
- **Vérification code** : oui. `getBusyTimes.ts:L20` fixe `MAX_CONCURRENT_LIMIT_CHECK_BATCHES = 5`; `L425-L439` traite les lots par vagues.
- **Justification** : concurrence volontairement limitée, peut sous-utiliser la DB.
- **Sévérité que tu retiendrais** : P3.
- **Scénario d'exploitation revu** : optimisation workload-dépendante.
- **Recommandation** : valider P3, benchmark avant changement.

### [PERF-009] — CONFIRMÉ
- **Vérification code** : oui. `getPublicEvent.ts:L269,L298,L468-L510` montre plusieurs appels repository/Prisma séquentiels.
- **Justification** : round-trips multiples confirmés.
- **Sévérité que tu retiendrais** : P2, surtout avec PERF-003.
- **Scénario d'exploitation revu** : impact fort sur pages publiques non cachées.
- **Recommandation** : valider.

### [PERF-010] — CONFIRMÉ
- **Vérification code** : oui. `schema.prisma:L918-L929` a `[eventTypeId]`, `[eventTypeId,status]`, `[startTime,endTime,status]`, pas `[eventTypeId,startTime,status]`.
- **Justification** : index composite manquant plausible pour requêtes eventType + range.
- **Sévérité que tu retiendrais** : P2 si requête chaude confirmée, P3 sinon.
- **Scénario d'exploitation revu** : nécessite EXPLAIN pour confirmer choix planner.
- **Recommandation** : valider avec EXPLAIN avant migration.
