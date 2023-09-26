#!/bin/bash

for i in {1..30}; do
  response=$(curl -o /dev/null -s -w "%{http_code}\n" 'http://localhost:8079/get-sequences-of-user?username=this-is-not-a-valid-user-and-please-do-not-uise-this-username-as-real-username')
  if [ "$response" = "200" ]; then
    echo "Backend is up and healthy."
    exit 0
  fi
  echo "Backend is not healthy yet. Response ${response}. Waiting 10 seconds..."
  sleep 10
done
echo "Backend did not become healthy within the expected time."
exit 1

