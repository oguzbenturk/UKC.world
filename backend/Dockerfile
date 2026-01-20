FROM node:20-alpine

# Create app directory
WORKDIR /app

# Copy package files and install dependencies as root (for proper permissions)
COPY package*.json ./
RUN npm install --omit=dev --silent && \
    npm audit fix --audit-level moderate && \
    npm cache verify

# Copy application code
COPY . .

# Create logs directory with proper permissions
RUN mkdir -p logs && \
    chmod 755 logs

# Add non-root user for security and change ownership
RUN addgroup -g 1001 -S nodejs \
  && adduser -S backend -u 1001 \
  && chown -R backend:nodejs /app

# Switch to non-root user
USER backend

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["npm", "start"]