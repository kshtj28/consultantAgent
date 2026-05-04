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
ENV PORT=80
ENV BACKEND_URL=http://backend:3001

# Copy custom nginx config to templates directory so envsubst can process it
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Copy built files
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose port (can be overridden by PORT env var)
EXPOSE $PORT

# Health check (uses localhost:PORT)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:$PORT || exit 1

# Start nginx (alpine image automatically processes templates on startup)
CMD ["nginx", "-g", "daemon off;"]
