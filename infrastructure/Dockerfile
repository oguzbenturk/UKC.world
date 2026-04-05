# Multi-stage build for frontend
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --silent && \
    npm cache verify

# Copy source code and build
COPY . .
RUN npm run build

# Production stage with unprivileged nginx
FROM nginxinc/nginx-unprivileged:alpine

# Install curl for health checks
USER root
RUN apk add --no-cache curl

# Ensure mount point for shared uploads exists
RUN mkdir -p /var/www/uploads

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY infrastructure/nginx.conf /etc/nginx/conf.d/nginx.conf

# Copy built application from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Drop privileges for runtime
USER nginx

EXPOSE 8080

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]