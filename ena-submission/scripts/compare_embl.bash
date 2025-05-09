#!/bin/bash

ACCESSION=$1
ORGANISM=$2

if [ -z "$ACCESSION" ] || [ -z "$ORGANISM" ]; then
  echo "Usage: $0 <accession> <organism>"
  exit 1
fi

mkdir -p results
mkdir -p pre-results

# 1. download the get-released.json file for the given accession
echo "Downloading get-released.json for $ACCESSION"
curl -X 'GET' \
  "https://backend-add-annotations-auto.loculus.org/$ORGANISM/get-released-data?accessionFilter=$ACCESSION" \
  -H 'accept: application/x-ndjson' > "pre-results/$ACCESSION-get-released.json"
# 2. parse the INSDC accession from the metadata

if [ "$ORGANISM" == "cchf" ]; then

  SUFFIXES=("L" "M" "S")

  for SUFFIX in "${SUFFIXES[@]}"; do
    # Use jq to extract the accession
    INSAC=$(jq -r ".metadata.insdcAccessionFull_${SUFFIX}" "pre-results/$ACCESSION-get-released.json")
    if [ -z "$INSAC" ] || [ "$INSAC" == "null" ]; then
      echo "Error: INSDC accession not found for suffix ${SUFFIX}"
      continue
    fi
    echo "INSDC accession (${SUFFIX}): $INSAC"

    # Download the EMBL flatfiles
    OUTPUT_FILE="results/${ACCESSION}_${SUFFIX}-ena.embl"
    URL="https://www.ebi.ac.uk/ena/browser/api/embl/$INSAC?download=true"
    echo "Downloading EMBL flatfile for $INSAC to $OUTPUT_FILE"
    curl -L "$URL" -o "$OUTPUT_FILE"
  done
else
  INSAC=$(jq -r '.metadata.insdcAccessionFull' "pre-results/$ACCESSION-get-released.json")
  if [ -z "$INSAC" ]; then
    echo "Error: INSDC accession not found in metadata"
    exit 1
  fi
  echo "INSDC accession: $INSAC"
  # 3. download the EMBL flatfile using the INSDC accession
  echo "Downloading EMBL flatfile for $INSAC"
  URL="https://www.ebi.ac.uk/ena/browser/api/embl/$INSAC?download=true"
  curl -L "$URL" -o "results/$ACCESSION-ena.embl"
fi
# 4. Use dry-run script to create EMBL flatfile
echo "Creating EMBL flatfile for $ACCESSION"
jq --arg accession "$ACCESSION.1" --arg organism "$ORGANISM" '{($accession): (. + {organism: $organism})}' "pre-results/$ACCESSION-get-released.json" > "pre-results/$ACCESSION-ena-submission.json"
python scripts/deposition_dry_run.py \
  --data-to-submit "pre-results/$ACCESSION-ena-submission.json" \
  --mode assembly \
  --config-file config/ena-submission-config.yaml
# 5. Compare EMBL flatfiles
gzip -df assembly/sequences.embl.gz 
mv assembly/sequences.embl "results/$ACCESSION-loculus.embl"