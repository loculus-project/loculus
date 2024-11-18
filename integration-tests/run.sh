#!/bin/bash
 ../deploy.py cluster --delete
 ../deploy.py cluster
 ../deploy.py helm --for-e2e
 python ../.github/scripts/wait_for_pods_to_be_ready.py