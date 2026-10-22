# Playground BFF and Protocol Tap. Build context: the repository root (needs packages/shared and catalog/).
# Runs the TypeScript sources with tsx; no build step.
FROM node:22-alpine
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/playground-bff/package.json apps/playground-bff/
RUN pnpm install --frozen-lockfile --prod --filter @playground/bff...
COPY packages/shared packages/shared
COPY catalog catalog
COPY apps/playground-bff apps/playground-bff
WORKDIR /repo/apps/playground-bff
# A new named volume mounted here inherits this ownership, so the BFF can save runs as `node`.
RUN mkdir -p /data && chown node:node /data
ENV NODE_ENV=production PORT=3001 CATALOG_DIR=/repo/catalog
# 3001 REST + socket.io, 3002 Certify tap, 3003 Verify tap
EXPOSE 3001 3002 3003
USER node
CMD ["node_modules/.bin/tsx", "src/main.ts"]
