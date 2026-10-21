# Cloud deployment

## Target layout

- **Vercel:** Next.js web app
- **Railway:** NestJS API, persistent email worker, and Redis in one project/environment
- **Neon:** PostgreSQL
- **Cloudflare R2:** object storage when media upload support is implemented

This guide prepares the project for that layout. It does not create provider accounts or deploy services. The application does not currently upload media, so R2 is not wired into the app yet.

## Vercel web app

Create a Vercel project from this repository and set its **Root Directory** to `apps/web`. Keep the repository's pnpm lockfile and workspace files available to the build. Select Node.js 24.

Set this build environment variable in Vercel:

| Variable | Value |
| --- | --- |
| `API_INTERNAL_URL` | The public HTTPS origin of the Railway API, with no trailing slash, e.g. `https://your-api.up.railway.app` |

The Next.js rewrite forwards browser requests from `/api/*` to this API origin, keeping requests same-origin from the browser's perspective. Redeploy the Vercel app after changing this variable. Configure the production Vercel domain and use that exact HTTPS origin for the API's `WEB_ORIGIN`.

## Railway project

Create one Railway project with API, worker, and Redis services in the same environment and region. Keep both application services at the repository root so the workspace packages and root Dockerfile are available. The existing root Dockerfile builds the monorepo and starts the API by default.

### API service

- Use the repository root as the source/root directory and build with the root `Dockerfile`.
- Expose the service publicly over HTTPS and generate or attach a domain.
- Configure the health check path as `/health/ready`.
- Set these variables:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `WEB_ORIGIN` | The exact Vercel production origin, e.g. `https://your-app.vercel.app` |
| `DATABASE_URL` | Neon pooled connection string, with TLS required |
| `REDIS_URL` | Railway private Redis connection string, referenced from the Redis service |
| `SMTP_HOST` | Hostname from your production email provider |
| `SMTP_PORT` | Port provided by your email provider |
| `SMTP_FROM` | Verified sender address |
| `SMTP_USER` / `SMTP_PASSWORD` | Credentials if required by the SMTP provider |

Railway provides the listening port in `PORT`; the API now uses it and falls back to `API_PORT` for local development.

### Worker service

- Use the same repository root and Dockerfile.
- Override the start command to `node apps/worker/dist/main.js`.
- Set `NODE_ENV=production`, `DATABASE_URL`, `REDIS_URL`, and the same SMTP variables as the API.
- Do not assign the worker a public domain; it does not accept inbound HTTP traffic.

### Redis service

Provision Railway Redis in the same project, environment, and region. Keep it private. Set `REDIS_URL` on both the API and worker using Railway's reference to the Redis service's URL; never copy credentials into source control. The worker uses BullMQ and requires a Redis-compatible service.

## Neon PostgreSQL

Create a Neon database and set `DATABASE_URL` on both Railway application services. Use the pooled connection string for application connections and require TLS. Keep the connection string in provider secrets, not in the repository.

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
- Confirm the API's `WEB_ORIGIN` exactly matches the deployed frontend origin.
- Confirm API and worker can connect to Neon, and API and worker can connect to Railway Redis privately.
- Verify email delivery, account verification, and password reset using the real SMTP provider.
- Verify `/health/ready`, login/session cookies, and the `/api` frontend proxy on the deployed domains.
- Set billing alerts and usage limits; Free-plan credits and resource limits do not guarantee continuous service.
- Configure database backups, monitoring, log retention, and an operational recovery plan before treating the app as production-ready.
