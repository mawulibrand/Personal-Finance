# Local development

## Prerequisites

Node.js 24, pnpm 10.17.1, and Docker Compose. On Windows use `pnpm.cmd` if PowerShell script execution is restricted.

## Setup

1. Copy `.env.example` to `.env` in the repository root. Local credentials are development-only.
2. Run `docker compose up -d` to start PostgreSQL, Redis, and Mailpit.
3. Run `pnpm install`.
4. Run `pnpm db:generate`, then `pnpm db:deploy`.
5. Run `pnpm dev` (or `npm run dev`). The dev task builds the shared database package before starting the applications.
6. Open http://localhost:3000. Register, open Mailpit at http://localhost:8025, verify your email, and sign in.

The API listens on port 4000. The web server proxies `/api` requests; no browser-readable session token is exposed. Changes to the shared database package require rebuilding it.

If Windows reports that `next` or `tsx` is not recognized, the workspace dependencies are missing or installation was interrupted. Run `pnpm.cmd install --frozen-lockfile` from the repository root. Generating a lockfile alone does not install these executables. Avoid `npm install` for this pnpm workspace.

Run `node --env-file=.env scripts/check-local-services.mjs` to check the configured local services without printing credentials. PostgreSQL error `28P01` means authentication failed: set `DATABASE_URL` to a valid user/password/database for your local PostgreSQL instance. Redis must also be started at the configured `REDIS_URL`; the email worker waits for it and uses reconnect backoff.

## Verification

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `node scripts/test-security.mjs` runs the dependency-free security tests before installation.
- API liveness: `GET http://localhost:4000/health/live`
- Database readiness: `GET http://localhost:4000/health/ready`

To check privacy, register two users and attempt to request one user's space dashboard using the other user's cookie. The API must return 404. An unverified account must fail sign-in. A consumed or expired email token must fail. Resetting a password must invalidate old sessions.

## Current scope and limits

This is the first Phase 1 implementation slice: identity, Personal Spaces, space access, audit events, an email worker, and the responsive web interface. Household features and finance records are later phases.

Email delivery is at-least-once. Queue jobs contain only the outbox ID; failed jobs are retained for inspection. Email bodies containing links are erased after successful delivery. Undelivered outbox rows contain sensitive links and require protected database access. Automated token/outbox expiry cleanup is still needed.

Production and staging deployment, distributed rate limiting, session/device management UI, operational dashboards, automated restore checks, and full browser/integration coverage are not complete. API readiness currently checks PostgreSQL; queue and SMTP health require separate operational monitoring. Do not treat this slice as production-ready.

The initial dependency download failed, but registry access later recovered and `pnpm-lock.yaml` was generated. Run `pnpm install --frozen-lockfile` to install the recorded dependencies. CI and Docker builds also require this lockfile. Integration tests require a running PostgreSQL database and built API; do not run the email worker during the identity tests, because they inspect pending verification messages.

Configure production HTTPS, real SMTP credentials, private network access to PostgreSQL/Redis, encrypted managed storage, environment-specific secrets, and a reverse proxy before deployment. No service is deployed by the local setup.
