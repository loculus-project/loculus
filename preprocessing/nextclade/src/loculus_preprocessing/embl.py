import io
import logging
from typing import Any

from Bio import SeqIO
from Bio.Seq import Seq
from Bio.SeqFeature import CompoundLocation, FeatureLocation, Reference, SeqFeature
from Bio.SeqRecord import SeqRecord

from .config import Config

logger = logging.getLogger(__name__)

# EMBL allowed qualifiers constant
EMBL_ANNOTATIONS: dict[str, list[str]] = {
    "cds_qualifiers": [
        "allele",
        "artificial_location",
        "circular_RNA",
        "codon_start",
        # "db_xref",  # protein accession of reference
        "EC_number",
        "exception",
        "experiment",
        "function",
        "gene",
        "gene_synonym",
        "inference",
        # "locus_tag",  # must be pre-registered with ENA
        # "old_locus_tag",
        "map",
        "note",
        "number",
        "operon",
        "product",
        "protein_id",
        "pseudo",
        "pseudogene",
        "ribosomal_slippage",
        "standard_name",
        "translation",
    ],
    "gene_qualifiers": [
        "allele",
        # "db_xref",
        "experiment",
        "function",
        "gene",
        "gene_synonym",
        "inference",
        # "locus_tag",
        # "old_locus_tag",
        "map",
        "note",
        "operon",
        "product",
        "pseudo",
        "pseudogene",
        "pseudotype",
        "standard_name",
        "trans_splicing",
    ],
}


def get_country(metadata: dict[str, str], config: Config) -> str:
    country = metadata.get(config.embl_info.country_property, "Unknown")
    admin_levels = config.embl_info.admin_level_properties
    admin = ", ".join([metadata.get(level) for level in admin_levels if metadata.get(level)])  # type: ignore
    return f"{country}: {admin}" if admin else country


def get_description(accession, version, db_name) -> str:
    return (
        f"Original sequence submitted to {db_name} with accession: "
        f"{accession}, version: {version}"
    )


def reformat_authors_from_loculus_to_embl_style(authors: str) -> str:
    authors_list = [author for author in authors.split(";") if author]
    ena_authors = []
    for author in authors_list:
        last_names, first_names = author.split(",")[0].strip(), author.split(",")[1].strip()
        initials = "".join([name[0] + "." for name in first_names.split() if name])
        ena_authors.append(f"{last_names} {initials}".strip())
    return ", ".join(ena_authors)


def get_authors(authors: str) -> str:
    try:
        return reformat_authors_from_loculus_to_embl_style(authors)
    except Exception as err:
        msg = f"Was unable to format authors: {authors} as ENA expects"
        raise ValueError(msg) from err


def get_molecule_type(molecule_type: str | None):
    # Dummy enum for MoleculeType
    class MoleculeType:
        GENOMIC_DNA = "GENOMIC_DNA"
        GENOMIC_RNA = "GENOMIC_RNA"
        VIRAL_CRNA = "VIRAL_CRNA"

        def __init__(self, value): self.value = value
        def __str__(self): return self.value
    try:
        return MoleculeType(molecule_type)
    except Exception as err:
        msg = f"Invalid molecule type: {molecule_type}"
        raise ValueError(msg) from err


def get_seq_features(  # noqa: PLR0914
    annotation_object: dict[str, Any], sequence_str: str, config
) -> list[SeqFeature]:
    """
    Takes a dictionary object with the following structure:
    {
        "genes": [
            {
            "range": {"begin": ..., "end": ...},
            "attributes": {"gene": ..., ...},
            "cdses": [
                {"segments": [{"range": {"begin": 1, "end": 10}, "strand": "+", "frame": ...}],
                "attributes": {"gene": ..., ...},
                "gffFeatureType": ...,
                },...]
        },..]
    }
    Creates a list of gene and CDS SeqFeature using:
    - https://www.ebi.ac.uk/ena/WebFeat/
    - https://www.insdc.org/submitting-standards/feature-table/
    Converts ranges from index-0 to index-1 and makes the ranges [] have an inclusive start and
    inclusive end (the default in nextclade is exclusive end)
    """
    # Map from nextclade attribute names to EMBL attribute names
    attribute_map = {
        # "Dbxref": "db_xref", - # protein accession of reference
        "Note": "note",
    }
    feature_list = []
    for gene in annotation_object.get("genes", []):
        gene_qualifiers = EMBL_ANNOTATIONS.get("gene_qualifiers", [])
        gene_attributes_map = {qualifier: qualifier for qualifier in gene_qualifiers}
        gene_attributes_map.update(attribute_map)
        gene_range = gene.get("range")
        attributes = gene.get("attributes", {})
        qualifiers = {
            new_key: attributes[old_key]
            for old_key, new_key in gene_attributes_map.items()
            if old_key in attributes
        }
        qualifiers["codon_start"] = 1
        # In FeatureLocation start and end are zero based, exclusive end.
        # thus an embl entry of 123..150 (one based counting) becomes a location of [122:150]
        feature = SeqFeature(
            FeatureLocation(start=gene_range["begin"], end=gene_range["end"]),
            type="gene",
            qualifiers=qualifiers,
        )
        feature_list.append(feature)
        for cds in gene.get("cdses", []):
            cds_qualifiers = EMBL_ANNOTATIONS.get("cds_qualifiers", [])
            cds_attributes_map = {qualifier: qualifier for qualifier in cds_qualifiers}
            cds_attributes_map.update(attribute_map)
            segments = cds.get("segments", [])
            ranges = [segment.get("range") for segment in segments]
            attributes_cds = cds.get("attributes", {})
            strands = [-1 if segment.get("strand") == "-" else +1 for segment in segments]
            locations = [
                FeatureLocation(start=r["begin"], end=r["end"], strand=s)
                for r, s in zip(ranges, strands, strict=False)
            ]
            compound_location = locations[0] if len(locations) == 1 else CompoundLocation(locations)
            qualifiers = {
                new_key: attributes_cds[old_key]
                for old_key, new_key in cds_attributes_map.items()
                if old_key in attributes_cds
            }
            qualifiers["codon_start"] = 1
            qualifiers["translation"] = "".join(
                [
                    str(Seq(sequence_str[(range["begin"]) : (range["end"])]).translate())
                    for range in ranges
                ]
            )
            feature = SeqFeature(
                location=compound_location,
                type="CDS",
                qualifiers=qualifiers,
            )
            feature_list.append(feature)
    return feature_list


def create_flatfile(  # noqa: PLR0913, PLR0917
    config: Config,
    accession,
    version,
    metadata,
    unaligned_nucleotide_sequences,
    annotation_object: dict[str, Any] | None = None,
) -> str:
    collection_date = metadata.get(config.embl_info.collection_date_property) or "Unknown"
    authors = get_authors(metadata.get(config.embl_info.authors_property) or "")
    country = get_country(metadata, config)
    description = get_description(accession, version, config.db_name)
    organism = config.scientific_name
    molecule_type = get_molecule_type(config.molecule_type)
    topology = config.topology

    seqIO_moleculetype = {  # noqa: N806
        "GENOMIC_DNA": "DNA",
        "GENOMIC_RNA": "RNA",
        "VIRAL_CRNA": "cRNA",
    }

    embl_content = []

    multi_segment = set(unaligned_nucleotide_sequences.keys()) != {"main"}

    for seq_name, sequence_str in unaligned_nucleotide_sequences.items():
        if not sequence_str:
            continue
        reference = Reference()
        reference.authors = authors
        sequence = SeqRecord(
            Seq(sequence_str),
            id=f"{accession}_{seq_name}" if multi_segment else accession,
            annotations={
                "molecule_type": seqIO_moleculetype.get(str(molecule_type), "DNA"),
                "organism": organism,
                "topology": topology,
                "references": [reference],
            },  # type: ignore
            description=description,
        )

        source_feature = SeqFeature(
            FeatureLocation(start=0, end=len(sequence.seq)),
            type="source",
            qualifiers={
                "molecule_type": str(molecule_type),
                "organism": organism,
                "country": country,
                "collection_date": collection_date,
            },
        )
        sequence.features.append(source_feature)
        if annotation_object and annotation_object.get(seq_name, None):
            seq_feature_list = get_seq_features(annotation_object[seq_name], sequence_str, config)
            for feature in seq_feature_list:
                sequence.features.append(feature)

        buffer = io.StringIO()
        SeqIO.write(sequence, buffer, "embl")
        buffer.seek(0)
        embl_content.append(buffer.read())

    return "\n".join(embl_content)
