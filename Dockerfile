# --- Stage 1: Build hactool from source ---
FROM debian:bookworm-slim AS builder
RUN apt-get update && apt-get install -y git make gcc libssl-dev
RUN git clone https://github.com/SciresM/hactool.git /src
WORKDIR /src
RUN cp config.mk.template config.mk && make

# --- Stage 2: Node.js Runner ---
FROM node:20-slim

# Install Python 3 and libssl (required by hactool at runtime)
RUN apt-get update && apt-get install -y python3 libssl3 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package configurations and install production dependencies
COPY package.json ./
RUN npm install --only=production

# Copy application files
COPY server.js scanner_helper.py ./
COPY public/ ./public/

# Copy compiled hactool binary from Stage 1
COPY --from=builder /src/hactool ./bin/hactool
COPY --from=builder /src/hactool /usr/local/bin/hactool
RUN chmod +x ./bin/hactool /usr/local/bin/hactool

# Ensure folders exist and are writable for any user
RUN mkdir -p /app/public/cache /app/db /config /games /tmp && chmod -R 777 /app /tmp

# Default environment variables
ENV PORT=3000
ENV GAMES_DIR=/games
ENV KEYS_PATH=/config/prod.keys
ENV DB_PATH=/config/games_db.json

EXPOSE 3000

CMD ["node", "server.js"]
