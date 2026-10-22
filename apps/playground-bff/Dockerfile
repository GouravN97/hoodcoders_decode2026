# Placeholder BFF: no dependencies, Node runs the TypeScript source directly (type stripping, Node 22.18+).
FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
ENV NODE_ENV=production PORT=3001
EXPOSE 3001
USER node
CMD ["node", "--disable-warning=ExperimentalWarning", "src/main.ts"]
