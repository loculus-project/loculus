"""Guard utilities for instance and organism selection."""

import click
from rich.console import Console

from ..config import get_instance_config, load_config


def require_instance(ctx: click.Context, instance: str | None = None) -> str:
    """
    Ensure an instance is selected, providing helpful guidance if not.

    Args:
        ctx: Click context
        instance: Instance name/URL from command line

    Returns:
        The selected instance name/URL

    Raises:
        click.ClickException: If no instance can be determined
    """
    console = Console()

    # If instance provided via command line, use it
    if instance:
        return instance

    # Load config to check for default instance and available instances
    config = load_config()

    # Check if there's a default instance
    if config.default_instance:
        console.print(f"[dim]Using default instance: {config.default_instance}[/dim]")
        return config.default_instance

    # No default instance - check what instances are available
    available_instances = list(config.instances.keys())

    if not available_instances:
        # No instances configured at all
        console.print("[red]✗ No Loculus instance configured[/red]")
        console.print()
        console.print("[bold]To get started, add an instance:[/bold]")
        console.print("  [cyan]loculus instance add https://main.loculus.org[/cyan]")
        console.print("  [cyan]loculus instance add https://cli.loculus.org[/cyan]")
        console.print()
        console.print("[bold]Or use the --instance flag:[/bold]")
        console.print(
            "  [cyan]loculus --instance https://main.loculus.org <command>[/cyan]"
        )
        console.print()
        console.print("[dim]See 'loculus instance --help' for more options[/dim]")

        raise click.ClickException("No instance configured")

    elif len(available_instances) == 1:
        # One instance available - suggest setting it as default
        instance_name = available_instances[0]
        console.print("[yellow]⚠ No default instance set[/yellow]")
        console.print()
        console.print(f"[bold]You have one instance configured: {instance_name}[/bold]")
        console.print(
            f"  [cyan]loculus instance use {instance_name}[/cyan]  "
            f"[dim]# Set as default[/dim]"
        )
        console.print()
        console.print("[bold]Or use the --instance flag:[/bold]")
        console.print(f"  [cyan]loculus --instance {instance_name} <command>[/cyan]")
        console.print()
        console.print("[bold]Or add another instance:[/bold]")
        console.print("  [cyan]loculus instance add https://cli.loculus.org[/cyan]")

        raise click.ClickException("No default instance set")

    else:
        # Multiple instances available - suggest selecting one
        console.print("[yellow]⚠ No default instance set[/yellow]")
        console.print()
        console.print("[bold]Available instances:[/bold]")
        for i, instance_name in enumerate(available_instances, 1):
            console.print(f"  {i}. {instance_name}")
        console.print()
        console.print("[bold]Set a default instance:[/bold]")
        console.print(f"  [cyan]loculus instance use {available_instances[0]}[/cyan]")
        console.print()
        console.print("[bold]Or use the --instance flag:[/bold]")
        console.print(
            f"  [cyan]loculus --instance {available_instances[0]} <command>[/cyan]"
        )
        console.print()
        console.print("[bold]Or add a new instance:[/bold]")
        console.print(
            "  [cyan]loculus instance add https://new-instance.loculus.org[/cyan]"
        )

        raise click.ClickException("No default instance set")


def require_organism(instance: str, organism: str | None = None) -> str:
    """
    Ensure an organism is selected, providing helpful guidance if not.

    Args:
        instance: Instance name/URL (required to fetch available organisms)
        organism: Organism name from command line

    Returns:
        The selected organism name

    Raises:
        click.ClickException: If no organism can be determined
    """
    console = Console()

    # If organism provided via command line, validate it exists
    if organism:
        try:
            instance_config = get_instance_config(instance)
            available_organisms = instance_config.get_organisms()

            if organism not in available_organisms:
                console.print(
                    f"[red]✗ Organism '{organism}' not found on this instance[/red]"
                )
                console.print()
                console.print("[bold]Available organisms:[/bold]")
                for org in sorted(available_organisms):
                    console.print(f"  • {org}")
                console.print()
                console.print("[bold]Set a default organism:[/bold]")
                console.print(
                    f"  [cyan]loculus organism select {available_organisms[0]}[/cyan]"
                )
                console.print()
                console.print("[bold]Or use the --organism flag:[/bold]")
                console.print(
                    f"  [cyan]loculus --organism {available_organisms[0]} "
                    f"<command>[/cyan]"
                )

                raise click.ClickException(f"Organism '{organism}' not found")

        except Exception as e:
            if "not found" in str(e):
                raise  # Re-raise organism not found errors
            console.print(f"[red]✗ Could not fetch organisms from instance: {e}[/red]")
            raise click.ClickException("Could not fetch organisms from instance") from e

        return organism

    # Load config to check for default organism
    config = load_config()

    # Check if there's a default organism
    if config.defaults.organism:
        console.print(f"[dim]Using default organism: {config.defaults.organism}[/dim]")
        return config.defaults.organism

    # No default organism - check what organisms are available
    try:
        instance_config = get_instance_config(instance)
        available_organisms = instance_config.get_organisms()
    except Exception as e:
        console.print(f"[red]✗ Could not fetch organisms from instance: {e}[/red]")
        raise click.ClickException("Could not fetch organisms from instance") from e

    if not available_organisms:
        # No organisms available
        console.print("[red]✗ No organisms found on this instance[/red]")
        console.print()
        console.print("[bold]Check organisms available:[/bold]")
        console.print("  [cyan]loculus organism[/cyan]")

        raise click.ClickException("No organisms available")

    elif len(available_organisms) == 1:
        # One organism available - suggest setting it as default
        organism_name = available_organisms[0]
        console.print("[yellow]⚠ No default organism set[/yellow]")
        console.print()
        console.print(f"[bold]You have one organism available: {organism_name}[/bold]")
        console.print(
            f"  [cyan]loculus organism {organism_name}[/cyan]  "
            f"[dim]# Set as default[/dim]"
        )
        console.print()
        console.print("[bold]Or use the --organism flag:[/bold]")
        console.print(f"  [cyan]loculus --organism {organism_name} <command>[/cyan]")

        raise click.ClickException("No default organism set")

    else:
        # Multiple organisms available - suggest selecting one
        console.print("[yellow]⚠ No default organism set[/yellow]")
        console.print()
        console.print("[bold]Available organisms:[/bold]")
        for i, organism_name in enumerate(available_organisms, 1):
            console.print(f"  {i}. {organism_name}")
        console.print()
        console.print("[bold]Set a default organism:[/bold]")
        console.print(f"  [cyan]loculus organism {available_organisms[0]}[/cyan]")
        console.print()
        console.print("[bold]Or use the --organism flag:[/bold]")
        console.print(
            f"  [cyan]loculus --organism {available_organisms[0]} <command>[/cyan]"
        )
        console.print()
        console.print("[bold]See available organisms:[/bold]")
        console.print("  [cyan]loculus organism[/cyan]")

        raise click.ClickException("No default organism set")


def require_group(instance: str, group: int | None = None) -> int:
    """
    Ensure a group is selected, providing helpful guidance if not.

    Args:
        instance: Instance name/URL (required to validate group exists)
        group: Group ID from command line

    Returns:
        The selected group ID

    Raises:
        click.ClickException: If no group can be determined
    """
    console = Console()

    # If group provided via command line, validate it exists
    if group is not None:
        try:
            get_instance_config(instance)
            # TODO: Add group validation
            return group
        except Exception as e:
            console.print(f"[red]✗ Could not validate group with instance: {e}[/red]")
            raise click.ClickException("Could not validate group with instance") from e

    # Load config to check for default group
    config = load_config()

    # Check if there's a default group
    if config.defaults.group is not None:
        console.print(f"[dim]Using default group: {config.defaults.group}[/dim]")
        return config.defaults.group

    # No group specified and no default - provide helpful guidance
    console.print("[yellow]⚠ No default group set[/yellow]")
    console.print()
    console.print("[bold]You need to specify a group for this operation.[/bold]")
    console.print()
    console.print("[bold]Set a default group:[/bold]")
    console.print("  [cyan]loculus group <group-id>[/cyan]")
    console.print()
    console.print("[bold]Or use the --group flag:[/bold]")
    console.print("  [cyan]loculus --group <group-id> <command>[/cyan]")
    console.print()
    console.print("[bold]See available groups:[/bold]")
    console.print("  [cyan]loculus group[/cyan]")

    raise click.ClickException("No default group set")
