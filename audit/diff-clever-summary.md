# Cartographie du diff fork cal.diy ↔ upstream cal.com

- **Branche fork** : `master @ 3e50c176fe`
- **Upstream** : `cal.com/main` (remote: `https://github.com/calcom/cal.com.git`)
- **Date** : 2026-05-20
- **Auteur unique des commits fork** : Sébastien Brunat <sebastien.brunat@clever-cloud.com>

## Commits Clever (10)

| Hash | Message |
|------|---------|
| `3e50c176fe` | feat(admin): system-wide team management |
| `6b5fb1982f` | fix(teams): harden router after security/perf audit |
| `001a7f6ccb` | feat(event-types): expose host priority dropdown + add webhook sink |
| `c821779504` | fix(ui): satisfy Radix 1.1 a11y warnings (DialogTitle + dropdown ref) |
| `3053fa94a5` | fix(webhooks): allow team admins to manage team event-type webhooks |
| `7e38e0fd0b` | feat(booker): default to tRPC for slot fetches + dev-only login helper |
| `0e57152e33` | feat(event-types): restore Assignment and Instant tabs for team events |
| `3312b345bc` | fix(teams): register teams as a tRPC endpoint segment + sidebar children |
| `92825148a6` | feat(teams): team management UI + tRPC handlers + Radix upgrade |
| `abf24c084d` | feat(team-booking): restore public team booking pages |

## Volume global

- 56 fichiers touchés
- +3860 / −116 lignes
- Aucune migration Prisma, aucune modification de `schema.prisma`
- Aucune modification de `packages/features/auth/lib/next-auth-options.ts`
- Aucune dépendance ajoutée hors écosystème Radix existant

## Top fichiers modifiés (≥ 50 lignes)

| Lignes | Fichier | Nature |
|--------|---------|--------|
| 707 | `yarn.lock` | Cascade Radix upgrade |
| 349 | `apps/web/modules/event-types/components/tabs/assignment/EventTeamAssignmentTab.tsx` | **NEW** — Assignment tab restauré |
| 272 | `scripts/seed-test-team.ts` | **NEW** — Seed dev |
| 247 | `apps/web/app/(use-page-wrapper)/settings/(settings-layout)/teams/[id]/profile/view.tsx` | **NEW** — Page édition team |
| 233 | `apps/web/app/(use-page-wrapper)/settings/(settings-layout)/teams/[id]/members/view.tsx` | **NEW** — Membres team |
| 149 | `apps/web/modules/event-types/components/tabs/instant/EventInstantTab.tsx` | **NEW** — Instant tab restauré |
| 135 | `apps/web/server/lib/team/[slug]/getServerSideProps.ts` | **NEW** — SSP public team |
| 130 | `apps/web/modules/admin/teams/admin-teams-view.tsx` | **NEW** — Admin teams UI |
| 115 | `apps/web/app/(use-page-wrapper)/settings/(settings-layout)/teams/new/view.tsx` | **NEW** — Création team |
| 102 | `apps/web/server/lib/team/[slug]/[type]/getServerSideProps.ts` | **NEW** — SSP public event team |
| 98 | `packages/trpc/server/routers/viewer/teams/_router.tsx` | **NEW** — Router teams |
| 88 | `apps/web/modules/team/team-public-view.tsx` | **NEW** |
| 83 | `apps/web/app/(use-page-wrapper)/settings/(settings-layout)/teams/view.tsx` | **NEW** — Liste teams |
| 81 | `packages/trpc/server/routers/viewer/webhook/util.ts` | **MOD** — Refactor permissions webhook |
| 77 | `scripts/dev-grant-password.ts` | **NEW** — Helper dev login |
| 69 | `packages/trpc/server/routers/viewer/teams/permissions.ts` | **NEW** — `requireMember` |
| 69 | `…/teams/inviteMember.handler.ts` | **NEW** |
| 66 | `…/teams/schemas.ts` | **NEW** — Zod schemas |

## Nouveaux fichiers (40)

### Pages App Router
- `apps/web/app/(booking-page-wrapper)/team/[slug]/page.tsx` — booking page publique team
- `apps/web/app/(booking-page-wrapper)/team/[slug]/[type]/page.tsx` — booking event team
- `apps/web/app/(use-page-wrapper)/settings/(admin-layout)/admin/teams/page.tsx` — admin: liste systeme
- `apps/web/app/(use-page-wrapper)/settings/(settings-layout)/teams/page.tsx` + `view.tsx` — liste user
- `apps/web/app/(use-page-wrapper)/settings/(settings-layout)/teams/new/page.tsx` + `view.tsx`
- `apps/web/app/(use-page-wrapper)/settings/(settings-layout)/teams/[id]/profile/page.tsx` + `view.tsx`
- `apps/web/app/(use-page-wrapper)/settings/(settings-layout)/teams/[id]/members/page.tsx` + `view.tsx`

### Modules UI
- `apps/web/modules/admin/teams/admin-teams-view.tsx`
- `apps/web/modules/event-types/components/tabs/assignment/EventTeamAssignmentTab.tsx`
- `apps/web/modules/event-types/components/tabs/instant/EventInstantTab.tsx`
- `apps/web/modules/team/team-public-view.tsx`
- `apps/web/modules/team/team-type-public-view.tsx`

### SSP helpers
- `apps/web/server/lib/team/[slug]/getServerSideProps.ts`
- `apps/web/server/lib/team/[slug]/[type]/getServerSideProps.ts`

### Endpoint Next.js API
- `apps/web/pages/api/trpc/teams/[trpc].ts` — split-router teams

### Procedures tRPC (`packages/trpc/server/routers/viewer/teams/`)
- `_router.tsx` (router racine)
- `permissions.ts` (`requireMember` + bypass system admin)
- `schemas.ts` (Zod)
- Handlers : `list`, `get`, `getMembershipbyUser`, `listMembers`, `create`, `update`, `delete`, `removeMember`, `changeMemberRole`, `inviteMember`, `acceptOrLeave`, `addMembersToEventTypes`, `getActiveUserBookings`, `getActiveUserBreakdown`, `adminList`, `adminDelete`

### Scripts opérationnels
- `scripts/dev-grant-password.ts`
- `scripts/seed-test-team.ts`
- `scripts/debug-teams.ts`

## Fichiers modifiés (15)

| Fichier | Nature de la modif |
|---------|--------------------|
| `apps/web/app/(use-page-wrapper)/settings/(settings-layout)/SettingsLayoutAppDirClient.tsx` | + onglets `teams` + admin `teams` |
| `apps/web/app/layout.tsx` | `suppressHydrationWarning` sur `<body>` |
| `apps/web/modules/event-types/components/EventTypeWebWrapper.tsx` | Restauration des dynamic imports Assignment + Instant |
| `apps/web/modules/schedules/hooks/useEvent.ts` | `useApiV2` defaults sur `NEXT_PUBLIC_USE_API_V2_FOR_BOOKER` |
| `apps/web/next.config.ts` | Retrait redirect `/settings/teams → /teams` |
| `apps/web/package.json` | Bump Radix dialog/dropdown/tooltip/toggle-group → `^1.1.x` (rangé) |
| `packages/i18n/locales/{en,fr}/common.json` | Ajout clés teams |
| `packages/trpc/react/shared.ts` | + endpoint `"teams"` |
| `packages/trpc/server/routers/viewer/_router.tsx` | + `teamsRouter` |
| `packages/trpc/server/routers/viewer/webhook/util.ts` | Refactor — autorisation team admin sur webhooks d'event-types team |
| `packages/ui/components/dialog/Dialog.tsx` | + `<DialogPrimitive.Title>` sr-only (Radix 1.1 a11y) |
| `packages/ui/package.json` | Bump dialog → `^1.1.15` |
| `yarn.lock` | Cascade |

## Dépendances ajoutées / modifiées

Toutes les nouvelles entrées dans `yarn.lock` sont des **transitives Radix** (`react-arrow`, `react-popper`, `react-roving-focus`, `react-toggle-group`, `aria-hidden`, `react-remove-scroll-bar`, `use-callback-ref`, `use-sidecar`, …). Aucune dépendance externe à l'écosystème Radix n'est introduite.

**Points d'attention** :
- `@radix-ui/react-dialog: ^1.1.15` (préfixe `^` flottant) là où upstream pinne en strict (`1.0.4`). Idem dropdown/tooltip/toggle-group. Risque supply chain mineur : un `yarn install` ultérieur peut tirer une patch version compromise sans rebuild explicite.
- Pas de dépendance "exotique" ajoutée (pas de lib crypto custom, pas de fetch wrapper non standard, pas de polyfill).

## Endpoints nouveaux

### HTTP
- `GET/POST /api/trpc/teams/<method>` (router split — 16 procedures listées plus haut)
- `GET /team/<slug>` (SSR public)
- `GET /team/<slug>/<type>` (SSR public)
- `GET /settings/teams[/...]` (App Router, auth requise via `page.tsx`)
- `GET /settings/admin/teams` (App Router, admin only — check page-level)

### Procedures tRPC publiques (au sens `authedProcedure`)
| Procedure | Permission | Notes |
|-----------|------------|-------|
| `teams.list` | authed | Liste mes teams (membership) |
| `teams.get` | authed + requireMember | Détail team |
| `teams.getMembershipbyUser` | authed | Retourne null si pas membre |
| `teams.listMembers` | authed + requireMember | Liste tous membres |
| `teams.create` | authed | **Pas de quota / allowlist** |
| `teams.update` | authed + requireMember(ADMIN+) | bio/logo/branding |
| `teams.delete` | authed + requireMember(OWNER) | Hard delete |
| `teams.removeMember` | authed + requireMember(ADMIN+) | OWNER pour kicker un admin |
| `teams.changeMemberRole` | authed + requireMember(OWNER) | |
| `teams.inviteMember` | authed + requireMember(ADMIN+) | **TODO: email non envoyé** |
| `teams.acceptOrLeave` | authed | |
| `teams.addMembersToEventTypes` | authed + requireMember(ADMIN+) | Vérifie ownership event-types |
| `teams.getActiveUserBookings` | authed + requireMember | Aggregate |
| `teams.getActiveUserBreakdown` | authed + requireMember | groupBy |
| `teams.adminList` | `authedAdminProcedure` | UserPermissionRole.ADMIN |
| `teams.adminDelete` | `authedAdminProcedure` | Pas de soft-delete, **pas d'audit log** |

## Aucune modification

- `packages/prisma/schema.prisma` — schema identique upstream
- `packages/prisma/migrations/` — pas de nouvelle migration
- `packages/features/auth/lib/next-auth-options.ts` — NextAuth identique
- `packages/lib/rateLimit.ts`, `packages/lib/crypto.ts`, `packages/lib/ssrfProtection.ts` — non touchés
- Aucun ajout/modif côté `apps/api/v2/`

## Hot path touché par le fork

Le diff touche principalement **3 hot paths upstream** :
1. **`packages/trpc/server/routers/viewer/_router.tsx`** — ajout de `teamsRouter` au router viewer (1 ligne, mais reste un point de couplage upstream lors d'un rebase).
2. **`packages/trpc/server/routers/viewer/webhook/util.ts`** — refactor complet de l'autorisation, ~80 lignes. **Forte probabilité de conflit lors d'un rebase upstream**.
3. **`apps/web/modules/event-types/components/EventTypeWebWrapper.tsx`** — restauration des dynamic imports pour 2 onglets (Assignment, Instant) précédemment stubbés `() => null` côté upstream MIT. Conflit possible si upstream re-stub.

Tous les autres modifs sont soit additifs (nouveaux fichiers/onglets) soit dans `i18n` (faible risque de conflit).
