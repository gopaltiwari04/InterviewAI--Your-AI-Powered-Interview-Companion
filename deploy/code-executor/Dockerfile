# Judge worker image. It starts sandbox containers through the host Docker
# daemon, so it needs /var/run/docker.sock mounted. That gives this container
# control of the host's Docker, which is why production should prefer running
# the executor directly on a dedicated VM (see interviewai-executor.service).
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
COPY . .
RUN pnpm install --frozen-lockfile --filter code-executor... \
 && pnpm --filter code-executor run build \
 && pnpm --filter code-executor deploy --prod /out \
 && cp -r apps/code-executor/dist /out/dist

FROM node:22-alpine
RUN apk add --no-cache docker-cli
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out .
EXPOSE 8090
CMD ["node", "--enable-source-maps", "dist/index.js"]
