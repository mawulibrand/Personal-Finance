# Phase 1 implementation status

## Written

- pnpm/Turborepo TypeScript monorepo with web, API, worker, and database package.
- Next.js responsive registration, sign-in, verification, password recovery, and private dashboard screens.
- Public PWA manifest and offline fallback; authenticated API data is never cached by the service worker.
- NestJS API and NestJS/BullMQ email worker.
- Prisma/PostgreSQL identity schema and initial version-controlled migration.
- Atomic creation of a user, Personal Space, owner membership, verification token, audit event, and email outbox message.
- Hashed one-time tokens and revocable HttpOnly cookie sessions; resetting a password revokes existing sessions.
- Membership/ownership checks, same-origin mutation checks, request rate limits, and sanitized error responses.
- Development PostgreSQL, Redis, and Mailpit Compose services; Docker image definition and CI workflow.
- Database-backed identity integration tests prepared for CI.

## Verified on the initial machine

- Node.js 24.16.0 and pnpm 10.17.1 are available.
- Three dependency-free security tests pass (`node scripts/test-security.mjs`).
- JavaScript syntax checks pass for the service worker and identity integration test.
- `git diff --check` passes.

## Pending verification

Dependency installation repeatedly failed with npm registry DNS/connection errors, including escalated attempts. Consequently there is no generated lockfile, Prisma client, full typecheck, application build, or browser test result. Docker and PostgreSQL executables were not available, so migrations and integration tests were not run locally. These are verification limits, not successful checks.

Once registry connectivity is restored, install dependencies, commit the generated lockfile after reviewing it, start the local services, and follow `local-development.md`. CI and Docker intentionally require that lockfile. The first milestone is not accepted until the registration-to-private-dashboard flow and privacy integration tests run successfully.

Staging deployment, full financial-domain authorization roles, and the remaining foundation operations are future work. No site, infrastructure, or production service has been deployed.
