FROM node:24-alpine AS base
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

RUN npm install --workspace=packages/shared --workspace=apps/api

COPY packages/shared/ packages/shared/
RUN npm run build --workspace=packages/shared

COPY apps/api/ apps/api/
COPY docs/ docs/
RUN npm run build --workspace=apps/api

FROM node:24-alpine
WORKDIR /app

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages/shared/dist ./packages/shared/dist
COPY --from=base /app/packages/shared/package.json ./packages/shared/
COPY --from=base /app/apps/api/dist ./apps/api/dist
COPY --from=base /app/apps/api/src/admin/panel.html ./apps/api/dist/admin/panel.html
COPY --from=base /app/apps/api/package.json ./apps/api/
COPY --from=base /app/docs ./docs
COPY --from=base /app/package.json ./

EXPOSE 3001
CMD ["node", "apps/api/dist/server.js"]
