# VisionBharat — DataGenesis 2026
# Multi-stage Dockerfile for Next.js

# Stage 1: Production dependencies only
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Stage 2: Build (needs devDependencies for Tailwind/PostCSS)
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
# Provide dummy DATABASE_URL for build-time route compilation
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/visionbharat
RUN npm run build

# Stage 3: Production
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy production node_modules (no devDependencies)
COPY --from=deps /app/node_modules ./node_modules

# Copy standalone build output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Create runtime directories for persistent data
RUN mkdir -p uploads checkpoints reports logs datasets exports/kaggle && \
    chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
