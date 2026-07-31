# Demo image: builds the app, then migrates and seeds the database on start.
# Not a production image — it deliberately carries drizzle-kit and tsx so the
# container can bring an empty database up to a usable state by itself.

FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.10.0 --activate
WORKDIR /app

# Dependencies resolve from the lockfile alone, so this layer survives a source
# edit. `--frozen-lockfile` fails rather than silently resolving something else.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Inlined into the client bundle at build time, which is why it is an ARG and
# not only a runtime variable: NODE_ENV is production in this image, so without
# it the role picker and the test-parcel panel compile out.
ARG NEXT_PUBLIC_DEMO_MODE=true
ENV NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE

# The build never opens a connection — the pool is lazy — but drizzle.config.ts
# and client.ts both read the variable as they evaluate. A placeholder keeps the
# build independent of a running database.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Migrations and the seed run from the entrypoint, so the runtime keeps the full
# dependency tree: `output: "standalone"` would drop drizzle-kit and tsx.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json next.config.ts drizzle.config.ts ./
COPY drizzle ./drizzle
COPY src ./src
COPY utils ./utils

COPY docker/demo-entrypoint.sh /usr/local/bin/demo-entrypoint.sh
RUN chmod +x /usr/local/bin/demo-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/demo-entrypoint.sh"]
CMD ["pnpm", "start"]
