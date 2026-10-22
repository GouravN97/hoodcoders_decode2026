# Headless mock wallet. Build context: the repository root (needs packages/shared).
FROM node:22-alpine
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/mock-wallet/package.json apps/mock-wallet/
RUN pnpm install --frozen-lockfile --prod --filter @playground/mock-wallet...
COPY packages/shared packages/shared
COPY apps/mock-wallet apps/mock-wallet
WORKDIR /repo/apps/mock-wallet
ENV NODE_ENV=production PORT=7003
EXPOSE 7003
USER node
CMD ["node_modules/.bin/tsx", "src/main.ts"]
