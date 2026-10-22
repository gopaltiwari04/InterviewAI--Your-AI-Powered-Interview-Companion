# Realtime server image (an alternative to Render's native Node runtime).
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
COPY . .
RUN pnpm install --frozen-lockfile --filter ws-server... \
 && pnpm --filter ws-server run build \
 && pnpm --filter ws-server deploy --prod /out \
 && cp -r apps/ws-server/dist /out/dist

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out .
USER node
EXPOSE 8080
CMD ["node", "--enable-source-maps", "dist/index.js"]
