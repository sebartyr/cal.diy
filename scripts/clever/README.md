# Clever Cloud deployment

The app is deployed as a Node application; the deployed directory is the whole
checkout after `yarn build`. `post-build.sh` trims what `next start` never
reads. Wire it with:

```
CC_POST_BUILD_HOOK=./scripts/clever/post-build.sh
```

| Variable | Default | Effect |
|---|---|---|
| `PRUNE_DEV_DEPENDENCIES` (custom, set it in the app env) | `false` | `yarn workspaces focus --production` on `@calcom/web` and the `packages/app-store/*` workspaces after the build — drops the devDependencies and the production dependencies of the workspaces the web server never loads (API v2, docs, examples), ~3 GB in all. Requires a run command that does not go through `turbo` (e.g. `yarn workspace @calcom/web start`). |
| `SENTRY_AUTH_TOKEN` | — | When set, `yarn build` has uploaded the source maps to Sentry and the hook deletes the local `.map` files. |
| `DELETE_SOURCE_MAPS` (custom) | `false` | Deletes the `.map` files (~270 MB) even without Sentry. Stack traces then point to minified code. |
| `API_V2_EMBEDDED` (custom) | `false` | The web app also serves API v2 under `/api/v2`, in the same process and port. The hook builds API v2 and keeps its dependencies (~0.8 GB). See below. |

Always removed: `.turbo`, `.yarn/cache`, `.yarn/install-state.gz`,
`apps/web/.next/cache`.

## API v2 in the web app

With `API_V2_EMBEDDED=true` (set for both the build and the run), `apps/web/pages/api/v2/[...path].ts`
hands `/api/v2/*` requests to the compiled NestJS app, initialised on the first request. No second
process, port or run command.

API v2 reads the same environment as the web app, plus:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_READ_URL`, `DATABASE_WRITE_URL` | yes | Usually the same value as `DATABASE_URL`. |
| `JWT_SECRET` | yes | |
| `REDIS_URL` | no | Without it, rate limits and caches live in the process's memory: only correct with a single instance. |
| `NEXT_PUBLIC_API_V2_URL` | must be unset | It rewrites `/api/v2/*` to a separate API deployment. |
| `ENABLE_SLOTS_WORKERS`, `SLOTS_WORKER_POOL_SIZE` | no (`true`, `4`) | API v2 computes slots in worker threads, which now share the web app's memory. Lower the pool size or disable the workers on small instances. |
