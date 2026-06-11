import argparse
import csv
import logging
import re
import shutil
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

LOG = logging.getLogger(__name__)

ENA_SEARCH = "https://www.ebi.ac.uk/ena/portal/api/search"
ENA_FASTA = "https://www.ebi.ac.uk/ena/browser/api/fasta"
ENA_FIELDS = [
    "accession",
    "sample_accession",
    "run_accession",
    "scientific_name",
    "collection_date",
    "country",
    "base_count",
    "description",
    "tax_id",
    "study_accession",
]

INFLUENZA_SEGMENT_ORDER = ("PB2", "PB1", "PA", "HA", "NP", "NA", "M", "NS")
INFLUENZA_A_H1N1_SEGMENTS = {
    "KU509700": "PB2",
    "KU509701": "PB1",
    "KU509702": "PA",
    "KU509703": "HA",
    "KU509704": "NP",
    "KU509705": "NA",
    "KU509706": "M",
    "KU509707": "NS",
}


@dataclass(frozen=True)
class PathogenTarget:
    key: str
    organism: str
    reference: str
    reference_accessions: tuple[str, ...]
    scientific_names: tuple[str, ...]
    segment_accessions: dict[str, str] | None = None


TARGETS = [
    PathogenTarget(
        key="sars-cov-2",
        organism="sars-cov-2",
        reference="singleReference",
        reference_accessions=("MN908947.3", "MN908947"),
        scientific_names=("severe acute respiratory syndrome coronavirus 2",),
    ),
    PathogenTarget(
        key="rsv-a",
        organism="rsv",
        reference="RSV-A",
        reference_accessions=("NC_001803.1", "NC_001803"),
        scientific_names=("human respiratory syncytial virus a",),
    ),
    PathogenTarget(
        key="rsv-b",
        organism="rsv",
        reference="RSV-B",
        reference_accessions=("AY353550", "NC_001781.1", "NC_001781"),
        scientific_names=("human respiratory syncytial virus 9320", "human orthopneumovirus b"),
    ),
    PathogenTarget(
        key="flu-a-h1n1",
        organism="influenza-a",
        reference="H1N1",
        reference_accessions=tuple(INFLUENZA_A_H1N1_SEGMENTS),
        scientific_names=("influenza a virus (a/michigan/45/2015(h1n1))",),
        segment_accessions=INFLUENZA_A_H1N1_SEGMENTS,
    ),
    PathogenTarget(
        key="flu-a-h3n2",
        organism="influenza-a",
        reference="H3N2",
        reference_accessions=(),
        scientific_names=("influenza a virus (h3n2)",),
    ),
    PathogenTarget(
        key="flu-b",
        organism="influenza-b",
        reference="singleReference",
        reference_accessions=("KX058884",),
        scientific_names=("influenza b virus",),
    ),
    PathogenTarget(
        key="hmpv",
        organism="hmpv",
        reference="singleReference",
        reference_accessions=("NC_039199.1", "NC_039199"),
        scientific_names=("human metapneumovirus",),
    ),
    PathogenTarget(
        key="hpiv-1",
        organism="hpiv",
        reference="HPIV-1",
        reference_accessions=("NC_003461.1", "NC_003461"),
        scientific_names=("human respirovirus 1",),
    ),
    PathogenTarget(
        key="hpiv-2",
        organism="hpiv",
        reference="HPIV-2",
        reference_accessions=("NC_003443.1", "NC_003443"),
        scientific_names=("human orthorubulavirus 2",),
    ),
    PathogenTarget(
        key="hpiv-3",
        organism="hpiv",
        reference="HPIV-3",
        reference_accessions=("NC_001796.2", "NC_001796"),
        scientific_names=("human respirovirus 3",),
    ),
    PathogenTarget(
        key="hpiv-4a",
        organism="hpiv",
        reference="HPIV-4a",
        reference_accessions=("NC_021928.1", "NC_021928"),
        scientific_names=("human parainfluenza virus 4a",),
    ),
    PathogenTarget(
        key="coronavirus-229e",
        organism="seasonal-coronavirus",
        reference="229E",
        reference_accessions=("NC_002645.1", "NC_002645"),
        scientific_names=("human coronavirus 229e",),
    ),
    PathogenTarget(
        key="coronavirus-hku1",
        organism="seasonal-coronavirus",
        reference="HKU1",
        reference_accessions=("NC_006577.2", "NC_006577"),
        scientific_names=("human coronavirus hku1",),
    ),
    PathogenTarget(
        key="coronavirus-nl63",
        organism="seasonal-coronavirus",
        reference="NL63",
        reference_accessions=("NC_005831.2", "NC_005831"),
        scientific_names=("human coronavirus nl63",),
    ),
    PathogenTarget(
        key="coronavirus-oc43",
        organism="seasonal-coronavirus",
        reference="OC43",
        reference_accessions=("AY391777.1", "AY391777", "NC_006213.1", "NC_006213"),
        scientific_names=("human coronavirus oc43",),
    ),
]


@dataclass
class Candidate:
    target: PathogenTarget
    entry_id: str
    sequence_accession: str
    run_accession: str
    sample_accession: str
    scientific_name: str
    collection_date: str
    country: str
    base_count: str
    description: str
    segment: str = ""


@dataclass
class DatasetEntry:
    target: PathogenTarget
    entry_id: str
    fasta_ids: list[str]
    sequence_accessions: list[str]
    sequence_segments: list[str]
    run_accessions: list[str]
    sample_accession: str
    scientific_name: str
    collection_date: str
    country: str
    base_count: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download ReVSeq ENA consensus sequences and write flat Loculus upload files."
    )
    parser.add_argument("--study-accession", default="PRJEB83635")
    parser.add_argument("--output-dir", type=Path, default=Path("test-data"))
    parser.add_argument(
        "--limit-per-target",
        type=int,
        help="Optional cap per pathogen target for smoke-test datasets. By default all matching records are used.",
    )
    parser.add_argument(
        "--clean",
        action="store_true",
        help="Delete the output directory before writing files. Use only for generated test-data directories.",
    )
    parser.add_argument("--log-level", default="INFO")
    return parser.parse_args()


def get_text(url: str, params: dict[str, str] | None = None, timeout: int = 60) -> str:
    full_url = url if params is None else f"{url}?{urlencode(params)}"
    with urlopen(full_url, timeout=timeout) as response:
        return response.read().decode("utf-8")


def ena_project_sequences(study_accession: str) -> list[dict[str, str]]:
    text = get_text(
        ENA_SEARCH,
        {
            "result": "sequence",
            "query": f'study_accession="{study_accession}"',
            "fields": ",".join(ENA_FIELDS),
            "format": "tsv",
            "limit": "0",
        },
    )
    return list(csv.DictReader(text.splitlines(), delimiter="\t"))


def reference_tokens(description: str) -> set[str]:
    return set(re.findall(r"\b[A-Z]{1,3}_\d+(?:\.\d+)?\b|\b[A-Z]{1,3}\d+(?:\.\d+)?\b", description))


def reference_base(accession: str) -> str:
    return accession.split(".", maxsplit=1)[0]


def classify(row: dict[str, str]) -> PathogenTarget | None:
    description_tokens = reference_tokens(row.get("description", ""))
    for target in TARGETS:
        target_accessions = {reference_base(accession) for accession in target.reference_accessions}
        token_accessions = {reference_base(token) for token in description_tokens}
        if target.reference_accessions and token_accessions.intersection(target_accessions):
            return target

    if description_tokens:
        return None

    scientific_name = row.get("scientific_name", "").strip().lower()
    for target in TARGETS:
        if scientific_name in target.scientific_names:
            return target
    return None


def segment_for(row: dict[str, str], target: PathogenTarget) -> str:
    if target.segment_accessions is None:
        return ""
    description_tokens = {reference_base(token) for token in reference_tokens(row.get("description", ""))}
    for accession, segment in target.segment_accessions.items():
        if reference_base(accession) in description_tokens:
            return segment
    return ""


def load_candidates(study_accession: str, limit_per_target: int | None) -> list[Candidate]:
    candidates = []
    target_counts: dict[str, int] = {}
    for row in ena_project_sequences(study_accession):
        target = classify(row)
        if target is None:
            continue
        if limit_per_target is not None and target_counts.get(target.key, 0) >= limit_per_target:
            continue
        target_counts[target.key] = target_counts.get(target.key, 0) + 1
        candidates.append(
            Candidate(
                target=target,
                entry_id=row["accession"],
                sequence_accession=row["accession"],
                run_accession=row.get("run_accession", ""),
                sample_accession=row.get("sample_accession", ""),
                scientific_name=row.get("scientific_name", ""),
                collection_date=row.get("collection_date", ""),
                country=row.get("country", ""),
                base_count=row.get("base_count", ""),
                description=row.get("description", ""),
                segment=segment_for(row, target),
            )
        )
    return candidates


def build_entries(candidates: list[Candidate]) -> list[DatasetEntry]:
    entries: list[DatasetEntry] = []
    influenza_candidates: dict[tuple[str, str], list[Candidate]] = {}

    for candidate in candidates:
        if candidate.target.organism in {"influenza-a", "influenza-b"}:
            group_key = (
                candidate.target.organism,
                candidate.sample_accession or candidate.run_accession or candidate.sequence_accession,
            )
            influenza_candidates.setdefault(group_key, []).append(candidate)
            continue
        entries.append(
            DatasetEntry(
                target=candidate.target,
                entry_id=candidate.entry_id,
                fasta_ids=[candidate.sequence_accession],
                sequence_accessions=[candidate.sequence_accession],
                sequence_segments=[candidate.segment],
                run_accessions=[candidate.run_accession] if candidate.run_accession else [],
                sample_accession=candidate.sample_accession,
                scientific_name=candidate.scientific_name,
                collection_date=candidate.collection_date,
                country=candidate.country,
                base_count=candidate.base_count,
            )
        )

    for (_, group_id), grouped_candidates in sorted(influenza_candidates.items()):
        ordered_candidates = sorted(
            grouped_candidates,
            key=lambda candidate: (
                INFLUENZA_SEGMENT_ORDER.index(candidate.segment)
                if candidate.segment in INFLUENZA_SEGMENT_ORDER
                else len(INFLUENZA_SEGMENT_ORDER),
                candidate.sequence_accession,
            ),
        )
        first = ordered_candidates[0]
        entries.append(
            DatasetEntry(
                target=first.target,
                entry_id=group_id,
                fasta_ids=[
                    influenza_fasta_id(group_id, first.target, candidate.segment) for candidate in ordered_candidates
                ],
                sequence_accessions=[candidate.sequence_accession for candidate in ordered_candidates],
                sequence_segments=[candidate.segment for candidate in ordered_candidates],
                run_accessions=sorted(
                    {candidate.run_accession for candidate in ordered_candidates if candidate.run_accession}
                ),
                sample_accession=first.sample_accession,
                scientific_name=first.scientific_name,
                collection_date=first.collection_date,
                country=first.country,
                base_count=sum_base_counts(ordered_candidates),
            )
        )

    return entries


def influenza_fasta_id(entry_id: str, target: PathogenTarget, segment: str) -> str:
    if target.organism == "influenza-a":
        return f"{entry_id}_{segment}-{target.reference}"
    return f"{entry_id}_{segment}"


def sum_base_counts(candidates: list[Candidate]) -> str:
    try:
        return str(sum(int(candidate.base_count) for candidate in candidates if candidate.base_count))
    except ValueError:
        return ""


def metadata_fields(organism: str) -> list[str]:
    fields = [
        "id",
        "revseqSourceAccession",
        "enaSequenceAccession",
        "enaRunAccession",
        "enaSampleAccession",
        "scientificName",
        "sampleCollectionDate",
        "geoLocCountry",
        "baseCount",
    ]
    if organism == "influenza-a":
        fields.append("subtype")
    if organism in {"influenza-a", "influenza-b"}:
        fields.extend(["fastaIds", "enaSegmentAccessions"])
    return fields


def metadata_row(entry: DatasetEntry, organism: str) -> dict[str, str]:
    row = {
        "id": entry.entry_id,
        "revseqSourceAccession": ";".join(entry.run_accessions) or entry.sequence_accessions[0],
        "enaSequenceAccession": representative_sequence_accession(entry),
        "enaRunAccession": ";".join(entry.run_accessions),
        "enaSampleAccession": entry.sample_accession,
        "scientificName": entry.scientific_name,
        "sampleCollectionDate": normalize_collection_date(entry.collection_date),
        "geoLocCountry": entry.country,
        "baseCount": entry.base_count,
    }
    if organism == "influenza-a":
        row["subtype"] = entry.target.reference
    if organism in {"influenza-a", "influenza-b"}:
        row["fastaIds"] = " ".join(entry.fasta_ids)
        row["enaSegmentAccessions"] = ";".join(entry.sequence_accessions)
    return row


def representative_sequence_accession(entry: DatasetEntry) -> str:
    if entry.target.organism in {"influenza-a", "influenza-b"}:
        for accession, segment in zip(entry.sequence_accessions, entry.sequence_segments, strict=True):
            if segment == "HA":
                return accession
    return entry.sequence_accessions[0]


def normalize_collection_date(value: str) -> str:
    for date_format in ("%Y-%m-%d", "%d-%b-%Y", "%Y-%m", "%b-%Y", "%Y"):
        try:
            parsed = datetime.strptime(value, date_format)
        except ValueError:
            continue
        if date_format in {"%Y-%m-%d", "%d-%b-%Y"}:
            return parsed.strftime("%Y-%m-%d")
        if date_format in {"%Y-%m", "%b-%Y"}:
            return f"{parsed:%Y-%m}-01"
        return f"{parsed:%Y}-01-01"
    return value


def sequence_for(accession: str) -> str:
    fasta = get_text(f"{ENA_FASTA}/{accession}", {"download": "false"})
    sequence = "".join(line.strip() for line in fasta.splitlines() if not line.startswith(">"))
    if not sequence:
        raise RuntimeError(f"ENA returned an empty FASTA sequence for {accession}")
    return sequence


def write_flat_dataset(entries: list[DatasetEntry], output_dir: Path, clean: bool) -> None:
    if clean and output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    by_organism: dict[str, list[DatasetEntry]] = {}
    for entry in entries:
        by_organism.setdefault(entry.target.organism, []).append(entry)

    for organism, organism_entries in sorted(by_organism.items()):
        write_organism_files(organism, sorted(organism_entries, key=lambda entry: entry.entry_id), output_dir)


def write_organism_files(organism: str, entries: list[DatasetEntry], output_dir: Path) -> None:
    metadata_path = output_dir / f"{organism}-metadata.tsv"
    fasta_path = output_dir / f"{organism}-sequences.fasta"
    fields = metadata_fields(organism)

    with metadata_path.open("w", encoding="utf-8", newline="") as metadata_handle:
        writer = csv.DictWriter(metadata_handle, delimiter="\t", fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        for entry in entries:
            writer.writerow(metadata_row(entry, organism))

    with fasta_path.open("w", encoding="utf-8") as fasta_handle:
        for entry in entries:
            for fasta_id, accession in zip(entry.fasta_ids, entry.sequence_accessions, strict=True):
                fasta_handle.write(f">{fasta_id}\n{sequence_for(accession)}\n")

    fasta_count = sum(len(entry.fasta_ids) for entry in entries)
    LOG.info("Wrote %s metadata rows and %s FASTA records for %s", len(entries), fasta_count, organism)


def main() -> None:
    args = parse_args()
    logging.basicConfig(level=getattr(logging, args.log_level.upper()), format="%(levelname)s %(message)s")
    candidates = load_candidates(args.study_accession, args.limit_per_target)
    LOG.info("Selected %s ENA consensus records from %s", len(candidates), args.study_accession)
    entries = build_entries(candidates)
    write_flat_dataset(entries, args.output_dir, args.clean)


if __name__ == "__main__":
    main()
