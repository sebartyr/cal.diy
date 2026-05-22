# Changelog

All notable changes to the `cal.diy` fork are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this fork
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Upstream (Cal.com) tracks
its own versioning under `v6.x`; the fork moves to `v7.x` to mark its independent line.

## [7.0.0] — 2026-05-22

Closes the 5-sprint security audit remediation (Sprints 0 → 4). 62 commits, 193 files,
+14 581 / -472 lines. ~47 tickets resolved in code; remaining items deferred to
`audit/OPS_TODO.md` (ops/PM responsibility).

This is a **major** release: several behavioural defaults change in ways that are visible
to operators and end-users. See **Breaking Changes** below.

### Breaking Changes

- **Password minimum length raised from 7 to 12 characters.** Existing users keep their
  passwords; new sign-ups and password resets are rejected below 12. [`SEC-005`]
- **Admin tRPC routes optionally require 2FA** via `REQUIRE_2FA_FOR_ADMIN=true`. Off by
  default in this release; flip after admins enroll. [`SPRINT3-041`]
- **`teams.create` defaults `isPrivate=true`.** Previously public-by-default.
  [`SEC-307+308-FORK`]
- **Per-user team-creation quota.** `MAX_TEAMS_PER_USER` (default 50). [`SEC-303-FORK`]
- **Admin team deletion refuses to drop teams with future ACCEPTED/PENDING bookings**
  unless `force: true` is passed. [`SEC-306-FORK`]
- **`adminList` returns `{ teams, nextCursor }`** instead of a bare array. Callers must
  paginate. [`BUG-101-FORK`]
- **`requireMember` returns `{ id: null, isSyntheticAdmin: true }`** for system admins
  instead of fake `id: -1`. Update any downstream consumers reading `.id` blindly.
  [`BUG-102-FORK`]
- **Avatar / team-image upload caps tightened.** `imageField` 1 MiB → **256 KiB** with
  MIME `refine` (`png|jpe?g|svg+xml|webp`); base64 avatar route hard-capped at 8 MiB with
  PNG/JPEG magic-bytes validation. [`SEC-015`, `SEC-304-FORK`]
- **`/api/logo` capped at 5 MiB** (returns 413 above). [`PERF-011`]
- **Markdown links emit `target="_blank" rel="noopener noreferrer"`.** [`SEC-203`]
- **CSP enforced on `/auth/login` and `/login`**, Report-Only everywhere else;
  `script-src` reduced to `'nonce-{nonce}' 'strict-dynamic'`. Inline scripts without the
  nonce will be blocked once Report-Only is flipped to enforce. [`SEC-201`, `SEC-205`]
- **Reset-password tokens are atomically consumed** via `updateMany({ where: { id, expires: { gt: now } } })`.
  Tokens are single-use; double-submits return 404. [`BUG-002`]
- **`/api/auth/two-factor/totp/disable` always requires password**, even for OAuth-only
  identities. [`SEC-011`]

### Added

- `FORK-NOTES.md` — branch model, shim pattern, divergence inventory, rebase procedure
  against upstream. [`FORK-301-FORK`]
- `audit/REMEDIATION_STATUS.md`, `audit/OPS_TODO.md` — sprint-by-sprint remediation
  tracking and ops backlog.
- `packages/prisma/migrations/MIGRATIONS.md` — documents the `CREATE INDEX CONCURRENTLY`
  pattern and `@prisma:no-transaction` directive. [`BUG-011`]
- `packages/features/audit-log/adminAuditLog.ts` — structured `recordAdminAction` audit
  trail (`granted` / `denied` outcomes, actor, target, reason) wired into every admin
  tRPC handler. [`SEC-305-FORK`]
- `packages/lib/crypto-clever.ts` — externalised AES-256-GCM logic with `v2:` prefix
  shim; reduces `crypto.ts` divergence from upstream to 3 lines. [`FORK-REFACTOR`]
- `packages/trpc/server/routers/viewer/webhook/authorization-clever.ts` — externalised
  webhook authorization helpers; `util.ts` diff vs upstream now ~5 lines. [`FORK-300-FORK`]
- OAuth refresh in-process mutex via `Map<userId::appSlug, Promise>` to coalesce
  concurrent token refreshes. [`SEC-107`]
- SSRF validation for CalDAV and ICS feed URLs. [`SEC-104`]
- Sentry `beforeSend` PII scrubbing with edge-runtime guard. [`RGPD-302`]
- Renovate config with `rangeStrategy: pin` and `@radix-ui/*` grouping. [`SEC-309-FORK`]
- GitHub Actions workflows: Semgrep (OWASP/TS/React/Node/secrets) + CodeQL
  (`security-extended`), both uploading SARIF. [`FORK-302-FORK`]
- `isSillyEnabled(log)` helper guarding hot-path `logger.silly` call sites
  (`EventManager`, `getBusyTimes`). [`PERF-002`]
- DST-aware `getWorkingHours` via optional `forDate` on `relativeTimeUnit`. [`BUG-004`]
- DST-aware `getUTCOffsetByTimezone(zone, date)` in booking time-bounds validation.
  [`BUG-003`]
- Recurring booking creation batched at 5 concurrent (`Promise.all` bounded). [`BUG-006`]
- `adminList` cursor pagination (`take: limit + 1`, `nextCursor`). [`BUG-101-FORK`]
- Invite email + atomic invite-token consumption. [`SEC-302-FORK`, `BUG-100-FORK`]

### Changed

- `EnvVars`: new `REQUIRE_2FA_FOR_ADMIN`, `MAX_TEAMS_PER_USER` (default 50),
  `MAX_BASE64_IMAGE_BYTES`. See `.env.example`.
- `getCspHeader` accepts a tri-state `{ mode: "enforce" | "report-only" | "off" }` in
  addition to the legacy `{ shouldEnforceCsp }` signature.
- `apps/web/proxy.ts` matcher broadened to cover all page paths for CSP injection.
- Lark / Feishu / Webex calendar+video adapters no longer swallow OAuth errors silently
  (`catch (err) { logger.warn(..., err); throw }`). [`BUG-007`]

### Fixed

- Reset-password token race condition (atomic consume). [`BUG-002`]
- Booking time-zone DST handling at slot boundaries. [`BUG-003`]
- Working-hours DST handling. [`BUG-004`]
- Recurring booking unbounded parallelism. [`BUG-006`]
- Webhook authorization branching (5-line diff vs upstream now isolated in
  `authorization-clever.ts`). [`FORK-300-FORK`]

### Security

This release closes ~47 audit findings. Headline tickets:

| ID                  | Theme                                                  |
| ------------------- | ------------------------------------------------------ |
| `SEC-005`           | Password min length 7 → 12                             |
| `SEC-011`           | 2FA disable requires password (incl. OAuth identities) |
| `SEC-015`           | Avatar base64 upload size + magic-bytes                |
| `SEC-104`           | SSRF validation (CalDAV, ICS feeds)                    |
| `SEC-107`           | OAuth refresh mutex (no concurrent refresh)            |
| `SEC-201` `SEC-205` | CSP Report-Only rollout + script-src tightened         |
| `SEC-203`           | Markdown links `rel="noopener noreferrer"`             |
| `SEC-302-FORK`      | Invite email + atomic token consumption                |
| `SEC-303-FORK`      | Per-user team-creation quota                           |
| `SEC-304-FORK`      | Team imageField size + MIME refine                     |
| `SEC-305-FORK`      | Admin audit trail (structured `recordAdminAction`)     |
| `SEC-306-FORK`      | adminDelete refuses future bookings without `force`    |
| `SEC-307+308-FORK`  | `teams.create` defaults `isPrivate=true`               |
| `SEC-309-FORK`      | Strict-pin Radix, Renovate config                      |
| `RGPD-302`          | Sentry PII scrubbing + edge-runtime guard              |
| `FORK-300/301/302`  | Webhook auth shim, fork notes, Semgrep+CodeQL          |

### Deferred (tracked in `audit/OPS_TODO.md`)

- Flip `REQUIRE_2FA_FOR_ADMIN=true` after admin enrollment.
- Flip CSP Report-Only → enforce after 48 h observation window.
- Wire admin-audit log to SIEM.
- Install Renovate GitHub App; enable GitHub Code Scanning (GHAS).
- Prisma indexes pending EXPLAIN ANALYZE on prod data (`SPRINT3-010/011/012`).
- Reset-token SHA-256 storage + schema migration (`SEC-007`, PM decision).
- ISR for public pages (`PERF-003`), `getPublicEvent` bundle (`PERF-009`).
- RGPD documentation: DPIA, `/privacy`, retention policy, breach notification
  (`SPRINT4-100..103`).
- Investigations: `INVEST-001..003`.
- P3 batched cleanup epic (~20 items): `SEC-004/010/013/014/016/017/108/207`,
  `BUG-008/010/012/014`, `PERF-006/007/008/100-FORK`.

### Notes

- This fork is now tagged `v7.0.0`. Upstream Cal.com `v6.x` continues on its own line;
  see `FORK-NOTES.md` for rebase procedure.
- The monorepo root `package.json` is bumped from `0.0.0` to `7.0.0` to track the fork
  release line; `apps/web/package.json` is bumped from `6.2.0` to `7.0.0` accordingly.
- Pre-remediation baseline preserved as tag `pre-remediation-20260520`. Sprint
  checkpoints: `sprint-0-closed` … `sprint-4-closed`.

[7.0.0]: https://github.com/sebartyr/cal.diy/releases/tag/v7.0.0
