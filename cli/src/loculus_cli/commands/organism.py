"""Organism management commands for Loculus CLI."""

from typing import Optional

import click
from rich.console import Console

from ..config import get_config_value, get_instance_config, set_config_value
from ..utils.guards import require_instance

console = Console()


@click.command(name="organism")
@click.argument("organism", required=False)
@click.option("--none", is_flag=True, help="Clear the default organism")
@click.pass_context
def organism_command(ctx: click.Context, organism: Optional[str], none: bool) -> None:
    """Set or show default organism for commands."""
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
            # Show available organisms and current default
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
                console.print("\n[dim]Usage: loculus organism <name>[/dim]")
                console.print("[dim]       loculus organism --none  (to clear)[/dim]")
            except Exception as e:
                console.print(
                    f"[yellow]Could not fetch available organisms: {e}[/yellow]"
                )
    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        raise click.ClickException(str(e))
