FROM node:26-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:26-alpine
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S cafino && adduser -S cafino -G cafino
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY migrations ./migrations
COPY scripts ./scripts
RUN mkdir -p /data/uploads && chown -R cafino:cafino /data
ENV UPLOAD_DIR=/data/uploads
USER cafino
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=4s --start-period=20s CMD wget -qO- http://127.0.0.1:8080/readyz || exit 1
CMD ["node", "src/index.js"]
