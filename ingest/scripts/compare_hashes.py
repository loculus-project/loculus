import json
import logging
import operator
from collections import defaultdict
from dataclasses import dataclass
from hashlib import md5

import click
import requests
import yaml

logger = logging.getLogger(__name__)
logging.basicConfig(
    encoding="utf-8",
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)8s (%(filename)20s:%(lineno)4d) - %(message)s ",
    datefmt="%H:%M:%S",
)


@dataclass
class Config:
    segmented: str
    nucleotide_sequences: list[str]
    debug_hashes: bool = False
    slack_hook: str = ""


InsdcAccession = str
JointInsdcAccession = str
LoculusAccession = str
Status = str


@dataclass
class Revision:
    loculus_accession: LoculusAccession
    curated_fields: dict[str, str] | None = None  # map from field to value


@dataclass
class SequenceUpdateManager:
    submit: list[JointInsdcAccession]
    revise: dict[JointInsdcAccession, Revision]
    noop: dict[JointInsdcAccession, LoculusAccession]
    blocked: dict[Status, dict[JointInsdcAccession, LoculusAccession]]
    revoke: dict[
        JointInsdcAccession, dict[LoculusAccession, InsdcAccession]
    ]  # Map of new grouping joint insdc accessions to map of previous state
    # i.e. loculus accessions (to be revoked) and their corresponding old joint insdc accessions
    sampled_out: list[JointInsdcAccession]
    hashes: list[float]

    def __init__(self, config: Config):
        self.config = config
        self.submit = []
        self.revise = {}
        self.noop = {}
        self.blocked = defaultdict(dict)
        self.revoke = {}
        self.sampled_out = []
        self.hashes = []


def notify(config: Config, text: str):
    """Send slack notification with blocked revision details"""
    if config.slack_hook:
        requests.post(config.slack_hook, data=json.dumps({"text": text}), timeout=10)
    logger.warn(text)


def get_curated_fields(curated_data, pre_curated_data, current_state):
    curated_fields = {}
    added = {
        k: curated_data[k]
        for k in curated_data
        if k not in pre_curated_data and curated_data[k] == current_state.get(k)
    }
    curated_fields.update(added)
    removed = {
        k: curated_data.get(k)
        for k in pre_curated_data
        if k not in curated_data and curated_data.get(k) == current_state.get(k)
    }
    curated_fields.update(removed)
    modified = {
        k: curated_data[k]
        for k in pre_curated_data
        if k in curated_data
        and pre_curated_data[k] != curated_data[k]
        and curated_data[k] == current_state.get(k)
    }
    curated_fields.update(modified)
    return curated_fields


def get_changed_fields(curated_data, pre_curated_data):
    added = [k for k in curated_data if k not in pre_curated_data]
    removed = [k for k in pre_curated_data if k not in curated_data]
    modified = [
        k for k in pre_curated_data if k in curated_data and pre_curated_data[k] != curated_data[k]
    ]
    return set(added + removed + modified)


def handle_curation(
    record: dict,
    sorted_versions: list,
    update_manager: SequenceUpdateManager,
):
    submitter_list = [sorted_version["submitter"] for sorted_version in sorted_versions]
    curated_metadata_fields = {}
    for index, submitter in enumerate(submitter_list):
        if submitter != "insdc_ingest_user":
            curated_data = sorted_versions[index]["original_metadata"]
            pre_curated_data = sorted_versions[index - 1]["original_metadata"]
            current_state = pre_curated_data = sorted_versions[-1]["original_metadata"]
            curated_metadata_fields.update(
                get_curated_fields(curated_data, pre_curated_data, current_state)
            )
    new_changed_metadata_fields = get_changed_fields(
        record, sorted_versions[-1]["original_metadata"]
    )
    if new_changed_metadata_fields.isdisjoint(curated_metadata_fields.keys()):
        logger.info("Sequence has been curated before but in different fields - can be revised")
        update_manager.revise[record["insdcAccessionBase"]] = Revision(
            loculus_accession=sorted_versions[-1]["loculus_accession"],
            curated_fields=curated_metadata_fields,
        )
    else:
        logger.info(
            "Sequence has been curated before but in overlapping fields - cannot be revised automatically"
        )
        notify(
            update_manager.config,
            f"Sequence {record['insdcAccessionBase']} has been curated before in overlapping fields - not not know how to proceed",
        )
        update_manager.blocked["CURATION_ISSUE"][record["insdcAccessionBase"]] = sorted_versions[-1][
            "loculus_accession"
        ]
    return update_manager


def md5_float(string: str) -> float:
    """Turn a string randomly but stably into a float between 0 and 1"""
    return int(md5(string.encode(), usedforsecurity=False).hexdigest(), 16) / 16**32


def sample_out_hashed_records(
    insdc_accession_base: str, subsample_fraction: float, sampled_out: dict[str, str], fasta_id: str
) -> tuple[float, list[dict[str, str]]]:
    hash_float = md5_float(insdc_accession_base)
    keep = hash_float <= subsample_fraction
    if not keep:
        sampled_out.append({fasta_id: insdc_accession_base, "hash": hash_float})
    return hash_float, sampled_out


def process_hashes(
    insdc_accession_base: str,
    fasta_id: str,
    record: dict,
    submitted: dict,
    update_manager: SequenceUpdateManager,
):
    if insdc_accession_base not in submitted:
        update_manager.submit.append(fasta_id)
    else:
        sorted_versions = sorted(
            submitted[insdc_accession_base]["versions"], key=lambda x: x["version"]
        )
        latest = sorted_versions[-1]
        if latest["hash"] != record["hash"]:
            status = latest["status"]
            if status == "APPROVED_FOR_RELEASE":
                if {sorted_version["submitter"] for sorted_version in sorted_versions} != {
                    "insdc_ingest_user"
                }:
                    # Sequence has been curated before - special case
                    return handle_curation(record, sorted_versions, update_manager)
                update_manager.revise[fasta_id] = Revision(
                    loculus_accession=submitted[insdc_accession_base]["loculus_accession"]
                )
            else:
                update_manager.blocked[status][fasta_id] = submitted[insdc_accession_base]["loculus_accession"]
        else:
            update_manager.noop[fasta_id] = submitted[insdc_accession_base]["loculus_accession"]
    return update_manager


@click.command()
@click.option("--config-file", required=True, type=click.Path(exists=True))
@click.option("--old-hashes", required=True, type=click.Path(exists=True))
@click.option("--metadata", required=True, type=click.Path(exists=True))
@click.option("--to-submit", required=True, type=click.Path())
@click.option("--to-revise", required=True, type=click.Path())
@click.option("--to-revoke", required=True, type=click.Path())
@click.option("--unchanged", required=True, type=click.Path())
@click.option("--sampled-out-file", required=True, type=click.Path())
@click.option("--output-blocked", required=True, type=click.Path())
@click.option("--subsample-fraction", required=True, type=float)
@click.option("--debug-hashes", is_flag=True, default=False)
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
)
def main(
    config_file: str,
    old_hashes: str,
    metadata: str,
    to_submit: str,
    to_revise: str,
    to_revoke: str,
    unchanged: str,
    output_blocked: str,
    sampled_out_file: str,
    subsample_fraction: float,
    debug_hashes: bool,
    log_level: str,
) -> None:
    logger.setLevel(log_level)
    logging.getLogger("requests").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    with open(config_file, encoding="utf-8") as file:
        full_config = yaml.safe_load(file)
        relevant_config = {
            key: full_config[key] for key in Config.__annotations__ if key in full_config
        }
        config = Config(**relevant_config)

    if debug_hashes:
        config.debug_hashes = True

    submitted: dict = json.load(open(old_hashes, encoding="utf-8"))
    new_metadata = json.load(open(metadata, encoding="utf-8"))

    # Sort all submitted versions by version number
    for _, loculus in submitted.items():
        # TODO: check sort order
        loculus["versions"] = sorted(loculus["versions"], key=operator.itemgetter("version"))

    update_manager = SequenceUpdateManager(config=config)

    for fasta_id, record in new_metadata.items():
        if not config.segmented:
            insdc_accession_base = record["insdcAccessionBase"]
            if not insdc_accession_base:
                msg = "Ingested sequences without INSDC accession base - potential internal error"
                raise ValueError(msg)
            hash_float, update_manager.sampled_out = sample_out_hashed_records(
                insdc_accession_base, subsample_fraction, update_manager.sampled_out, fasta_id
            )
            if config.debug_hashes:
                update_manager.hashes.append(hash_float)
            process_hashes(
                insdc_accession_base, fasta_id, record, submitted, update_manager
            )
            continue

        insdc_keys = [f"insdcAccessionBase_{segment}" for segment in config.nucleotide_sequences]
        insdc_accession_base_list = [record[key] for key in insdc_keys if record[key]]
        if len(insdc_accession_base_list) == 0:
            msg = (
                "Ingested multi-segmented sequences without INSDC accession base(s) "
                "- potential internal error"
            )
            raise ValueError(msg)
        insdc_accession_base = "/".join(
            [
                f"{record[key]}.{segment}"
                for key, segment in zip(insdc_keys, config.nucleotide_sequences)
                if record[key]
            ]
        )
        hash_float, update_manager.sampled_out = sample_out_hashed_records(
            insdc_accession_base, subsample_fraction, update_manager.sampled_out, fasta_id
        )
        if config.debug_hashes:
            update_manager.hashes.append(hash_float)
        if all(accession not in submitted for accession in insdc_accession_base_list):
            update_manager.submit.append(fasta_id)
            continue
        if all(accession in submitted for accession in insdc_accession_base_list) and all(
            submitted[accession]["jointAccession"] == insdc_accession_base
            for accession in insdc_accession_base_list
        ):
            # grouping is the same, can just look at first segment in group
            accession = insdc_accession_base_list[0]
            process_hashes(
                accession, fasta_id, record, submitted, update_manager
            )
            continue
        old_accessions = {}
        for accession in insdc_accession_base_list:
            if accession in submitted:
                old_accessions[submitted[accession]["loculus_accession"]] = submitted[accession][
                    "jointAccession"
                ]
                # TODO: Figure out how to check for curation when regrouping - maybe just notify
        logger.warn(
            "Grouping has changed. Ingest would like to group INSDC samples:"
            f"{insdc_accession_base}, however these were previously grouped as {old_accessions}"
        )
        update_manager.revoke[fasta_id] = old_accessions

    outputs = [
        (update_manager.submit, to_submit, "Sequences to submit"),
        (update_manager.revise, to_revise, "Sequences to revise"),
        (update_manager.noop, unchanged, "Unchanged sequences"),
        (update_manager.blocked, output_blocked, "Blocked sequences"),
        (update_manager.revoke, to_revoke, "Sequences to revoke"),
        (update_manager.sampled_out, sampled_out_file, "Sampled out sequences"),
    ]

    if config.debug_hashes:
        outputs.append((update_manager.hashes, "hashes.json", "Hashes"))

    for value, path, text in outputs:
        with open(path, "w", encoding="utf-8") as file:
            json.dump(value, file)
        logger.info(f"{text}: {len(value)}")


if __name__ == "__main__":
    main()
