# Use a lightweight Node.js base image
FROM node:20-alpine

# Set working directory inside the container
# WORKDIR /app

# Copy package.json and package-lock.json first (for caching)
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy the rest of the application files
COPY . .

# Expose the port Sonos HTTP API uses
EXPOSE 5005

# Start the application
CMD ["npm", "start"]

