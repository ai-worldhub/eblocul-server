# syntax=docker/dockerfile:1

FROM node:24.21-alpine AS base
WORKDIR /opt/app

FROM base AS build
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --ignore-scripts --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json nest-cli.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
RUN npm run build

FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
    && npm rebuild @prisma/engines prisma

FROM base AS runtime
ENV NODE_ENV=production
ENV SERVER_PORT=3000
COPY package.json prisma.config.ts ./
COPY prisma ./prisma
COPY --from=prod-deps /opt/app/node_modules ./node_modules
COPY --from=build /opt/app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
