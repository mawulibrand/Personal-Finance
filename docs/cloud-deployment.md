# Cloud deployment

## Target layout

- **Vercel:** Next.js web app
- **Vercel:** NestJS API as a serverless function
- **DigitalOcean App Platform:** persistent email worker
- **DigitalOcean Managed Valkey:** Redis-compatible queue backend for BullMQ
- **Neon:** PostgreSQL
- **Cloudflare R2:** object storage when media upload support is implemented

This guide prepares the project for that layout. It does not create provider accounts or deploy services. The API writes email messages to the PostgreSQL outbox; the DigitalOcean worker polls the outbox and uses Valkey for BullMQ. The API does not need Redis. The application does not currently upload media, so R2 is not wired into the app yet.

## Vercel web app

Create a Vercel project from this repository and set its **Root Directory** to `apps/web`. Keep the repository's pnpm lockfile and workspace files available to the build. Select Node.js 24.

In **Project Settings → Build and Deployment**, use:

- **Framework Preset:** Next.js
- **Install Command field only:** `pnpm install --frozen-lockfile`
- **Build Command field only:** leave the default Next.js build command, or enter `pnpm --filter @pf/web build` if a custom command is required
- **Output Directory:** leave the default; do not override it

Enter each command in its own field. Do not paste both commands as a comma-separated list, include Markdown backticks, or put the build command in the Install Command field.

Do not use `npm install --prefix=../..` as the install command. The repository root package does not depend on Next.js; Next.js is a dependency of the `@pf/web` workspace. Installing the pnpm workspace from the app root lets pnpm discover the root `pnpm-workspace.yaml` and install the web package's dependencies from the shared lockfile.

Set this build environment variable in the Vercel web project:

| Variable | Value |
| --- | --- |
| `API_INTERNAL_URL` | The public HTTPS origin of the Vercel API project, with no trailing slash, e.g. `https://your-api.vercel.app` |

The Next.js rewrite forwards browser requests from `/api/*` to this API origin, keeping requests same-origin from the browser's perspective. Redeploy the web app after changing this variable.

### Troubleshooting `NEXT_NO_VERSION`

If the build log shows `npm install --prefix=../..` followed by `No Next.js version detected`, replace the Vercel project's custom **Install Command** with `pnpm install --frozen-lockfile`, verify the root directory is `apps/web`, then redeploy with the same commit. The warning about npm's `cache-dir` setting is not the cause of this error.

## Vercel API project

Create a second Vercel project from the same repository for the API. Set its **Root Directory** to `apps/api`, select **NestJS** as the framework preset (or leave auto-detection enabled), and select Node.js 24. Use:

- **Install Command field only:** `pnpm install --frozen-lockfile`
- **Build Command field only:** `pnpm --filter @pf/api build`
- **Output Directory:** leave the default

Enter the commands as plain text with no Markdown backticks, quotes, commas, or prompt/output characters such as `>`. Do not combine the install and build commands in one field.

Keep the pnpm workspace and root lockfile available to the build. The API build script builds `@pf/database` first, which generates the Prisma client and the shared package output. Prisma client generation uses a local placeholder datasource URL when no `DATABASE_URL` is set; it does not connect to the database. Migration commands still require the real Neon `DATABASE_URL`. Vercel supports NestJS as a serverless function and detects the API entrypoint at `src/main.ts`.

The API imports Helmet as a module namespace and calls its declared `default` export explicitly. This avoids Vercel's TypeScript check treating the default import as the module namespace rather than the middleware function.

Set these Vercel environment variables on the API project:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `WEB_ORIGIN` | Exact HTTPS origin of the Vercel web app, e.g. `https://your-app.vercel.app` |
| `DATABASE_URL` | Neon pooled PostgreSQL connection string, with TLS required |

Set `API_INTERNAL_URL` in the web project's production environment to the API project's public Vercel origin. Deploy the API first so its domain is available, then set the web variable and redeploy the web project.

The API must have `WEB_ORIGIN` set to the web app's exact production origin because it validates request origins and configures credentialed CORS. Preview deployments need matching API `WEB_ORIGIN` configuration; do not broaden the origin check to arbitrary domains.

## DigitalOcean App Platform worker

Create a DigitalOcean App Platform app from the GitHub repository. Add a **Worker** component (not a web service) for the email worker:

- Use the repository root as the source directory so the workspace packages and root `Dockerfile` are included.
- Build with the root `Dockerfile`; it compiles the worker along with the monorepo.
- Set the worker run command to `node apps/worker/dist/main.js`.
- Do not expose a public HTTP route for the worker.

Set these runtime environment variables on the worker:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | The same Neon pooled PostgreSQL connection string |
| `REDIS_URL` | TLS connection URL for DigitalOcean Managed Valkey |
| `SMTP_HOST` | Hostname from your production email provider |
| `SMTP_PORT` | Port specified by that provider |
| `SMTP_FROM` | Verified sender address |
| `SMTP_USER` / `SMTP_PASSWORD` | Credentials if required by the SMTP provider |

Create a DigitalOcean Managed Valkey cluster and allow network access from the App Platform worker. Use Valkey's TLS connection details to form `REDIS_URL` (`rediss://...`); keep credentials in DigitalOcean's encrypted environment variables. The application uses BullMQ, which needs a Redis-compatible service.

## Neon PostgreSQL

Create a Neon database and set `DATABASE_URL` on the Vercel API and DigitalOcean worker. Use the pooled connection string for application connections and require TLS. Keep the connection string in provider secrets, not in the repository.

Apply schema migrations before routing production traffic:

```powershell
$env:DATABASE_URL = "<Neon pooled connection string>"
pnpm.cmd db:deploy
```

Run this from the repository root after installing dependencies. Do not run development migrations against production.

## Cloudflare R2

R2 is reserved for future media uploads. No current feature reads or writes object storage, so do not configure or store R2 access keys yet. When media support is implemented, use a private bucket, least-privilege credentials, and short-lived signed upload/download URLs rather than exposing bucket credentials to browsers.

## Before launch

- Use separate provider environments and secrets for previews/staging and production.
- Confirm the API's `WEB_ORIGIN` exactly matches the deployed frontend origin and the web rewrite reaches the API deployment.
- Confirm both API and worker can connect to Neon, and the DigitalOcean worker can connect to Valkey over TLS.
- Verify email delivery, account verification, and password reset using the real SMTP provider.
- Verify `/health/ready`, login/session cookies, and the `/api` frontend proxy on the deployed Vercel domains.
- Set billing alerts and usage limits; Free-plan credits and resource limits do not guarantee continuous service.
- Configure database backups, monitoring, log retention, and an operational recovery plan before treating the app as production-ready.

Provider references: [NestJS on Vercel](https://vercel.com/docs/frameworks/backend/nestjs), [DigitalOcean App Platform workers](https://docs.digitalocean.com/products/app-platform/how-to/manage-workers/), and [DigitalOcean Managed Valkey](https://docs.digitalocean.com/products/databases/valkey/).
