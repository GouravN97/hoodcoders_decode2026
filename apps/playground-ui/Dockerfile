# Playground UI. VITE_USE_MOCKS=false (what injistack/docker-compose.yml builds) calls the BFF, which nginx
# proxies on the same origin; true builds the in-browser mock mode (MSW serves the API, runs are simulated).
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
