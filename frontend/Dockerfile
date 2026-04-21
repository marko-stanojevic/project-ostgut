# Build stage
FROM node:20-alpine3.22 AS builder

WORKDIR /app

RUN apk upgrade --no-cache

# NEXT_PUBLIC_* vars must be available at build time (baked into the JS bundle).
# AUTH_SECRET is NOT a build arg — it is injected at runtime via the container environment.
ARG NEXT_PUBLIC_API_URL=http://localhost:8080
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

ARG NEXT_PUBLIC_NEW_RELIC_ACCOUNT_ID
ARG NEXT_PUBLIC_NEW_RELIC_APPLICATION_ID
ARG NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY
ARG NEXT_PUBLIC_NEW_RELIC_TRUST_KEY
ARG NEXT_PUBLIC_NEW_RELIC_AGENT_ID
ENV NEXT_PUBLIC_NEW_RELIC_ACCOUNT_ID=$NEXT_PUBLIC_NEW_RELIC_ACCOUNT_ID
ENV NEXT_PUBLIC_NEW_RELIC_APPLICATION_ID=$NEXT_PUBLIC_NEW_RELIC_APPLICATION_ID
ENV NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY=$NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY
ENV NEXT_PUBLIC_NEW_RELIC_TRUST_KEY=$NEXT_PUBLIC_NEW_RELIC_TRUST_KEY
ENV NEXT_PUBLIC_NEW_RELIC_AGENT_ID=$NEXT_PUBLIC_NEW_RELIC_AGENT_ID

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Next standalone output can be either:
# - .next/standalone/server.js
# - .next/standalone/frontend/server.js
# Normalize to .next/standalone/server.js for the runtime image.
RUN if [ -f .next/standalone/server.js ]; then \
    true; \
    elif [ -f .next/standalone/frontend/server.js ]; then \
    cp -R .next/standalone/frontend/. .next/standalone/; \
    else \
    echo "standalone server.js not found" >&2; \
    exit 1; \
    fi

# Runtime stage
FROM gcr.io/distroless/nodejs20-debian12:nonroot

WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

CMD ["server.js"]
