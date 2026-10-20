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

# F04-FIX (C7): Don't chown /app/certs. Fresh Docker volumes inherit the
# image's directory ownership. If /app/certs is 1001:1001 in the image,
# the fresh volume is 1001:1001, and openssl (as root without DAC_OVERRIDE)
# can't write. Keep /app/certs root:root in the image, and let entrypoint
# chown it to 1001 AFTER cert generation.
RUN mkdir -p /app/data /app/certs /app/media && \
    chown -R app:app /app/data /app/media && \
    chown root:root /app/certs

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/forum.db
ENV MEDIA_ROOT=/app/media

ENTRYPOINT ["sh", "entrypoint.sh"]
CMD ["node", "server.js"]