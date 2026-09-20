# =============================================================================
# AniZora backend - NestJS + Prisma
# =============================================================================
# Multi-stage so the runtime image carries no build toolchain and no dev
# dependencies. Prisma's engines need OpenSSL, which is why the Alpine images
# install libc6-compat / openssl explicitly.
# =============================================================================

# --- Stage 1: dependencies ---------------------------------------------------
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json package-lock.json* ./
COPY prisma ./prisma
# The lockfile is produced on the developer's OS; npm install lets the Linux
# container resolve its own optional platform packages (e.g. @emnapi, swc).
RUN npm install --no-audit --no-fund

# --- Stage 2: build ----------------------------------------------------------
FROM node:22-alpine AS build
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npx prisma generate
RUN npm run build

# The seed is compiled to plain JS so it can run in the production image,
# which does not carry ts-node.
RUN npx tsc prisma/seed.ts prisma/seed-art.ts prisma/seed-data.ts --outDir dist-seed --module commonjs --target es2022 --esModuleInterop --skipLibCheck --resolveJsonModule

# Drop dev dependencies from the tree we are about to copy forward.
RUN npm prune --omit=dev

# --- Stage 3: runtime --------------------------------------------------------
FROM node:22-alpine AS production
RUN apk add --no-cache libc6-compat openssl tini
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Run as a non-root user.
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001

COPY --from=build --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nestjs:nodejs /app/dist ./dist
COPY --from=build --chown=nestjs:nodejs /app/prisma ./prisma
COPY --from=build --chown=nestjs:nodejs /app/package.json ./package.json
COPY --from=build --chown=nestjs:nodejs /app/dist-seed ./dist-seed
# Demo media is baked into the image and copied into the uploads volume on
# first start (the volume would otherwise hide it).
COPY --from=build --chown=nestjs:nodejs /app/storage/uploads/demo ./demo-media

# Uploads live on a volume; create it up front so permissions are correct.
RUN mkdir -p /app/storage/uploads && chown -R nestjs:nodejs /app/storage

COPY --chown=nestjs:nodejs docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

USER nestjs
EXPOSE 4000

# tini reaps zombies and forwards signals, so the container stops cleanly.
ENTRYPOINT ["/sbin/tini", "--", "/app/docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
