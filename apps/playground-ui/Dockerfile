# Playground UI: built in mock mode by default (MSW serves the API in the browser and runs are simulated),
# because the real BFF does not exist yet. Build with --build-arg VITE_USE_MOCKS=false to call the BFF,
# which nginx proxies on the same origin.
# Build context: the repository root (the UI needs packages/shared and catalog/*.yaml).

FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/playground-ui/package.json apps/playground-ui/
COPY apps/playground-bff/package.json apps/playground-bff/
RUN pnpm install --frozen-lockfile
COPY packages/shared packages/shared
COPY catalog catalog
COPY apps/playground-ui apps/playground-ui
ARG VITE_USE_MOCKS=true
ARG VITE_BFF_URL=
ENV VITE_USE_MOCKS=$VITE_USE_MOCKS VITE_BFF_URL=$VITE_BFF_URL
RUN pnpm --filter @playground/ui build

FROM nginx:stable
COPY apps/playground-ui/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/playground-ui/dist /usr/share/nginx/html
EXPOSE 80
