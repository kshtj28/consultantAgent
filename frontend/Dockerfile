# Frontend Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm using corepack
RUN corepack enable && corepack prepare pnpm@latest --activate

# Fix for "SELF_SIGNED_CERT_IN_CHAIN" error in environments with SSL-inspecting proxies
RUN npm config set strict-ssl false && pnpm config set strict-ssl false

# Copy package files
COPY package*.json pnpm-lock.yaml ./
COPY tsconfig*.json ./
COPY vite.config.ts ./

# Install dependencies
RUN pnpm install

# Copy source code
COPY src ./src
COPY index.html ./

# Build for production
RUN pnpm run build

# Production stage - serve with nginx
FROM nginx:alpine AS production

# Default environment variables
# PORT=3000 matches Railway's default network target — set matching PORT in Railway env vars
ENV PORT=3000
ENV BACKEND_URL=http://localhost:3001

# Copy nginx config template
COPY nginx.conf /etc/nginx/nginx.conf.template

# Copy built files
COPY --from=builder /app/dist /usr/share/nginx/html

# EXPOSE tells Railway which port to route traffic to (must match PORT above)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3000}/ || exit 1

# Explicitly run envsubst on only our two vars, then start nginx
CMD ["/bin/sh", "-c", "envsubst '${PORT} ${BACKEND_URL}' < /etc/nginx/nginx.conf.template > /etc/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'"]
