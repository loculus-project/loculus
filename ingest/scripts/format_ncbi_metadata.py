import csv
import json
import logging
import re
from dataclasses import dataclass

import click
import pandas as pd
import yaml
from Bio import Entrez, SeqIO

logger = logging.getLogger(__name__)
logging.basicConfig(
    encoding="utf-8",
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)8s (%(filename)20s:%(lineno)4d) - %(message)s ",
    datefmt="%H:%M:%S",
)


@dataclass
class NCBIMappings:
    string_to_string_mappings: dict[str, str]
    string_to_list_mappings: dict[str, str]
    string_to_dict_mappings: dict[str, dict[str, str]]
    unknown_mappings: list[str]


@dataclass
class NCBIEntrezMappings:
    metadata_mapping: dict[str, str]
    segment_product_mapping: dict[str, dict[str, list[str]]]


def convert_to_title_case(name: str) -> str:
    """Converts a string to title case, except for lowercase particles or prepositions
    Examples:
        - "DE LA FUENTE" -> "de la Fuente"
        - "Smith" -> "Smith"
        - "doe" -> "Doe"
    """
    # List of lowercase particles or prepositions commonly used in names
    # TODO: Use package for this, e.g. nameparser
    lowercase_particles = [
        "de",
        "la",
        "van",
        "den",
        "der",
        "dem",
        "le",
        "du",
        "von",
        "del",
        "vom",
        "di",
        "da",
        "las",
        "los",
    ]
    title_case_text = name.title()

    words = title_case_text.split()
    result = []
    for word in words:
        if word.lower() in lowercase_particles:
            result.append(word.lower())
        else:
            result.append(word)
    return " ".join(result)


def reformat_authors_from_genbank_to_loculus(
    authors_list: list[str], insdc_accession_base: str
) -> str:
    """Input looks like ["Smith, J.A.", "Doe, J.B."], output should be "Smith, J. A.; Doe, J. B."""
    if not authors_list:
        return ""

    formatted_authors_list = []

    for author in authors_list:
        author_single_white_space = re.sub(r"\s\s+", " ", author)
        names = [a for a in author_single_white_space.split(",") if a]
        if len(names) == 2:
            last_names, first_names = names[0], names[1]
            # First names present

            # Add spaces after periods using regex
            # \.     = match a literal period
            # (?!    = negative lookahead - don't match if following character is:
            #   -    = a hyphen OR
            #   \s   = any whitespace OR
            #   $    = end of string
            # )      = end of negative lookahead
            formatted_initials = re.sub(r"\.(?!-|\s|$)", ". ", first_names)

            author_formatted = f"{last_names.strip()}, {formatted_initials.strip()}"
        elif len(names) == 1:
            # Only last names
            author_formatted = f"{names[0].strip()}, "
        else:
            msg = (
                f"{insdc_accession_base}: Unexpected number of commas in author {author} "
                f"not adding author to authors list"
            )
            logger.error(msg)
            continue
        formatted_authors_list.append(author_formatted)

    formatted_authors = "; ".join(formatted_authors_list)

    # If entire string is uppercase, convert to title case, some journals do this
    if formatted_authors.isupper():
        formatted_authors = convert_to_title_case(formatted_authors)
    return formatted_authors


def extract_fields(row, ncbi_mappings: NCBIMappings) -> dict:
    try:
        extracted = {}
        extracted.update(
            {key: row.get(value) for key, value in ncbi_mappings.string_to_string_mappings.items()}
        )
        extracted.update(
            {key: row.get(value) for key, value in ncbi_mappings.string_to_list_mappings.items()}
        )
        for field in ncbi_mappings.string_to_list_mappings:
            if extracted[field]:
                extracted[field] = ",".join(extracted[field])
            else:
                extracted[field] = ""
        for field, sub_dict in ncbi_mappings.string_to_dict_mappings.items():
            dict_as_string = row.get(field, {})
            extracted.update({key: dict_as_string.get(value) for key, value in sub_dict.items()})
        extracted.update(dict.fromkeys(ncbi_mappings.unknown_mappings))

    except KeyError as e:
        print(f"Missing key: {e}")
        extracted = {}
    return extracted


def batch_fetch_genbank(accession_list, ncbi_entrez_mappings: NCBIEntrezMappings, batch_size=100):
    record_data_map = {}
    Entrez.email = "fetch_genbank"
    for i in range(0, len(accession_list), batch_size):
        print(f"Fetching batch {i} to {i + batch_size}")
        batch = accession_list[i : i + batch_size]
        try:
            with Entrez.efetch(
                db="nucleotide", id=",".join(batch), rettype="gb", retmode="text"
            ) as handle:
                # Parse multiple records from the handle
                batch_records = list(SeqIO.parse(handle, "genbank"))
                record_data_map.update(
                    {
                        record.id: extract_qualifiers(record, ncbi_entrez_mappings)
                        for record in batch_records
                    }
                )
        except Exception as e:
            print(f"Error fetching batch {batch}: {e}")

    return record_data_map


def extract_qualifiers(genbank_record, ncbi_entrez_mappings: NCBIEntrezMappings) -> dict:
    extracted_data = {}
    product_list = []

    for feature in genbank_record.features:
        for qualifier in ncbi_entrez_mappings.metadata_mapping:
            if qualifier in feature.qualifiers:
                # Some qualifiers have multiple values (stored as lists), join them with commas if needed
                if qualifier in extracted_data:
                    extracted_data[qualifier] += ", " + ", ".join(feature.qualifiers[qualifier])
                else:
                    extracted_data[qualifier] = ", ".join(feature.qualifiers[qualifier])
        if ncbi_entrez_mappings.segment_product_mapping and "product" in feature.qualifiers:
            product_list.extend(feature.qualifiers["product"])

    extracted_data["segment"] = None

    for segment, full_product_list in ncbi_entrez_mappings.segment_product_mapping.items():
        if set(product_list) <= set(full_product_list):
            extracted_data["segment"] = segment
            break

    if not extracted_data["segment"]:
        logger.warning(
            f"{genbank_record.id}: Could not find segment for product list: {product_list}"
        )
        print(f"{genbank_record.id}: Could not find segment for product list: {product_list}")

    return extracted_data


def jsonl_to_tsv(
    jsonl_file: str,
    tsv_file: str,
    ncbi_mappings: NCBIMappings,
    ncbi_entrez_mappings: NCBIEntrezMappings | None = None,
    segment_file: str | None = None,
) -> None:
    extracted_rows: list[dict[str, str]] = []
    accession_list = []
    with (
        open(jsonl_file, encoding="utf-8") as infile,
    ):
        for line in infile:
            row = json.loads(line.strip())
            extracted = extract_fields(row, ncbi_mappings)
            accession_list.append(extracted["genbankAccession"])
            extracted["ncbiSubmitterNames"] = reformat_authors_from_genbank_to_loculus(
                extracted["ncbiSubmitterNames"], extracted["genbankAccession"]
            )
            extracted_rows.append(extracted)
    if ncbi_entrez_mappings:
        entrez_accessions = batch_fetch_genbank(
            accession_list, ncbi_entrez_mappings, batch_size=100000
        )
        for row in extracted_rows:
            row.update(entrez_accessions.get(row["genbankAccession"], {}))
    df = pd.DataFrame(extracted_rows)
    df.to_csv(
        tsv_file,
        sep="\t",
        quoting=csv.QUOTE_NONE,
        escapechar="\\",
        index=False,
        float_format="%.0f",
    )
    if ncbi_entrez_mappings:
        # Create segment file.
        segment_df = df.rename(columns={"genbankAccession": "seqName"})[["seqName", "segment"]]
        segment_df = segment_df[~segment_df["segment"].isnull()]
        segment_df.to_csv(
            segment_file,
            sep="\t",
            quoting=csv.QUOTE_NONE,
            escapechar="\\",
            index=False,
            float_format="%.0f",
        )


@click.command()
@click.option("--config-file", required=True, type=click.Path(exists=True))
@click.option("--input", required=True, type=click.Path(exists=True))
@click.option("--output", required=True, type=click.Path())
@click.option("--segment-file", required=False, type=click.Path())
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
)
def main(config_file: str, input: str, output: str, segment_file, log_level: str) -> None:
    logger.setLevel(log_level)

    with open(config_file, encoding="utf-8") as file:
        full_config = yaml.safe_load(file)
        ncbi_mappings_data = full_config["ncbi_mappings"]
        relevant_config = {key: ncbi_mappings_data[key] for key in NCBIMappings.__annotations__}
        ncbi_mappings = NCBIMappings(**relevant_config)
        ncbi_entrez_mapping_data = full_config["ncbi_entrez_mappings"]
        relevant_config = {
            key: ncbi_entrez_mapping_data.get(key, {}) for key in NCBIEntrezMappings.__annotations__
        }
        ncbi_entrez_mappings = NCBIEntrezMappings(**relevant_config)

    jsonl_to_tsv(
        input,
        output,
        ncbi_mappings=ncbi_mappings,
        ncbi_entrez_mappings=ncbi_entrez_mappings,
        segment_file=segment_file,
    )


if __name__ == "__main__":
    main()
