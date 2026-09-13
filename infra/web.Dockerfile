FROM node:24.21.0-alpine AS build
RUN npm install --global pnpm@10.33.4
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY backend/package.json backend/
RUN pnpm install --frozen-lockfile --filter web
COPY apps/web apps/web
RUN pnpm --filter web build

FROM caddy:2.11.4-alpine
COPY infra/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
