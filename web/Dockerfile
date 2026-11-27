# Build from the repository root: docker build -f web/Dockerfile -t crm-mcp-console .
FROM node:22-alpine AS server
WORKDIR /srv
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS web
WORKDIR /srv/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web .
RUN npm run build

FROM node:22-alpine
WORKDIR /srv
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 \
    MCP_SERVER_ENTRY=/srv/server/dist/index.js CRM_DATA=/srv/server/data/crm.json
COPY --from=server /srv/dist server/dist
COPY --from=server /srv/node_modules server/node_modules
COPY --from=server /srv/package.json server/package.json
COPY data server/data
COPY --from=web /srv/web/.next/standalone web
COPY --from=web /srv/web/.next/static web/.next/static
USER node
EXPOSE 3000
CMD ["node", "web/server.js"]
