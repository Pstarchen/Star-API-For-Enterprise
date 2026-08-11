ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM dependencies AS prisma-client
ARG PRISMA_ENGINES_MIRROR
ENV PRISMA_ENGINES_MIRROR=${PRISMA_ENGINES_MIRROR}
COPY prisma ./prisma
RUN npx prisma generate

FROM base AS builder
COPY --from=prisma-client /app/node_modules ./node_modules
COPY . .
ENV DATABASE_URL="postgresql://starapi:build-only@postgres:5432/starapi?schema=public"
RUN npm run build

FROM dependencies AS migrator
COPY prisma ./prisma
COPY --chmod=755 scripts/docker-entrypoint.sh /usr/local/bin/star-api-entrypoint
ENTRYPOINT ["/usr/local/bin/star-api-entrypoint"]
CMD ["npx", "prisma", "migrate", "deploy"]

FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs nextjs \
    && mkdir -p /var/lib/star-api/assets \
    && chown -R nextjs:nodejs /var/lib/star-api

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --chown=nextjs:nodejs scripts/show-install-token.mjs ./scripts/show-install-token.mjs
COPY --chmod=755 scripts/docker-entrypoint.sh /usr/local/bin/star-api-entrypoint
COPY --chmod=755 scripts/init-deployment-secrets.sh /usr/local/bin/star-api-init-secrets

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/star-api-entrypoint"]
CMD ["node", "server.js"]
