# Stratégie de maintenance fork cal.diy ↔ upstream cal.com

Objectif : conserver la capacité de récupérer les patches CVE upstream sans bloquer les features Clever, et durcir le pipeline de sécurité au niveau d'un fork interne (et non d'un SaaS multi-tenant).

---

## 1. Cartographie du couplage actuel (rappel)

### Hot path upstream touché par le fork

| Fichier | Type modif | Risque rebase |
|---------|------------|---------------|
| `packages/trpc/server/routers/viewer/_router.tsx` | +1 ligne (import + register) | Faible (additif) |
| `packages/trpc/server/routers/viewer/webhook/util.ts` | ~80 lignes ré-écrites | **Élevé** — toute évolution upstream conflit |
| `apps/web/modules/event-types/components/EventTypeWebWrapper.tsx` | 2 dynamic imports restaurés | Moyen — upstream peut re-stub |
| `apps/web/next.config.ts` | Retrait redirect `/settings/teams` | Faible (1 ligne) |
| `apps/web/app/(use-page-wrapper)/settings/(settings-layout)/SettingsLayoutAppDirClient.tsx` | + 30 lignes (nav tabs) | Moyen |
| Packages `@radix-ui/*` | Versions `^1.1.x` (vs upstream pinned `1.0.4`) | Moyen — drift transitif |

### Fichiers Clever-only (additifs)

40 fichiers entièrement nouveaux dans `apps/web/...teams/...`, `apps/web/modules/admin/teams/`, `packages/trpc/server/routers/viewer/teams/`, `scripts/`. Aucun risque de conflit (additifs purs).

---

## 2. Branches de travail recommandées

```
upstream      ← miroir de cal.com/main (read-only, ne JAMAIS push)
master        ← branche prod fork Clever (releases déployées)
develop       ← intégration features Clever (optionnel)
sec/upstream  ← branche éphémère pour cherry-picker les CVE patches
```

**Workflow CVE patch upstream** :
1. `git fetch upstream main`
2. `git log upstream/main..master` → identifier les commits Clever exposés à la zone modifiée.
3. `git checkout -b sec/upstream-<cve> upstream/main`
4. Cherry-pick le commit upstream patch.
5. Rebase sur `master` ; résoudre les conflits localisés.
6. PR vers `master` avec label `security` + ultrareview.

---

## 3. Procédure de rebase périodique

**Cadence recommandée** : 1× tous les 15 jours (assez court pour ne pas accumuler trop de diff, assez espacé pour ne pas hijacker tous les sprints).

```bash
# Préparation
git fetch upstream main
git checkout -b sync/upstream-$(date +%Y%m%d) master

# Merge avec strategy=ours sur les fichiers Clever exclusifs pour gagner du temps
git merge upstream/main

# Si conflits massifs : prendre une approche cherry-pick fine plutôt que merge brut
git checkout master
git checkout -b sync/upstream-$(date +%Y%m%d)
git log --oneline master..upstream/main | tac | while read sha _; do
  git cherry-pick $sha || break  # arrêter au 1er conflit
done
```

**Quel que soit l'outil** :
- Tag avant rebase : `git tag pre-rebase-$(date +%Y%m%d) master`.
- Tests E2E + type-check obligatoires avant merge.
- PR `sync/upstream-…` séparée de toute feature.

---

## 4. Réduction du couplage `webhook/util.ts` (FORK-300-FORK)

Le refactor actuel mélange du code upstream + du code Clever. Proposition :

### Avant (état actuel)
```ts
// packages/trpc/server/routers/viewer/webhook/util.ts
// 80 lignes ré-écrites, comprenant `canManageEventType` + le middleware
async function canManageEventType(...) { ... }
export const createWebhookProcedure = () => { ... };
```

### Après (couplage réduit)
```ts
// packages/trpc/server/routers/viewer/webhook/util.ts
// Patch minimal vs upstream : 1 import + remplacement du test d'ownership
import { canManageEventType } from "./canManageEventType";  // Clever-only

// ... reste = upstream verbatim, sauf l'unique appel à canManageEventType
```

```ts
// packages/trpc/server/routers/viewer/webhook/canManageEventType.ts (Clever-only)
import { prisma } from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";

export async function canManageEventType(eventTypeId: number, userId: number): Promise<boolean> {
  // Logique Clever (team admin OK) — isolée
  ...
}
```

**Bénéfice** : `util.ts` ne diverge que d'~5 lignes au lieu de 80. Tout patch upstream sur `util.ts` se merge proprement ; seul `canManageEventType.ts` (Clever-only) évolue indépendamment.

---

## 5. CI hardening recommandé

### 5.1. Pinner strictement Radix
```jsonc
// apps/web/package.json
"@radix-ui/react-dialog": "1.1.15",       // au lieu de "^1.1.15"
"@radix-ui/react-dropdown-menu": "2.1.16",
"@radix-ui/react-tooltip": "1.2.8",
"@radix-ui/react-toggle-group": "1.1.11",
```

### 5.2. Activer Renovate pour propagation contrôlée
```json
// renovate.json
{
  "extends": ["config:base"],
  "rangeStrategy": "pin",
  "packageRules": [
    { "matchPackagePatterns": ["^@radix-ui/"], "groupName": "radix-ui" },
    { "matchUpdateTypes": ["major"], "automerge": false },
    { "matchUpdateTypes": ["patch"], "automerge": true, "requiredStatusChecks": ["check-types", "yarn-audit"] }
  ]
}
```

### 5.3. Ajouter Semgrep en CI

```yaml
# .github/workflows/semgrep.yml
name: Semgrep
on: { pull_request: { branches: [master] } }
jobs:
  semgrep:
    runs-on: ubuntu-latest
    container: returntocorp/semgrep
    steps:
      - uses: actions/checkout@v4
      - run: semgrep --config=p/owasp-top-ten --config=p/typescript --error
```

Démarrer en `--error` only sur fichiers `packages/trpc/server/routers/viewer/teams/**` + `scripts/**` puis étendre.

### 5.4. CodeQL (gratuit GitHub)
```yaml
# .github/workflows/codeql.yml
name: CodeQL
on: { push: { branches: [master] }, pull_request: { branches: [master] } }
jobs:
  analyze:
    runs-on: ubuntu-latest
    permissions: { security-events: write, contents: read }
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v3
        with: { languages: javascript-typescript }
      - uses: github/codeql-action/analyze@v3
```

### 5.5. `yarn audit` en bloquant
Aujourd'hui : `--severity critical` only. Passer à `--severity high` après triage de la baseline existante.

### 5.6. SBOM + signature
- Générer un SBOM à chaque release : `npx @cyclonedx/cyclonedx-npm --output sbom.json`.
- Signer les images Docker avec `cosign sign --key cosign.key`.

---

## 6. Watch upstream

### Sources à monitorer
1. **GitHub Security Advisories** sur `calcom/cal.com` — RSS feed : `https://github.com/calcom/cal.com/security/advisories.atom`.
2. **Releases** : `https://github.com/calcom/cal.com/releases.atom` (changelog mention CVEs).
3. **Dependabot** activé sur le fork pour les transitives.

### Channel Slack interne
- `#cal-clever-security` avec webhook GitHub posté chaque advisory + chaque release upstream.
- Responsable rotatif (1 personne/sprint) qui traite les advisories.

---

## 7. `FORK-NOTES.md` à créer à la racine

Format suggéré :

```markdown
# Cal.diy fork notes (Clever Cloud)

## Upstream
- Origin: https://github.com/calcom/cal.com (branch: main)
- Last sync: 2026-05-20 (commit upstream a1b2c3)
- Sync cadence: every 2 weeks

## Files patched in upstream
- packages/trpc/server/routers/viewer/webhook/util.ts (ownership refactor → see canManageEventType.ts)
- packages/trpc/server/routers/viewer/_router.tsx (+ teamsRouter import)
- apps/web/modules/event-types/components/EventTypeWebWrapper.tsx (dynamic imports restored)
- apps/web/next.config.ts (removed /settings/teams redirect)
- apps/web/app/.../SettingsLayoutAppDirClient.tsx (added teams tab)

## Clever-only directories
- apps/web/app/(use-page-wrapper)/settings/(settings-layout)/teams/
- apps/web/app/(booking-page-wrapper)/team/
- apps/web/modules/admin/teams/
- apps/web/modules/team/
- packages/trpc/server/routers/viewer/teams/
- scripts/ (dev-grant-password, seed-test-team, debug-teams)

## CVE patches procedure
1. git fetch upstream main
2. git checkout -b sec/upstream-<cve> upstream/main
3. cherry-pick le fix
4. rebase sur master
5. PR avec label `security`

## Owners
- Fork maintainer : Sébastien Brunat
- Security watch : <équipe sécurité Clever>
```

---

## 8. Tâches concrètes prioritaires

| # | Action | Effort | Quand |
|---|--------|--------|-------|
| 1 | Pinner Radix strict (5.1) | XS | Cette semaine |
| 2 | Externaliser `canManageEventType` (section 4) | S | Cette semaine |
| 3 | `FORK-NOTES.md` à la racine | XS | Cette semaine |
| 4 | Semgrep en CI (5.3) | S | Sprint courant |
| 5 | Renovate config (5.2) | S | Sprint courant |
| 6 | CodeQL (5.4) | XS | Sprint courant |
| 7 | Channel Slack #cal-clever-security (6) | XS | Sprint courant |
| 8 | `yarn audit --severity high` (5.5) | S après triage | Sprint+1 |
| 9 | SBOM + cosign (5.6) | M | Sprint+1 ou +2 |
| 10 | Première sync upstream `sync/upstream-…` (3) | M | À planifier dans 2 semaines max |
