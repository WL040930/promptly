# Multi-stage build: front-end assets + API runtime
FROM node:20-alpine AS base
WORKDIR /app

# Install all deps (incl. dev) for building
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# Build the React app
FROM deps AS build
COPY . .
RUN npm run build

# Install only production deps for runtime
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy server code and built UI assets
COPY --from=build /app/packages/cli ./packages/cli
COPY --from=build /app/packages/ui/dist ./packages/ui/dist

# Drop privileges for runtime
USER node

EXPOSE 3000
CMD ["node", "packages/cli/server.js"]
