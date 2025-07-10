import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timedelta

import requests

logger = logging.getLogger(__name__)


@dataclass
class SlackConfig:
    slack_hook: str
    slack_token: str
    slack_channel_id: str
    last_notification_sent: datetime | None


def slack_conn_init(
    slack_hook_default: str, slack_token_default: str, slack_channel_id_default: str
) -> SlackConfig:
    return SlackConfig(
        slack_hook=os.getenv("SLACK_HOOK", slack_hook_default),
        slack_token=os.getenv("SLACK_TOKEN", slack_token_default),
        slack_channel_id=os.getenv("SLACK_CHANNEL_ID", slack_channel_id_default),
        last_notification_sent=None,
    )


def notify(config: SlackConfig, text: str):
    """Send slack notification using slack hook"""
    if config.slack_hook:
        requests.post(config.slack_hook, data=json.dumps({"text": text}), timeout=10)


def send_slack_notification(
    comment: str, slack_config: SlackConfig, time: datetime, time_threshold: int = 12
):
    """
    Sends a slack notification if current time is over time_threshold hours
    since slack_config.last_notification_sent.
    """
    if not slack_config.slack_hook:
        logger.info("Could not find slack hook cannot send message")
        return
    if (
        not slack_config.last_notification_sent
        or time - timedelta(hours=time_threshold) > slack_config.last_notification_sent
    ):
        logger.warning(comment)
        try:
            notify(slack_config, comment)
            slack_config.last_notification_sent = time
        except requests.exceptions.RequestException as e:
            logger.error(f"Error sending slack notification: {e}")
