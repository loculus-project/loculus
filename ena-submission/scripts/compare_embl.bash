#!/bin/bash

# 1. download the get-released.json file for the given accession

ACCESSION=$1
ORGANISM=$2

if [ -z "$ACCESSION" ] || [ -z "$ORGANISM" ]; then
  echo "Usage: $0 <accession> <organism>"
  exit 1
fi

mkdir -p results
mkdir -p pre-results
curl -X 'GET' \
  "https://backend-add-annotations-auto.loculus.org/$ORGANISM/get-released-data?accessionFilter=$ACCESSION" \
  -H 'accept: application/x-ndjson' > "pre-results/$ACCESSION-get-released.json"
# 2. parse the INSDC accession from the metadata
INSAC=$(jq -r '.metadata.insdcAccessionFull' "pre-results/$ACCESSION-get-released.json")
if [ -z "$INSAC" ]; then
  echo "Error: INSDC accession not found in metadata"
  exit 1
fi
echo "INSDC accession: $INSAC"
# 3. download the EMBL flatfile using the INSDC accession
URL="https://www.ebi.ac.uk/ena/browser/api/embl/$INSAC?download=true"
curl -L "$URL" -o "results/$ACCESSION-ena.embl"
# 4. Use dry-run script to create EMBL flatfile
jq --arg accession "$ACCESSION.1" --arg organism "$ORGANISM" '{($accession): (. + {organism: $organism})}' "pre-results/$ACCESSION-get-released.json" > "pre-results/$ACCESSION-ena-submission.json"

python scripts/deposition_dry_run.py \
  --data-to-submit "pre-results/$ACCESSION-ena-submission.json" \
  --mode assembly \
  --config-file config/ena-submission-config.yaml
# 5. Compare EMBL flatfiles
gzip -df assembly/sequences.embl.gz 
mv assembly/sequences.embl "results/$ACCESSION-loculus.embl"