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
- Phase 3 net worth: current tracked savings and valued investments less outstanding liability principal, grouped by original currency, plus immutable dated snapshots generated from balances as of the selected date. No FX conversion, cash, or property is included.
- Phase 3 payday routines: reusable fixed-amount actions per salary source for savings, goals, and liabilities; routine entries are created when salary is confirmed, and users can record partial/completed actions or skip them after performing any external transfer. Routine completion records the matching financial transaction; no money is moved automatically.
- Phase 4 investments: investment accounts and holdings, dated BUY/CONTRIBUTION/SELL/WITHDRAWAL/income/fee/tax records, manual valuations, quantity × price valuations from dated unit balances, contractual simple/compound fixed deposits, expected and actual maturity values, and valuation history. Contract values are calculated with actual/365 day counting, using annual, semiannual, quarterly, monthly, or daily compounding; projected maturity valuations remain distinct from actual payout valuations. Valued holdings contribute to net-worth totals in their original currency; no FX conversion or trades are performed.
- Phase 5 portfolio intelligence: per-currency absolute and percentage return, bounded XIRR, flow-adjusted time-weighted return, allocation, top-holding concentration, HHI/effective holding count, annualized volatility when enough valid periods exist, contribution/income/fee analysis, fixed-deposit maturity exposure, and comparable historical valuation changes. Every metric includes its formula, input data, period, limitations, and freshness; insufficient results are marked `NOT_ENOUGH_DATA`. TWR excludes periods with external capital flows when intermediate valuations are unavailable.
- Phase 6 scenario planning (initial slice): saved, comparable scenarios with weekly, biweekly, monthly, or yearly contributions; configurable starting capital, expected return, duration, inflation, and annual contribution growth; nominal and inflation-adjusted projections; and one-time conversion to a goal-linked plan. Return assumptions are estimates, never guarantees, and projected starting capital is not recorded as actual contributions.
- Phase 7 rule-based financial reviews: private profile snapshots summarize three complete months of base-currency income and expenses, tracked savings, estimated emergency-fund coverage, net worth by currency, freshness, and limitations. Seeded, transparent rules generate possible strategies with observed values; users can select, modify, reject, or give feedback. Selected or modified strategies can be converted once to goal-linked plans using explicit user-supplied projection assumptions. Conversion is recorded on the plan, and actual goal contributions remain separate from projections. All results are deterministic and do not change authoritative calculations. AI and external AI services are out of project scope.
- Workspace navigation uses a dedicated vertical scroll region on desktop and mobile so long dashboard pages remain accessible while the sidebar/mobile navigation stays available.

## Local verification

- `pnpm.cmd typecheck` passes across all workspaces.
- `pnpm.cmd --filter @pf/api test` passes all API unit tests.
- `pnpm.cmd build` succeeds for the API, worker, and web app.
- `node --env-file=.env --test tests/integration/identity.test.mjs` covers identity, categories, income, expenses, recurring confirmations, budgets, cash flow, savings, liabilities, financial goals, net-worth snapshots, payday routines, investment transactions and valuations, portfolio analytics, fixed-deposit maturity, strategy-to-plan conversion, and cross-space privacy checks.
- Portfolio analytics unit tests verify a known-value XIRR and portfolio return, TWR, allocation, concentration, diversification, currency separation, fixed-deposit maturity exposure, flow-related insufficient-data handling, and latest same-day valuation selection.
- Scenario unit and integration tests verify periodic projections, contribution growth, inflation adjustment, assumptions validation, scenario comparison, one-time conversion to a financial plan, and tracking against actual goal contributions.
- Financial review tests cover rule ordering, disabled rules, and insufficient profile data; integration verifies private review generation, historical profile aggregation, response and feedback handling, selected-strategy conversion with user-supplied assumptions, plan traceability, duplicate-conversion protection, monthly idempotency, and cross-space isolation.
- Investment valuations and fixed-deposit estimates use deterministic actual/365 day counting; simple interest uses `A = P(1 + rt)` and compound interest uses `A = P(1 + r/n)^(nt)`. Contract estimates stop at maturity and exclude provider-specific fees, taxes, and rounding. The expected maturity value is saved as a contractual valuation, separate from the actual payout valuation and recorded receipt.
- The foundation, category, income, expense, recurring-record, budget, savings, liability, financial-goal, net-worth snapshot, payday-routine, investment, financial-review, scenario-planning, and strategy-to-plan migrations are applied to the local development database.

## Remaining work

- Configurable rule management, more advanced scenario editing and financial-plan lifecycle features, household finance, notifications, and production hardening remain. AI/provider integration is not planned.
- Staging deployment, browser-based end-to-end coverage, operational monitoring, backup/restore exercises, and production setup are not complete.

See [delivery phases](delivery-phases.txt) for the planned sequence and acceptance criteria. Do not treat this local development slice as production-ready.
