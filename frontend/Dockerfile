# Build stage
FROM node:20-alpine3.22 AS builder

WORKDIR /app

RUN apk upgrade --no-cache

ARG NEXT_PUBLIC_API_URL=http://localhost:8080
ARG AUTH_SECRET

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV AUTH_SECRET=$AUTH_SECRET

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Runtime stage
FROM gcr.io/distroless/nodejs20-debian12:nonroot

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_PUBLIC_API_URL=http://backend:8080

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

CMD ["server.js"]
