# Macronomics API image. Build from the REPO ROOT (monorepo context):
#   docker build -f services/api/Dockerfile -t macronomics-api .
# Runtime needs DATABASE_URL (Supabase EU/Zurich pooler) injected as a secret.
FROM node:24-slim AS runtime

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NODE_ENV=production
RUN corepack enable

WORKDIR /app
COPY . .
# allowBuilds (pnpm-workspace.yaml) permits esbuild's prebuilt binary used by dev tooling.
RUN pnpm install --frozen-lockfile

EXPOSE 8787
ENV PORT=8787
# Node 24 runs the TypeScript entrypoint directly (native type stripping; no build step).
CMD ["node", "services/api/src/index.ts"]
