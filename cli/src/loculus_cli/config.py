"""Configuration management for Loculus CLI."""

import os
import sys
import time
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, Field
from rich.console import Console

from .instance_info import InstanceInfo
from .types import Schema


class InstanceConfig(BaseModel):
    """Configuration for a specific Loculus instance."""

    instance_url: str = Field(description="Base instance URL")
    keycloak_realm: str = Field(default="loculus", description="Keycloak realm")
    keycloak_client_id: str = Field(
        default="backend-client", description="Keycloak client ID"
    )

    _instance_info: InstanceInfo | None = None

    @property
    def instance_info(self) -> InstanceInfo:
        """Get instance info client (cached)."""
        if self._instance_info is None:
            self._instance_info = InstanceInfo(self.instance_url)
        return self._instance_info

    @property
    def backend_url(self) -> str:
        """Get backend URL dynamically."""
        return self.instance_info.get_hosts()["backend"]

    @property
    def keycloak_url(self) -> str:
        """Get Keycloak URL dynamically."""
        return self.instance_info.get_hosts()["keycloak"]

    @property
    def website_url(self) -> str:
        """Get website URL dynamically."""
        return self.instance_info.get_hosts()["website"]

    def get_lapis_url(self, organism: str) -> str:
        """Get LAPIS URL for specific organism."""
        return self.instance_info.get_lapis_url(organism)

    def get_organisms(self) -> list[str]:
        """Get list of available organisms."""
        return self.instance_info.get_organisms()

    def get_organism_schema(self, organism: str) -> Schema:
        """Get metadata schema for organism."""
        return self.instance_info.get_organism_schema(organism)

    class Config:
        # Allow private attributes (for _instance_info)
        arbitrary_types_allowed = True


class OutputConfig(BaseModel):
    """Output formatting configuration."""

    format: str = Field(default="table", description="Default output format")
    color: str = Field(default="auto", description="Color output setting")


class SubmissionConfig(BaseModel):
    """Submission configuration."""

    chunk_size: int = Field(default=1000, description="Batch size for submissions")
    validate_before_submit: bool = Field(
        default=True, description="Validate before submitting"
    )


class DefaultsConfig(BaseModel):
    """Default values for commands."""

    organism: str | None = Field(default=None, description="Default organism")
    group: int | None = Field(default=None, description="Default group ID")


class Config(BaseModel):
    """Main configuration model."""

    default_instance: str | None = Field(default=None, description="Default instance")
    instances: dict[str, InstanceConfig] = Field(
        default_factory=dict, description="Instance configurations"
    )
    output: OutputConfig = Field(
        default_factory=OutputConfig, description="Output configuration"
    )
    submission: SubmissionConfig = Field(
        default_factory=SubmissionConfig, description="Submission configuration"
    )
    defaults: DefaultsConfig = Field(
        default_factory=DefaultsConfig, description="Default values for commands"
    )
    last_run_timestamp: float | None = Field(
        default=None, description="Timestamp of last CLI run"
    )


def get_config_dir() -> Path:
    """Get the configuration directory."""
    config_dir = Path.home() / ".config" / "loculus"
    config_dir.mkdir(parents=True, exist_ok=True)
    return config_dir


def get_config_file() -> Path:
    """Get the configuration file path."""
    # Check if LOCULUS_CONFIG environment variable is set
    config_env = os.environ.get("LOCULUS_CONFIG")
    if config_env:
        return Path(config_env)

    return get_config_dir() / "config.yml"


def load_config(config_file: str | None = None) -> Config:
    """Load configuration from file."""
    if config_file:
        config_path = Path(config_file)
    else:
        config_path = get_config_file()

    if not config_path.exists():
        return Config()

    with open(config_path) as f:
        data = yaml.safe_load(f) or {}

    return Config(**data)


def save_config(config: Config, config_file: str | None = None) -> None:
    """Save configuration to file."""
    if config_file:
        config_path = Path(config_file)
    else:
        config_path = get_config_file()

    # Ensure directory exists
    config_path.parent.mkdir(parents=True, exist_ok=True)

    with open(config_path, "w") as f:
        yaml.safe_dump(
            config.model_dump(), f, default_flow_style=False, sort_keys=False
        )


def get_instance_config(instance: str | None = None) -> InstanceConfig:
    """Get configuration for a specific instance."""
    config = load_config()

    # Determine which instance to use
    if instance:
        instance_name = instance
    elif config.default_instance:
        instance_name = config.default_instance
    else:
        # Default to main.loculus.org
        instance_name = "main.loculus.org"

    # Check if we have configuration for this instance
    if instance_name in config.instances:
        return config.instances[instance_name]

    # Generate default configuration - now just needs instance URL
    if instance_name == "main.loculus.org":
        instance_url = "https://main.loculus.org"
    elif instance_name.startswith("http"):
        # If it's already a URL, use as-is
        instance_url = instance_name
    else:
        # Assume it's a hostname
        instance_url = f"https://{instance_name}"

    return InstanceConfig(instance_url=instance_url)


def set_config_value(key: str, value: Any) -> None:
    """Set a configuration value."""
    config = load_config()
    config_dict = config.model_dump()

    # Handle nested keys like 'output.format'
    keys = key.split(".")
    current = config_dict

    # Navigate to the parent of the target key
    for k in keys[:-1]:
        if k not in current:
            current[k] = {}
        current = current[k]

    # Set the value
    current[keys[-1]] = value

    # Save the updated config
    updated_config = Config(**config_dict)
    save_config(updated_config)


def get_config_value(key: str) -> Any:
    """Get a configuration value."""
    config = load_config()

    # Handle nested keys like 'output.format'
    keys = key.split(".")
    current = config.model_dump()

    for k in keys:
        if k not in current:
            return None
        current = current[k]

    return current


def check_and_show_warning() -> None:
    """Check if CLI hasn't been run for 5+ minutes and show warning."""
    config = load_config()
    current_time = time.time()

    # Check if last run was more than 5 minutes ago (300 seconds)
    if (
        config.last_run_timestamp is None
        or (current_time - config.last_run_timestamp) > 300
    ):
        console = Console(file=sys.stderr)
        console.print(
            "WARNING: THE LOCULUS CLI IS STILL UNDER DEVELOPMENT AND IS "
            "NOT READY FOR PRODUCTION USE\n",
            style="yellow",
        )

    # Update timestamp
    config.last_run_timestamp = current_time
    save_config(config)
