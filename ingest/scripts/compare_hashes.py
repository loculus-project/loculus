import json
import logging
import operator
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
    segmented: str
    nucleotide_sequences: list[str]
    debug_hashes: bool = False
    slack_hook: str = ""


InsdcAccession = str
JointInsdcAccession = str
LoculusAccession = str
Status = str


@dataclass
class SequenceUpdateManager:
    submit: list[JointInsdcAccession]
    revise: dict[JointInsdcAccession, LoculusAccession]
    noop: dict[JointInsdcAccession, LoculusAccession]
    blocked: dict[Status, dict[JointInsdcAccession, LoculusAccession]]
    revoke: dict[
        JointInsdcAccession, dict[LoculusAccession, InsdcAccession]
    ]  # Map of new grouping joint insdc accessions to map of previous state
    # i.e. loculus accessions (to be revoked) and their corresponding old joint insdc accessions
    sampled_out: list[JointInsdcAccession]
    hashes: list[float]
    config: Config


def notify(config: Config, text: str):
    """Send slack notification with blocked revision details"""
    if config.slack_hook:
        requests.post(config.slack_hook, data=json.dumps({"text": text}), timeout=10)
    logger.warn(text)


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
    ingested_insdc_accession: str,
    fasta_id: str,
    ingested_hash: str,
    submitted: dict[InsdcAccession : dict[str, Any]],
    update_manager: SequenceUpdateManager,
):
    """
    Submitted is a dictionary with all Loculus state in the format:
    insdc_accession:
        loculus_accession: abcd
        versions:
        - version: 1
          hash: abcd
          status: APPROVED_FOR_RELEASE
          submitter: insdc_ingest_user
          jointAccession: insdc_accession.seg1/insdc_accession.seg2
        - version: 2
          hash: efg
          status: HAS_ERRORS
          submitter: curator
          jointAccession: insdc_accession.seg1/insdc_accession.seg2
    """
    if ingested_insdc_accession not in submitted:
        update_manager.submit.append(fasta_id)
        return update_manager

    sorted_versions = sorted(
        submitted[ingested_insdc_accession]["versions"], key=operator.itemgetter("version")
    )
    latest = sorted_versions[-1]
    corresponding_loculus_accession = submitted[ingested_insdc_accession]["loculus_accession"]
    if latest["hash"] != ingested_hash:
        status = latest["status"]
        if status == "APPROVED_FOR_RELEASE":
            if {sorted_version["submitter"] for sorted_version in sorted_versions} != {
                "insdc_ingest_user"
            }:
                # Sequence has been curated before - special case
                notify(
                    update_manager.config,
                    (
                        f"Ingest: Sequence {corresponding_loculus_accession} with INSDC "
                        f"accession {ingested_insdc_accession} has been curated before "
                        "- do not know how to proceed"
                    ),
                )
                update_manager.blocked["CURATION_ISSUE"][ingested_insdc_accession] = (
                    corresponding_loculus_accession
                )
                return update_manager
            update_manager.revise[fasta_id] = corresponding_loculus_accession
        else:
            update_manager.blocked[status][fasta_id] = corresponding_loculus_accession
    else:
        update_manager.noop[fasta_id] = corresponding_loculus_accession
    return update_manager


def get_approved_submitted_accessions(data):
    approved = set()
    for insdc_accession, info in data.items():
        versions = info.get("versions", [])
        sorted_versions = sorted(versions, key=operator.itemgetter("version"))
        if sorted_versions and sorted_versions[-1].get("status") == "APPROVED_FOR_RELEASE":
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
    already_ingested_accessions = get_approved_submitted_accessions(submitted)
    current_ingested_accessions = set()

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
        fasta_id = field["id"]
        record = field["metadata"]
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
                insdc_accession_base, fasta_id, record["hash"], submitted, update_manager
            )
            current_ingested_accessions.add(insdc_accession_base)
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
                for key, segment in zip(insdc_keys, config.nucleotide_sequences, strict=False)
                if record[key]
            ]
        )
        insdc_accessions = [record[key] for key in insdc_keys if record.get(key)]
        current_ingested_accessions.update(set(insdc_accessions))
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
            process_hashes(accession, fasta_id, record["hash"], submitted, update_manager)
            continue
        old_accessions = {}
        for accession in insdc_accession_base_list:
            if accession in submitted:
                old_accessions[submitted[accession]["loculus_accession"]] = submitted[accession][
                    "jointAccession"
                ]
                # TODO: Figure out how to check for curation when regrouping - maybe just notify
        logger.warning(
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
        if text == "Blocked sequences":
            for status, accessions in value.items():
                logger.info(f"Blocked sequences - {status}: {len(accessions)}")
        else:
            logger.info(f"{text}: {len(value)}")

    potentially_suppressed = already_ingested_accessions - current_ingested_accessions
    if len(potentially_suppressed) > 0:
        warning = (
            f"{len(potentially_suppressed)} previously ingested INSDC accessions not found in "
            f"re-ingested metadata - {', '.join(potentially_suppressed)}."
            " This might be due to these sequences being suppressed in the INSDC database."
            " Please check the INSDC database for these accessions."
            " If this is the case, please revoke these accessions in Loculus."
            " If this is not the case, this indicates a potential ingest error."
        )
        logger.warning(warning)
        notify(
            config,
            warning,
        )


if __name__ == "__main__":
    main()
