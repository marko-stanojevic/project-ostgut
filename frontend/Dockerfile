# Build stage
FROM node:20-alpine3.22 AS builder

WORKDIR /app

RUN apk upgrade --no-cache

# NEXT_PUBLIC_* vars must be available at build time (baked into the JS bundle).
# AUTH_SECRET is NOT a build arg — it is injected at runtime via the container environment.
ARG NEXT_PUBLIC_API_URL=http://localhost:8080
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Runtime stage
FROM gcr.io/distroless/nodejs20-debian12:nonroot

WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./frontend/.next/static

WORKDIR /app/frontend

EXPOSE 3000

CMD ["server.js"]
