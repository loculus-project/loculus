import dataclasses
import json
import logging
import sys
from collections import defaultdict
from dataclasses import dataclass
from hashlib import md5
from typing import Any

import click
import orjsonl
import pandas as pd
import requests
import yaml
from loculus_client import Config, get_submitted

logger = logging.getLogger(__name__)
logging.basicConfig(
    encoding="utf-8",
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)8s (%(filename)20s:%(lineno)4d) - %(message)s ",
    datefmt="%H:%M:%S",
)


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
    hashes: list[str]
    config: Config
    muted_hashes: dict[LoculusAccession, set[str]]


@dataclass(slots=True)
class LatestLoculusVersion:
    loculus_accession: LoculusAccession
    latest_version: int
    hash: str | None
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


def calculate_metadata_diff(
    config: Config, new_metadata: dict[str, Any], previous_entry: LatestLoculusVersion
) -> dict[str, Any]:
    previous_metadata_list = get_submitted(
        config,
        None,
        fields=None,
        accessionVersionsFilter=[
            f"{previous_entry.loculus_accession}.{previous_entry.latest_version}"
        ],
    )
    if not previous_metadata_list or len(previous_metadata_list) != 1:
        logger.warning(
            f"Could not retrieve previous metadata for {previous_entry.loculus_accession} "
            f"version {previous_entry.latest_version} to calculate metadata diff"
        )
        return {}
    previous_metadata = previous_metadata_list[0].get("submittedMetadata", {})

    return {
        key: {
            "old": previous_metadata.get(key),
            "new": new_metadata.get(key),
        }
        for key in new_metadata.keys() | previous_metadata.keys()
        if new_metadata.get(key) != previous_metadata.get(key)
    }


# How a record compares to what was submitted before (see classify_hash)
SUBMIT = "submit"
NOOP = "noop"
MUTED = "muted"
BLOCKED = "blocked"
CURATED = "curated"
REVISE = "revise"


def classify_hash(
    ingested_insdc_accession: InsdcAccession,
    newly_ingested_hash: str | None,
    submitted: dict[InsdcAccession, LatestLoculusVersion],
    muted_hashes: dict[LoculusAccession, set[str]],
) -> str:
    """Decide if a record should be submitted, revised, or left alone, without side effects"""
    if ingested_insdc_accession not in submitted:
        return SUBMIT
    previously_submitted_entry = submitted[ingested_insdc_accession]
    if previously_submitted_entry.hash == newly_ingested_hash:
        return NOOP
    if newly_ingested_hash in muted_hashes.get(previously_submitted_entry.loculus_accession, set()):
        return MUTED
    if previously_submitted_entry.status != "APPROVED_FOR_RELEASE":
        return BLOCKED
    if previously_submitted_entry.curated:
        return CURATED
    return REVISE


def process_hashes(
    ingested_insdc_accession: InsdcAccession,
    metadata_id: SubmissionId,
    new_metadata: dict[str, Any],
    submitted: dict[InsdcAccession, LatestLoculusVersion],
    update_manager: SequenceUpdateManager,
):
    """
    Decide if metadata_id should be submitted, revised, or noop
    """
    newly_ingested_hash: str | None = new_metadata.get("hash")
    decision = classify_hash(
        ingested_insdc_accession, newly_ingested_hash, submitted, update_manager.muted_hashes
    )

    if decision == SUBMIT:
        update_manager.submit.append(metadata_id)
        return update_manager

    previously_submitted_entry = submitted[ingested_insdc_accession]
    corresponding_loculus_accession = previously_submitted_entry.loculus_accession
    status = previously_submitted_entry.status

    if decision == NOOP:
        update_manager.noop[metadata_id] = corresponding_loculus_accession
        return update_manager

    if decision == MUTED:
        logger.info(
            f"Skipping muted hash {newly_ingested_hash} for accession {corresponding_loculus_accession}"
        )
        update_manager.noop[metadata_id] = corresponding_loculus_accession
        return update_manager

    if decision == BLOCKED:
        update_manager.blocked[status][metadata_id] = corresponding_loculus_accession
        return update_manager

    if decision == CURATED:
        metadata_diff = calculate_metadata_diff(
            update_manager.config, new_metadata, previously_submitted_entry
        )
        # Sequence has been curated before - special case
        notification = (
            f"Ingest: Sequence {corresponding_loculus_accession} with INSDC "
            f"accession {ingested_insdc_accession} has been curated before "
            f"- do not know how to proceed. New hash: {newly_ingested_hash}, "
            f"old hash: {previously_submitted_entry.hash}. Metadata diff: {metadata_diff}"
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


_MISSING = object()


@dataclass(slots=True)
class _VersionsSeen:
    """What construct_submitted_dict keeps of the versions of one Loculus accession: the latest
    version, and the latest non-revocation (revocations have no INSDC accessions)"""

    latest_version: Any
    latest_version_number: int
    latest_is_revocation: bool
    non_revocation_version_number: int = -1
    non_revocation_status: Status = ""
    non_revocation_hash: str | None = None
    non_revocation_insdc_values: tuple = ()
    latest_by_curator: bool = False
    non_revocation_by_curator: bool = False
    versions_by_curator: int = 0


def construct_submitted_dict(  # noqa: C901, PLR0912, PLR0915
    old_hashes: str, insdc_keys: list[str], config: Config
) -> dict[InsdcAccession, LatestLoculusVersion]:
    """Map each INSDC accession to the latest version of the Loculus accession that has it

    old_hashes is an ndjson file where each entry has the following fields:
    ```
    {"accession":"LOC_00021A9",
    "version":1,
    "submitter":"insdc_ingest_user",
    "isRevocation":false,
    "submittedMetadata":
        {"hash":"6349c57c56efaca1fbfcabf4d377535b",
        "insdcAccessionBase_L":"",
        "insdcAccessionBase_M":"",
        "insdcAccessionBase_S":"ON191017"},
    "status":"RECEIVED"}
    ```
    (a single segmented example will only have one insdcAccessionBase field)

    The latest version of a revoked accession takes its INSDC accessions and hash from the latest
    non-revocation, and an accession counts as curated if any version was submitted by someone else
    than the ingest user. Of versions with the same number, the first in the file counts.

    Streamed, keeping two versions per Loculus accession: holding every entry took ~1 kB per
    previous submission, which is GBs for SARS-CoV-2.
    """
    value_keys = insdc_keys if config.segmented else ["insdcAccessionBase"]
    seen: dict[LoculusAccession, _VersionsSeen] = {}
    for entry in orjsonl.stream(old_hashes):
        accession: LoculusAccession = entry["accession"]
        version_number = int(entry["version"])
        is_revocation = entry.get("isRevocation", False)
        versions = seen.get(accession)
        by_curator = entry["submitter"] != "insdc_ingest_user"
        if versions is None:
            versions = seen[accession] = _VersionsSeen(
                entry["version"], version_number, is_revocation, latest_by_curator=by_curator
            )
        elif version_number > versions.latest_version_number:
            versions.latest_version = entry["version"]
            versions.latest_version_number = version_number
            versions.latest_is_revocation = is_revocation
            versions.latest_by_curator = by_curator
        versions.versions_by_curator += by_curator
        if not is_revocation and version_number > versions.non_revocation_version_number:
            submitted_metadata = entry["submittedMetadata"]
            versions.non_revocation_version_number = version_number
            versions.non_revocation_status = sys.intern(entry["status"])
            versions.non_revocation_hash = submitted_metadata.get("hash")
            versions.non_revocation_insdc_values = tuple(
                submitted_metadata.get(key, _MISSING) for key in value_keys
            )
            versions.non_revocation_by_curator = by_curator

    # Create a map from INSDC accession to latest loculus accession
    insdc_to_loculus_accession_map: dict[InsdcAccession, LatestLoculusVersion] = {}
    for loculus_accession, versions in seen.items():
        if versions.non_revocation_version_number < 0:
            msg = f"{loculus_accession} has no version that is not a revocation"
            raise ValueError(msg)
        if config.segmented:
            for key, value in zip(value_keys, versions.non_revocation_insdc_values, strict=True):
                if value is _MISSING:
                    raise KeyError(key)
            submitted_metadata = dict(
                zip(value_keys, versions.non_revocation_insdc_values, strict=True)
            )
            insdc_accessions = [
                submitted_metadata[key] for key in insdc_keys if submitted_metadata[key]
            ]
            joint_accession = get_joint_insdc_accession(submitted_metadata, insdc_keys, config)
        else:
            value = versions.non_revocation_insdc_values[0]
            joint_accession = "" if value is _MISSING else value
            insdc_accessions = [joint_accession]

        status = "REVOKED" if versions.latest_is_revocation else versions.non_revocation_status
        # Check if any version of sequence has been curated. For a revoked accession, the latest
        # non-revocation counts with the submitter of the revocation, as it always has (only
        # reachable in the metadata diff of a curated sequence, which REVOKED never gets to).
        by_curator = versions.versions_by_curator
        if versions.latest_is_revocation:
            by_curator += versions.latest_by_curator - versions.non_revocation_by_curator
        latest = LatestLoculusVersion(
            loculus_accession=loculus_accession,
            latest_version=versions.latest_version,
            hash=versions.non_revocation_hash,
            status=status,
            curated=by_curator > 0,
            jointAccession=joint_accession,
        )

        for insdc_accession in insdc_accessions:
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


def load_muted_hashes_dict(muted_hashes_path: str) -> dict[LoculusAccession, set[str]]:
    expect_columns = {"accession", "hash_digest"}
    df = pd.read_csv(muted_hashes_path, sep="\t")
    if not expect_columns.issubset(df.columns):
        msg = f"Malformatted muted-hash file {muted_hashes_path}: must contain columns '{expect_columns}'"
        raise ValueError(msg)
    return df.groupby("accession")["hash_digest"].agg(set).to_dict()


def load_config(config_file: str) -> Config:
    with open(config_file, encoding="utf-8") as file:
        full_config = yaml.safe_load(file)
    relevant_config = {f.name: full_config.get(f.name, []) for f in dataclasses.fields(Config)}
    return Config(**relevant_config)


@click.command()
@click.option("--config-file", required=True, type=click.Path(exists=True))
@click.option("--old-hashes", required=True, type=click.Path(exists=True))
@click.option("--muted-hashes", required=False, type=click.Path(exists=True))
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
    muted_hashes: str,
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
    config = load_config(config_file)

    insdc_keys = [f"insdcAccessionBase_{segment}" for segment in config.nucleotide_sequences]

    submitted: dict[InsdcAccession, LatestLoculusVersion] = construct_submitted_dict(
        old_hashes, insdc_keys, config
    )
    already_ingested_accessions = get_approved_submitted_accessions(submitted)
    current_ingested_accessions: set[InsdcAccession] = set()
    muted_hashes_dict: dict[LoculusAccession, set[str]] = (
        load_muted_hashes_dict(muted_hashes) if muted_hashes else {}
    )

    update_manager = SequenceUpdateManager(
        submit=[],
        revise={},
        noop={},
        blocked=defaultdict(dict),
        revoke={},
        sampled_out=[],
        hashes=[],
        config=config,
        muted_hashes=muted_hashes_dict,
    )

    for field in orjsonl.stream(metadata):
        metadata_id: SubmissionId = field["id"]
        record: dict[str, Any] = field["metadata"]
        if not config.segmented:
            insdc_accession_base = record["insdcAccessionBase"]
            if not insdc_accession_base:
                msg = "Ingested sequences without INSDC accession base - potential internal error"
                raise ValueError(msg)
            if sample_out_hashed_records(insdc_accession_base, subsample_fraction):
                update_manager.sampled_out.append(insdc_accession_base)
                continue
            process_hashes(
                insdc_accession_base,
                metadata_id,
                record,
                submitted,
                update_manager,
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
            process_hashes(accession, metadata_id, record, submitted, update_manager)
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
            process_hashes(accession, metadata_id, record, submitted, update_manager)
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

    write_outputs(
        update_manager,
        to_submit=to_submit,
        to_revise=to_revise,
        unchanged=unchanged,
        output_blocked=output_blocked,
        to_revoke=to_revoke,
        sampled_out_file=sampled_out_file,
    )
    warn_potentially_suppressed(config, already_ingested_accessions, current_ingested_accessions)


def write_outputs(  # noqa: PLR0913
    update_manager: SequenceUpdateManager,
    *,
    to_submit: str,
    to_revise: str,
    unchanged: str,
    output_blocked: str,
    to_revoke: str,
    sampled_out_file: str,
) -> None:
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


def warn_potentially_suppressed(
    config: Config,
    already_ingested_accessions: set[InsdcAccession],
    current_ingested_accessions: set[InsdcAccession],
) -> None:
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
