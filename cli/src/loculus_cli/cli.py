"""Main CLI entry point."""

import click
from rich.console import Console

from .commands.auth import auth_group
from .commands.config import config_group
from .commands.get import get_group
from .commands.group import group_command
from .commands.instance import instance_group
from .commands.organism import organism_command
from .commands.release import release
from .commands.revise import revise_group
from .commands.schema import schema_group
from .commands.status import status
from .commands.submit import submit_group

console = Console()


@click.group()
@click.option(
    "--instance",
    envvar="LOCULUS_INSTANCE",
    help="Loculus instance URL (e.g., main.loculus.org)",
)
@click.option(
    "--organism",
    "-o",
    envvar="LOCULUS_ORGANISM",
    help="Organism name (e.g., 'Mpox', 'H5N1')",
)
@click.option(
    "--group",
    "-g",
    type=int,
    envvar="LOCULUS_GROUP",
    help="Group ID for operations",
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
def cli(
    ctx: click.Context,
    instance: str,
    organism: str,
    group: int,
    config: str,
    verbose: bool,
    no_color: bool,
) -> None:
    """Loculus CLI - Command line interface for Loculus."""
    # Ensure context object exists
    ctx.ensure_object(dict)

    # Store global options in context
    ctx.obj["instance"] = instance
    ctx.obj["organism"] = organism
    ctx.obj["group"] = group
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
cli.add_command(instance_group)
cli.add_command(organism_command)
cli.add_command(group_command)
cli.add_command(schema_group)
cli.add_command(status)
cli.add_command(release)


if __name__ == "__main__":
    cli()
