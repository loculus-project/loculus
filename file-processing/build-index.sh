#!/usr/bin/env bash
set -euo pipefail

PATHOPLEXUS_URL="https://pathoplexus.org"
LAPIS_URL="https://lapis.pathoplexus.org"

KMER_LEN=31
WINDOW_SIZE=15
KDUST_MIN=0.80

usage() {
    echo "Usage: $0 -o <output-index>" >&2
    exit 2
}

OUTPUT_FILE=""
while getopts ":o:h" opt; do
    case "$opt" in
        o)
            OUTPUT_FILE="$OPTARG"
            ;;
        h)
            usage
            ;;
        :)
            echo "Option -$OPTARG requires an argument." >&2
            usage
            ;;
        \?)
            echo "Unknown option: -$OPTARG" >&2
            usage
            ;;
    esac
done

[[ -n "$OUTPUT_FILE" ]] || {
    echo "Missing required option: -o <output-index>" >&2
    usage
}

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT INT TERM

TEMP_INDEX="$TMP_DIR/deacon_human_kdust_filtered.idx"
COMBINED_FASTA="$TMP_DIR/combined.fasta"

mkdir -p "$(dirname "$OUTPUT_FILE")"

wget https://objectstorage.uk-london-1.oraclecloud.com/n/lrbvkel2wjot/b/human-genome-bucket/o/deacon/misc/panhuman-1.k31w15c8.idx -O "$TEMP_INDEX"

mapfile -t organisms < <(
    curl -fsSL "${PATHOPLEXUS_URL}/loculus-info" \
    | jq -r '.organisms | keys[]'
)

for organism in "${organisms[@]}"; do 
    organism_fasta="$TMP_DIR/${organism}.fasta" 
    echo "Downloading ${organism}..." >&2 
    curl "${LAPIS_URL}/${organism}/sample/unalignedNucleotideSequences?dataUseTerms=OPEN&dataFormat=fasta&versionStatus=LATEST_VERSION&isRevocation=false" | zstdcat > "$organism_fasta" 
     
    if [[ ! -s "$organism_fasta" ]]; 
        then echo "Warning: empty FASTA returned for ${organism}; skipping." >&2 
        continue 
    fi 
    cat "$organism_fasta" >> "$COMBINED_FASTA" 
    # Ensure records from separate files cannot run together. 
    printf '\n' >> "$COMBINED_FASTA"
done

deacon index \
    diff "$TEMP_INDEX" \
    "$COMBINED_FASTA" \
    -k "$KMER_LEN" \
    -w "$WINDOW_SIZE" \
    -o "$OUTPUT_FILE"

echo "Output written to: $OUTPUT_FILE"
