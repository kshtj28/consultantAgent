# Frontend Dockerfile
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm using corepack
RUN corepack enable && corepack prepare pnpm@10 --activate

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

# BACKEND_URL default — override in Railway with the real backend URL.
# The entrypoint script auto-adds https:// if the scheme is omitted.
ENV BACKEND_URL=http://localhost:3001

# Replace base nginx.conf with a non-root-safe version (no "user nginx;" directive)
COPY nginx-main.conf /etc/nginx/nginx.conf

# Copy nginx server-block template (port hardcoded to 3000 inside the file)
COPY nginx.conf /etc/nginx/nginx.conf.template

# Copy and enable the entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Copy built files
COPY --from=builder /app/dist /usr/share/nginx/html

# Railway routes traffic to port 3000 — nginx listens on 3000 (hardcoded in nginx.conf)
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["/docker-entrypoint.sh"]
