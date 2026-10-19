# ---------- Stage 1: builder ----------
FROM node:22-alpine AS builder

# SQLCipher (better-sqlite3-multiple-ciphers) needs these to compile.
RUN apk add --no-cache python3 make g++ openssl-dev

WORKDIR /app
COPY package*.json ./
RUN npm ci

# ---------- Stage 2: runtime ----------
FROM node:22-alpine AS runtime

RUN apk add --no-cache openssl vips su-exec

# Fixed UID/GID 1001 for the app user.
RUN addgroup -g 1001 -S app && adduser -u 1001 -S app -G app

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY server.js ./
COPY entrypoint.sh ./

RUN mkdir -p /app/data /app/certs /app/media && chown -R app:app /app

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/forum.db
ENV MEDIA_ROOT=/app/media

ENTRYPOINT ["sh", "entrypoint.sh"]
CMD ["node", "server.js"]