import csv
import json
import logging
import re
from dataclasses import dataclass

import click
import yaml

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


def jsonl_to_tsv(jsonl_file: str, tsv_file: str, ncbi_mappings: NCBIMappings) -> None:
    headers = (
        list(ncbi_mappings.string_to_string_mappings.keys())
        + list(ncbi_mappings.string_to_list_mappings.keys())
        + [key for val in ncbi_mappings.string_to_dict_mappings.values() for key in val]
        + list(ncbi_mappings.unknown_mappings)
    )
    with (
        open(jsonl_file, encoding="utf-8") as infile,
        open(tsv_file, "w", newline="", encoding="utf-8") as file,
    ):
        writer = csv.DictWriter(
            file,
            fieldnames=headers,
            delimiter="\t",
            quoting=csv.QUOTE_NONE,
            escapechar="\\",
        )
        writer.writeheader()
        for line in infile:
            row = json.loads(line.strip())
            extracted = extract_fields(row, ncbi_mappings)
            extracted["ncbiSubmitterNames"] = reformat_authors_from_genbank_to_loculus(
                extracted["ncbiSubmitterNames"], extracted["genbankAccession"]
            )

            # Ensure float formatting matches "%.0f"
            formatted_row = {
                key: f"{value:.0f}" if isinstance(value, float) else value
                for key, value in extracted.items()
            }
            writer.writerow(formatted_row)


@click.command()
@click.option("--config-file", required=True, type=click.Path(exists=True))
@click.option("--input", required=True, type=click.Path(exists=True))
@click.option("--output", required=True, type=click.Path())
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
)
def main(config_file: str, input: str, output: str, log_level: str) -> None:
    logger.setLevel(log_level)

    with open(config_file, encoding="utf-8") as file:
        full_config = yaml.safe_load(file)
        ncbi_mappings_data = full_config["ncbi_mappings"]
        relevant_config = {key: ncbi_mappings_data[key] for key in NCBIMappings.__annotations__}
        ncbi_mappings = NCBIMappings(**relevant_config)

    jsonl_to_tsv(input, output, ncbi_mappings=ncbi_mappings)


if __name__ == "__main__":
    main()
