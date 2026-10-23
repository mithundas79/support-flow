FROM node:22.20.0-alpine3.22
WORKDIR /fixture
COPY automation/fixture-provider/server.mjs ./server.mjs
USER node
EXPOSE 4010 1025
CMD ["node", "server.mjs"]
