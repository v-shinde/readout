FROM node:18-alpine AS base
WORKDIR /app

# Copy root workspace files
COPY package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/ai-engine/package.json packages/ai-engine/

RUN npm install --workspace=packages/ai-engine --workspace=packages/shared

COPY packages/shared/ packages/shared/
COPY packages/ai-engine/ packages/ai-engine/

EXPOSE 5002
CMD ["node", "packages/ai-engine/src/server.js"]
