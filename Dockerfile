# 前端 build + API 伺服器，單一容器部署
FROM node:22-alpine AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY public public
COPY src src
COPY shared shared
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci --omit=dev
COPY server server
COPY shared shared
COPY --from=web /app/dist dist
ENV NODE_ENV=production PORT=3000 UPLOAD_DIR=/data/uploads
VOLUME /data
EXPOSE 3000
CMD ["node", "server/src/index.js"]
