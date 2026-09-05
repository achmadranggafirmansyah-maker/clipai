FROM node:20-bookworm-slim

# ffmpeg untuk proses render clip, python3+pip untuk yt-dlp, curl untuk healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp dipasang lewat pip (selalu bisa di-update terpisah dari image ini)
RUN pip3 install --no-cache-dir --break-system-packages yt-dlp

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .
RUN npm run build

# folder kerja sementara untuk download & hasil render
RUN mkdir -p /app/tmp /app/public/outputs

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "run", "start"]
