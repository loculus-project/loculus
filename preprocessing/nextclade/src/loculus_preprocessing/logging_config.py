"""Logging configuration for the preprocessing pipeline"""

import logging


def configure_logging(level: str | int = logging.INFO) -> None:
    """Configure logging with timestamps and consistent format"""
    logging.basicConfig(
        level=level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
