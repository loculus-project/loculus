"""Stream an NCBI Datasets data_report.jsonl from stdin to stdout, keeping records released on or
after a date, and write the kept accessions (one per line) for `seqkit grep -f`."""

import logging
import sys

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
@click.option("--released-after", required=True, help="YYYY-MM-DD, inclusive")
@click.option("--output-accessions", required=True, type=click.Path())
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
)
def main(released_after: str, output_accessions: str, log_level: str) -> None:
    logger.setLevel(log_level)
    seen = kept = 0
    with open(output_accessions, "w", encoding="utf-8") as accessions:
        for line in sys.stdin.buffer:
            seen += 1
            record = orjson.loads(line)
            # ISO timestamps compare correctly as strings
            if record.get("releaseDate", "")[:10] >= released_after:
                sys.stdout.buffer.write(line)
                accessions.write(record["accession"] + "\n")
                kept += 1
    logger.info(f"Kept {kept} of {seen} records released on or after {released_after}")


if __name__ == "__main__":
    main()
