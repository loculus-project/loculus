"""Instance management commands for Loculus CLI."""

import click
from rich.console import Console
from rich.table import Table

from ..config import (
    InstanceConfig,
    load_config,
    save_config,
)
from ..instance_info import InstanceInfo

console = Console()


@click.group(name="instance", invoke_without_command=True)
@click.pass_context
def instance_group(ctx: click.Context) -> None:
    """Manage Loculus instances."""
    if ctx.invoked_subcommand is None:
        ctx.invoke(list_instances)


@instance_group.command(name="list")
def list_instances() -> None:
    """List all configured instances."""
    try:
        config = load_config()

        if not config.instances:
            console.print("[yellow]No instances configured[/yellow]")
            console.print(
                "\n[dim]Add an instance with: loculus instance add <url>[/dim]"
            )
            return

        table = Table(title="Configured Instances")
        table.add_column("Instance", style="green")
        table.add_column("Name", style="blue")
        table.add_column("Status", style="yellow")

        for name, instance_config in config.instances.items():
            # Try to check if instance is accessible
            status = "Unknown"
            try:
                instance_info = InstanceInfo(instance_config.instance_url)
                info = instance_info.get_info()
                title = info.get("title", "N/A")
                status = "✓ Accessible"
            except Exception:
                status = "✗ Unreachable"

            # Mark default instance
            if name == config.default_instance:
                name_display = f"{name} [bold green](default)[/bold green]"
            else:
                name_display = name

            table.add_row(name_display, title, status)

        console.print(table)

        if config.default_instance:
            console.print(
                f"\nDefault instance: "
                f"[bold green]{config.default_instance}[/bold green]"
            )
        else:
            console.print("\n[yellow]No default instance set[/yellow]")

        console.print("\n[dim]Usage: loculus instance select <name>[/dim]")
        console.print("[dim]       loculus instance select --none  (to clear)[/dim]")

    except Exception as e:
        console.print(f"[bold red]✗ Failed to list instances:[/bold red] {e}")
        raise click.ClickException(str(e)) from e


@instance_group.command(name="select")
@click.argument("name", required=False)
@click.option("--none", is_flag=True, help="Clear the default instance")
def select_instance(name: str | None, none: bool) -> None:
    """Select a default instance."""
    try:
        config = load_config()

        if none:
            config.default_instance = None
            save_config(config)
            console.print("[green]✓[/green] Cleared default instance")
        elif name:
            if name not in config.instances:
                console.print(f"[red]Instance '{name}' not found[/red]")
                console.print("Available instances:")
                for instance_name in config.instances:
                    console.print(f"  • {instance_name}")
                raise click.Abort()

            config.default_instance = name
            save_config(config)
            console.print(
                f"[green]✓[/green] Set default instance to [bold]{name}[/bold]"
            )
        else:
            console.print(
                "[red]Error: Please specify an instance name or use --none[/red]"
            )
            console.print("[dim]Usage: loculus instance select <name>[/dim]")
            console.print(
                "[dim]       loculus instance select --none  (to clear)[/dim]"
            )
            raise click.ClickException("Instance name required")

    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        raise click.ClickException(str(e)) from e


@instance_group.command(name="add")
@click.argument("url")
@click.option("--name", help="Custom name for the instance (default: derived from URL)")
@click.option("--set-default", is_flag=True, help="Set as default instance")
@click.option("--keycloak-realm", default="loculus", help="Keycloak realm")
@click.option(
    "--keycloak-client-id", default="backend-client", help="Keycloak client ID"
)
def add_instance(
    url: str,
    name: str | None,
    set_default: bool,
    keycloak_realm: str,
    keycloak_client_id: str,
) -> None:
    """Add a new instance."""
    try:
        # Normalize URL - add https:// if no protocol specified
        if not url.startswith(("http://", "https://")):
            url = f"https://{url}"

        # Validate instance by fetching info
        console.print(f"Connecting to {url}...")
        instance_info = InstanceInfo(url)
        info = instance_info.get_info()

        console.print(f"[green]✓[/green] Connected to {info['title']}")
        if info.get("version"):
            console.print(f"Version: {info['version']}")

        organisms = instance_info.get_organisms()
        console.print(
            f"Available organisms: {', '.join(organisms[:5])}"
            f"{'...' if len(organisms) > 5 else ''}"
        )

        # Derive instance name from URL if not provided
        if not name:
            name = url.replace("https://", "").replace("http://", "").replace("/", "")

        # Save configuration
        config = load_config()
        config.instances[name] = InstanceConfig(
            instance_url=url,
            keycloak_realm=keycloak_realm,
            keycloak_client_id=keycloak_client_id,
        )

        if set_default or not config.default_instance:
            config.default_instance = name
            console.print("[green]✓[/green] Set as default instance")

        save_config(config)
        console.print(f"[green]✓[/green] Added instance '{name}'")

    except Exception as e:
        console.print(f"[red]Error: Failed to add instance: {e}[/red]")
        raise click.ClickException(str(e)) from e


@instance_group.command(name="remove")
@click.argument("name")
def remove_instance(name: str) -> None:
    """Remove an instance."""
    try:
        config = load_config()
        if name in config.instances:
            del config.instances[name]

            # Clear default if it was the removed instance
            if config.default_instance == name:
                config.default_instance = None

            save_config(config)
            console.print(f"✓ Removed instance [bold green]{name}[/bold green]")
        else:
            console.print(f"[bold yellow]Instance '{name}' not found[/bold yellow]")

    except Exception as e:
        console.print(f"[bold red]✗ Failed to remove instance:[/bold red] {e}")
        raise click.ClickException(str(e)) from e


@instance_group.command(name="show")
@click.argument("name", required=False)
def show_instance(name: str | None) -> None:
    """Show details for an instance."""
    try:
        config = load_config()

        # Use default instance if no name provided
        if not name:
            name = config.default_instance
            if not name:
                console.print("[red]No instance specified and no default set[/red]")
                raise click.Abort()

        if name not in config.instances:
            console.print(f"[red]Instance '{name}' not found[/red]")
            raise click.Abort()

        instance_config = config.instances[name]

        console.print(f"[bold]Instance: {name}[/bold]")
        if name == config.default_instance:
            console.print("[green]✓ Default instance[/green]")
        console.print()

        # Show configuration
        console.print("[bold]Configuration:[/bold]")
        console.print(f"  URL: {instance_config.instance_url}")
        console.print(f"  Keycloak Realm: {instance_config.keycloak_realm}")
        console.print(f"  Keycloak Client ID: {instance_config.keycloak_client_id}")

        # Try to fetch live info
        try:
            console.print("\n[bold]Instance Info:[/bold]")
            instance_info = InstanceInfo(instance_config.instance_url)
            info = instance_info.get_info()

            console.print(f"  Title: {info.get('title', 'N/A')}")
            console.print(f"  Version: {info.get('version', 'N/A')}")

            # Show organisms
            organisms = instance_info.get_organisms()
            console.print(f"\n[bold]Available Organisms ({len(organisms)}):[/bold]")
            for i, org in enumerate(organisms):
                if i < 10:  # Show first 10
                    console.print(f"  • {org}")
                elif i == 10:
                    console.print(f"  ... and {len(organisms) - 10} more")
                    break

        except Exception as e:
            console.print(f"\n[yellow]Could not fetch live instance info: {e}[/yellow]")

    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        raise click.ClickException(str(e)) from e
