"""Configuration commands for Loculus CLI."""

from typing import Any

import click
from rich.console import Console
from rich.table import Table

from ..config import get_config_value, load_config, set_config_value

console = Console()


@click.group(name="config")
def config_group() -> None:
    """Configuration commands."""
    pass


@config_group.command()
@click.argument("key")
@click.argument("value")
def set_value(key: str, value: str) -> None:
    """Set a configuration value."""
    try:
        set_config_value(key, value)
        console.print(
            f"✓ Set [bold green]{key}[/bold green] = [bold blue]{value}[/bold blue]"
        )
    except Exception as e:
        console.print(f"[bold red]✗ Failed to set config:[/bold red] {e}")
        raise click.ClickException(str(e)) from e


@config_group.command()
@click.argument("key")
def get(key: str) -> None:
    """Get a configuration value."""
    try:
        value = get_config_value(key)
        if value is not None:
            console.print(
                f"[bold green]{key}[/bold green] = [bold blue]{value}[/bold blue]"
            )
        else:
            console.print(
                f"[bold yellow]Configuration key '{key}' not found[/bold yellow]"
            )
    except Exception as e:
        console.print(f"[bold red]✗ Failed to get config:[/bold red] {e}")
        raise click.ClickException(str(e)) from e


@config_group.command()
def list_values() -> None:
    """List all configuration values."""
    try:
        config = load_config()
        config_dict = config.model_dump()

        table = Table(title="Configuration")
        table.add_column("Key", style="green")
        table.add_column("Value", style="blue")

        def add_config_items(data: dict[str, Any], prefix: str = "") -> None:
            for key, value in data.items():
                full_key = f"{prefix}.{key}" if prefix else key

                if hasattr(value, "items"):  # Check if it's dict-like
                    add_config_items(value, full_key)
                elif hasattr(value, "__iter__") and not isinstance(
                    value, str
                ):  # Check if it's list-like
                    table.add_row(full_key, str(value))
                else:
                    table.add_row(full_key, str(value) if value is not None else "")

        add_config_items(config_dict)
        console.print(table)

    except Exception as e:
        console.print(f"[bold red]✗ Failed to list config:[/bold red] {e}")
        raise click.ClickException(str(e)) from e
