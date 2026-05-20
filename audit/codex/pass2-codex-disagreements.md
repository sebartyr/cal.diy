# Pass 2 Codex - divergences significatives avec Opus

## 1. SEC-001 n'est pas P0

Le stub PBAC est réel (`util.ts:L15-L20`) et les routes citées l'utilisent. Je confirme donc le fond. Je downgrade de P0 à P1 : l'impact est un IDOR authentifié sur event-types d'équipe, pas une compromission globale ou exécution de code. La portée exacte doit aussi être confirmée handler par handler.

## 2. SEC-200 fail-open rate-limit n'est pas P0

`rateLimit.ts:L33-L42` retourne bien `success: true` sans `UNKEY_ROOT_KEY`, et le timeout Unkey fail-open aussi (`L43-L56`). Mais P0 est trop haut : l'impact est brute-force/abus illimité sur endpoints protégés, pas compromission immédiate. Je retiens P1 en self-host Internet sans WAF/proxy rate-limit.

## 3. SEC-100 AES-CBC : padding-oracle non démontré

`crypto.ts:L15-L40` confirme AES-CBC sans authentification. Je garde le finding, mais P1 est exagéré. Le scénario solide est "attaquant avec écriture DB peut corrompre/malléer des secrets"; le padding oracle exploitable n'est pas prouvé par une différence d'erreur observable. Je retiens P2.

## 4. BUG-001 double-booking : réel, mais P0 trop haut

`RegularBookingService.ts:L933-L946` vérifie la disponibilité avant `createBooking`; `createBooking.ts:L139-L147` crée sans isolation/lock de slot. Aucun lock subtil trouvé. Je retiens P1 : intégrité/availability de planning, critique produit, mais pas P0.

## 5. SEC-202 postMessage : origin check absent, impact P1 non prouvé

`embed-iframe.ts:L559-L568` et `embed.ts:L1565-L1582` ne vérifient pas `e.origin`. Le problème existe. En revanche Opus ne prouve pas qu'un site hostile peut déclencher une action sensible sur une victime plutôt que manipuler son propre embed. Je retiens P2/P3 selon configuration embed.

## 6. SEC-002 timing attack OAuth secret est surestimé

`api-auth.strategy.ts:L184-L186` compare par string equality. C'est un mauvais pattern. Mais l'exploitation distante d'un secret OAuth haute entropie via timing JS/HTTP est peu réaliste sans oracle très propre. Je retiens P3 hardening.

## 7. SEC-109 Stripe webhook stub n'est pas un finding actuel

`stripepayment/webhook.ts:L9-L10` retourne 404. Opus parle d'un risque de régression future, pas d'une vulnérabilité présente. Je recommande de le sortir des 56 findings et de le garder en note mainteneur.

## 8. SEC-207 Info.tsx post-sanitize mutation n'est pas exploitable aujourd'hui

`Info.tsx:L20-L30` injecte uniquement un CSS constant dans `<p>`/`<li>`. Le pattern est fragile, mais sans entrée utilisateur dans le remplacement, il n'y a pas de scénario actuel. Je drop en vulnérabilité.

## 9. PERF-004/PERF-005 ne sont pas prouvés par les lignes citées

`EventTeamAssignmentTab.tsx:L43-L45` utilise des `watch("field")` ciblés, pas `watch()` global. `FormBuilder.tsx:L132-L136` montre `useFieldArray`, pas un rerender à chaque keystroke. Ces points demandent React Profiler ou une localisation plus précise.

## 10. SEC-105/SEC-106 dépendent de sémantique produit

Pour `hidden`, le code ne bloque pas le booking, mais "hidden" peut vouloir dire non listé, pas secret. Pour `bookerEmail`, le spoofing email est inhérent à beaucoup de flows de booking publics. Je garde ces constats à P3/à discuter produit, pas P2 automatique.
