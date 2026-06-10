# Image for running the integration-tests Playwright suite (and the dev data seeder)
# inside the cluster. Based on the official Playwright image so browsers are preinstalled;
# keep the version in sync with the @playwright/test version in package.json.
FROM mcr.microsoft.com/playwright:v1.60.0-noble

WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json package-lock.json* ./
RUN npm ci || npm install

# Copy the test sources and configuration.
COPY . .

# By default, seed the deployment with SeqSet-citation test data. The Helm Job sets
# PLAYWRIGHT_TEST_BASE_URL / PLAYWRIGHT_TEST_BACKEND_URL to the in-cluster services.
CMD ["npm", "run", "seed"]
