# Build the single-file game, then serve it with a dependency-free Node server.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY scripts/build.mjs scripts/build.mjs
COPY src src
RUN node scripts/build.mjs --min

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/index.html ./index.html
COPY scripts/serve.mjs scripts/serve.mjs
USER node
EXPOSE 8080
CMD ["node", "scripts/serve.mjs"]
