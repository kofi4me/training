FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-reportlab ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --chown=node:node . .
RUN mkdir -p /var/lib/kryptnet && chown node:node /var/lib/kryptnet
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4317 NETWORK_LAB_PYTHON=/usr/bin/python3 NETWORK_LAB_DATA_DIR=/var/lib/kryptnet
USER node
EXPOSE 4317
CMD ["node", "server.js"]
