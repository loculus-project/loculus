import json
import logging

import click


@click.command()
@click.option("--old-hashes", required=True, type=click.Path(exists=True))
@click.option("--metadata", required=True, type=click.Path(exists=True))
@click.option("--to-submit", required=True, type=click.Path())
@click.option("--to-revise", required=True, type=click.Path())
@click.option("--unchanged", required=True, type=click.Path())
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
)
def main(
    old_hashes: str,
    metadata: str,
    to_submit: str,
    to_revise: str,
    unchanged: str,
    log_level: str,
) -> None:
    logging.basicConfig(level=log_level)

    submitted: dict = json.load(open(old_hashes))
    new_metadata = json.load(open(metadata))

    # Sort all submitted versions by version number
    for _, loculus in submitted.items():
        # TODO: check sort order
        loculus["versions"] = sorted(loculus["versions"], key=lambda x: x["version"])

    submit = [] # INSDC accessions to submit
    revise = {} # Mapping from INSDC accessions to loculus accession, required for revision
    noop = {} # Mapping from INSDC accessions to equivalent loculus accession, no change required

    for fasta_id, record in new_metadata.items():
        insdc_accession_base = record["insdc_accession_base"]
        if insdc_accession_base not in submitted:
            submit.append(fasta_id)
        else:
            if submitted[insdc_accession_base]["versions"][-1]["hash"] != record["hash"]:
                revise[fasta_id] = submitted[insdc_accession_base]["loculus_accession"]
            else:
                noop[fasta_id] = submitted[insdc_accession_base]["loculus_accession"]

    # Iterate over metadata and decide what to do with it
    outputs = [(submit, to_submit), (revise, to_revise), (noop, unchanged)]
    for (value, path) in outputs:
        with open(path, "w") as file:
            json.dump(value, file)

if __name__ == "__main__":
    main()
