FROM node:18-alpine AS base
WORKDIR /app

# Copy root workspace files
COPY package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/notification-service/package.json packages/notification-service/

RUN npm install --workspace=packages/notification-service --workspace=packages/shared

COPY packages/shared/ packages/shared/
COPY packages/notification-service/ packages/notification-service/

EXPOSE 5004
CMD ["node", "packages/notification-service/src/server.js"]
