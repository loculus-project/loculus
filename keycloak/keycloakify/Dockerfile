# Stage 1: Building the Keycloak theme
# Use a Node.js image to run yarn commands
FROM node:latest as builder

# Install Maven
USER root
RUN apt-get update && apt-get install -y maven

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

# List the contents of the output directory
RUN ls -l /output

# We will have a destination mounted at /destination

# Copy the built JAR to the destination when the container starts

# Start the container
CMD ["cp", "/output/*.jar", "/destination/"]


