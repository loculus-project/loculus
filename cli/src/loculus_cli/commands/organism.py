"""Organism management commands for Loculus CLI."""

import click
from rich.console import Console

from ..config import get_config_value, get_instance_config, set_config_value
from ..utils.guards import require_instance

console = Console()


@click.group(name="organism", invoke_without_command=True)
@click.pass_context
def organism_command(ctx: click.Context) -> None:
    """Manage organisms."""
    if ctx.invoked_subcommand is None:
        ctx.invoke(list_organisms)


@organism_command.command(name="list")
@click.pass_context
def list_organisms(ctx: click.Context) -> None:
    """List available organisms."""
    try:
        instance = require_instance(ctx, ctx.obj.get("instance"))
        instance_config = get_instance_config(instance)

        current = get_config_value("defaults.organism")
        if current:
            console.print(
                f"Current default organism: [bold green]{current}[/bold green]\n"
            )
        else:
            console.print("No default organism set\n")

        # List available organisms
        try:
            organisms = instance_config.get_organisms()
            console.print("[bold]Available organisms:[/bold]")
            for org in sorted(organisms):
                if org == current:
                    console.print(f"  • {org} [dim](current default)[/dim]")
                else:
                    console.print(f"  • {org}")
            console.print("\n[dim]Usage: loculus organism select <name>[/dim]")
            console.print(
                "[dim]       loculus organism select --none  (to clear)[/dim]"
            )
        except Exception as e:
            console.print(f"[yellow]Could not fetch available organisms: {e}[/yellow]")
    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        raise click.ClickException(str(e)) from e


@organism_command.command(name="select")
@click.argument("organism", required=False)
@click.option("--none", is_flag=True, help="Clear the default organism")
@click.pass_context
def select_organism(ctx: click.Context, organism: str | None, none: bool) -> None:
    """Select a default organism."""
    try:
        if none:
            set_config_value("defaults.organism", None)
            console.print("[green]✓[/green] Cleared default organism")
        elif organism:
            # Validate organism exists before setting it
            instance = require_instance(ctx, ctx.obj.get("instance"))
            instance_config = get_instance_config(instance)
            available_organisms = instance_config.get_organisms()

            if organism not in available_organisms:
                console.print(f"[red]Error: Organism '{organism}' not found.[/red]")
                console.print()
                console.print("[bold]Available organisms:[/bold]")
                for org in sorted(available_organisms):
                    console.print(f"  • {org}")
                raise click.ClickException(f"Organism '{organism}' not found")

            set_config_value("defaults.organism", organism)
            console.print(
                f"[green]✓[/green] Set default organism to [bold]{organism}[/bold]"
            )
        else:
            console.print(
                "[red]Error: Please specify an organism name or use --none[/red]"
            )
            console.print("[dim]Usage: loculus organism select <name>[/dim]")
            console.print(
                "[dim]       loculus organism select --none  (to clear)[/dim]"
            )
            raise click.ClickException("Organism name required")
    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        raise click.ClickException(str(e)) from e
