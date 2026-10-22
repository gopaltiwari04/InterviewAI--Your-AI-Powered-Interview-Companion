# Evaluation worker image (AI evaluations, deadline sweeps). It never runs candidate code.
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
COPY . .
RUN pnpm install --frozen-lockfile --filter worker... \
 && pnpm --filter worker run build \
 && pnpm --filter worker deploy --prod /out \
 && cp -r apps/worker/dist /out/dist \
 && cp -r packages/database/prisma /out/prisma \
 && cd /out && npx prisma@5.22.0 generate --schema prisma/schema.prisma

FROM node:22-alpine
RUN apk add --no-cache openssl
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out .
USER node
EXPOSE 8091
CMD ["node", "--enable-source-maps", "dist/index.js"]
