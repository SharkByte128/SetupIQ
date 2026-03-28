FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/

RUN npm install --workspace=packages/shared --workspace=apps/web

COPY packages/shared/ packages/shared/
RUN npm run build --workspace=packages/shared

ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

COPY apps/web/ apps/web/
RUN npm run build --workspace=apps/web

# ── Serve with Caddy ──────────────────────────────────────
FROM caddy:2-alpine
COPY --from=build /app/apps/web/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
