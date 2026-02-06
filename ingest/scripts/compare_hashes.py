import json
import logging
from collections import defaultdict
from dataclasses import dataclass
from hashlib import md5
from typing import Any

import click
import orjsonl
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
    organism: str
    segmented: str
    nucleotide_sequences: list[str]
    slack_hook: str = ""


InsdcAccession = str  # one per segment
JointInsdcAccession = str  # for single segmented this is equal to the InsdcAccession,
# for multi-segmented it is a concatenation of the base INSDC accessions all segments with their segment
# e.g. "ABC123.S/ABC123.M/ABC123.L" for segments S, M, L
LoculusAccession = str  # one per sample, potentially multiple segments
SubmissionId = str  # used to link metadata entries to fasta entries,
# historically the same as the JointInsdcAccession with the INSDC version
# e.g. "ABC123.1.S/ABC123.2.M/ABC123.1.L" for segments S, M, L
Status = str


@dataclass
class SequenceUpdateManager:
    submit: list[SubmissionId]
    revise: dict[SubmissionId, LoculusAccession]
    noop: dict[SubmissionId, LoculusAccession]
    blocked: dict[Status, dict[SubmissionId, LoculusAccession]]
    revoke: dict[
        SubmissionId, dict[LoculusAccession, JointInsdcAccession]
    ]  # Map of current submissionId to map of previous state
    # i.e. loculus accessions (to be revoked) and their corresponding old joint insdc accessions
    sampled_out: list[JointInsdcAccession]
    hashes: list[float]
    config: Config


@dataclass
class LatestLoculusVersion:
    loculus_accession: LoculusAccession
    latest_version: int
    hash: float | None
    status: Status
    curated: bool
    jointAccession: JointInsdcAccession  # noqa: N815


def notify(config: Config, text: str):
    """Send slack notification with text"""
    if config.slack_hook:
        try:
            requests.post(config.slack_hook, data=json.dumps({"text": text}), timeout=10)
        except Exception as e:
            logger.error(f"Failed to send Slack notification: {e}")


def md5_float(string: str) -> float:
    """Turn a string randomly but stably into a float between 0 and 1"""
    return int(md5(string.encode(), usedforsecurity=False).hexdigest(), 16) / 16**32


def sample_out_hashed_records(
    joint_insdc_accession: JointInsdcAccession,
    subsample_fraction: float,
) -> bool:
    hash_float = md5_float(joint_insdc_accession)
    keep = hash_float <= subsample_fraction
    return not keep


def process_hashes(
    ingested_insdc_accession: InsdcAccession,
    metadata_id: SubmissionId,
    newly_ingested_hash: float | None,
    submitted: dict[InsdcAccession, LatestLoculusVersion],
    update_manager: SequenceUpdateManager,
):
    """
    Decide if metadata_id should be submitted, revised, or noop
    """

    if ingested_insdc_accession not in submitted:
        update_manager.submit.append(metadata_id)
        return update_manager

    previously_submitted_entry = submitted[ingested_insdc_accession]
    corresponding_loculus_accession = previously_submitted_entry.loculus_accession
    status = previously_submitted_entry.status

    if previously_submitted_entry.hash == newly_ingested_hash:
        update_manager.noop[metadata_id] = corresponding_loculus_accession
        return update_manager

    if status != "APPROVED_FOR_RELEASE":
        update_manager.blocked[status][metadata_id] = corresponding_loculus_accession
        return update_manager

    if previously_submitted_entry.curated:
        # Sequence has been curated before - special case
        notification = (
            f"Ingest: Sequence {corresponding_loculus_accession} with INSDC "
            f"accession {ingested_insdc_accession} has been curated before "
            f"- do not know how to proceed. New hash: {newly_ingested_hash}, "
            f"old hash: {previously_submitted_entry.hash}."
        )
        logger.warning(notification)
        notify(update_manager.config, notification)
        update_manager.blocked["CURATION_ISSUE"][metadata_id] = corresponding_loculus_accession
        return update_manager

    update_manager.revise[metadata_id] = corresponding_loculus_accession
    return update_manager


def get_joint_insdc_accession(record, insdc_keys, config, take_subset=False, subset=None):
    subset = subset or {}
    pairs = zip(insdc_keys, config.nucleotide_sequences, strict=False)

    if take_subset:
        return "/".join(
            f"{record[key]}.{segment}" for key, segment in pairs if record.get(key) in subset
        )

    return "/".join(f"{record[key]}.{segment}" for key, segment in pairs if record.get(key))


def get_loculus_accession_to_latest_version_map(
    old_hashes: str,
) -> dict[LoculusAccession, dict[str, Any]]:
    """
    Maps each LoculusAccession to the entry of the latest version,
    additionally adding a bool field curated.

    old_hashes is an ndjson file where each entry has the following fields:
    ```
    {"accession":"LOC_00021A9",
    "version":1,
    "submitter":"insdc_ingest_user",
    "isRevocation":false,
    "originalMetadata":
        {"hash":"6349c57c56efaca1fbfcabf4d377535b",
        "insdcAccessionBase_L":"",
        "insdcAccessionBase_M":"",
        "insdcAccessionBase_S":"ON191017"},
    "status":"RECEIVED"}
    ```
    (a single segmented example will only have one insdcAccessionBase field)
    """
    loculus_accession_to_version_map: dict[LoculusAccession, list[dict[str, Any]]] = {}

    for field in orjsonl.stream(old_hashes):
        accession: LoculusAccession = field["accession"]
        if accession not in loculus_accession_to_version_map:
            loculus_accession_to_version_map[accession] = []
        loculus_accession_to_version_map[accession].append(field)

    loculus_accession_to_latest_version_map: dict[LoculusAccession, dict[str, Any]] = {}
    for accession, versions in loculus_accession_to_version_map.items():
        sorted_versions = sorted(versions, key=lambda x: int(x["version"]), reverse=True)
        # Revocations do not have INSDC accessions, get these from the last non-revocation
        if sorted_versions[0]["isRevocation"]:
            non_revoked_versions = sorted(
                [v for v in versions if not v.get("isRevocation", False)],
                key=lambda x: int(x["version"]),
                reverse=True,
            )
            latest = non_revoked_versions[0]
            latest["isRevocation"] = True
            latest["version"] = sorted_versions[0]["version"]
            latest["submitter"] = sorted_versions[0]["submitter"]
        else:
            latest = sorted_versions[0]

        # Check if any version of sequence has been curated
        latest["curated"] = {v["submitter"] for v in sorted_versions} != {"insdc_ingest_user"}

        loculus_accession_to_latest_version_map[accession] = latest
    return loculus_accession_to_latest_version_map


def construct_submitted_dict(
    old_hashes: str, insdc_keys: list[str], config: Config
) -> dict[InsdcAccession, LatestLoculusVersion]:
    # Get the latest version for each loculus accession
    loculus_accession_to_latest_version_map: dict[LoculusAccession, dict[str, Any]] = (
        get_loculus_accession_to_latest_version_map(old_hashes)
    )

    # Create a map from INSDC accession to latest loculus accession
    insdc_to_loculus_accession_map: dict[InsdcAccession, LatestLoculusVersion] = {}
    for loculus_accession, entry in loculus_accession_to_latest_version_map.items():
        original_metadata: dict[str, Any] = entry["originalMetadata"]
        hash_value = original_metadata.get("hash")

        if config.segmented:
            insdc_accessions = [
                original_metadata[key] for key in insdc_keys if original_metadata[key]
            ]
            joint_accession = get_joint_insdc_accession(original_metadata, insdc_keys, config)
        else:
            insdc_accessions = [original_metadata.get("insdcAccessionBase", "")]
            joint_accession = original_metadata.get("insdcAccessionBase", "")

        status = "REVOKED" if entry["isRevocation"] else entry["status"]

        for insdc_accession in insdc_accessions:
            latest = LatestLoculusVersion(
                loculus_accession=loculus_accession,
                latest_version=entry["version"],
                hash=hash_value,
                status=status,
                curated=entry["curated"],
                jointAccession=joint_accession,
            )
            if insdc_accession not in insdc_to_loculus_accession_map:
                insdc_to_loculus_accession_map[insdc_accession] = latest
                continue
            if (
                insdc_to_loculus_accession_map[insdc_accession].loculus_accession
                == loculus_accession
            ):
                continue
            # Only allow one loculus accession per INSDC accession, unless one has been revoked
            # In this case ignore the revoked one
            if insdc_to_loculus_accession_map[insdc_accession].status == "REVOKED":
                insdc_to_loculus_accession_map[insdc_accession] = latest
                continue
            if latest.status == "REVOKED":
                # If the next one is revoked, keep the current one
                continue
            message = (
                f"INSDC accession {insdc_accession} has multiple loculus accessions: "
                f"{loculus_accession} and "
                f"{insdc_to_loculus_accession_map[insdc_accession].loculus_accession}!"
            )
            logger.error(message)
            raise ValueError(message)

    return insdc_to_loculus_accession_map


def get_approved_submitted_accessions(
    data: dict[InsdcAccession, LatestLoculusVersion],
) -> set[InsdcAccession]:
    approved = set()
    for insdc_accession, info in data.items():
        if info.status == "APPROVED_FOR_RELEASE":
            approved.add(insdc_accession)
    return approved


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

    insdc_keys = [f"insdcAccessionBase_{segment}" for segment in config.nucleotide_sequences]

    submitted: dict[InsdcAccession, LatestLoculusVersion] = construct_submitted_dict(
        old_hashes, insdc_keys, config
    )
    already_ingested_accessions = get_approved_submitted_accessions(submitted)
    current_ingested_accessions: set[InsdcAccession] = set()

    update_manager = SequenceUpdateManager(
        submit=[],
        revise={},
        noop={},
        blocked=defaultdict(dict),
        revoke={},
        sampled_out=[],
        hashes=[],
        config=config,
    )

    for field in orjsonl.stream(metadata):
        metadata_id: SubmissionId = field["id"]
        record: dict[str, Any] = field["metadata"]
        ingested_hash: float | None = record.get("hash")
        if not config.segmented:
            insdc_accession_base = record["insdcAccessionBase"]
            if not insdc_accession_base:
                msg = "Ingested sequences without INSDC accession base - potential internal error"
                raise ValueError(msg)
            if sample_out_hashed_records(insdc_accession_base, subsample_fraction):
                update_manager.sampled_out.append(insdc_accession_base)
                continue
            process_hashes(
                insdc_accession_base, metadata_id, ingested_hash, submitted, update_manager
            )
            current_ingested_accessions.add(insdc_accession_base)
            continue

        insdc_accession_base_list = [record[key] for key in insdc_keys if record[key]]
        if len(insdc_accession_base_list) == 0:
            msg = (
                "Ingested multi-segmented sequences without INSDC accession base(s) "
                "- potential internal error"
            )
            raise ValueError(msg)
        joint_insdc_accession = get_joint_insdc_accession(record, insdc_keys, config)
        insdc_accessions = [record[key] for key in insdc_keys if record.get(key)]
        current_ingested_accessions.update(set(insdc_accessions))
        if sample_out_hashed_records(joint_insdc_accession, subsample_fraction):
            update_manager.sampled_out.append(joint_insdc_accession)
            continue
        # Process hashes and check if grouping has changed
        if all(accession not in submitted for accession in insdc_accession_base_list):
            update_manager.submit.append(metadata_id)
            continue
        if all(accession in submitted for accession in insdc_accession_base_list) and all(
            submitted[accession].jointAccession == joint_insdc_accession
            for accession in insdc_accession_base_list
        ):
            # grouping is the same, can just look at first segment in group
            accession = insdc_accession_base_list[0]
            process_hashes(accession, metadata_id, ingested_hash, submitted, update_manager)
            continue
        # old group is subset of new group, new group has new segments
        old_submitted = [
            accession for accession in insdc_accession_base_list if accession in submitted
        ]
        if all(
            submitted[accession].jointAccession
            == get_joint_insdc_accession(
                record, insdc_keys, config, take_subset=True, subset=set(old_submitted)
            )
            for accession in old_submitted
        ):
            # has a new segment, must be revised
            accession = old_submitted[0]
            process_hashes(accession, metadata_id, ingested_hash, submitted, update_manager)
            continue
        old_accessions: dict[LoculusAccession, JointInsdcAccession] = {
            submitted[a].loculus_accession: submitted[a].jointAccession
            for a in insdc_accession_base_list
            if a in submitted
        }
        # TODO: Figure out how to check for curation when regrouping - maybe just notify
        logger.warning(
            "Grouping has changed. Ingest would like to group INSDC samples:"
            f"{joint_insdc_accession}, however these were previously grouped as {old_accessions}"
        )
        update_manager.revoke[metadata_id] = old_accessions

    outputs = [
        (update_manager.submit, to_submit, "Sequences to submit"),
        (update_manager.revise, to_revise, "Sequences to revise"),
        (update_manager.noop, unchanged, "Unchanged sequences"),
        (update_manager.blocked, output_blocked, "Blocked sequences"),
        (update_manager.revoke, to_revoke, "Sequences to revoke"),
        (update_manager.sampled_out, sampled_out_file, "Sampled out sequences"),
    ]

    for value, path, text in outputs:
        with open(path, "w", encoding="utf-8") as file:
            json.dump(value, file)
        if text == "Blocked sequences":
            for status, accessions in value.items():
                logger.info(f"Blocked sequences - {status}: {len(accessions)}")
        else:
            logger.info(f"{text}: {len(value)}")

    potentially_suppressed = already_ingested_accessions - current_ingested_accessions
    if len(potentially_suppressed) > 0:
        warning = (
            f"Organism: {config.organism}; {len(potentially_suppressed)} previously ingested "
            "INSDC accessions not found in "
            f"re-ingested metadata - {', '.join(potentially_suppressed)}."
            " This might be due to these sequences being suppressed in the INSDC database."
            " Please check the INSDC database for these accessions."
            " If this is the case, please revoke these accessions in Loculus."
            " If this is not the case, this indicates a potential ingest error."
        )
        logger.warning(warning)
        notify(config, warning)


if __name__ == "__main__":
    main()
