# Implementation status

## Completed slices

- Phase 1 foundation: pnpm/Turborepo monorepo, web app, API, email worker, PostgreSQL schema, and local service setup.
- Identity: registration, email verification, sign-in, password recovery, revocable sessions, Personal Spaces, authorization checks, and audit events.
- Phase 2 categories: per-space standard income and expense categories, custom category creation, duplicate-name protection, API authorization, and a category management screen.
- Phase 2 income: per-space income sources, actual income records, monthly salary schedules with multiple possible payday dates, weekend adjustment rules, salary confirmation, duplicate-period protection, and an income screen.
- Phase 2 expenses: categorized manual expense records, monthly totals and history, base-currency handling, space-level authorization, and a responsive sidebar across signed-in pages.
- Phase 2 recurring records: weekly, fortnightly, monthly, and yearly income/expense schedules. A due item creates a cash transaction only after user confirmation.
- Phase 2 budgets and cash flow: monthly category limits, exact decimal spending and remaining calculations, currency-aware actual income totals, expense category breakdowns, and monthly net cash flow.
- Phase 3 savings: manually tracked savings accounts, opening balances, dated deposits and withdrawals, currency-specific balances, withdrawal protection against negative dated balances, and a responsive savings screen.
- Phase 3 liabilities: typed debt records with original/opening balances and optional terms, dated repayments split into principal and interest/fees, exact outstanding balances by currency, payoff status, concurrent overpayment protection, and a responsive liability screen. Interest is not accrued automatically.
- Phase 3 goals: currency-specific targets, optional target dates and descriptions, dated contribution/withdrawal history, progress tracking, completion status, and protection against negative dated balances.
- Phase 3 net worth: current tracked savings less outstanding liability principal, grouped by original currency, plus immutable dated snapshots generated from balances as of the selected date. No FX conversion, cash, property, or investments are included.
- Phase 3 payday routines: reusable fixed-amount actions per salary source for savings, goals, and liabilities; routine entries are created when salary is confirmed, and users can record partial/completed actions or skip them after performing any external transfer. Routine completion records the matching financial transaction; no money is moved automatically.

## Local verification

- `pnpm.cmd typecheck` passes across all workspaces.
- `pnpm.cmd --filter @pf/api test` passes all API unit tests.
- `pnpm.cmd build` succeeds for the API, worker, and web app.
- `node --env-file=.env --test tests/integration/identity.test.mjs` covers identity, categories, income, expenses, recurring confirmations, budgets, cash flow, savings, liabilities, financial goals, net-worth snapshots, payday routines, and cross-space privacy checks.
- The foundation, category, income, expense, recurring-record, budget, savings, liability, financial-goal, net-worth snapshot, and payday-routine migrations are applied to the local development database.

## Remaining work

- Phase 3 wealth foundation slices are implemented locally. Later phases: investments, deterministic analytics, planning, household finance, notifications, and production hardening.
- Staging deployment, browser-based end-to-end coverage, operational monitoring, backup/restore exercises, and production setup are not complete.

See [delivery phases](delivery-phases.txt) for the planned sequence and acceptance criteria. Do not treat this local development slice as production-ready.
