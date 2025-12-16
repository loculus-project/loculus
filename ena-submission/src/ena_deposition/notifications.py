import json
import logging
import os
import zipfile
from dataclasses import dataclass
from datetime import datetime, timedelta

import boto3
import requests
from botocore.exceptions import ClientError
from slack_sdk import WebClient, web

logger = logging.getLogger(__name__)


@dataclass
class SlackConfig:
    slack_hook: str
    slack_token: str
    slack_channel_id: str
    last_notification_sent: datetime | None


@dataclass
class S3Config:
    endpoint: str | None
    bucket: str | None
    access_key: str | None
    secret_key: str | None


def s3_conn_init(
    endpoint: str | None = None,
    bucket: str | None = None,
    access_key: str | None = None,
    secret_key: str | None = None,
) -> S3Config:
    """Initialize S3 configuration from provided values or environment variables."""
    return S3Config(
        endpoint=os.getenv("S3_ENDPOINT", endpoint),
        bucket=os.getenv("S3_BUCKET", bucket),
        access_key=os.getenv("S3_ACCESS_KEY", access_key),
        secret_key=os.getenv("S3_SECRET_KEY", secret_key),
    )


def upload_file_to_s3(
    config: S3Config, file_path: str, s3_key: str | None = None
) -> bool:
    """
    Upload a file to S3/MinIO bucket under ena-deposition directory.

    Args:
        config: S3 configuration with endpoint, bucket, and credentials
        file_path: Path to local file to upload
        s3_key: Optional S3 object key. If not provided, uses ena-deposition/{filename}

    Returns:
        True if upload successful, False otherwise
    """
    if not config.endpoint or not config.bucket:
        logger.info("S3 not configured (missing endpoint or bucket), skipping upload")
        return False

    if not config.access_key or not config.secret_key:
        logger.warning("S3 credentials not configured, skipping upload")
        return False

    try:
        s3_client = boto3.client(
            "s3",
            endpoint_url=config.endpoint,
            aws_access_key_id=config.access_key,
            aws_secret_access_key=config.secret_key,
        )

        # Use ena-deposition directory prefix
        if s3_key is None:
            filename = os.path.basename(file_path)
            s3_key = f"ena-deposition/{filename}"

        logger.info(f"Uploading {file_path} to s3://{config.bucket}/{s3_key}")
        s3_client.upload_file(file_path, config.bucket, s3_key)
        logger.info(f"Successfully uploaded to s3://{config.bucket}/{s3_key}")
        return True

    except ClientError as e:
        logger.error(f"Failed to upload file to S3: {e}")
        return False
    except Exception as e:
        logger.error(f"Unexpected error uploading to S3: {e}")
        return False


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


def upload_file_with_comment(
    config: SlackConfig, file_path: str, comment: str
) -> web.SlackResponse:
    """Upload file with comment to slack channel"""
    client = WebClient(token=config.slack_token)
    output_file_zip = os.path.basename(file_path) + ".zip"
    zip = zipfile.ZipFile(output_file_zip, "w", zipfile.ZIP_DEFLATED)
    zip.write(file_path)
    zip.close()
    return client.files_upload_v2(
        file=output_file_zip,
        title=output_file_zip,
        channel=config.slack_channel_id,
        initial_comment=comment,
    )


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
