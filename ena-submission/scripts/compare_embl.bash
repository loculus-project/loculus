#!/bin/bash

# 1. download the get-released.json file for the given accession

ACCESSION=$1
ORGANISM=$2

if [ -z "$ACCESSION" ] || [ -z "$ORGANISM" ]; then
  echo "Usage: $0 <accession> <organism>"
  exit 1
fi

curl -X 'GET' \
  "https://backend-add-annotations-auto.loculus.org/$ORGANISM/get-released-data?accessionFilter=$ACCESSION" \
  -H 'accept: application/x-ndjson' > "results/get-released.json"
# 2. parse the INSDC accession from the metadata
INSAC=$(jq -r '.metadata.insdcAccessionFull' results/get-released.json)
if [ -z "$INSAC" ]; then
  echo "Error: INSDC accession not found in metadata"
  exit 1
fi
echo "INSDC accession: $INSAC"
# 3. download the EMBL flatfile using the INSDC accession
URL="https://www.ebi.ac.uk/ena/browser/api/embl/$INSAC?download=true"
curl -L "$URL" -o "ena.embl"
# 4. Use dry-run script to create EMBL flatfile
jq --arg accession "$ACCESSION.1" --arg organism "$ORGANISM" '{($accession): (. + {organism: $organism})}' results/get-released.json > results/ena-submission.json

python scripts/deposition_dry_run.py \
  --data-to-submit results/ena-submission.json \
  --mode assembly \
  --config-file config/ena-submission-config.yaml
# 5. Compare EMBL flatfiles
gzip -df assembly/sequences.embl.gz 
mv assembly/sequences.embl results/loculus.embl