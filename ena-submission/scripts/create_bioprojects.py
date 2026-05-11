# This file offers command line options to generate bioproject XML files
# using only a Pathoplexus groupId and organism name.
# You will need to copy the Pathoplexus ena-deposition config.yaml to your local machine
# and provide the path to it using the --config-file option.
# TIP: run
# kubectl get configmap loculus-ena-submission-config \
#   -n production -o jsonpath='{.data.config\.yaml}' > config.yaml

# WARNING: Please still review submission files manually before using them!!
# WARNING: If submitting as a broker please add `is_broker=true` to the config file
import logging
import os
from pathlib import Path

import click
from ena_deposition.call_loculus import get_group_info
from ena_deposition.config import Config, get_config
from ena_deposition.create_project import construct_project_set_object
from ena_deposition.ena_submission_helper import get_project_xml
from ena_deposition.submission_db_helper import (
    ProjectTableEntry,
)

logger = logging.getLogger(__name__)
logging.basicConfig(
    encoding="utf-8",
    level=logging.INFO,
    format="%(asctime)s %(levelname)8s (%(filename)20s:%(lineno)4d) - %(message)s ",
    datefmt="%H:%M:%S",
)


@click.command()
@click.option(
    "--config-file",
    required=False,
    type=click.Path(exists=True),
    default="config/config.yaml",
)
@click.option("--group-id", required=True, type=str)
@click.option("--organism", required=True, type=str)
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
)
def local_ena_project_generator(config_file, group_id, organism, log_level) -> None:
    """
    Produce output of submission pipeline locally
    """
    logger.setLevel(log_level)
    logging.getLogger("requests").setLevel(logging.INFO)

    config: Config = get_config(config_file)

    group_info = get_group_info(config, group_id)
    project_entry = ProjectTableEntry(
        group_id=group_id,
        organism=organism,
        center_name=group_info.institution,
    )

    project_set = construct_project_set_object(group_info, config, project_entry)
    project_xml = get_project_xml(project_set)

    directory = f"project_{group_id}"
    os.makedirs(directory, exist_ok=True)
    logger.info(f"Writing results to {directory}")

    Path(os.path.join(directory, "submission.xml")).write_text(
        project_xml["SUBMISSION"], encoding="utf-8"
    )
    Path(os.path.join(directory, "project.xml")).write_text(
        project_xml["PROJECT"], encoding="utf-8"
    )

    logger.info(f"""
        You can submit the project to ENA using the command:

        curl -X POST https://www.ebi.ac.uk/ena/submit/drop-box/submit \
        -u '$ena_submission_username:$ena_submission_password' \
        -F 'SUBMISSION=@{directory}/submission.xml' \
        -F 'PROJECT=@{directory}/project.xml' \
        --max-time 50

        Remember to submit to:
        https://wwwdev.ebi.ac.uk/ena/submit/drop-box/submit

        if you do not want to submit to production.
    """)

if __name__ == "__main__":
    local_ena_project_generator()
