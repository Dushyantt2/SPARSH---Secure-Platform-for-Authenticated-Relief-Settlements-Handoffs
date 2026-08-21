FROM node:20-alpine

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy application configuration and source code
COPY tsconfig.json ./
COPY src ./src
COPY data ./data

# Build TypeScript source code into dist/
RUN npm run build

# Copy runtime schema definition into compiled output location
RUN mkdir -p dist/db && cp src/db/schema.sql dist/db/schema.sql

EXPOSE 4000

ENV PORT=4000 \
    NODE_ENV=production

CMD ["npm", "start"]
