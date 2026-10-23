FROM node:22.20.0-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN npm install --global npm@11.21.1 --ignore-scripts --audit=false --fund=false \
    && npm ci --ignore-scripts \
    && npm run build --workspace @support-flow/contracts \
    && npm run build --workspace @support-flow/core \
    && npm run build --workspace @support-flow/api \
    && node --input-type=module -e "await import('@support-flow/core'); await import('./apps/api/dist/app.js')"
FROM node:22.20.0-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api ./apps/api
COPY fixtures ./fixtures
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/index.js"]
