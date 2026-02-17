#!/bin/bash
set -euxo pipefail

../deploy.py cluster --delete
../deploy.py cluster
../deploy.py deploy --for-e2e --enablePreprocessing
python ../.github/scripts/wait_for_pods_to_be_ready.py
