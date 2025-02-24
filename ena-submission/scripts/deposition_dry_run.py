# This file offers command line options to generate the submission files
# for local ena submission from input data, it uses the configs specified in the config folder
# It requires an input file in the same format as required to trigger ena submission and should
# produce the same output as would be sent to ENA by the pipeline.

# WARNING: Please still review submission files manually before using them!!
import json
import logging
import os
from typing import Any

import click
from ena_deposition.config import Config, get_config
from ena_deposition.create_assembly import create_manifest_object
from ena_deposition.create_project import construct_project_set_object
from ena_deposition.create_sample import construct_sample_set_object
from ena_deposition.ena_submission_helper import create_manifest, get_project_xml, get_sample_xml

logger = logging.getLogger(__name__)
logging.basicConfig(
    encoding="utf-8",
    level=logging.INFO,
    format="%(asctime)s %(levelname)8s (%(filename)20s:%(lineno)4d) - %(message)s ",
    datefmt="%H:%M:%S",
)


@click.command()
@click.option(
    "--data-to-submit",
    required=False,
    type=click.Path(exists=True),
)
@click.option(
    "--config-file",
    required=False,
    type=click.Path(exists=True),
)
@click.option(
    "--mode",
    required=True,
    type=click.Choice(["project", "sample", "assembly"]),
)
@click.option("--center-name", required=False, type=str, default="CENTER_NAME")
@click.option(
    "--revision",
    required=False,
    type=bool,
    default=False,
)
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
)
def local_ena_submission_generator(
    config_file,
    data_to_submit,
    center_name,
    mode,
    revision,
    log_level,
):
    """
    Produce output of submission pipeline locally
    """
    logger.setLevel(log_level)
    logging.getLogger("requests").setLevel(logging.INFO)

    config: Config = get_config(config_file)

    with open(data_to_submit, encoding="utf-8") as json_file:
        sequences_to_upload: dict[str, Any] = json.load(json_file)

    if len(sequences_to_upload) > 1:
        logging.error("Script can only handle one entry at a time")
        return

    for full_accession, data in sequences_to_upload.items():
        accession, version = full_accession.split(".")
        entry = {
            "accession": accession,
            "version": version,
            "group_id": data["metadata"]["groupId"],
            "organism": data["organism"],
            "metadata": data["metadata"],
            "unaligned_nucleotide_sequences": data["unalignedNucleotideSequences"],
        }

    group_info = {"institution": center_name, "address": {"city": "CITY", "country": "COUNTRY"}, "groupName": "GROUP_NAME"}

    if mode == "project":
        project_set = construct_project_set_object(group_info, config, entry)
        project_xml = get_project_xml(project_set)

        directory = "project"
        os.makedirs(directory, exist_ok=True)
        logger.info(f"Writing results to {directory}")

        with open(os.path.join(directory, "submission.xml"), "w") as file:
            file.write(project_xml["SUBMISSION"])
        with open(os.path.join(directory, "project.xml"), "w") as file:
            file.write(project_xml["PROJECT"])

        logger.info(
            "You can submit the project to ENA using the command: \n"
            "curl -X POST $ena_submission_url "
            "-u '$ena_submission_username:$ena_submission_password' "
            "-F 'SUBMISSION=@project/submission.xml' -F 'PROJECT=@project/project.xml'"
            " --max-time 10 > {output}"
            "\n Remember to submit to wwwdev. if you do not want to submit to production"
        )

    if mode == "sample":
        entry["center_name"] = center_name
        sample_set = construct_sample_set_object(config, entry, entry)
        sample_xml = get_sample_xml(sample_set, revision=revision)

        directory = "sample"
        os.makedirs(directory, exist_ok=True)
        logger.info(f"Writing results to {directory}")

        with open(os.path.join(directory, "submission.xml"), "w") as file:
            file.write(sample_xml["SUBMISSION"])
        with open(os.path.join(directory, "sample.xml"), "w") as file:
            file.write(sample_xml["SAMPLE"])

        logger.info(
            "You can submit the sample to ENA using the command: \n"
            "curl -X POST $ena_submission_url "
            "-u '$ena_submission_username:$ena_submission_password' "
            "-F 'SUBMISSION=@sample/submission.xml' -F 'SAMPLE=@sample/sample.xml'"
            " --max-time 10 > {output}"
            "\n Remember to submit to wwwdev. if you do not want to submit to production"
        )

    if mode == "assembly":
        dummy_sample_dict = {"result": {"ena_sample_accession": "BIOSAMPLE_ACCESSION"}}
        dummy_project_dict = {
            "result": {"bioproject_accession": "BIOPROJECT_ACCESSION"},
            "center_name": center_name,
        }

        directory = "assembly"
        os.makedirs(directory, exist_ok=True)
        logger.info(f"Writing results to {directory}")

        manifest_object = create_manifest_object(
            config, dummy_sample_dict, dummy_project_dict, entry, dir=directory
        )
        create_manifest(manifest_object, is_broker=config.is_broker, dir=directory)
        logger.info(
            "You can submit the assembly to ENA using the command: \n"
            "java -jarwebin-cli.jar -username $ena_submission_username "
            "-password $ena_submission_password -context genome "
            "-manifest assembly/manifest.tsv -submit "
            f"-centername {center_name}"
            "\n Remember to submit with -test if you do not want to submit to production"
        )


if __name__ == "__main__":
    local_ena_submission_generator()
