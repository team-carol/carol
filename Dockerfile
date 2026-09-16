# Stage 1: Compile TypeScript
FROM node:22-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

# Stage 2: Production
FROM node:22-slim AS production
ARG BUILD_VERSION=local
ARG RELEASE_VERSION=0.0.0
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
# ffmpeg: 채보 풀영상(MP4/H.264) 인코딩용. python3/make/g++ 는 네이티브 모듈 빌드에만
# 필요하므로 설치 후 제거하되, ffmpeg 는 런타임에 남긴다.
RUN npm ci --omit=dev && apt-get purge -y python3 make g++ && apt-get autoremove -y \
  && apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/dist/ ./dist/
VOLUME ["/app/data"]
ENV NODE_ENV=production
ENV DATA_DIR=/app/data
ENV BUILD_VERSION=${BUILD_VERSION}
ENV RELEASE_VERSION=${RELEASE_VERSION}
CMD ["node", "dist/bot/index.js"]
