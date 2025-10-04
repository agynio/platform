FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json tsconfig.json ./
COPY src ./src

# Install dependencies
RUN npm install -g pnpm@10.5.0
RUN pnpm install

# Build the application
RUN pnpm build

# Expose port
EXPOSE 3001

# Start the server
CMD ["node", "dist/index.js"]