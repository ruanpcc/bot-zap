FROM node:18-slim

# Instala o Chromium e o FFmpeg nativos
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

CMD ["node", "index.js"]