import csv
import json
import logging
from pathlib import Path

import click


@click.command()
@click.option("--metadata-path", required=True, type=click.Path(exists=True))
@click.option("--sequences-path", required=False, type=click.Path(exists=True))
@click.option("--to-submit-path", required=True, type=click.Path(exists=True))
@click.option("--to-revise-path", required=True, type=click.Path(exists=True))
@click.option("--sequences-submit-path", required=False, type=click.Path())
@click.option("--sequences-revise-path", required=False, type=click.Path())
@click.option("--metadata-submit-path", required=True, type=click.Path())
@click.option("--metadata-revise-path", required=True, type=click.Path())
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
)
def main(
    metadata_path: str,
    sequences_path: str,
    to_submit_path: str,
    to_revise_path: str,
    sequences_submit_path: str,
    sequences_revise_path: str,
    metadata_submit_path: str,
    metadata_revise_path: str,
    log_level: str,
) -> None:
    logging.basicConfig(level=log_level)

    metadata = json.load(open(metadata_path))
    to_submit = json.load(open(to_submit_path))
    to_revise = json.load(open(to_revise_path))

    metadata_submit = []
    metadata_revise = []

    for fasta_id in to_submit:
        metadata_submit.append(metadata[fasta_id])
        # Add sequences here, once we have sequences in json format
    
    for fasta_id, loculus_accession in to_revise.items():
        revise_record = metadata[fasta_id]
        revise_record["submissionId"] = loculus_accession
        metadata_revise.append(revise_record)
        # Add sequences here, once we have sequences in json format
    
    # Turn list of objects into tsv with keys as headers
   # Function to write list of dictionaries to a TSV file
    def write_to_tsv(data, filename):
        if not data:
            Path(filename).touch()
            return
        keys = data[0].keys()
        with open(filename, 'w', newline='') as output_file:
            dict_writer = csv.DictWriter(output_file, keys, delimiter='\t')
            dict_writer.writeheader()
            dict_writer.writerows(data)

    # Write data to TSV
    write_to_tsv(metadata_submit, metadata_submit_path)
    write_to_tsv(metadata_revise, metadata_revise_path)
    

if __name__ == "__main__":
    main()
