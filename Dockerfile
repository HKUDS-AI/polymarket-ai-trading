# Polymarket Trading System — Node.js (API + paper trader)
FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p /app/data /app/logs \
    /app/data/recordings_conservative \
    /app/data/recordings_moderate \
    /app/data/recordings_aggressive

RUN node scripts/init-databases.mjs || true

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://127.0.0.1:8000/api/health || exit 1

CMD ["node", "scripts/start-all.mjs"]
