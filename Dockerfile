# Next.js feedback app. Qdrant runs as its own service and Ollama stays on the
# host GPU, reached through host.docker.internal.
FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/prompts ./prompts
COPY --from=build --chown=node:node /app/ontology.json ./ontology.json
COPY --from=build --chown=node:node /app/ontology-v2.json ./ontology-v2.json
# The user script runs on Node's type stripping, straight from the sources.
COPY --from=build --chown=node:node /app/scripts/create-user.ts ./scripts/create-user.ts
COPY --from=build --chown=node:node /app/app/server/db ./app/server/db
COPY --from=build --chown=node:node /app/app/server/auth/access-code-helper.ts ./app/server/auth/access-code-helper.ts
COPY --from=build --chown=node:node /app/app/server/feedback/feedback-helper.ts ./app/server/feedback/feedback-helper.ts

RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "server.js"]
