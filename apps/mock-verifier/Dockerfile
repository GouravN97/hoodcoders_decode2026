# Mock verifier. Build context: the repository root (needs packages/shared and packages/protocol-core).
FROM node:22-alpine
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/protocol-core/package.json packages/protocol-core/
COPY apps/mock-verifier/package.json apps/mock-verifier/
RUN pnpm install --frozen-lockfile --prod --filter @playground/mock-verifier...
COPY packages/shared packages/shared
COPY packages/protocol-core packages/protocol-core
COPY apps/mock-verifier apps/mock-verifier
WORKDIR /repo/apps/mock-verifier
ENV NODE_ENV=production PORT=7004 BASE_PATH=/mock-verifier
EXPOSE 7004
USER node
CMD ["node_modules/.bin/tsx", "src/main.ts"]
