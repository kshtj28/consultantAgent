# Frontend Dockerfile
FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10 --activate

RUN npm config set strict-ssl false && pnpm config set strict-ssl false

COPY package*.json pnpm-lock.yaml ./
COPY tsconfig*.json ./
COPY vite.config.ts ./

RUN pnpm install

COPY src ./src
COPY index.html ./

RUN pnpm run build

# Production stage
FROM nginx:alpine AS production

# Railway injects $PORT at runtime; 3000 is the fallback default
ENV PORT=3000
ENV BACKEND_URL=http://localhost:3001

# Store nginx config as a template — entrypoint substitutes PORT + BACKEND_URL at runtime
COPY nginx.conf /etc/nginx/nginx.conf.template

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3000}/ || exit 1

CMD ["/docker-entrypoint.sh"]
