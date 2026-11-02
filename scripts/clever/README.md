# Clever Cloud deployment

Cal.diy runs on Clever Cloud as a single **Node.js** application, backed by a **PostgreSQL** add-on.
Each deployment builds a tagged release of this repository; one process serves the web app and,
optionally, API v2.

## How a deployment works

The Clever application is linked to a small deployment repository, not to this one. Its pre-build
hook downloads the release to deploy and replaces the checkout with it:

1. **Pre-build** (`CC_PRE_BUILD_HOOK=clevercloud/pre-build.sh`, in the deployment repository)
   downloads `https://github.com/sebartyr/cal.diy/archive/refs/tags/v${CAL_VERSION}.tar.gz`,
   extracts it into `APP_HOME` and removes `example-apps`. `CALCOM_CUSTOM_DL_URL` and
   `CALCOM_CUSTOM_DIR_NAME` override the URL and the extracted directory name.
2. **Install**: Clever runs `yarn install` (`CC_NODE_BUILD_TOOL=yarn-berry`).
3. **Post-build** (`CC_POST_BUILD_HOOK`): applies the database migrations, builds the app, then
   runs [`post-build.sh`](./post-build.sh), which trims what the server never reads.
4. **Run** (`CC_RUN_COMMAND`): starts the web server on port 8080.

Deploying a new version means changing `CAL_VERSION` and redeploying.

## Clever Cloud settings

| Variable | Value |
|---|---|
| `CC_NODE_BUILD_TOOL` | `yarn-berry` |
| `CC_PRE_BUILD_HOOK` | `clevercloud/pre-build.sh` |
| `CC_POST_BUILD_HOOK` | `yarn workspace @calcom/prisma db-deploy && yarn build && ./scripts/clever/post-build.sh` |
| `CC_RUN_COMMAND` | `yarn workspace @calcom/web start -p 8080 -H 0.0.0.0` |
| `CAL_VERSION` | Release to deploy, without the `v` (e.g. `8.2.3`). |
| `YARN_ENABLE_IMMUTABLE_INSTALLS` | `0` |
| `NODE_ENV` | `production` |

The run command must not go through `turbo`: with `PRUNE_DEV_DEPENDENCIES=true`, `turbo` is removed
after the build. Migrations run during the build, while the Prisma CLI is still installed.

## Application settings

The server refuses to boot in production without `DATABASE_URL`, `NEXTAUTH_SECRET` and
`CALENDSO_ENCRYPTION_KEY` (24 characters or more), or with placeholder values.

| Variable | Notes |
|---|---|
| `DATABASE_URL`, `DATABASE_DIRECT_URL` | The PostgreSQL add-on's connection URI. |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `CALENDSO_ENCRYPTION_KEY` | `openssl rand -base64 24`. Never change it once set: it encrypts stored credentials. |
| `NEXTAUTH_URL`, `NEXT_PUBLIC_WEBAPP_URL`, `NEXT_PUBLIC_WEBSITE_URL` | The public URL, e.g. `https://calendar.example.com`. |
| `EMAIL_FROM`, `EMAIL_SERVER_HOST`, `EMAIL_SERVER_PORT`, `EMAIL_SERVER_USER`, `EMAIL_SERVER_PASSWORD` | SMTP for invitations and booking emails. |
| `CRON_API_KEY` | Optional. When set, it must be a real secret, not the `.env.example` value. |

Sign-in providers, integrations and the other options are described in
[`.env.example`](../../.env.example). For OIDC (Keycloak, Authentik, …), set `OIDC_LOGIN_ENABLED`,
`OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` and `OIDC_PROVIDER_NAME`. The identity provider
must send `email_verified: true`, or sign-in is refused.

## Deployment size

`post-build.sh` always removes the build caches: `.turbo`, `.yarn/cache`, `.yarn/install-state.gz`
and `apps/web/.next/cache`. These variables, read by the hook, reduce the deployment further:

| Variable | Default | Effect |
|---|---|---|
| `PRUNE_DEV_DEPENDENCIES` | `false` | Runs `yarn workspaces focus --production` on `@calcom/web` and the `packages/app-store/*` workspaces: drops the devDependencies and the dependencies of the workspaces the server never loads (API v2 unless embedded, docs, examples). |
| `DELETE_SOURCE_MAPS` | `false` | Deletes the `.map` files (~270 MB). Stack traces then point to minified code. |
| `SENTRY_AUTH_TOKEN` | — | `yarn build` uploads the source maps to Sentry, and the hook then deletes them locally. |

Measured on a release build: 6.1 GB before trimming, 3.0 GB with the caches removed only,
2.2 GB with `PRUNE_DEV_DEPENDENCIES=true`, 2.0 GB with `DELETE_SOURCE_MAPS=true` as well.

## API v2 in the web app

With `ENABLE_API_V2=true`, the web app also serves API v2 under `/api/v2`, in the same process and
on the same port: no second application, port or run command. The variable must be set for both the
build and the run. `post-build.sh` then builds API v2 and keeps its dependencies (about 100 MB more,
most being shared with the web app), and `apps/web/pages/api/v2/[...path].ts` hands `/api/v2/*`
requests to the compiled NestJS app, initialised on the first request.

API v2 reads the same environment as the web app, plus:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_READ_URL`, `DATABASE_WRITE_URL` | yes | Usually the same value as `DATABASE_URL`. |
| `JWT_SECRET` | yes | |
| `API_URL` | yes | The public URL followed by `/api`, e.g. `https://calendar.example.com/api`. API v2 appends `/v2` to build the OAuth redirect URIs of its calendar and conferencing endpoints; it defaults to `http://localhost`. |
| `WEB_APP_URL` | yes | The public URL, like `NEXT_PUBLIC_WEBAPP_URL`. Defaults to `https://app.cal.com`. |
| `REDIS_URL` | no | Without it, rate limits and caches live in the process's memory, which is only correct with a single instance. Use a Redis add-on before scaling out. |
| `NEXT_PUBLIC_API_V2_URL` | must be unset | It points `/api/v2/*` to a separately deployed API instead. |
| `ENABLE_SLOTS_WORKERS`, `SLOTS_WORKER_POOL_SIZE` | no (`true`, `4`) | API v2 computes slots in worker threads, which share the web app's memory. Lower the pool size or disable the workers on small instances. |

The API is then reachable at `https://<your domain>/api/v2/...`, e.g.
`curl -H "Authorization: Bearer cal_..." https://calendar.example.com/api/v2/me`.

## Troubleshooting

- **`Refusing to boot in production`**: a required variable is missing or holds a placeholder; the
  message lists which.
- **The build log shows the size before and after trimming** (`post-build: … is X before
  trimming` / `after trimming`).
- **`/api/v2/*` answers 404**: `ENABLE_API_V2` is not `true` at run time. **503**: the compiled API
  is missing, usually because `ENABLE_API_V2` was not set during the build; the server log says why.
- **A user created from the admin panel cannot sign in with OIDC**: accounts created before v8.2.3 have
  no verified email; run `UPDATE "users" SET "emailVerified" = now() WHERE id = <id>;`.
