FROM node:18-alpine AS base
WORKDIR /app

# Copy root workspace files
COPY package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/scraper/package.json packages/scraper/

RUN npm install --workspace=packages/scraper --workspace=packages/shared

COPY packages/shared/ packages/shared/
COPY packages/scraper/ packages/scraper/

EXPOSE 5003
CMD ["node", "packages/scraper/src/server.js"]
