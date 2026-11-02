#!/usr/bin/env bash
# Clever Cloud post-build hook (CC_POST_BUILD_HOOK=./scripts/clever/post-build.sh).
#
# The deployed directory is the whole checkout after `yarn build`: build caches,
# the offline yarn cache and dev tooling all ship with it and none of it is read
# by `next start`. Measured on a v7.5.0 deploy: .turbo 1.1G, .yarn/cache 0.8G,
# apps/web/.next/cache ~1G, node_modules 3.5G of which roughly two thirds are
# devDependencies.
set -euo pipefail
cd "$(dirname "$0")/../.."

size() { du -sh . 2>/dev/null | cut -f1; }
echo "post-build: ${PWD} is $(size) before trimming"

# Custom variable. The web app serves API v2 in its own process under /api/v2
# (apps/web/pages/api/v2/[...path].ts), loading the `nest build` output at
# runtime, so it is built here, before the prune removes the Nest CLI.
if [ "${ENABLE_API_V2:-false}" = "true" ]; then
  echo "post-build: building API v2 for the web app to serve"
  yarn workspace @calcom/api-v2 dev:build
  yarn workspace @calcom/api-v2 build
fi

# Custom variable, not a Clever Cloud one. Opt-in because it changes what the
# run command may rely on: turbo, ts-node and every other devDependency
# disappear, so the app must be started with `yarn workspace @calcom/web start`
# (or `next start` from apps/web), not through `turbo run`.
if [ "${PRUNE_DEV_DEPENDENCIES:-false}" = "true" ]; then
  echo "post-build: pruning devDependencies"
  # enableScripts=0 only silences dependency build scripts; the root postinstall
  # (`husky install && turbo run post-install`) still runs and both binaries are
  # devDependencies about to be removed, so it is stripped for the duration of
  # the re-link and restored afterwards.
  cp package.json package.json.pre-prune
  trap 'mv package.json.pre-prune package.json' EXIT
  node -e '
    const fs = require("fs");
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
    delete pkg.scripts.postinstall;
    fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
  '
  # Only the workspaces `next start` loads: the web app and the app-store apps.
  # The apps are separate workspaces that @calcom/web does not depend on, yet
  # their dependencies (e.g. the Exchange calendars' ews-javascript-api) are
  # loaded at runtime. `--all` would also keep the production dependencies of
  # docs and examples, and of API v2 unless it is embedded, ~0.8 GB that the
  # web server never reads.
  runtime_workspaces=$(yarn workspaces list --json | node -e '
    let input = "";
    process.stdin.on("data", (chunk) => (input += chunk)).on("end", () => {
      for (const line of input.trim().split("\n")) {
        const { location, name } = JSON.parse(line);
        if (location === "apps/web" || location.startsWith("packages/app-store/")) console.log(name);
        if (location === "apps/api/v2" && process.env.ENABLE_API_V2 === "true") console.log(name);
      }
    });
  ')
  # shellcheck disable=SC2086 # one workspace name per word
  YARN_ENABLE_SCRIPTS=0 yarn workspaces focus --production $runtime_workspaces
  mv package.json.pre-prune package.json
  trap - EXIT
  # No `prisma generate` here: the client lives in packages/prisma/generated,
  # outside node_modules, so the re-link cannot touch it — and the schema's
  # enum/zod/kysely generators need ts-node, which the prune just removed.
fi

# Sentry uploads source maps during `yarn build` (create-sentry-release.js), so
# the .map files have already served their purpose. Kept by default when no
# Sentry auth token is set, as they are then the only way to read a stack trace;
# DELETE_SOURCE_MAPS=true (custom variable) trades that for ~270 MB.
if [ -n "${SENTRY_AUTH_TOKEN:-}" ] || [ "${DELETE_SOURCE_MAPS:-false}" = "true" ]; then
  echo "post-build: removing source maps"
  find apps/web/.next -name '*.map' -type f -delete
fi

rm -rf .turbo .yarn/cache .yarn/install-state.gz apps/web/.next/cache
find . -path ./node_modules -prune -o -type d -name .turbo -print0 2>/dev/null | xargs -0 rm -rf

echo "post-build: ${PWD} is $(size) after trimming"
