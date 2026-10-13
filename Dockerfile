FROM node:24.16.0-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
# Generation needs a datasource URL, but does not connect to the database.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN pnpm build

FROM node:24.16.0-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000 4000
# Override with node apps/worker/dist/main.js for the worker.
CMD ["node", "apps/api/dist/main.js"]
