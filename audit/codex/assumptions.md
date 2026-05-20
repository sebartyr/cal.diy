# Hypotheses et limites

## Hypotheses

- Revision analysee : `3e50c176fe`.
- Deploiement suppose : self-hosted, expose Internet, PostgreSQL >= 13, Next.js derriere reverse proxy ou CDN optionnel.
- Le disclaimer upstream "not production" est pris en compte pour le ton, pas pour reduire artificiellement la severite technique.
- Les utilisateurs authentifies peuvent creer des webhooks, modifier leur profil, et utiliser les integrations disponibles dans l'instance.
- Les secrets `NEXTAUTH_SECRET` et `CALENDSO_ENCRYPTION_KEY` sont des secrets de production dans les deployments Docker documentes.
- L'audit considere le multi-replica possible; les races non protegees par verrou DB ou contrainte sont donc retenues.

## Zones lues prioritairement

- `apps/web/pages/api/**` et `apps/web/app/api/**` pour endpoints publics.
- `packages/trpc/server/routers/**` pour procedures tRPC et mutations.
- `packages/features/bookings/**`, `packages/features/auth/**`, `packages/features/webhooks/**` pour logique metier sensible.
- `packages/app-store/**/api/**` pour callbacks OAuth et stockage credentials.
- `packages/lib/**` pour crypto, SSRF, sanitization et helpers serveur.
- `packages/prisma/schema.prisma` pour contraintes et index.
- `apps/web/proxy.ts`, `apps/web/lib/csp.ts`, `Dockerfile`, `README.md`.

## Non couvert ou seulement partiellement couvert

- Pas d'EXPLAIN ANALYZE : aucune base PostgreSQL runtime n'a ete interrogee.
- Pas d'audit CVE exhaustif de `yarn.lock` : l'analyse supply-chain s'est limitee aux scripts/config visibles et au Dockerfile.
- Pas de tests dynamiques navigateur, Playwright, ni fuzzing HTTP.
- Pas de verification complete de chaque integration OAuth tierce contre la documentation provider actuelle.
- Pas de validation runtime des proxies/CDN qui pourraient imposer des limites de taille, egress firewall ou CSP additionnelle.
- Pas de revue exhaustive ligne par ligne de toutes les routes API v1/v2; les surfaces a plus fort risque ont ete priorisees.
- Pas de verification de secrets locaux : je n'ai pas ouvert `.env`.

## Faux positifs ecartes pendant la passe

- `checkBookingLimits` a une expression de retour maladroite avec `!!Promise.all(...)`, mais le controle fonctionne par exception et les appelants n'utilisent pas le booleen.
- Le repo contient des helpers de sanitization CSV et markdown; sans chemin precis qui les contourne, je n'ai pas emis de finding generique.
- Les requetes Prisma `include` existent, mais je n'ai pas retenu de finding performance sans hot path et impact concret.
