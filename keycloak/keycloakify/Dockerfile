# Stage 1: Building the Keycloak theme
# Use a Node.js image to run yarn commands
FROM node:latest as builder

# Set the working directory
WORKDIR /app

# Copy package.json and yarn.lock (or just package.json if you don't use a lock file)
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn

# Copy the rest of the code
COPY . .

# Build the Keycloak theme
RUN yarn build-keycloak-theme

# Stage 2: Lightweight container for distribution
FROM alpine:latest

# Create output directory
RUN mkdir /output

# Copy the built JAR from the builder stage
COPY --from=builder /app/build_keycloak/target/*.jar /output/

# Set the command to copy the JAR file to a mounted volume
CMD ["cp", "-r", "/output/*", "/destination/"]

# Set the volume where the JAR file will be copied to when the container is run
VOLUME /destination/