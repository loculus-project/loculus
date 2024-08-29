import json
import logging
import os
import zipfile
from dataclasses import dataclass
from datetime import datetime, timedelta

import requests
from slack_sdk import WebClient


@dataclass
class SlackConfig:
    slack_hook: str
    slack_token: str
    slack_channel_id: str
    last_notification_sent: datetime | None


logger = logging.getLogger(__name__)


def slack_conn_init(
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

    last_notification_sent = None

    params = {
        "slack_hook": slack_hook,
        "slack_token": slack_token,
        "slack_channel_id": slack_channel_id,
        "last_notification_sent": last_notification_sent,
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


def send_slack_notification(
    comment: str, slack_config: SlackConfig, time: datetime, time_threshold=12
):
    if not slack_config.slack_hook:
        logger.info("Could not find slack hook cannot send message")
        return
    if (
        not slack_config.last_notification_sent
        or time - timedelta(hours=time_threshold) > slack_config.last_notification_sent
    ):
        logger.warning(comment)
        notify(slack_config, comment)
        slack_config.last_notification_sent = time
