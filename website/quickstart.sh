#!/usr/bin/env bash

set -e
cp .env.example .env
echo "Environment file copied."
npm ci
echo "Dependencies installed."
../generate_local_test_config.sh --from-live
echo "Local test config generated pointing to live main.loculus.org server"
npm run start-server
