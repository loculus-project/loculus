"""Main CLI entry point."""

import sys

import click
from rich.console import Console

from .commands.auth import auth_group
from .commands.config import config_group
from .commands.get import get_group
from .commands.group import group_command
from .commands.instance import instance_group
from .commands.organism import organism_command
from .commands.release import release
from .commands.schema import schema_group
from .commands.status import status
from .commands.submit import submit_group
from .config import check_and_show_warning

console = Console()


def preprocess_args(args: list[str]) -> list[str]:
    """Reorder command line arguments to put global options first."""
    # Global options that should be moved to the front
    global_options = [
        "--organism",
        "-O",
        "--instance",
        "-I",
        "--group",
        "-G",
        "--config",
        "--verbose",
        "-v",
        "--no-color",
    ]

    # Find positions of global options and their values
    global_args = []
    other_args = []
    i = 0

    while i < len(args):
        if args[i] in global_options:
            global_args.append(args[i])
            # Check if this option takes a value
            if i + 1 < len(args) and not args[i + 1].startswith("-"):
                i += 1
                global_args.append(args[i])
        else:
            other_args.append(args[i])
        i += 1

    return global_args + other_args


preprocessed_args = preprocess_args(sys.argv[1:])
sys.argv = [sys.argv[0]] + preprocessed_args


@click.group(context_settings={"help_option_names": ["-h", "--help"]})
@click.option(
    "--instance",
    "-I",
    envvar="LOCULUS_INSTANCE",
    help="Loculus instance URL (e.g., main.loculus.org)",
)
@click.option(
    "--organism",
    "-O",
    envvar="LOCULUS_ORGANISM",
    help="Organism name (e.g., 'Mpox', 'H5N1')",
)
@click.option(
    "--group",
    "-G",
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
    # Check and show warning if CLI hasn't been run for 5+ minutes
    check_and_show_warning()

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
cli.add_command(config_group)
cli.add_command(instance_group)
cli.add_command(organism_command)
cli.add_command(group_command)
cli.add_command(schema_group)
cli.add_command(status)
cli.add_command(release)


def main() -> None:
    """Main entry point for the CLI."""
    cli()
