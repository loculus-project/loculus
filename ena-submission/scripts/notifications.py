import json
import logging
import os
import zipfile
from dataclasses import dataclass

import requests
from slack_sdk import WebClient


@dataclass
class SlackConfig:
    slack_hook: str
    slack_token: str
    slack_channel_id: str


logger = logging.getLogger(__name__)


def get_slack_config(
    slack_hook_default: str, slack_token_default: str, slack_channel_id_default: str
):
    slack_hook = os.getenv("SLACK_HOOK")
    if not slack_hook:
        slack_hook = slack_hook_default

    slack_token = os.getenv("SLACK_TOKEN")
    if not slack_token:
        slack_token = slack_token_default

    slack_channel_id = os.getenv("SLACK_CHANNEL_ID")
    if not slack_channel_id:
        slack_channel_id = slack_channel_id_default

    params = {
        "slack_hook": slack_hook,
        "slack_token": slack_token,
        "slack_channel_id": slack_channel_id,
    }

    return SlackConfig(**params)


def notify(config: SlackConfig, text: str):
    """Send slack notification using slack hook"""
    if config.slack_hook:
        requests.post(config.slack_hook, data=json.dumps({"text": text}), timeout=10)


def upload_file_with_comment(config: SlackConfig, file_path: str, comment: str):
    """Upload file with comment to slack channel"""
    client = WebClient(token=config.slack_token)
    output_file_zip = file_path.split(".")[0] + ".zip"
    zip = zipfile.ZipFile(output_file_zip, "w", zipfile.ZIP_DEFLATED)
    zip.write(file_path)
    zip.close()
    return client.files_upload_v2(
        file=output_file_zip,
        title=file_path.split("/")[-1],
        channel=config.slack_channel_id,
        initial_comment=comment,
    )
