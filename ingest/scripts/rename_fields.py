import csv
import json

import click


def extract_fields(row):
    # Extract the required fields based on the provided mapping
    try:
        # Host-related fields
        host_lineage = row.get("host", {}).get("lineage", [])
        last_host_lineage = host_lineage[-1] if host_lineage else {}

        # Virus-related fields
        virus_lineage = row.get("virus", {}).get("lineage", [])
        last_virus_lineage = virus_lineage[-1] if virus_lineage else {}

        # Isolate-related fields
        isolate = row.get("isolate", {})

        # Location-related fields
        location = row.get("location", {})

        # Submitter-related fields
        submitter = row.get("submitter", {})

        # Map the fields to the new dictionary structure
        extracted = {
            "ncbiHostTaxonId": last_host_lineage.get("taxon_id"),
            "ncbiHostCommonName": last_host_lineage.get("name"),
            "ncbiReleaseDate": row.get("releaseDate"),
            "ncbiIsAnnotated": row.get("isAnnotated"),
            "ncbiVirusName": last_virus_lineage.get("name"),
            "ncbiIsLabHost": row.get("isLabHost"),
            "ncbiProteinCount": row.get("proteinCount"),
            "ncbiSourceDb": row.get("sourceDatabase"),
            "ncbiIsComplete": row.get("completeness"),
            "ncbiLabHost": row.get("labHost"),
            "ncbiIsolateName": isolate.get("name"),
            "ncbiIsolateSource": isolate.get("source"),
            "ncbiUpdateDate": row.get("updateDate"),
            "genbankAccession": row.get("accession"),
            "ncbiGeoLocation": location.get("geographicLocation"),
            "ncbiGeoRegion": location.get("geographicRegion"),
            "biosampleAccession": row.get("biosample"),
            "ncbi_gene_count": row.get("geneCount"),
            "bioprojects": row.get("bioprojects"),
            "ncbiSraAccessions": row.get("sraAccessions"),
            "ncbiSubmitterAffiliation": submitter.get("affiliation"),
            "ncbiSubmitterNames": submitter.get("names"),
            "ncbiSubmitterCountry": submitter.get("country"),
        }
    except KeyError as e:
        print(f"Missing key: {e}")
        extracted = {}

    return extracted


def jsonl_to_tsv(jsonl_file, tsv_file):
    with (
        open(jsonl_file, "r", encoding="utf-8") as infile,
        open(tsv_file, "w", newline="", encoding="utf-8") as outfile,
    ):
        writer = csv.DictWriter(
            outfile,
            fieldnames=[
                "ncbiHostTaxonId",
                "ncbiHostCommonName",
                "ncbiReleaseDate",
                "ncbiIsAnnotated",
                "ncbiVirusName",
                "ncbiIsLabHost",
                "ncbiProteinCount",
                "ncbiSourceDb",
                "ncbiIsComplete",
                "ncbiLabHost",
                "ncbiIsolateName",
                "ncbiIsolateSource",
                "ncbiUpdateDate",
                "genbankAccession",
                "ncbiGeoLocation",
                "ncbiGeoRegion",
                "biosampleAccession",
                "ncbi_gene_count",
                "bioprojects",
                "ncbiSraAccessions",
                "ncbiSubmitterAffiliation",
                "ncbiSubmitterNames",
                "ncbiSubmitterCountry",
            ],
            delimiter="\t",
        )

        # Write header
        writer.writeheader()

        # Process each row in the JSONL file
        for line in infile:
            row = json.loads(line.strip())
            extracted = extract_fields(row)
            writer.writerow(extracted)


@click.command()
@click.option("--input", required=True, type=click.Path(exists=True))
@click.option("--output", required=True, type=click.Path())
def main(input: str, output: str) -> None:
    jsonl_to_tsv(input, output)


if __name__ == "__main__":
    main()
