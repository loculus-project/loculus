"""Main CLI entry point."""

import click
from rich.console import Console

from .commands.auth import auth_group
from .commands.config import config_group
from .commands.get import get_group
from .commands.revise import revise_group
from .commands.schema import schema_group
from .commands.submit import submit_group

console = Console()


@click.group()
@click.option(
    "--instance",
    envvar="LOCULUS_INSTANCE",
    help="Loculus instance URL (e.g., main.loculus.org)",
)
@click.option(
    "--config",
    envvar="LOCULUS_CONFIG",
    help="Path to configuration file",
)
@click.option(
    "--verbose",
    "-v",
    is_flag=True,
    help="Enable verbose output",
)
@click.option(
    "--no-color",
    is_flag=True,
    help="Disable colored output",
)
@click.pass_context
def cli(ctx: click.Context, instance: str, config: str, verbose: bool, no_color: bool) -> None:
    """Loculus CLI - Command line interface for Loculus."""
    # Ensure context object exists
    ctx.ensure_object(dict)
    
    # Store global options in context
    ctx.obj["instance"] = instance
    ctx.obj["config"] = config
    ctx.obj["verbose"] = verbose
    ctx.obj["no_color"] = no_color
    
    # Configure console
    if no_color:
        console.no_color = True


# Add command groups
cli.add_command(auth_group)
cli.add_command(submit_group)
cli.add_command(get_group)
cli.add_command(revise_group)
cli.add_command(config_group)
cli.add_command(schema_group)


if __name__ == "__main__":
    cli()