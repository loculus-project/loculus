#!/bin/bash

for i in {1..30}; do
  response=$(curl -o /dev/null -s -w "%{http_code}\n" 'http://localhost:3000/')
  if [ "$response" = "200" ]; then
    echo "Website is up and healthy."
    exit 0
  fi
  echo "Website is not healthy yet. Response ${response}. Waiting 10 seconds..."
  sleep 10
done
echo "Website did not become healthy within the expected time."
exit 1