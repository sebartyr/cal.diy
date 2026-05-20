# Pass 2 Codex - findings solides et à creuser

## Solides, prêts à fixer

| ID | Statut Codex | Sévérité retenue | Pourquoi c'est solide |
| --- | --- | --- | --- |
| SEC-001 | confirmé avec downgrade | P1 | Stub PBAC no-op lu dans `eventTypes/util.ts`; routes PBAC exposées. |
| SEC-004 | confirmé | P2 | Fast path user inconnu avant bcrypt dans `next-auth-options.ts`. |
| SEC-007 | confirmé | P2 | `maxAge: 10 * 60 * 60` contredit le commentaire 10 min. |
| SEC-009 | confirmé | P2 | Backup codes chiffrés réversibles dans `totp/setup/route.ts`. |
| SEC-101 | confirmé | P1 | `stripe` dans `NONCE_EXEMPT_APPS`; callback Stripe ne corrèle pas le state. |
| SEC-103 | confirmé | P1 | Webhook send fetch l'URL stockée sans revalidation. |
| SEC-104 | confirmé | P1 | CalDAV/ICS consomment des URL utilisateur sans guard SSRF visible. |
| SEC-200 | confirmé avec downgrade | P1 | `rateLimit()` retourne succès si Unkey absent. |
| SEC-205 | confirmé | P2 | Dockerfile secrets build par défaut + runner root. |
| BUG-001 | confirmé avec downgrade | P1 | Availability check hors transaction, create sans lock slot. |
| BUG-003 | confirmé | P2 | `availability.ts` snapshot l'offset timezone avec `dayjs()`. |
| BUG-004 | confirmé | P1/P2 | `count` non borné et boucle sur dates récurrentes. |
| BUG-012 | confirmé | P2 | Idempotency key seulement pour `ACCEPTED`. |
| PERF-002 | confirmé | P2 | `JSON.stringify` évalué avant logger. |
| PERF-003 | confirmé | P2 | Pages publiques sans revalidate/cache visible. |

## À creuser avant fix prioritaire

| ID | Raison |
| --- | --- |
| SEC-002 | Timing attack remote très fragile; patch simple mais severity basse. |
| SEC-011 | Exploitable surtout en mauvaise config sans `CALENDSO_ENCRYPTION_KEY`; vérifier démarrage réel. |
| SEC-102 | Pattern plausible, mais il faut valider callback par callback. |
| SEC-105 | Clarifier si `hidden` signifie non listé ou non bookable. |
| SEC-202 | Origin check absent, mais actions sensibles réellement invocables à cartographier. |
| BUG-002 | Reproduction DST ciblée nécessaire pour quantifier l'impact. |
| BUG-008 | Ajouter EXPLAIN/volumétrie Webhook avant qualifier perf-critical. |
| PERF-001 | Warning code réel; mesurer avec équipe 50+ hosts et pool Prisma. |
| PERF-004 | Nécessite React Profiler; lignes citées montrent des watches ciblés. |
| PERF-010 | Confirmer par EXPLAIN sur requête chaude avant migration d'index. |

## À retirer ou fusionner

| ID | Décision |
| --- | --- |
| SEC-109 | Drop comme vuln actuelle; endpoint stub 404. |
| SEC-204 | Drop; doublon explicite de SEC-004. |
| SEC-207 | Drop comme vuln actuelle; remplacement CSS constant. |
| PERF-005 | Drop ou approfondir; localisation citée ne prouve pas le rerender. |
| BUG-013 | Fusion possible avec BUG-004; `rrule` ancien seul ne prouve pas le DoS. |
