# Implementation status

## Completed slices

- Phase 1 foundation: pnpm/Turborepo monorepo, web app, API, email worker, PostgreSQL schema, and local service setup.
- Identity: registration, email verification, sign-in, password recovery, revocable sessions, Personal Spaces, authorization checks, and audit events.
- Phase 2 categories: per-space standard income and expense categories, custom category creation, duplicate-name protection, API authorization, and a category management screen.
- Phase 2 income: per-space income sources, actual income records, monthly salary schedules with multiple possible payday dates, weekend adjustment rules, salary confirmation, duplicate-period protection, and an income screen.
- Phase 2 expenses: categorized manual expense records, monthly totals and history, base-currency handling, space-level authorization, and a responsive sidebar across signed-in pages.
- Phase 2 recurring records: weekly, fortnightly, monthly, and yearly income/expense schedules. A due item creates a cash transaction only after user confirmation.
- Phase 2 budgets and cash flow: monthly category limits, exact decimal spending and remaining calculations, currency-aware actual income totals, expense category breakdowns, and monthly net cash flow.

## Local verification

- `pnpm.cmd typecheck` passes across all workspaces.
- `pnpm.cmd test` passes all API unit tests.
- `pnpm.cmd build` succeeds for the API, worker, and web app.
- `node --env-file=.env --test tests/integration/identity.test.mjs` passes identity, category, income, expense recording, recurring confirmations, budget totals, cash flow, and cross-space privacy checks.
- The foundation, category, income, expense, recurring-record, and budget migrations are applied to the local development database.

## Remaining work

- Later phases: wealth tracking, investments, deterministic analytics, planning, household finance, notifications, and production hardening.
- Staging deployment, browser-based end-to-end coverage, operational monitoring, backup/restore exercises, and production setup are not complete.

See [delivery phases](delivery-phases.txt) for the planned sequence and acceptance criteria. Do not treat this local development slice as production-ready.
