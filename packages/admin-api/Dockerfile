FROM node:18-alpine AS base
WORKDIR /app

# Copy root workspace files
COPY package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/admin-api/package.json packages/admin-api/

RUN npm install --workspace=packages/admin-api --workspace=packages/shared

COPY packages/shared/ packages/shared/
COPY packages/admin-api/ packages/admin-api/

EXPOSE 5001
CMD ["node", "packages/admin-api/src/server.js"]
