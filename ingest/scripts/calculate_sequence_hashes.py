"""For each downloaded sequences calculate md5 hash and put into JSON"""

import hashlib
import logging

import click
import orjson

logger = logging.getLogger(__name__)
logging.basicConfig(
    encoding="utf-8",
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)8s (%(filename)20s:%(lineno)4d) - %(message)s ",
    datefmt="%H:%M:%S",
)


@click.command()
@click.option("--input", required=True, type=click.Path(exists=True))
@click.option("--output-hashes", required=True, type=click.Path())
@click.option("--output-sequences", required=True, type=click.Path())
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
)
def main(input: str, output_hashes: str, output_sequences: str, log_level: str) -> None:
    logger.setLevel(log_level)
    logging.getLogger("requests").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)

    counter = 0

    # Plain line parsing and writers kept open: Biopython and orjsonl.append (which reopens the file for every
    # record) made this take minutes for SARS-CoV-2. Output is identical: the sequence is the record's lines joined
    # with spaces and carriage returns removed, as in Bio.SeqIO's FASTA parser, and each line is orjson.dumps + "\n".
    def records(f_in):
        name, lines = None, []
        for line in f_in:
            if line.startswith(">"):
                if name is not None:
                    yield name, "".join(lines).replace(" ", "").replace("\r", "")
                title = line[1:].rstrip("\n")
                name = title.split(None, 1)[0] if title.strip() else ""
                lines = []
            elif name is not None:
                lines.append(line.rstrip("\n"))
        if name is not None:
            yield name, "".join(lines).replace(" ", "").replace("\r", "")

    with (
        open(input, encoding="utf-8") as f_in,
        open(output_hashes, "ab") as hashes_out,
        open(output_sequences, "ab") as sequences_out,
    ):
        for record_id, sequence in records(f_in):
            hash = hashlib.md5(sequence.encode(), usedforsecurity=False).hexdigest()
            hashes_out.write(orjson.dumps({"id": record_id, "hash": hash}) + b"\n")
            sequences_out.write(orjson.dumps({"id": record_id, "sequence": sequence}) + b"\n")
            counter += 1

    logger.info(f"Calculated hashes for {counter} sequences")


if __name__ == "__main__":
    main()
