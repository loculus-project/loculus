"""For each downloaded sequences calculate md5 hash and put into JSON"""

from pathlib import Path
import re
import logging
import pandas as pd
import csv
import shutil

import click
from Bio import SeqIO
import yaml

logger = logging.getLogger(__name__)
logging.basicConfig(
    encoding="utf-8",
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)8s (%(filename)20s:%(lineno)4d) - %(message)s ",
    datefmt="%H:%M:%S",
)


@click.command()
@click.option("--config-file", required=True, type=click.Path(exists=True))
@click.option("--input-seq", required=True, type=click.Path(exists=True))
@click.option("--input-metadata", required=True, type=click.Path(exists=True))
@click.option("--output-seq", required=True, type=click.Path())
@click.option("--output-metadata", required=True, type=click.Path())
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
)
def main(config_file: str, input_seq: str, input_metadata: str, output_seq: str, output_metadata: str, log_level: str) -> None:
    logger.setLevel(log_level)

    with open(config_file) as file:
        config = yaml.safe_load(file)
        single_segment: bool = 'nucleotideSequences' not in config or (len(
            config['nucleotideSequences']) == 1 and config['nucleotideSequences'][0] == 'main')

    def write_to_fasta(data, filename):
        if not data:
            Path(filename).touch()
            return
        with open(filename, 'a') as file:
            for record in data:
                file.write(f">{record.id}\n{record.seq}\n")

    def write_to_tsv(data, filename):
        if not data:
            Path(filename).touch()
            return
        columns = data[0].keys()
        with open(filename, 'w', newline='') as output_file:
            dict_writer = csv.DictWriter(output_file, columns, delimiter='\t')
            dict_writer.writeheader()
            dict_writer.writerows(data)

    if single_segment:
        logger.debug("No segments found, assuming single-segment virus")
        with open(input_seq) as f:
            records = SeqIO.parse(f, "fasta")
            write_to_fasta(records, output_seq)
        shutil.copy(input_metadata, output_metadata)
    else:

        df = pd.read_csv(input_metadata, sep="\t",
                         dtype=str, keep_default_na=False)
        metadata = df.to_dict(orient="records", index='genbank_accession')
        metadata_dict = {}
        for entry in metadata:
            metadata_dict[entry['genbank_accession']] = entry

        # Discard all sequences with unclear segment annotations
        # Append segment to end of NCBI accession ID to conform with LAPIS formatting
        processed_seq = []
        processed_metadata = []

        with open(input_seq) as f:
            records = SeqIO.parse(f, "fasta")
            for record in records:
                for segment in config['nucleotideSequences']:
                    re_input = re.compile(
                        '.*segment {0}.*'.format(segment), re.IGNORECASE)
                    x = re_input.search(record.description)
                    if x:
                        processed_metadata.append(metadata_dict[record.id])
                        record.id += '_' + segment
                        processed_seq.append(record)

        write_to_fasta(processed_seq, output_seq)
        write_to_tsv(processed_metadata, output_metadata)


if __name__ == "__main__":
    main()
