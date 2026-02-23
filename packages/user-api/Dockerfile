FROM node:18-alpine AS base
WORKDIR /app

# Copy root workspace files
COPY package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/user-api/package.json packages/user-api/

RUN npm install --workspace=packages/user-api --workspace=packages/shared

COPY packages/shared/ packages/shared/
COPY packages/user-api/ packages/user-api/

EXPOSE 5000
CMD ["node", "packages/user-api/src/server.js"]
