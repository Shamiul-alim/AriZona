# =============================================================================
# AniZora frontend - Next.js standalone
# =============================================================================
# Uses Next's `output: 'standalone'` build, which traces exactly the node_modules
# the server actually needs. The runtime image is therefore a fraction of the
# size of a naive copy of the whole dependency tree.
#
# NEXT_PUBLIC_* values are inlined into the client bundle at BUILD time, so they
# arrive as build args rather than runtime environment variables.
# =============================================================================

# --- Stage 1: dependencies ---------------------------------------------------
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
# The lockfile is produced on the developer's OS; npm install lets the Linux
# container resolve its own optional platform packages (e.g. @emnapi, swc).
RUN npm install --no-audit --no-fund

# --- Stage 2: build ----------------------------------------------------------
FROM node:22-alpine AS build
RUN apk add --no-cache libc6-compat
WORKDIR /app

ARG NEXT_PUBLIC_SITE_NAME=AniZora
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ARG NEXT_PUBLIC_API_URL=http://localhost:4000/api
ARG NEXT_PUBLIC_ADS_ENABLED=false
ARG NEXT_PUBLIC_ADSENSE_CLIENT_ID=
ARG NEXT_PUBLIC_ADSENSE_TEST_MODE=true
ARG NEXT_PUBLIC_VIDEO_ADS_ENABLED=false
ARG NEXT_PUBLIC_IMA_VAST_TAG_URL=
ARG NEXT_PUBLIC_ADSTERRA_ENABLED=false
ARG NEXT_PUBLIC_ADSTERRA_POPUNDER_SRC=
ARG NEXT_PUBLIC_ADSTERRA_FREQUENCY_HOURS=12

ENV NEXT_PUBLIC_SITE_NAME=$NEXT_PUBLIC_SITE_NAME \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_ADS_ENABLED=$NEXT_PUBLIC_ADS_ENABLED \
    NEXT_PUBLIC_ADSENSE_CLIENT_ID=$NEXT_PUBLIC_ADSENSE_CLIENT_ID \
    NEXT_PUBLIC_ADSENSE_TEST_MODE=$NEXT_PUBLIC_ADSENSE_TEST_MODE \
    NEXT_PUBLIC_VIDEO_ADS_ENABLED=$NEXT_PUBLIC_VIDEO_ADS_ENABLED \
    NEXT_PUBLIC_IMA_VAST_TAG_URL=$NEXT_PUBLIC_IMA_VAST_TAG_URL \
    NEXT_PUBLIC_ADSTERRA_ENABLED=$NEXT_PUBLIC_ADSTERRA_ENABLED \
    NEXT_PUBLIC_ADSTERRA_POPUNDER_SRC=$NEXT_PUBLIC_ADSTERRA_POPUNDER_SRC \
    NEXT_PUBLIC_ADSTERRA_FREQUENCY_HOURS=$NEXT_PUBLIC_ADSTERRA_FREQUENCY_HOURS \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# --- Stage 3: runtime --------------------------------------------------------
FROM node:22-alpine AS production
RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
