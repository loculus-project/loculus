import logging
from datetime import datetime, timedelta
from time import sleep

import click
import pytz
import yaml
from loculus_client import (
    Config,
    approve,
    get_or_create_group_and_return_group_id,
    get_submitted,
    regroup_and_revoke,
    submit_or_revise,
)

logger = logging.getLogger(__name__)
logging.basicConfig(
    encoding="utf-8",
    level=logging.INFO,
    format="%(asctime)s %(levelname)8s %(filename)15s%(mode)s - %(message)s ",
    datefmt="%H:%M:%S",
)

_start_time: datetime | None = None


@click.command()
@click.option(
    "--metadata",
    required=False,
    type=click.Path(exists=True),
)
@click.option(
    "--sequences",
    required=False,
    type=click.Path(exists=True),
)
@click.option(
    "--mode",
    required=True,
    type=click.Choice(["submit", "revise", "approve", "regroup-and-revoke", "get-submitted"]),
)
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
)
@click.option(
    "--config-file",
    required=True,
    type=click.Path(exists=True),
)
@click.option(
    "--output",
    required=False,
    type=click.Path(),
)
@click.option(
    "--revoke-map",
    required=False,
    type=click.Path(exists=True),
)
@click.option(
    "--approve-timeout",
    required=False,
    type=int,
)
def submit_to_loculus(
    metadata, sequences, mode, log_level, config_file, output, revoke_map, approve_timeout
):
    """
    Submit data to Loculus.
    """
    global _start_time
    logger.setLevel(log_level)
    logging.getLogger("requests").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)

    old_factory = logging.getLogRecordFactory()

    def record_factory(*args, **kwargs):
        record = old_factory(*args, **kwargs)
        record.mode = f":{mode}"
        return record

    logging.setLogRecordFactory(record_factory)

    with open(config_file, encoding="utf-8") as file:
        full_config = yaml.safe_load(file)
        relevant_config = {}
        relevant_config = {key: full_config.get(key, []) for key in Config.__annotations__}
        config = Config(**relevant_config)

    logger.info(f"Config: {config}")

    if mode in {"submit", "revise"}:
        logger.info(f"Starting {mode}")
        try:
            group_id = get_or_create_group_and_return_group_id(
                config, allow_creation=mode == "submit"
            )
        except ValueError as e:
            logger.error(f"Aborting {mode} due to error: {e}")
            return
        response = submit_or_revise(metadata, sequences, config, group_id, mode=mode)
        logger.info(f"Completed {mode}")

    if mode == "approve":
        while True:
            if not _start_time:
                _start_time = datetime.now(tz=pytz.utc)
            logger.info("Approving sequences")
            response = approve(config)
            logger.info(f"Approved: {len(response)} sequences")
            sleep(config.time_between_approve_requests_seconds)
            if datetime.now(tz=pytz.utc) - timedelta(minutes=approve_timeout) > _start_time:
                break

    if mode == "regroup-and-revoke":
        try:
            group_id = get_or_create_group_and_return_group_id(
                config, allow_creation=mode == "submit"
            )
        except ValueError as e:
            logger.error(f"Aborting {mode} due to error: {e}")
            return
        logger.info("Submitting new segment groups and revoking old segment groups")
        response = regroup_and_revoke(metadata, sequences, revoke_map, config, group_id)
        logger.info(f"Revoked: {len(response)} sequence entries of old segment groups")

    if mode == "get-submitted":
        logger.info("Getting submitted sequences")
        get_submitted(config, output)


if __name__ == "__main__":
    submit_to_loculus()
